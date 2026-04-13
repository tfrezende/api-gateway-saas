import { appConfig } from '../../config/app.config';

export interface CircuitBreakerConfig {
  threshold: number;
  halfOpenAfter: number;
}

export function createCircuitBreakerConfig(): CircuitBreakerConfig {
  return {
    threshold: appConfig.circuitBreaker.threshold,
    halfOpenAfter: appConfig.circuitBreaker.halfOpenAfter,
  };
}
