import { ProxyService } from './proxy.service';
import { RouterMatcherService } from '../shared/router-matcher.service';
import { CircuitBreakerService } from './circuit-breaker/circuit-breaker.service';
import { BadGatewayException } from '@nestjs/common';
import { BrokenCircuitError } from '../shared/utils/error.utils';
import type { Request, Response } from 'express';
import { request as httpRequest } from 'http';
import { EventEmitter } from 'events';

jest.mock('http', () => ({
  request: jest.fn(),
}));

const mockRouterMatcherService = {
  matchRoute: jest.fn(),
};

const mockCircuitBreakerService = {
  getCircuitBreaker: jest.fn(),
};

const flushAsync = (): Promise<void> =>
  new Promise((resolve) => setImmediate(resolve));

const buildRequest = (overrides: Partial<Request> = {}): Request =>
  ({
    path: '/users',
    url: '/users',
    method: 'GET',
    headers: {},
    user: undefined,
    on: jest.fn(),
    pipe: jest.fn(),
    ...overrides,
  }) as unknown as Request;

const buildResponse = (overrides: Partial<Response> = {}): Response =>
  ({
    headersSent: false,
    writeHead: jest.fn(),
    end: jest.fn(),
    on: jest.fn(),
    ...overrides,
  }) as unknown as Response;

interface PipeHarness {
  request: Request & EventEmitter;
  response: Response & EventEmitter;
  proxyReq: EventEmitter & {
    setTimeout: jest.Mock;
    destroy: jest.Mock;
  };
  proxyRes: EventEmitter & {
    statusCode?: number;
    headers: Record<string, string>;
    complete: boolean;
    pipe: jest.Mock;
  };
  timeoutHandler: (() => void) | undefined;
  pipePromise: Promise<void>;
}

const mockedHttpRequest = httpRequest as jest.MockedFunction<
  typeof httpRequest
>;

