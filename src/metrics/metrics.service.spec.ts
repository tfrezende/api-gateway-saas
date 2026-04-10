import { register } from 'prom-client';
import { MetricsService } from './metrics.service';

describe('MetricsService', () => {
  let service: MetricsService;

  beforeEach(() => {
    register.clear();
    service = new MetricsService();
  });

  describe('incrementRequestCount', () => {
    it('should increment the request count', async () => {
      service.incrementRequestCount('GET', '/test', 200);

      const metrics = await service.getMetrics();

      expect(metrics).toContain('api_gateway_requests_total');
      expect(metrics).toContain('method="GET"');
      expect(metrics).toContain('path="/test"');
      expect(metrics).toContain('status_code="200"');
    });

    it('should increment the counter for different methods', async () => {
      service.incrementRequestCount('GET', '/test', 200);
      service.incrementRequestCount('POST', '/test', 201);

      const metrics = await service.getMetrics();

      expect(metrics).toContain('method="GET"');
      expect(metrics).toContain('method="POST"');
    });

    it('should increment the counter for different status codes', async () => {
      service.incrementRequestCount('GET', '/test', 200);
      service.incrementRequestCount('GET', '/test', 404);

      const metrics = await service.getMetrics();

      expect(metrics).toContain('status_code="200"');
      expect(metrics).toContain('status_code="404"');
    });

    it('should track multiple increments correctly', async () => {
      service.incrementRequestCount('GET', '/test', 200);
      service.incrementRequestCount('GET', '/test', 200);
      service.incrementRequestCount('GET', '/test', 404);

      const metrics = await service.getMetrics();

      expect(metrics).toContain(
        'api_gateway_requests_total{method="GET",path="/test",status_code="200"} 2',
      );
      expect(metrics).toContain(
        'api_gateway_requests_total{method="GET",path="/test",status_code="404"} 1',
      );
    });
  });

  describe('incrementErrorCount', () => {
    it('should increment the error counter', async () => {
      service.incrementErrorCount('GET', '/api/users', 401);

      const metrics = await service.getMetrics();

      expect(metrics).toContain('api_gateway_errors_total');
      expect(metrics).toContain('status_code="401"');
    });

    it('should track multiple error status codes', async () => {
      service.incrementErrorCount('GET', '/api/users', 401);
      service.incrementErrorCount('GET', '/api/users', 403);
      service.incrementErrorCount('GET', '/api/users', 500);

      const metrics = await service.getMetrics();

      expect(metrics).toContain('status_code="401"');
      expect(metrics).toContain('status_code="403"');
      expect(metrics).toContain('status_code="500"');
    });

    it('should track error counter independently from request counter', async () => {
      service.incrementRequestCount('GET', '/api/users', 200);
      service.incrementErrorCount('GET', '/api/users', 500);

      const metrics = await service.getMetrics();

      expect(metrics).toContain('api_gateway_requests_total');
      expect(metrics).toContain('api_gateway_errors_total');
    });
  });

  describe('recordLatency', () => {
    it('should record latency for a request', async () => {
      service.recordLatency('GET', '/test', 200, 0.5);

      const metrics = await service.getMetrics();

      expect(metrics).toContain('api_gateway_request_latency_seconds');
      expect(metrics).toContain('method="GET"');
      expect(metrics).toContain('path="/test"');
      expect(metrics).toContain('status_code="200"');
    });

    it('should record latency for multiple requests', async () => {
      service.recordLatency('GET', '/multiple', 200, 0.5);
      service.recordLatency('GET', '/multiple', 200, 1.0);
      service.recordLatency('GET', '/multiple', 200, 0.2);

      const metrics = await service.getMetrics();

      expect(metrics).toContain(
        'api_gateway_request_latency_seconds_bucket{le="1",method="GET",path="/multiple",status_code="200"} 3',
      );
    });

    it('should place observations in correct buckets', async () => {
      service.recordLatency('GET', '/test', 200, 0.05);
      service.recordLatency('GET', '/test', 200, 0.3);
      service.recordLatency('GET', '/test', 200, 1.5);
      service.recordLatency('GET', '/test', 200, 3);

      const metrics = await service.getMetrics();

      expect(metrics).toContain(
        'api_gateway_request_latency_seconds_bucket{le="0.1",method="GET",path="/test",status_code="200"} 1',
      );
      expect(metrics).toContain(
        'api_gateway_request_latency_seconds_bucket{le="0.5",method="GET",path="/test",status_code="200"} 2',
      );
      expect(metrics).toContain(
        'api_gateway_request_latency_seconds_bucket{le="2.5",method="GET",path="/test",status_code="200"} 3',
      );
      expect(metrics).toContain(
        'api_gateway_request_latency_seconds_bucket{le="5",method="GET",path="/test",status_code="200"} 4',
      );
      expect(metrics).toContain(
        'api_gateway_request_latency_seconds_bucket{le="10",method="GET",path="/test",status_code="200"} 4',
      );
    });
  });

  describe('getMetrics', () => {
    it('should returns a non-empty string', async () => {
      const metrics = await service.getMetrics();
      expect(typeof metrics).toBe('string');
      expect(metrics.length).toBeGreaterThan(0);
    });

    it('should include default metrics', async () => {
      const metrics = await service.getMetrics();
      expect(metrics).toContain('process_cpu_user_seconds_total');
      expect(metrics).toContain('process_resident_memory_bytes');
    });
  });

  describe('getContentType', () => {
    it('should return the correct content type for Prometheus metrics', () => {
      const contentType = service.getContentType();
      expect(contentType).toContain('text/plain');
    });
  });
});
