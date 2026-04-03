import { Request } from 'express';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '../../auth/jwt.service';
import { HttpMethod } from '../../config/routes.config';
import { RouterMatcherService } from '../../shared/router-matcher.service';

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly routeMatcher: RouterMatcherService,
  ) {}

  private readonly publicPaths: string[] = ['/healthcheck', '/version'];

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const { path, method } = request;

    if (this.publicPaths.includes(path)) {
      return true;
    }

    const route = this.routeMatcher.matchRoute(path);
    const methodConfig = route?.methods?.[method as HttpMethod];

    if (!route || !methodConfig || methodConfig.isPublic) {
      return true;
    }

    const token = this.extractToken(request);
    const payload = this.jwtService.verifySignature(token);

    request.user = payload;

    return true;
  }

  private extractToken(request: Request): string {
    const authHeader =
      (request.headers['authorization'] as string) ||
      (request.headers['Authorization'] as string);
    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing or malformed Authorization header',
      );
    }
    return authHeader.split(' ')[1];
  }
}
