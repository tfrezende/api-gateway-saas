import { LoggerService } from './logger.service';

jest.mock('pino', () => {
  const childMock = jest.fn().mockReturnValue({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  });

  const loggerMock = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: childMock,
  };

  return jest.fn().mockReturnValue(loggerMock);
});

import pino from 'pino';

const getMockLogger = () =>
  (pino as unknown as jest.Mock).mock.results[0].value as {
    info: jest.Mock;
    warn: jest.Mock;
    error: jest.Mock;
    child: jest.Mock;
  };

describe('LoggerService', () => {
  let service: LoggerService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LoggerService();
  });

  // ── info ───────────────────────────────────────────────────────────

  describe('info', () => {
    it('should call logger.info with message and empty context', () => {
      service.info('test message');

      expect(getMockLogger().info).toHaveBeenCalledWith({}, 'test message');
    });

    it('should call logger.info with message and context', () => {
      service.info('request received', {
        requestId: 'abc-123',
        method: 'GET',
        path: '/api/users',
      });

      expect(getMockLogger().info).toHaveBeenCalledWith(
        { requestId: 'abc-123', method: 'GET', path: '/api/users' },
        'request received',
      );
    });
  });

  // ── warn ───────────────────────────────────────────────────────────

  describe('warn', () => {
    it('should call logger.warn with message and empty context', () => {
      service.warn('test warning');

      expect(getMockLogger().warn).toHaveBeenCalledWith({}, 'test warning');
    });

    it('should call logger.warn with message and context', () => {
      service.warn('rate limit exceeded', {
        requestId: 'abc-123',
        userId: 'user-123',
      });

      expect(getMockLogger().warn).toHaveBeenCalledWith(
        { requestId: 'abc-123', userId: 'user-123' },
        'rate limit exceeded',
      );
    });
  });

  // ── error ──────────────────────────────────────────────────────────

  describe('error', () => {
    it('should call logger.error with message and empty context', () => {
      service.error('test error');

      expect(getMockLogger().error).toHaveBeenCalledWith({}, 'test error');
    });

    it('should call logger.error with message and context', () => {
      service.error('upstream failed', {
        requestId: 'abc-123',
        error: 'ECONNREFUSED',
      });

      expect(getMockLogger().error).toHaveBeenCalledWith(
        { requestId: 'abc-123', error: 'ECONNREFUSED' },
        'upstream failed',
      );
    });
  });

  // ── child ──────────────────────────────────────────────────────────

  describe('child', () => {
    it('should call logger.child with the provided context', () => {
      service.child({ requestId: 'abc-123' });

      expect(getMockLogger().child).toHaveBeenCalledWith({
        requestId: 'abc-123',
      });
    });

    it('should return the child logger instance', () => {
      const childLogger = service.child({ requestId: 'abc-123' });

      expect(childLogger).toBeDefined();
      expect(childLogger.info).toBeDefined();
      expect(childLogger.warn).toBeDefined();
      expect(childLogger.error).toBeDefined();
    });
  });
});
