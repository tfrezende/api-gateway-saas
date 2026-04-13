import { createCircuitBreakerConfig } from './circuit-breaker.config';

describe('CreateCircuitBreakerConfig', () => {
  const originalThreshold = process.env.CIRCUIT_BREAKER_THRESHOLD;
  const originalHalfOpenAfter = process.env.CIRCUIT_BREAKER_HALF_OPEN_AFTER;

  afterEach(() => {
    process.env.CIRCUIT_BREAKER_THRESHOLD = originalThreshold;
    process.env.CIRCUIT_BREAKER_HALF_OPEN_AFTER = originalHalfOpenAfter;
  });

  describe('threshold', () => {
    it('should return default threshold from appConfig', () => {
      process.env.CIRCUIT_BREAKER_THRESHOLD = '10';
      const config = createCircuitBreakerConfig();
      expect(config.threshold).toBe(10);
    });
  });

  describe('halfOpenAfter', () => {
    it('should return default halfOpenAfter from appConfig', () => {
      process.env.CIRCUIT_BREAKER_HALF_OPEN_AFTER = '5000';
      const config = createCircuitBreakerConfig();
      expect(config.halfOpenAfter).toBe(5000);
    });
  });
});
