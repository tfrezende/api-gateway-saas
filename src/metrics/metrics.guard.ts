import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { appConfig } from '../config/app.config';

@Injectable()
export class MetricsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const apiKey = request.headers['x-metrics-api-key'] as string | undefined;
    const authHeader = request.headers['authorization'];
    const bearerKey = authHeader?.startsWith('ApiKey ')
      ? authHeader.split(' ')[1]
      : undefined;

    const key = apiKey ?? bearerKey;

    if (!key || key !== appConfig.metrics.apiKey) {
      throw new UnauthorizedException('Invalid or missing API key for metrics');
    }

    return true;
  }
}
