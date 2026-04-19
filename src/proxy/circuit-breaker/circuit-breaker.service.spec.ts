import { Test, TestingModule } from '@nestjs/testing';
import { CircuitBreakerService } from './circuit-breaker.service';
import { MetricsService } from '../../metrics/metrics.service';
import { CircuitBreakerState } from './circuit-breaker';

const mockMetricsService = {
  incrementCircuitBreakerCounter: jest.fn(),
};

describe('CircuitBreakerService', () => {
  let service: CircuitBreakerService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CircuitBreakerService,
        { provide: MetricsService, useValue: mockMetricsService },
      ],
    }).compile();

    service = module.get(CircuitBreakerService);
  });

  describe('getCircuitBreaker', () => {
    it('should create a new circuit breaker for a target', () => {
      const cb = service.getCircuitBreaker('http://service-a');
      expect(cb).toBeDefined();
      expect(cb.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should return the same instance for the same target', () => {
      const cb1 = service.getCircuitBreaker('http://service-a');
      const cb2 = service.getCircuitBreaker('http://service-a');
      expect(cb1).toBe(cb2);
    });

    it('should return different instances for different targets', () => {
      const cb1 = service.getCircuitBreaker('http://service-a');
      const cb2 = service.getCircuitBreaker('http://service-b');
      expect(cb1).not.toBe(cb2);
    });
  });

  describe('resetAll', () => {
    it('should clear all circuit breakers', () => {
      const cb1 = service.getCircuitBreaker('http://service-a');
      service.resetAll();
      const cb2 = service.getCircuitBreaker('http://service-a');
      expect(cb1).not.toBe(cb2);
    });
  });

  describe('event callbacks (onBreak / onReset / onHalfOpen)', () => {
    const threshold = 5; // matches createCircuitBreakerConfig default (CIRCUIT_BREAKER_THRESHOLD=5)
    const failFn = jest.fn().mockRejectedValue(new Error('fail'));
    const successFn = jest.fn().mockResolvedValue('ok');

    async function tripBreaker(target: string): Promise<void> {
      const cb = service.getCircuitBreaker(target);
      for (let i = 0; i < threshold; i++) {
        await cb.execute(failFn).catch(() => undefined);
      }
    }

    it('should emit OPEN metric when circuit breaks (onBreak)', async () => {
      await tripBreaker('http://on-break');
      expect(
        mockMetricsService.incrementCircuitBreakerCounter,
      ).toHaveBeenCalledWith('OPEN', 'http://on-break');
    });

    it('should emit HALF_OPEN metric when circuit transitions to half-open (onHalfOpen)', async () => {
      jest.useFakeTimers();
      await tripBreaker('http://on-half-open');
      // Advance past halfOpenAfter so attemptReset is triggered
      jest.advanceTimersByTime(60_000);

      const cb = service.getCircuitBreaker('http://on-half-open');
      await cb.execute(successFn).catch(() => undefined);

      expect(
        mockMetricsService.incrementCircuitBreakerCounter,
      ).toHaveBeenCalledWith('HALF_OPEN', 'http://on-half-open');
      jest.useRealTimers();
    });

    it('should emit CLOSED metric when circuit resets (onReset)', async () => {
      jest.useFakeTimers();
      await tripBreaker('http://on-reset');
      jest.advanceTimersByTime(60_000);

      const cb = service.getCircuitBreaker('http://on-reset');
      await cb.execute(successFn);

      expect(
        mockMetricsService.incrementCircuitBreakerCounter,
      ).toHaveBeenCalledWith('CLOSED', 'http://on-reset');
      jest.useRealTimers();
    });
  });
});
