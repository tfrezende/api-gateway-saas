import { MetricsGuard } from './metrics.guard';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';

jest.mock('../config/app.config', () => ({
  appConfig: {
    metrics: {
      apiKey: 'test-api-key',
    },
  },
}));

const buildExecutionContext = (apiKey?: string): ExecutionContext => {
  const request = {
    headers: {
      'x-metrics-api-key': apiKey,
    },
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
};

describe('MetricsGuard', () => {
  let guard: MetricsGuard;

  beforeEach(() => {
    guard = new MetricsGuard();
  });

  it('should allow access with valid API key', () => {
    const context = buildExecutionContext('test-api-key');
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should deny access with invalid API key', () => {
    const context = buildExecutionContext('invalid-api-key');
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should deny access with missing API key', () => {
    const context = buildExecutionContext();
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