describe('ProxyService', () => {
  let service: ProxyService;

  beforeEach(() => {
    service = new ProxyService(
      mockRouterMatcherService as unknown as RouterMatcherService,
      mockCircuitBreakerService as unknown as CircuitBreakerService,
    );
    jest.clearAllMocks();
  });

  afterEach(() => {
    mockedHttpRequest.mockReset();
  });

  const createPipeHarness = (): PipeHarness => {
    const requestEmitter = new EventEmitter();
    const responseEmitter = new EventEmitter();
    const proxyReqEmitter = new EventEmitter();
    const proxyResEmitter = new EventEmitter();

    /* eslint-disable @typescript-eslint/no-unsafe-assignment */
    const request = {
      path: '/users',
      url: '/users',
      method: 'GET',
      headers: {},
      user: undefined,
      on: requestEmitter.on.bind(requestEmitter),
      emit: requestEmitter.emit.bind(requestEmitter),
      pipe: jest.fn(),
    } as unknown as Request & EventEmitter;

    const response = {
      headersSent: false,
      on: responseEmitter.on.bind(responseEmitter),
      emit: responseEmitter.emit.bind(responseEmitter),
      writeHead: jest.fn(),
      end: jest.fn(),
    } as unknown as Response & EventEmitter;

    let timeoutHandler: (() => void) | undefined;

    const proxyReq = Object.assign(proxyReqEmitter, {
      setTimeout: jest.fn((_: number, cb: () => void) => {
        timeoutHandler = cb;
      }),
      destroy: jest.fn(),
    });

    const proxyRes = Object.assign(proxyResEmitter, {
      statusCode: 200,
      headers: { 'content-type': 'application/json' },
      complete: false,
      pipe: jest.fn(),
    });

    mockedHttpRequest.mockImplementation(((_options, callback) => {
      /* eslint-disable-next-line @typescript-eslint/no-unsafe-call */
      callback(proxyRes as never);
      return proxyReq as never;
    }) as typeof httpRequest);
    /* eslint-enable @typescript-eslint/no-unsafe-assignment */

    const pipePromise = (
      service as unknown as {
        pipe: (req: Request, res: Response, target: string) => Promise<void>;
      }
    ).pipe(request, response, 'http://localhost:3002');

    return {
      request,
      response,
      proxyReq,
      proxyRes,
      timeoutHandler,
      pipePromise,
    };
  };

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

      await flushAsync();

      /* eslint-disable @typescript-eslint/unbound-method */
      expect(response.writeHead).toHaveBeenCalledWith(503, {
        'Content-Type': 'application/json',
      });
      expect(response.end).toHaveBeenCalledWith(
        expect.stringContaining('circuit is open'),
      );
      /* eslint-enable @typescript-eslint/unbound-method */
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

      await flushAsync();

      /* eslint-disable @typescript-eslint/unbound-method */
      expect(response.writeHead).not.toHaveBeenCalled();
      expect(response.end).not.toHaveBeenCalled();
      /* eslint-enable @typescript-eslint/unbound-method */
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

      await flushAsync();

      /* eslint-disable @typescript-eslint/unbound-method */
      expect(response.writeHead).toHaveBeenCalledWith(502, {
        'Content-Type': 'application/json',
      });
      expect(response.end).toHaveBeenCalledWith(
        expect.stringContaining('Bad gateway error'),
      );
      /* eslint-enable @typescript-eslint/unbound-method */
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

      await flushAsync();

      /* eslint-disable @typescript-eslint/unbound-method */
      expect(response.writeHead).not.toHaveBeenCalled();
      expect(response.end).not.toHaveBeenCalled();
      /* eslint-enable @typescript-eslint/unbound-method */
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

  describe('pipe', () => {
    it('should resolve when upstream emits end', async () => {
      const harness = createPipeHarness();

      harness.proxyRes.emit('end');

      await expect(harness.pipePromise).resolves.toBeUndefined();
      /* eslint-disable @typescript-eslint/unbound-method */
      expect(harness.request.pipe).toHaveBeenCalledWith(harness.proxyReq);
      expect(harness.response.writeHead).toHaveBeenCalledWith(200, {
        'content-type': 'application/json',
      });
      /* eslint-enable @typescript-eslint/unbound-method */
    });

    it('should resolve when upstream closes after complete response', async () => {
      const harness = createPipeHarness();
      harness.proxyRes.complete = true;

      harness.proxyRes.emit('close');

      await expect(harness.pipePromise).resolves.toBeUndefined();
    });

    it('should reject when upstream closes before completion', async () => {
      const harness = createPipeHarness();

      harness.proxyRes.emit('close');

      await expect(harness.pipePromise).rejects.toThrow(
        'Upstream response closed prematurely',
      );
    });

    it('should reject and destroy upstream request on timeout', async () => {
      const harness = createPipeHarness();

      harness.timeoutHandler?.();

      await expect(harness.pipePromise).rejects.toThrow(
        'Upstream service timed out',
      );
      expect(harness.proxyReq.destroy).toHaveBeenCalled();
    });

    it('should reject and destroy upstream request when client request closes', async () => {
      const harness = createPipeHarness();

      harness.request.emit('close');

      await expect(harness.pipePromise).rejects.toThrow(
        'Client request closed before completion',
      );
      expect(harness.proxyReq.destroy).toHaveBeenCalled();
    });

    it('should ignore request close after request is complete', async () => {
      const harness = createPipeHarness();
      (harness.request as Request).complete = true;

      harness.request.emit('close');
      harness.proxyRes.emit('end');

      await expect(harness.pipePromise).resolves.toBeUndefined();
      expect(harness.proxyReq.destroy).not.toHaveBeenCalled();
    });

    it('should reject and destroy upstream request when client response closes', async () => {
      const harness = createPipeHarness();

      harness.response.emit('close');

      await expect(harness.pipePromise).rejects.toThrow(
        'Client response closed before completion',
      );
      expect(harness.proxyReq.destroy).toHaveBeenCalled();
    });

    it('should ignore response close after response is fully written', async () => {
      const harness = createPipeHarness();
      Object.defineProperty(harness.response, 'writableEnded', {
        value: true,
        configurable: true,
      });

      harness.response.emit('close');
      harness.proxyRes.emit('end');

      await expect(harness.pipePromise).resolves.toBeUndefined();
      expect(harness.proxyReq.destroy).not.toHaveBeenCalled();
    });

    it('should include forwarded auth headers in upstream request options', async () => {
      const request = buildRequest({
        headers: { authorization: 'Bearer token' },
        user: {
          sub: 'user-123',
          email: 'user@test.com',
          roles: ['admin'],
          scopes: ['read'],
          iat: 1,
          exp: 2,
        },
        on: jest.fn(),
        pipe: jest.fn(),
      });
      const response = buildResponse();

      const proxyReq = Object.assign(new EventEmitter(), {
        setTimeout: jest.fn(),
        destroy: jest.fn(),
      });
      const proxyRes = Object.assign(new EventEmitter(), {
        statusCode: 200,
        headers: {},
        complete: true,
        pipe: jest.fn(),
      });

      mockedHttpRequest.mockImplementation(((_options, callback) => {
        /* eslint-disable-next-line @typescript-eslint/no-unsafe-call */
        callback(proxyRes as never);
        return proxyReq as never;
      }) as typeof httpRequest);

      const pipePromise = (
        service as unknown as {
          pipe: (req: Request, res: Response, target: string) => Promise<void>;
        }
      ).pipe(request, response, 'http://localhost:3002');

      proxyRes.emit('end');
      await expect(pipePromise).resolves.toBeUndefined();

      const options = mockedHttpRequest.mock.calls[0][0] as unknown as {
        headers: Record<string, string>;
      };

      expect(options.headers['X-Auth-User-Id']).toBe('user-123');
      expect(options.headers['X-Auth-User-Email']).toBe('user@test.com');
      expect(options.headers['X-Auth-User-Roles']).toBe('admin');
      expect(options.headers['X-Auth-User-Scopes']).toBe('read');
    });
  });
});
