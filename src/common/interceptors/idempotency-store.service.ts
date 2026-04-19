import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { appConfig } from '../../config/app.config';

const PROCESSING_SENTINEL = 'processing';

export interface StoredResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

@Injectable()
export class IdempotencyStoreService {
  constructor(@Inject('REDIS_CLIENT') private readonly redisClient: Redis) {}

  async get(key: string): Promise<StoredResponse | 'processing' | null> {
    const raw = await this.redisClient.get(key);
    if (raw === null) return null;
    if (raw === PROCESSING_SENTINEL) return PROCESSING_SENTINEL;
    return JSON.parse(raw) as StoredResponse;
  }

  async setProcessing(key: string): Promise<boolean> {
    const result = await this.redisClient.set(
      key,
      PROCESSING_SENTINEL,
      'PX',
      appConfig.idempotency.processingTtlMs,
      'NX',
    );
    return result === 'OK';
  }

  async set(key: string, value: StoredResponse, ttlMs: number): Promise<void> {
    await this.redisClient.set(key, JSON.stringify(value), 'PX', ttlMs);
  }

  async delete(key: string): Promise<void> {
    await this.redisClient.del(key);
  }
}
