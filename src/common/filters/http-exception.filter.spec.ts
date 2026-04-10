import {
  ArgumentsHost,
  BadGatewayException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import { HttpExceptionFilter } from './http-exception.filter';
import { LoggerService } from '../../shared/logger.service';
import { MetricsService } from '../../metrics/metrics.service';

const mockJson = jest.fn();
const mockStatus = jest.fn(() => ({ json: mockJson }));
const mockSetHeader = jest.fn();
const mockLoggerService = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  child: jest.fn(),
};
const mockMetricsService = {
  incrementRequestCount: jest.fn(),
  incrementErrorCount: jest.fn(),
  recordLatency: jest.fn(),
};

const buildMockArgumentsHost = (
  method: string,
  path: string,
  requestId?: string,
): ArgumentsHost => {
  const request = {
    method,
    path,
    headers: {
      'x-request-id': requestId,
    },
  };

  const response = {
    status: mockStatus,
    setHeader: mockSetHeader,
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
};

describe('HttpExceptionFilter', () => {
  let httpExceptionFilter: HttpExceptionFilter;

  beforeEach(() => {
    httpExceptionFilter = new HttpExceptionFilter(
      mockLoggerService as unknown as LoggerService,
      mockMetricsService as unknown as MetricsService,
    );
    jest.clearAllMocks();
  });

  describe('catch', () => {
    it('should handle HttpException and return correct response', () => {
      const host = buildMockArgumentsHost('GET', '/test');
      httpExceptionFilter.catch(
        new UnauthorizedException('Unauthorized'),
        host,
      );
      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED);
    });

    it('should return the correct status code for a Forbidden Exception', () => {
      const host = buildMockArgumentsHost('POST', '/forbidden');
      httpExceptionFilter.catch(new ForbiddenException('Forbidden'), host);
      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.FORBIDDEN);
    });

    it('should return the correct status code for a Bad Gateway Exception', () => {
      const host = buildMockArgumentsHost('PUT', '/bad-gateway');
      httpExceptionFilter.catch(new BadGatewayException('Bad Gateway'), host);
      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.BAD_GATEWAY);
    });

    it('should return 500 for non-HttpException errors', () => {
      const host = buildMockArgumentsHost('DELETE', '/internal-error');
      httpExceptionFilter.catch(new Error('Something went wrong'), host);
      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('should return 500 for a non-Error unknown value', () => {
      const host = buildMockArgumentsHost('PATCH', '/unknown-error');
      httpExceptionFilter.catch('Unknown error', host);
      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    });

    it('should return a consistent error body structure', () => {
      const host = buildMockArgumentsHost('GET', '/test');
      httpExceptionFilter.catch(
        new HttpException('Test error', HttpStatus.BAD_REQUEST),
        host,
      );
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: HttpStatus.BAD_REQUEST,
          message: expect.any(String) as string,
          path: '/test',
          timestamp: expect.any(String) as string,
        }),
      );
    });

    it('should return the message for a string HttpException response', () => {
      const host = buildMockArgumentsHost('GET', '/test');
      httpExceptionFilter.catch(
        new UnauthorizedException('Unauthorized'),
        host,
      );
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Unauthorized',
        }),
      );
    });

    it('should return the message property for an object HttpException response', () => {
      const host = buildMockArgumentsHost('POST', '/test');
      httpExceptionFilter.catch(
        new HttpException({ message: 'Object error' }, HttpStatus.BAD_REQUEST),
        host,
      );
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Object error',
        }),
      );
    });

    it('should return a generic message for non-Error, non-HttpException values', () => {
      const host = buildMockArgumentsHost('DELETE', '/test');
      httpExceptionFilter.catch(12345, host);
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Internal server error',
        }),
      );
    });

    it('should include the request path in the response body', () => {
      const host = buildMockArgumentsHost('GET', '/test-path');
      httpExceptionFilter.catch(
        new HttpException('Test error', HttpStatus.BAD_REQUEST),
        host,
      );
      expect(mockJson).toHaveBeenCalledWith(
        expect.objectContaining({
          path: '/test-path',
        }),
      );
    });

    it('should include a valid ISO timestamp in the response body', () => {
      const host = buildMockArgumentsHost('GET', '/test');
      httpExceptionFilter.catch(
        new HttpException('Test error', HttpStatus.BAD_REQUEST),
        host,
      );
      const calls = mockJson.mock.calls as Array<[{ timestamp: string }]>;
      const body = calls[0][0];
      expect(body.timestamp).toBeDefined();
      expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
    });

    it('should return 429 for a ThrottlerException', () => {
      const host = buildMockArgumentsHost('GET', '/api/users');
      httpExceptionFilter.catch(new ThrottlerException(), host);

      expect(mockStatus).toHaveBeenCalledWith(HttpStatus.TOO_MANY_REQUESTS);
    });

    it('should set Retry-After header for a ThrottlerException', () => {
      const host = buildMockArgumentsHost(
        'GET',
        '/api/users',
        'test-request-id',
      );

      httpExceptionFilter.catch(new ThrottlerException(), host);

      expect(mockSetHeader).toHaveBeenCalledWith('Retry-After', '60');
    });

    it('should not set Retry-After header for non-ThrottlerException', () => {
      const host = buildMockArgumentsHost('GET', '/api/users');

      httpExceptionFilter.catch(new UnauthorizedException(), host);

      expect(mockSetHeader).not.toHaveBeenCalled();
    });

    it('should log warn for ThrottlerException', () => {
      const host = buildMockArgumentsHost('GET', '/api/users', 'abc-123');
      httpExceptionFilter.catch(new ThrottlerException(), host);

      expect(mockLoggerService.warn).toHaveBeenCalledWith(
        'ThrottlerException: Too Many Requests',
        expect.objectContaining({
          requestId: 'abc-123',
          method: 'GET',
          path: '/api/users',
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
        }),
      );
    });

    it('should log error for non-ThrottlerException', () => {
      const host = buildMockArgumentsHost('GET', '/api/users', 'abc-123');
      httpExceptionFilter.catch(
        new UnauthorizedException('Unauthorized'),
        host,
      );

      expect(mockLoggerService.error).toHaveBeenCalledWith(
        'Unauthorized',
        expect.objectContaining({
          requestId: 'abc-123',
          method: 'GET',
          path: '/api/users',
          statusCode: HttpStatus.UNAUTHORIZED,
        }),
      );
    });

    it('should include requestId in log when present in headers', () => {
      const host = buildMockArgumentsHost('GET', '/api/users', 'abc-123');
      httpExceptionFilter.catch(new UnauthorizedException(), host);

      expect(mockLoggerService.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ requestId: 'abc-123' }),
      );
    });

    it('should handle missing requestId in headers gracefully', () => {
      const host = buildMockArgumentsHost('GET', '/api/users');
      httpExceptionFilter.catch(new UnauthorizedException(), host);

      expect(mockLoggerService.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ requestId: undefined }),
      );
    });
  });
});
