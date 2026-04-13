describe('appConfig', () => {
  const originalEnv = { ...process.env };

  const loadAppConfig = () => {
    jest.resetModules();
    return require('./app.config') as typeof import('./app.config');
  };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hmac';
    delete process.env.PORT;
    delete process.env.JWT_EXPIRES_IN;
    delete process.env.PROXY_TIMEOUT;
    delete process.env.REDIS_HOST;
    delete process.env.REDIS_PORT;
    delete process.env.THROTTLER_IP_TTL;
    delete process.env.THROTTLER_IP_LIMIT;
    delete process.env.THROTTLER_USER_TTL;
    delete process.env.THROTTLER_USER_LIMIT;
    delete process.env.LOGGER_LEVEL;
    delete process.env.NODE_ENV;
    delete process.env.METRICS_API_KEY;
    delete process.env.CIRCUIT_BREAKER_THRESHOLD;
    delete process.env.CIRCUIT_BREAKER_HALF_OPEN_AFTER;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('throws when JWT_SECRET is not set', () => {
    delete process.env.JWT_SECRET;

    expect(() => loadAppConfig()).toThrow(
      'JWT_SECRET environment variable is not set',
    );
  });

  it('returns default values when optional env vars are not set', () => {
    const { appConfig } = loadAppConfig();

    expect(appConfig.port).toBe(3000);
    expect(appConfig.jwt).toEqual({
      secret: 'test-secret-that-is-long-enough-for-hmac',
      expiresIn: '1h',
    });
    expect(appConfig.proxy).toEqual({ timeout: 5000 });
    expect(appConfig.redis).toEqual({ host: 'localhost', port: 6379 });
    expect(appConfig.throttler).toEqual({
      ip: { ttl: 60000, limit: 200 },
      user: { ttl: 60000, limit: 300 },
    });
    expect(appConfig.logger).toEqual({ level: 'info', pretty: true });
    expect(appConfig.metrics).toEqual({ apiKey: undefined });
    expect(appConfig.circuitBreaker).toEqual({
      threshold: 5,
      halfOpenAfter: 10000,
    });
  });

  it('returns configured values from environment variables', () => {
    process.env.PORT = '8080';
    process.env.JWT_EXPIRES_IN = '2h';
    process.env.PROXY_TIMEOUT = '1500';
    process.env.REDIS_HOST = 'redis.internal';
    process.env.REDIS_PORT = '6380';
    process.env.THROTTLER_IP_TTL = '120000';
    process.env.THROTTLER_IP_LIMIT = '25';
    process.env.THROTTLER_USER_TTL = '180000';
    process.env.THROTTLER_USER_LIMIT = '40';
    process.env.LOGGER_LEVEL = 'debug';
    process.env.NODE_ENV = 'production';
    process.env.METRICS_API_KEY = 'metrics-key';
    process.env.CIRCUIT_BREAKER_THRESHOLD = '9';
    process.env.CIRCUIT_BREAKER_HALF_OPEN_AFTER = '45000';

    const { appConfig } = loadAppConfig();

    expect(appConfig.port).toBe(8080);
    expect(appConfig.jwt).toEqual({
      secret: 'test-secret-that-is-long-enough-for-hmac',
      expiresIn: '2h',
    });
    expect(appConfig.proxy).toEqual({ timeout: 1500 });
    expect(appConfig.redis).toEqual({ host: 'redis.internal', port: 6380 });
    expect(appConfig.throttler).toEqual({
      ip: { ttl: 120000, limit: 25 },
      user: { ttl: 180000, limit: 40 },
    });
    expect(appConfig.logger).toEqual({ level: 'debug', pretty: false });
    expect(appConfig.metrics).toEqual({ apiKey: 'metrics-key' });
    expect(appConfig.circuitBreaker).toEqual({
      threshold: 9,
      halfOpenAfter: 45000,
    });
  });
});