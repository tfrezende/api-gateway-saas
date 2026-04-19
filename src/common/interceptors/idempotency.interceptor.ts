import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ConflictException,
} from '@nestjs/common';
import {
  IdempotencyStoreService,
  StoredResponse,
} from './idempotency-store.service';
import { RouterMatcherService } from '../../shared/router-matcher.service';
import { Observable, EMPTY, catchError, mergeMap } from 'rxjs';
import type { Request, Response } from 'express';
import { createHash } from 'crypto';
import { appConfig } from '../../config/app.config';

const IDEMPOTENT_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

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
      return (originalEnd as (...a: unknown[]) => Response)(chunk, ...args);
    };

    return next.handle().pipe(
      mergeMap(async () => {
        const body = Buffer.concat(chunks).toString('utf8');

        const headers: Record<string, string> = {};
        for (const [key, value] of Object.entries(response.getHeaders())) {
          if (typeof value === 'string') headers[key] = value;
          else if (typeof value === 'number') headers[key] = String(value);
          else if (Array.isArray(value)) headers[key] = value[0];
        }

        const stored: StoredResponse = {
          statusCode: response.statusCode,
          headers,
          body,
        };

        await this.store.set(redisKey, stored, appConfig.idempotency.ttlMs);
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
