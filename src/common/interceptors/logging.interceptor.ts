import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import type { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { LoggerService } from '../../shared/logger.service';
import { MetricsService } from '../../metrics/metrics.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(
    private readonly logger: LoggerService,
    private readonly metricsService: MetricsService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const { method } = request;
    const path = this.resolvePath(request);
    const requestId = randomUUID();
    const startTime = Date.now();

    request.headers['x-request-id'] = requestId;
    response.setHeader('x-request-id', requestId);

    this.logger.info(`Incoming request: ${method} ${path}`, { requestId });
    return next.handle().pipe(
      tap(() => {
        const latencyMs = Date.now() - startTime;
        const userId = request.user?.sub;

        this.logger.info('Request completed', {
          requestId,
          method,
          path,
          statusCode: response.statusCode,
          latencyMs,
          userId,
        });

        this.metricsService.incrementRequestCount(
          method,
          path,
          response.statusCode,
        );
        this.metricsService.recordLatency(
          method,
          path,
          response.statusCode,
          latencyMs,
        );
      }),
    );
  }

  private resolvePath(request: Request): string {
    const route = request.route as { path?: string | undefined };
    return route?.path ?? request.path;
  }
}
