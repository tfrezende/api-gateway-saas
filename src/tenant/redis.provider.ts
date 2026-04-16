import { Provider } from '@nestjs/common';
import Redis from 'ioredis';
import { appConfig } from '../config/app.config';

export const RedisProvider: Provider = {
  provide: 'REDIS_CLIENT',
  useFactory: () => {
    return new Redis({
      host: appConfig.redis.host,
      port: appConfig.redis.port,
    });
  },
};
