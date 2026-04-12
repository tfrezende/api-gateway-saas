import { Injectable } from '@nestjs/common';
import { CircuitBreaker } from './circuit-breaker';
import { MetricsService } from '../../metrics/metrics.service';
import { createCircuitBreakerConfig } from './circuit-breaker.config';

@Injectable()
export class CircuitBreakerService {
  private readonly circuitBreakers = new Map<string, CircuitBreaker>();

  constructor(private readonly metricsService: MetricsService) {}

  getCircuitBreaker(target: string): CircuitBreaker {
    if (!this.circuitBreakers.has(target)) {
      const circuitBreaker = new CircuitBreaker(
        target,
        createCircuitBreakerConfig(),
      );
      this.registerEvents(circuitBreaker, target);
      this.circuitBreakers.set(target, circuitBreaker);
    }

    return this.circuitBreakers.get(target)!;
  }

  resetAll(): void {
    this.circuitBreakers.clear();
  }

  private registerEvents(circuitBreaker: CircuitBreaker, target: string): void {
    circuitBreaker.onBreak(() => {
      this.metricsService.incrementCircuitBreakerCounter('OPEN', target);
    });

    circuitBreaker.onReset(() => {
      this.metricsService.incrementCircuitBreakerCounter('CLOSED', target);
    });

    circuitBreaker.onHalfOpen(() => {
      this.metricsService.incrementCircuitBreakerCounter('HALF_OPEN', target);
    });
  }
}
