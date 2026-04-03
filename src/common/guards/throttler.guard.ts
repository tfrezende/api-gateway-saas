import { Injectable } from '@nestjs/common';
import { ThrottlerGuard as NestThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

@Injectable()
export class ThrottlerGuard extends NestThrottlerGuard {
  protected getTracker(request: Request): Promise<string> {
    const key = request.user?.sub ?? request.ip ?? 'anonymous';
    return Promise.resolve(key);
  }
}
