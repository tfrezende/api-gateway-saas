import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';

interface ErrorResponse {
  statusCode: number;
  timestamp: string;
  message: string;
  path: string;
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();

    const statusCode = this.resolveStatus(exception);
    const message = this.resolveMessage(exception);

    const body: ErrorResponse = {
      statusCode,
      timestamp: new Date().toISOString(),
      message,
      path: request.path,
    };

    if (exception instanceof ThrottlerException) {
      response.setHeader('Retry-After', '60');
    }

    this.logger.error(
      `${request.method} ${request.path} ${statusCode} - ${message}`,
    );

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
