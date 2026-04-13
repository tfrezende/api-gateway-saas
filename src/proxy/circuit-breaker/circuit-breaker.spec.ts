import { CircuitBreaker, CircuitBreakerState } from './circuit-breaker';
import { BrokenCircuitError } from '../../shared/utils/error.utils';
import { CircuitBreakerConfig } from './circuit-breaker.config';

const config: CircuitBreakerConfig = {
  threshold: 3,
  halfOpenAfter: 1000,
};

const successFn = jest.fn().mockResolvedValue('ok');
const failureFn = jest.fn().mockRejectedValue(new Error('upstream error'));

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker('http://localhost:3001', config);
    jest.clearAllMocks();
    successFn.mockResolvedValue('ok');
    failureFn.mockRejectedValue(new Error('upstream error'));
  });

  describe('CLOSED state', () => {
    it('should start in CLOSED state', () => {
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should execute the function successfully', async () => {
      const result = await circuitBreaker.execute(successFn);
      expect(result).toBe('ok');
      expect(successFn).toHaveBeenCalledTimes(1);
    });

    it('should stay CLOSED after failures below threshold', async () => {
      for (let i = 0; i < config.threshold - 1; i++) {
        await expect(circuitBreaker.execute(failureFn)).rejects.toThrow(
          'upstream error',
        );
        expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
      }
    });

    it('should reset failure count after a successful call', async () => {
      await expect(circuitBreaker.execute(failureFn)).rejects.toThrow(
        'upstream error',
      );
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);

      await expect(circuitBreaker.execute(successFn)).resolves.toBe('ok');
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);

      await expect(circuitBreaker.execute(failureFn)).rejects.toThrow(
        'upstream error',
      );
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });
  });

  describe('OPEN state', () => {
    beforeEach(async () => {
      for (let i = 0; i < config.threshold; i++) {
        await expect(circuitBreaker.execute(failureFn)).rejects.toThrow(
          'upstream error',
        );
      }
    });

    it('should transition to OPEN state after reaching threshold', () => {
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
    });

    it('should throw BrokenCircuitError when OPEN', async () => {
      await expect(circuitBreaker.execute(successFn)).rejects.toThrow(
        BrokenCircuitError,
      );
    });

    it('should call onBreak callback when opening', async () => {
      const onBreak = jest.fn();
      circuitBreaker = new CircuitBreaker('http://localhost:3001', config);
      circuitBreaker.onBreak(onBreak);

      for (let i = 0; i < config.threshold; i++) {
        await expect(circuitBreaker.execute(failureFn)).rejects.toThrow();
      }

      expect(onBreak).toHaveBeenCalledTimes(1);
    });

    it('should call onBreak callback only once regardless of extra failures', async () => {
      const onBreak = jest.fn();
      circuitBreaker = new CircuitBreaker('http://localhost:3001', config);
      circuitBreaker.onBreak(onBreak);

      for (let i = 0; i < config.threshold + 2; i++) {
        await expect(circuitBreaker.execute(failureFn)).rejects.toThrow();
      }

      expect(onBreak).toHaveBeenCalledTimes(1);
    });

    it('should still throw BrokenCircuitError before halfOpenAfter window elapses', async () => {
      await new Promise<void>((resolve) =>
        setTimeout(resolve, config.halfOpenAfter / 2),
      );

      await expect(circuitBreaker.execute(successFn)).rejects.toThrow(
        BrokenCircuitError,
      );
    });
  });

  describe('HALF_OPEN state', () => {
    beforeEach(async () => {
      for (let i = 0; i < config.threshold; i++) {
        await expect(circuitBreaker.execute(failureFn)).rejects.toThrow(
          'upstream error',
        );
      }
      await new Promise<void>((resolve) =>
        setTimeout(resolve, config.halfOpenAfter + 50),
      );
    });

    it('should remain OPEN until a request triggers the HALF_OPEN transition', () => {
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
    });

    it('should allow one request through in HALF_OPEN state', async () => {
      const onHalfOpenCallback = jest.fn();
      circuitBreaker.onHalfOpen(onHalfOpenCallback);

      await expect(circuitBreaker.execute(successFn)).resolves.toBe('ok');
      expect(onHalfOpenCallback).toHaveBeenCalledTimes(1);
    });

    it('should transition back to CLOSED on success in HALF_OPEN', async () => {
      await expect(circuitBreaker.execute(successFn)).resolves.toBe('ok');
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should transition back to OPEN on failure in HALF_OPEN', async () => {
      await expect(circuitBreaker.execute(failureFn)).rejects.toThrow(
        'upstream error',
      );
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
    });

    it('should throw BrokenCircuitError for concurrent requests in HALF_OPEN', async () => {
      const firstCall = circuitBreaker.execute(successFn);
      const secondCall = circuitBreaker.execute(successFn);

      await expect(firstCall).resolves.toBe('ok');
      await expect(secondCall).rejects.toThrow(BrokenCircuitError);
    });

    it('should call onReset callback when resetting to CLOSED', async () => {
      const onReset = jest.fn();
      circuitBreaker.onReset(onReset);

      await expect(circuitBreaker.execute(successFn)).resolves.toBe('ok');
      expect(onReset).toHaveBeenCalledTimes(1);
    });

    it('should call onHalfOpen callback when transitioning to HALF_OPEN', async () => {
      const onHalfOpen = jest.fn();
      circuitBreaker.onHalfOpen(onHalfOpen);

      await expect(circuitBreaker.execute(successFn)).resolves.toBe('ok');
      expect(onHalfOpen).toHaveBeenCalledTimes(1);
    });

    it('should attempt reset on next call after halfOpenAfter time elapses', async () => {
      await new Promise<void>((resolve) =>
        setTimeout(resolve, config.halfOpenAfter + 50),
      );

      const onHalfOpen = jest.fn();
      circuitBreaker.onHalfOpen(onHalfOpen);

      await expect(circuitBreaker.execute(successFn)).resolves.toBe('ok');
      expect(onHalfOpen).toHaveBeenCalledTimes(1);
    });

    it('should not attempt reset if a request is already in flight in HALF_OPEN', async () => {
      await new Promise<void>((resolve) =>
        setTimeout(resolve, config.halfOpenAfter + 50),
      );

      const firstCall = circuitBreaker.execute(successFn);
      const secondCall = circuitBreaker.execute(successFn);

      await expect(firstCall).resolves.toBe('ok');
      await expect(secondCall).rejects.toThrow(BrokenCircuitError);
    });
  });
});
