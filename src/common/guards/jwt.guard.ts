import type { Request } from 'express';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '../../auth/jwt.service';
import { HttpMethod } from '../../config/routes.config';
import { RouterMatcherService } from '../../shared/router-matcher.service';
import { extractBearerToken } from '../../shared/utils/token.utils';

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly routeMatcher: RouterMatcherService,
  ) {}

  private readonly publicPaths: string[] = [
    '/healthcheck',
    '/version',
    '/metrics',
  ];

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const { path, method } = request;

    if (this.publicPaths.includes(path)) {
      return true;
    }

    const token = extractBearerToken(request);
    if (token) {
      const payload = this.jwtService.verifySignature(token);
      request.user = payload;
      request.tenantId = payload.tenantId;
    }

    const route = await this.routeMatcher.matchRoute(path, request.tenantId);
    const methodConfig = route?.methods?.[method as HttpMethod];

    if (!route || !methodConfig || methodConfig.isPublic) {
      return true;
    }

    if (!request.user) {
      throw new UnauthorizedException(
        'Authentication required to access this resource',
      );
    }

    return true;
  }
}
