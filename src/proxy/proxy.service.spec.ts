/* eslint-disable @typescript-eslint/unbound-method */
import { ProxyService } from './proxy.service';
import { RouterMatcherService } from '../shared/router-matcher.service';
import { CircuitBreakerService } from './circuit-breaker/circuit-breaker.service';
import { BadGatewayException } from '@nestjs/common';
import { BrokenCircuitError } from '../shared/utils/error.utils';
import type { Request, Response } from 'express';

const mockRouterMatcherService = {
  matchRoute: jest.fn(),
};

const mockCircuitBreakerService = {
  getCircuitBreaker: jest.fn(),
};

const buildRequest = (overrides: Partial<Request> = {}): Request =>
  ({
    path: '/users',
    url: '/users',
    method: 'GET',
    headers: {},
    user: undefined,
    pipe: jest.fn(),
    ...overrides,
  }) as unknown as Request;

const buildResponse = (overrides: Partial<Response> = {}): Response =>
  ({
    headersSent: false,
    writeHead: jest.fn(),
    end: jest.fn(),
    ...overrides,
  }) as unknown as Response;

describe('ProxyService', () => {
  let service: ProxyService;

  beforeEach(() => {
    service = new ProxyService(
      mockRouterMatcherService as unknown as RouterMatcherService,
      mockCircuitBreakerService as unknown as CircuitBreakerService,
    );
    jest.clearAllMocks();
  });

  // ── Route matching ─────────────────────────────────────────────────

  describe('forward', () => {
    it('should throw BadGatewayException when no matching route is found', () => {
      mockRouterMatcherService.matchRoute.mockReturnValue(undefined);

      expect(() => service.forward(buildRequest(), buildResponse())).toThrow(
        BadGatewayException,
      );
    });

    it('should throw BadGatewayException when route has no target', () => {
      mockRouterMatcherService.matchRoute.mockReturnValue({ path: '/users' });

      expect(() => service.forward(buildRequest(), buildResponse())).toThrow(
        BadGatewayException,
      );
    });

    it('should get circuit breaker for the route target', () => {
      const mockBreaker = {
        execute: jest.fn().mockResolvedValue(undefined),
      };
      mockRouterMatcherService.matchRoute.mockReturnValue({
        target: 'http://localhost:3002',
      });
      mockCircuitBreakerService.getCircuitBreaker.mockReturnValue(mockBreaker);

      service.forward(buildRequest(), buildResponse());

      expect(mockCircuitBreakerService.getCircuitBreaker).toHaveBeenCalledWith(
        'http://localhost:3002',
      );
    });

    // ── BrokenCircuitError ─────────────────────────────────────────

    it('should return 503 when circuit breaker is open', async () => {
      const mockBreaker = {
        execute: jest
          .fn()
          .mockRejectedValue(new BrokenCircuitError('http://localhost:3002')),
      };
      mockRouterMatcherService.matchRoute.mockReturnValue({
        target: 'http://localhost:3002',
      });
      mockCircuitBreakerService.getCircuitBreaker.mockReturnValue(mockBreaker);

      const response = buildResponse();
      service.forward(buildRequest(), response);

      await new Promise<void>((resolve) => setTimeout(resolve, 50));

      expect(response.writeHead).toHaveBeenCalledWith(503, {
        'Content-Type': 'application/json',
      });
      expect(response.end).toHaveBeenCalledWith(
        expect.stringContaining('circuit is open'),
      );
    });

    it('should not write response when headers already sent on BrokenCircuitError', async () => {
      const mockBreaker = {
        execute: jest
          .fn()
          .mockRejectedValue(new BrokenCircuitError('http://localhost:3002')),
      };
      mockRouterMatcherService.matchRoute.mockReturnValue({
        target: 'http://localhost:3002',
      });
      mockCircuitBreakerService.getCircuitBreaker.mockReturnValue(mockBreaker);

      const response = buildResponse({ headersSent: true });
      service.forward(buildRequest(), response);

      await new Promise<void>((resolve) => setTimeout(resolve, 50));

      expect(response.writeHead).not.toHaveBeenCalled();
      expect(response.end).not.toHaveBeenCalled();
    });

    // ── Generic errors ─────────────────────────────────────────────

    it('should return 502 for generic upstream errors', async () => {
      const mockBreaker = {
        execute: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      };
      mockRouterMatcherService.matchRoute.mockReturnValue({
        target: 'http://localhost:3002',
      });
      mockCircuitBreakerService.getCircuitBreaker.mockReturnValue(mockBreaker);

      const response = buildResponse();
      service.forward(buildRequest(), response);

      await new Promise<void>((resolve) => setTimeout(resolve, 50));

      expect(response.writeHead).toHaveBeenCalledWith(502, {
        'Content-Type': 'application/json',
      });
      expect(response.end).toHaveBeenCalledWith(
        expect.stringContaining('Bad gateway error'),
      );
    });

    it('should not write response when headers already sent on generic error', async () => {
      const mockBreaker = {
        execute: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      };
      mockRouterMatcherService.matchRoute.mockReturnValue({
        target: 'http://localhost:3002',
      });
      mockCircuitBreakerService.getCircuitBreaker.mockReturnValue(mockBreaker);

      const response = buildResponse({ headersSent: true });
      service.forward(buildRequest(), response);

      await new Promise<void>((resolve) => setTimeout(resolve, 50));

      expect(response.writeHead).not.toHaveBeenCalled();
      expect(response.end).not.toHaveBeenCalled();
    });

    // ── Circuit breaker execution ──────────────────────────────────

    it('should call execute with a function', () => {
      const mockBreaker = {
        execute: jest.fn().mockResolvedValue(undefined),
      };
      mockRouterMatcherService.matchRoute.mockReturnValue({
        target: 'http://localhost:3002',
      });
      mockCircuitBreakerService.getCircuitBreaker.mockReturnValue(mockBreaker);

      service.forward(buildRequest(), buildResponse());

      expect(mockBreaker.execute).toHaveBeenCalledWith(expect.any(Function));
    });
  });
});
