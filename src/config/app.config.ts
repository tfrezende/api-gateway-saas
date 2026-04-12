if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not set');
}

export const appConfig = {
  get port() {
    return parseInt(process.env.PORT ?? '3000');
  },
  get jwt() {
    return {
      secret: process.env.JWT_SECRET,
      expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    };
  },
  get proxy() {
    return {
      timeout: parseInt(process.env.PROXY_TIMEOUT ?? '5000'),
    };
  },
  get redis() {
    return {
      host: process.env.REDIS_HOST ?? 'localhost',
      port: parseInt(process.env.REDIS_PORT ?? '6379'),
    };
  },
  get throttler() {
    return {
      ip: {
        ttl: parseInt(process.env.THROTTLER_IP_TTL ?? '60000'),
        limit: parseInt(process.env.THROTTLER_IP_LIMIT ?? '200'),
      },
      user: {
        ttl: parseInt(process.env.THROTTLER_USER_TTL ?? '60000'),
        limit: parseInt(process.env.THROTTLER_USER_LIMIT ?? '300'),
      },
    };
  },
  get logger() {
    return {
      level: process.env.LOGGER_LEVEL ?? 'info',
      pretty: process.env.NODE_ENV !== 'production',
    };
  },
  get metrics() {
    return {
      apiKey: process.env.METRICS_API_KEY,
    };
  },
  get circuitBreaker() {
    return {
      threshold: parseInt(process.env.CIRCUIT_BREAKER_THRESHOLD ?? '5'),
      halfOpenAfter: parseInt(
        process.env.CIRCUIT_BREAKER_HALF_OPEN_AFTER ?? '10000',
      ),
    };
  },
};
