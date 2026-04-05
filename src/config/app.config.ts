if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is not set');
}

export const appConfig = {
  port: parseInt(process.env.PORT ?? '3000'),
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
  },
  proxy: {
    timeout: parseInt(process.env.PROXY_TIMEOUT ?? '5000'),
  },
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: parseInt(process.env.REDIS_PORT ?? '6379'),
  },
  throttler: {
    ip: {
      ttl: parseInt(process.env.THROTTLER_IP_TTL ?? '60000'),
      limit: parseInt(process.env.THROTTLER_IP_LIMIT ?? '200'),
    },
    user: {
      ttl: parseInt(process.env.THROTTLER_USER_TTL ?? '60000'),
      limit: parseInt(process.env.THROTTLER_USER_LIMIT ?? '300'),
    },
  },
  logger: {
    level: process.env.LOGGER_LEVEL ?? 'info',
    pretty: process.env.NODE_ENV !== 'production',
  },
};
