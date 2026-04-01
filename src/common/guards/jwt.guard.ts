import { Request } from 'express';
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '../../auth/jwt.service';

@Injectable()
export class JwtGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  private readonly publicPaths: string[] = ['/healthcheck', '/version'];

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();

    if (this.publicPaths.includes(request.path)) {
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
