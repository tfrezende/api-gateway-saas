import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ConflictException,
} from '@nestjs/common';
import { IdempotencyStoreService } from './idempotency-store.service';
import { RouterMatcherService } from '../../shared/router-matcher.service';
import { Observable, EMPTY, catchError, mergeMap } from 'rxjs';
import type { Request, Response } from 'express';
import { createHash } from 'crypto';
import { appConfig } from '../../config/app.config';

const IDEMPOTENT_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// Headers that are specific to a single transport hop and must not be replayed.
const HOP_BY_HOP = new Set([
  'transfer-encoding',
  'connection',
  'keep-alive',
  'te',
  'trailers',
  'upgrade',
]);

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly store: IdempotencyStoreService,
    private readonly routeMatcher: RouterMatcherService,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();

    if (!IDEMPOTENT_METHODS.has(request.method)) {
      return next.handle();
    }

    const route = await this.routeMatcher.matchRoute(
      request.path,
      request.tenantId,
    );

    if (route?.skipIdempotency) {
      return next.handle();
    }

    const tenantId = request.tenantId || 'default';
    const idempotencyKey = this.resolveKey(request);
    const redisKey = `idempotency:${tenantId}:${idempotencyKey}`;

    const cached = await this.store.get(redisKey);

    if (cached === 'processing') {
      throw new ConflictException(
        'A request with the same idempotency key is currently being processed',
      );
    }

    if (cached !== null) {
      response.status(cached.statusCode);
      for (const [header, value] of Object.entries(cached.headers)) {
        response.setHeader(header, value);
      }
      response.setHeader('X-Idempotency-Replay', 'true');
      response.send(cached.body);
      return EMPTY;
    }

    await this.store.setProcessing(redisKey);

    const chunks: Buffer[] = [];
    let resolveBody!: (body: string) => void;
    const bodyPromise = new Promise<string>((resolve) => {
      resolveBody = resolve;
    });

    const originalWrite = response.write.bind(
      response,
    ) as typeof response.write;
    const originalEnd = response.end.bind(response) as typeof response.end;

    response.write = (chunk: unknown, ...args: unknown[]) => {
      if (chunk) {
        chunks.push(
          Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string),
        );
      }
      return (originalWrite as (...a: unknown[]) => boolean)(chunk, ...args);
    };

    response.end = (chunk: unknown, ...args: unknown[]) => {
      if (chunk) {
        chunks.push(
          Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string),
        );
      }
      resolveBody(Buffer.concat(chunks).toString('utf8'));
      return (originalEnd as (...a: unknown[]) => Response)(chunk, ...args);
    };

    return next.handle().pipe(
      mergeMap(async (value) => {
        // Wait for response.end() to be called — streaming may finish
        // after next.handle() emits because ProxyService.forward() is fire-and-forget.
        const body = await bodyPromise;

        const headers: Record<string, string> = {};
        for (const [key, val] of Object.entries(response.getHeaders())) {
          if (HOP_BY_HOP.has(key.toLowerCase())) continue;
          if (typeof val === 'string') headers[key] = val;
          else if (typeof val === 'number') headers[key] = String(val);
          else if (Array.isArray(val)) headers[key] = val[0];
        }

        await this.store.set(
          redisKey,
          { statusCode: response.statusCode, headers, body },
          appConfig.idempotency.ttlMs,
        );
        return value as unknown;
      }),
      catchError(async (err: unknown) => {
        await this.store.delete(redisKey);
        throw err;
      }),
    );
  }

  private resolveKey(request: Request): string {
    const header = request.headers['idempotency-key'];
    if (header) {
      return Array.isArray(header) ? header[0] : header;
    }

    const raw = request.body ? JSON.stringify(request.body) : '';
    return createHash('sha256')
      .update(
        `${request.tenantId ?? ''}:${request.method}:${request.path}:${raw}`,
      )
      .digest('hex');
  }
}
