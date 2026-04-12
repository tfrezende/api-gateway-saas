import { BrokenCircuitError } from '../../shared/utils/error.utils';
import { CircuitBreakerConfig } from './circuit-breaker.config';

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export class CircuitBreaker {
  private state = CircuitBreakerState.CLOSED;
  private failureCount = 0;
  private lastFailureTime?: number;
  private halfOpenRequestInFlight = false;

  private onBreakCallback?: () => void;
  private onResetCallback?: () => void;
  private onHalfOpenCallback?: () => void;

  constructor(
    private readonly target: string,
    private readonly config: CircuitBreakerConfig,
  ) {}

  public async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitBreakerState.OPEN) {
      if (this.shouldAttemptReset()) {
        return this.attemptReset(fn);
      }
      throw new BrokenCircuitError(this.target);
    }

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      if (this.halfOpenRequestInFlight) {
        throw new BrokenCircuitError(this.target);
      }
      return this.attemptReset(fn);
    }

    return this.callThrough(fn);
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  onBreak(callback: () => void): void {
    this.onBreakCallback = callback;
  }

  onReset(callback: () => void): void {
    this.onResetCallback = callback;
  }

  onHalfOpen(callback: () => void): void {
    this.onHalfOpenCallback = callback;
  }

  private async callThrough<T>(fn: () => Promise<T>): Promise<T> {
    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private async attemptReset<T>(fn: () => Promise<T>): Promise<T> {
    this.state = CircuitBreakerState.HALF_OPEN;
    this.halfOpenRequestInFlight = true;
    this.onHalfOpenCallback?.();

    try {
      const result = await fn();
      this.reset();
      return result;
    } catch (err) {
      this.trip();
      throw err;
    } finally {
      this.halfOpenRequestInFlight = false;
    }
  }

  private shouldAttemptReset(): boolean {
    return (
      this.lastFailureTime !== undefined &&
      Date.now() - this.lastFailureTime >= this.config.halfOpenAfter
    );
  }

  private onSuccess(): void {
    this.failureCount = 0;
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.config.threshold) {
      this.trip();
    }
  }

  private trip(): void {
    this.state = CircuitBreakerState.OPEN;
    this.failureCount = 0;
    this.lastFailureTime = Date.now();
    this.onBreakCallback?.();
  }

  private reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failureCount = 0;
    this.lastFailureTime = undefined;
    this.onResetCallback?.();
  }
}
