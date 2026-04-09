import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

const mockMetricsService = {
  getMetrics: jest.fn(),
  getContentType: jest.fn(),
};

const mockResponse = {
  status: jest.fn().mockReturnThis(),
  setHeader: jest.fn().mockReturnThis(),
  send: jest.fn().mockReturnThis(),
};

describe('MetricsController', () => {
  let controller: MetricsController;

  beforeEach(() => {
    controller = new MetricsController(
      mockMetricsService as unknown as MetricsService,
    );
    jest.clearAllMocks();
  });

  // ── metrics ────────────────────────────────────────────────────────

  describe('metrics', () => {
    it('should set the correct content type header', async () => {
      mockMetricsService.getContentType.mockReturnValue(
        'text/plain; version=0.0.4; charset=utf-8',
      );
      mockMetricsService.getMetrics.mockResolvedValue('# metrics output');

      await controller.getMetrics(mockResponse as never);

      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'text/plain; version=0.0.4; charset=utf-8',
      );
    });

    it('should send the metrics output', async () => {
      mockMetricsService.getContentType.mockReturnValue(
        'text/plain; version=0.0.4; charset=utf-8',
      );
      mockMetricsService.getMetrics.mockResolvedValue('# metrics output');

      await controller.getMetrics(mockResponse as never);

      expect(mockResponse.send).toHaveBeenCalledWith('# metrics output');
    });

    it('should set status 200', async () => {
      mockMetricsService.getContentType.mockReturnValue(
        'text/plain; version=0.0.4; charset=utf-8',
      );
      mockMetricsService.getMetrics.mockResolvedValue('# metrics output');

      await controller.getMetrics(mockResponse as never);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
    });

    it('should call getMetrics once', async () => {
      mockMetricsService.getContentType.mockReturnValue('text/plain');
      mockMetricsService.getMetrics.mockResolvedValue('');

      await controller.getMetrics(mockResponse as never);

      expect(mockMetricsService.getMetrics).toHaveBeenCalledTimes(1);
    });

    it('should call getContentType once', async () => {
      mockMetricsService.getContentType.mockReturnValue('text/plain');
      mockMetricsService.getMetrics.mockResolvedValue('');

      await controller.getMetrics(mockResponse as never);

      expect(mockMetricsService.getContentType).toHaveBeenCalledTimes(1);
    });

    it('should send empty string when metrics output is empty', async () => {
      mockMetricsService.getContentType.mockReturnValue('text/plain');
      mockMetricsService.getMetrics.mockResolvedValue('');

      await controller.getMetrics(mockResponse as never);

      expect(mockResponse.send).toHaveBeenCalledWith('');
    });
  });
});
