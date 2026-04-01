import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
} from '@nestjs/common';
import { Request } from 'express';
import { HttpMethod } from '../../config/routes.config';
import { RouterMatcherService } from '../../shared/router-matcher.service';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly routerMatcherService: RouterMatcherService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const { path, method } = request;

    const route = this.routerMatcherService.matchRoute(path);
    if (!route) {
      throw new ForbiddenException('Route not configured');
    }

    const methodConfig = route.methods?.[method as HttpMethod];

    if (!methodConfig || methodConfig.isPublic || !request.user) {
      return true;
    }

    const user = request.user;

    this.checkRoles(user.roles, methodConfig.roles);
    this.checkScopes(user.scopes, methodConfig.scopes);

    return true;
  }

  private checkRoles(userRoles: string[], requiredRoles?: string[]) {
    if (!requiredRoles?.length) return;
    const hasRole = requiredRoles.some((role) => userRoles.includes(role));
    if (!hasRole) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }

  private checkScopes(userScopes: string[], requiredScopes?: string[]) {
    if (!requiredScopes?.length) return;
    const hasScope = requiredScopes.some((scope) => userScopes.includes(scope));
    if (!hasScope) {
      throw new ForbiddenException('Insufficient permissions');
    }
  }
}
