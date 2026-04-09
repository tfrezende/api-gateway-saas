import { Injectable } from '@nestjs/common';
import {
  Registry,
  Counter,
  Histogram,
  collectDefaultMetrics,
} from 'prom-client';

@Injectable()
export class MetricsService {
  private readonly registry: Registry;
  private readonly requestCounter: Counter;
  private readonly latencyHistogram: Histogram;
  private readonly errorCounter: Counter;

  constructor() {
    this.registry = new Registry();
    collectDefaultMetrics({ register: this.registry });

    this.requestCounter = new Counter({
      name: 'api_gateway_requests_total',
      help: 'Total number of API requests',
      labelNames: ['method', 'path', 'status_code'],
      registers: [this.registry],
    });

    this.latencyHistogram = new Histogram({
      name: 'api_gateway_request_latency_seconds',
      help: 'Latency of API requests in seconds',
      labelNames: ['method', 'path', 'status_code'],
      buckets: [0.1, 0.5, 1, 2.5, 5, 10],
      registers: [this.registry],
    });

    this.errorCounter = new Counter({
      name: 'api_gateway_errors_total',
      help: 'Total number of API errors',
      labelNames: ['method', 'path', 'status_code'],
      registers: [this.registry],
    });
  }

  incrementRequestCount(
    method: string,
    path: string,
    statusCode: number,
  ): void {
    this.requestCounter.inc({ method, path, status_code: statusCode });
  }

  incrementErrorCount(method: string, path: string, statusCode: number): void {
    this.errorCounter.inc({ method, path, status_code: statusCode });
  }

  recordLatency(
    method: string,
    path: string,
    statusCode: number,
    latencySeconds: number,
  ): void {
    this.latencyHistogram.observe(
      { method, path, status_code: statusCode },
      latencySeconds,
    );
  }

  async getMetrics(): Promise<string> {
    return await this.registry.metrics();
  }

  getContentType(): string {
    return this.registry.contentType;
  }
}
