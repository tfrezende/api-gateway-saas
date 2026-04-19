import { ConflictException } from '@nestjs/common';
import { Observable, of, throwError } from 'rxjs';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import type { Request, Response } from 'express';
import { IdempotencyInterceptor } from './idempotency.interceptor';
import {
  IdempotencyStoreService,
  StoredResponse,
} from './idempotency-store.service';
import { RouterMatcherService } from '../../shared/router-matcher.service';

const mockStore = {
  get: jest.fn(),
  set: jest.fn(),
  setProcessing: jest.fn(),
  delete: jest.fn(),
};

const mockRouterMatcher = {
  matchRoute: jest.fn(),
};

const buildContext = (
  method: string,
  overrides: Partial<Request> = {},
): {
  context: ExecutionContext;
  request: Partial<Request>;
  response: Partial<Response> & { writtenChunks: string[] };
} => {
  const writtenChunks: string[] = [];
  const request: Partial<Request> = {
    method,
    path: '/transactions',
    tenantId: 'tenant-1',
    headers: {},
    body: { amount: 100 },
    ...overrides,
  };
  const response = {
    statusCode: 201,
    status: jest.fn().mockReturnThis(),
    setHeader: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    getHeaders: jest
      .fn()
      .mockReturnValue({ 'content-type': 'application/json' }),
    write: jest.fn((chunk: string) => {
      writtenChunks.push(chunk);
      return true;
    }),
    end: jest.fn((chunk?: string) => {
      if (chunk) writtenChunks.push(chunk);
      return response;
    }),
    writtenChunks,
  } as unknown as Partial<Response> & { writtenChunks: string[] };

  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;

  return { context, request, response };
};

const buildHandler = (value: unknown = {}): CallHandler => ({
  handle: () => of(value),
});

// Simulates a proxy that writes to response.end() after emitting —
// needed because the interceptor awaits bodyPromise which resolves in response.end().
const buildStreamingHandler = (
  response: Partial<Response> & { writtenChunks: string[] },
  value: unknown = {},
): CallHandler => ({
  handle: () =>
    new Observable<unknown>((subscriber) => {
      subscriber.next(value);
      (response.end as (chunk?: string) => unknown)('');
      subscriber.complete();
    }),
});

