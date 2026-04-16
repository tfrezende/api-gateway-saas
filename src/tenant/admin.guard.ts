import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { JwtService } from '../auth/jwt.service';
import { extractBearerToken } from '../shared/utils/token.utils';

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    const token = extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }
    const payload = this.jwtService.verifySignature(token);
    if (payload.roles?.includes('admin')) {
      return true;
    }
    throw new ForbiddenException(
      'Admin privileges required to access this resource',
    );
  }
}
