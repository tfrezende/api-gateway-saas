import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { LoggerService } from '../../shared/logger.service';

interface ErrorResponse {
  statusCode: number;
  timestamp: string;
  message: string;
  path: string;
}

@Catch()
@Injectable()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: LoggerService) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();

    const statusCode = this.resolveStatus(exception);
    const message = this.resolveMessage(exception);
    const requestId = request.headers['x-request-id'] as string | undefined;

    const body: ErrorResponse = {
      statusCode,
      timestamp: new Date().toISOString(),
      message,
      path: request.path,
    };

    if (exception instanceof ThrottlerException) {
      response.setHeader('Retry-After', '60');
      this.logger.warn(message, {
        requestId,
        method: request.method,
        path: request.path,
        statusCode,
      });
    } else {
      this.logger.error(message, {
        requestId,
        method: request.method,
        path: request.path,
        statusCode,
        error: message,
      });
    }

    response.status(statusCode).json(body);
  }

  private resolveStatus(exception: unknown): number {
    if (exception instanceof HttpException) {
      return exception.getStatus();
    }
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  private resolveMessage(exception: unknown): string {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      if (typeof response === 'string') return response;
      if (typeof response === 'object' && 'message' in response) {
        return String(response.message);
      }
    }
    if (exception instanceof Error) return exception.message;
    return 'Internal server error';
  }
}