describe('IdempotencyInterceptor', () => {
  let interceptor: IdempotencyInterceptor;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRouterMatcher.matchRoute.mockResolvedValue(null);
    mockStore.setProcessing.mockResolvedValue(undefined);
    mockStore.set.mockResolvedValue(undefined);
    mockStore.delete.mockResolvedValue(undefined);
    interceptor = new IdempotencyInterceptor(
      mockStore as unknown as IdempotencyStoreService,
      mockRouterMatcher as unknown as RouterMatcherService,
    );
  });

  describe('passthrough cases', () => {
    it('should skip GET requests', async () => {
      const { context } = buildContext('GET');
      const next = buildHandler();
      const obs = await interceptor.intercept(context, next);
      await new Promise<void>((resolve) =>
        obs.subscribe({ complete: resolve }),
      );
      expect(mockStore.get).not.toHaveBeenCalled();
    });

    it('should skip HEAD requests', async () => {
      const { context } = buildContext('HEAD');
      const next = buildHandler();
      const obs = await interceptor.intercept(context, next);
      await new Promise<void>((resolve) =>
        obs.subscribe({ complete: resolve }),
      );
      expect(mockStore.get).not.toHaveBeenCalled();
    });

    it('should skip routes with skipIdempotency: true', async () => {
      mockRouterMatcher.matchRoute.mockResolvedValue({ skipIdempotency: true });
      const { context } = buildContext('POST');
      const next = buildHandler();
      const obs = await interceptor.intercept(context, next);
      await new Promise<void>((resolve) =>
        obs.subscribe({ complete: resolve }),
      );
      expect(mockStore.get).not.toHaveBeenCalled();
    });
  });

  describe('processing sentinel', () => {
    it('should throw ConflictException when key is processing', async () => {
      mockStore.get.mockResolvedValue('processing');
      const { context } = buildContext('POST');
      await expect(
        interceptor.intercept(context, buildHandler()),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('cache replay', () => {
    it('should replay cached response and set X-Idempotency-Replay header', async () => {
      const stored: StoredResponse = {
        statusCode: 201,
        headers: { 'content-type': 'application/json' },
        body: '{"id":1}',
      };
      mockStore.get.mockResolvedValue(stored);
      const { context, response } = buildContext('POST');

      const obs = await interceptor.intercept(context, buildHandler());
      // EMPTY completes immediately with no emissions
      await new Promise<void>((resolve) =>
        obs.subscribe({ complete: resolve }),
      );

      expect(response.status).toHaveBeenCalledWith(201);
      expect(response.setHeader).toHaveBeenCalledWith(
        'content-type',
        'application/json',
      );
      expect(response.setHeader).toHaveBeenCalledWith(
        'X-Idempotency-Replay',
        'true',
      );
      expect(response.send).toHaveBeenCalledWith('{"id":1}');
    });
  });

  describe('first-time request', () => {
    it('should call setProcessing on first occurrence', async () => {
      mockStore.get.mockResolvedValue(null);
      const { context, response } = buildContext('POST', {
        headers: { 'idempotency-key': 'key-abc' },
      });

      const obs = await interceptor.intercept(
        context,
        buildStreamingHandler(response),
      );
      await new Promise<void>((resolve) =>
        obs.subscribe({ complete: resolve }),
      );

      expect(mockStore.setProcessing).toHaveBeenCalledWith(
        'idempotency:tenant-1:key-abc',
      );
    });

    it('should cache the response after completion', async () => {
      mockStore.get.mockResolvedValue(null);
      const { context, response } = buildContext('POST', {
        headers: { 'idempotency-key': 'key-abc' },
      });

      const obs = await interceptor.intercept(
        context,
        buildStreamingHandler(response),
      );
      await new Promise<void>((resolve) =>
        obs.subscribe({ complete: resolve }),
      );

      expect(mockStore.set).toHaveBeenCalledWith(
        'idempotency:tenant-1:key-abc',
        expect.objectContaining({ statusCode: 201 }),
        expect.any(Number),
      );
    });

    it('should delete the processing key on upstream error', async () => {
      mockStore.get.mockResolvedValue(null);
      const { context } = buildContext('POST', {
        headers: { 'idempotency-key': 'key-abc' },
      });
      const failingHandler: CallHandler = {
        handle: () => throwError(() => new Error('upstream failed')),
      };

      const obs = await interceptor.intercept(context, failingHandler);
      await new Promise<void>((resolve) => {
        obs.subscribe({ error: () => resolve() });
      });

      expect(mockStore.delete).toHaveBeenCalledWith(
        'idempotency:tenant-1:key-abc',
      );
      expect(mockStore.set).not.toHaveBeenCalled();
    });

    it('should include body written via response.end chunk argument', async () => {
      mockStore.get.mockResolvedValue(null);
      const { context, response } = buildContext('POST', {
        headers: { 'idempotency-key': 'key-chunk' },
      });

      // Pass the body as the chunk argument to response.end instead of response.write
      const chunkHandler: CallHandler = {
        handle: () =>
          new Observable<unknown>((subscriber) => {
            subscriber.next({});
            (response.end as (chunk: string) => unknown)('{"id":2}');
            subscriber.complete();
          }),
      };

      const obs = await interceptor.intercept(context, chunkHandler);
      await new Promise<void>((resolve) =>
        obs.subscribe({ complete: resolve }),
      );

      expect(mockStore.set).toHaveBeenCalledWith(
        'idempotency:tenant-1:key-chunk',
        expect.objectContaining({ body: '{"id":2}' }),
        expect.any(Number),
      );
    });

    it('should serialise number-valued headers to strings', async () => {
      mockStore.get.mockResolvedValue(null);
      const { context, response } = buildContext('POST', {
        headers: { 'idempotency-key': 'key-num-header' },
      });
      (response.getHeaders as jest.Mock).mockReturnValue({
        'content-length': 42,
      });

      const obs = await interceptor.intercept(
        context,
        buildStreamingHandler(response),
      );
      await new Promise<void>((resolve) =>
        obs.subscribe({ complete: resolve }),
      );

      expect(mockStore.set).toHaveBeenCalledWith(
        'idempotency:tenant-1:key-num-header',
        expect.objectContaining({ headers: { 'content-length': '42' } }),
        expect.any(Number),
      );
    });

    it('should use the first value for array-valued headers', async () => {
      mockStore.get.mockResolvedValue(null);
      const { context, response } = buildContext('POST', {
        headers: { 'idempotency-key': 'key-arr-header' },
      });
      (response.getHeaders as jest.Mock).mockReturnValue({
        'set-cookie': ['a=1', 'b=2'],
      });

      const obs = await interceptor.intercept(
        context,
        buildStreamingHandler(response),
      );
      await new Promise<void>((resolve) =>
        obs.subscribe({ complete: resolve }),
      );

      expect(mockStore.set).toHaveBeenCalledWith(
        'idempotency:tenant-1:key-arr-header',
        expect.objectContaining({ headers: { 'set-cookie': 'a=1' } }),
        expect.any(Number),
      );
    });
  });
});
