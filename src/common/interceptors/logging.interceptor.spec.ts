import { LoggingInterceptor } from './logging.interceptor';
import { LoggerService } from '../../shared/logger.service';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import type { Request, Response } from 'express';

const mockLoggerService = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  child: jest.fn(),
};

const mockSetHeader = jest.fn().mockReturnThis();

const buildContext = (method: string, path: string): ExecutionContext => {
  const mockRequest = {
    method,
    path,
    headers: {} as Record<string, string>,
    user: undefined,
  };
  const mockResponse = {
    statusCode: 200,
    setHeader: mockSetHeader,
  } as unknown as Response;

  return {
    switchToHttp: () => ({
      getRequest: () => mockRequest,
      getResponse: () => mockResponse,
    }),
  } as unknown as ExecutionContext;
};

const buildCallHandler = (): CallHandler => ({
  handle: () => of({}),
});

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;

  beforeEach(() => {
    mockSetHeader.mockClear();
    interceptor = new LoggingInterceptor(
      mockLoggerService as unknown as LoggerService,
    );
    jest.clearAllMocks();
  });

  it('should call next.handle()', (done) => {
    const context = buildContext('GET', '/api/users');
    const next = buildCallHandler();

    interceptor.intercept(context, next).subscribe({
      complete: done,
    });
  });

  it('should return the response from next.handle()', (done) => {
    const context = buildContext('GET', '/api/users');
    const next = buildCallHandler();

    interceptor.intercept(context, next).subscribe({
      next: (value) => {
        expect(value).toEqual({});
        done();
      },
    });
  });

  it('should set x-request-id on the request headers', (done) => {
    const context = buildContext('GET', '/api/users');
    const request = context.switchToHttp().getRequest<Request>();

    interceptor.intercept(context, buildCallHandler()).subscribe({
      complete: () => {
        expect(request.headers['x-request-id']).toBeDefined();
        done();
      },
    });
  });

  it('should set x-request-id on the response headers', (done) => {
    const context = buildContext('GET', '/api/users');

    interceptor.intercept(context, buildCallHandler()).subscribe({
      complete: () => {
        expect(mockSetHeader).toHaveBeenCalledWith(
          'x-request-id',
          expect.any(String),
        );
        done();
      },
    });
  });

  it('should set the same request ID on moth request and response', (done) => {
    const context = buildContext('GET', '/api/users');
    const request = context.switchToHttp().getRequest<Request>();

    interceptor.intercept(context, buildCallHandler()).subscribe({
      complete: () => {
        const requestId = request.headers['x-request-id'];
        expect(mockSetHeader).toHaveBeenCalledWith('x-request-id', requestId);
        done();
      },
    });
  });

  it('should log the request method and path', (done) => {
    const context = buildContext('POST', '/api/orders');
    const next = buildCallHandler();
    const request = context.switchToHttp().getRequest<Request>();

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        const requestId = request.headers['x-request-id'];
        expect(mockLoggerService.info).toHaveBeenCalledWith(
          'Incoming request: POST /api/orders',
          expect.objectContaining({ requestId }),
        );
        done();
      },
    });
  });

  it('should log the response status code and duration', (done) => {
    const context = buildContext('GET', '/api/products');

    interceptor.intercept(context, buildCallHandler()).subscribe({
      complete: () => {
        expect(mockLoggerService.info).toHaveBeenCalledWith(
          'Request completed',
          expect.objectContaining({
            statusCode: 200,
            latencyMs: expect.any(Number) as number,
          }),
        );
        done();
      },
    });
  });

  it('should lof the request ID in both logs', (done) => {
    const context = buildContext('GET', '/api/categories');
    const request = context.switchToHttp().getRequest<Request>();

    interceptor.intercept(context, buildCallHandler()).subscribe({
      complete: () => {
        const requestId = request.headers['x-request-id'];
        expect(mockLoggerService.info).toHaveBeenNthCalledWith(
          1,
          'Incoming request: GET /api/categories',
          expect.objectContaining({ requestId }),
        );
        expect(mockLoggerService.info).toHaveBeenNthCalledWith(
          2,
          'Request completed',
          expect.objectContaining({ requestId }),
        );
        done();
      },
    });
  });

  it('should log the user ID when authenticated', (done) => {
    const context = buildContext('GET', '/api/users');
    const request = context.switchToHttp().getRequest<Request>();
    request.user = {
      sub: 'user123',
      email: 'user123@example.com',
      roles: ['user'],
      scopes: ['read'],
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };

    interceptor.intercept(context, buildCallHandler()).subscribe({
      complete: () => {
        expect(mockLoggerService.info).toHaveBeenCalledWith(
          'Request completed',
          expect.objectContaining({ userId: 'user123' }),
        );
        done();
      },
    });
  });

  it('should not include user ID in logs when not authenticated', (done) => {
    const context = buildContext('GET', '/auth');

    interceptor.intercept(context, buildCallHandler()).subscribe({
      complete: () => {
        const calls = mockLoggerService.info.mock.calls as Array<
          [string, Record<string, unknown>]
        >;
        const completedCall = calls[1][1];

        expect(completedCall.userId).toBeUndefined();
        done();
      },
    });
  });
});
