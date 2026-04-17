import { Provider, OnApplicationShutdown, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { appConfig } from '../config/app.config';

@Injectable()
export class RedisClientService implements OnApplicationShutdown {
  readonly client: Redis;

  constructor() {
    this.client = new Redis({
      host: appConfig.redis.host,
      port: appConfig.redis.port,
    });
  }

  async onApplicationShutdown(): Promise<void> {
    await this.client.quit();
  }
}

export const RedisProvider: Provider = {
  provide: 'REDIS_CLIENT',
  useFactory: (redisClientService: RedisClientService) =>
    redisClientService.client,
  inject: [RedisClientService],
};
