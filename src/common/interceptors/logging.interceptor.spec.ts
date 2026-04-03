import { LoggingInterceptor } from './logging.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';

const buildContext = (method: string, path: string): ExecutionContext => {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ method, path }),
      getResponse: () => ({ statusCode: 200 }),
    }),
  } as unknown as ExecutionContext;
};

const buildCallHandler = (): CallHandler => ({
  handle: () => of({}),
});

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;

  beforeEach(() => {
    interceptor = new LoggingInterceptor();
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

  it('should log the request method and path', (done) => {
    const logSpy = jest.spyOn(interceptor['logger'], 'log');
    const context = buildContext('POST', '/api/orders');
    const next = buildCallHandler();

    interceptor.intercept(context, next).subscribe({
      complete: () => {
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('POST'));
        expect(logSpy).toHaveBeenCalledWith(
          expect.stringContaining('/api/orders'),
        );
        done();
      },
    });
  });
});
