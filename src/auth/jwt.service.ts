import { verify, TokenExpiredError, JsonWebTokenError } from 'jsonwebtoken';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { appConfig } from '../config/app.config';
import { Role, Scope } from '../config/routes.config';

export interface JwtPayload {
  sub: string;
  email: string;
  roles: Role[];
  scopes: Scope[];
  iat: number;
  exp: number;
}

@Injectable()
export class JwtService {
  verifySignature(token: string): JwtPayload {
    try {
      return verify(
        token,
        appConfig.jwt.secret as string,
      ) as unknown as JwtPayload;
    } catch (error: unknown) {
      if (error instanceof TokenExpiredError) {
        throw new UnauthorizedException('Token has expired');
      } else if (error instanceof JsonWebTokenError) {
        throw new UnauthorizedException('Invalid token');
      } else {
        throw new UnauthorizedException('Failed to verify token');
      }
    }
  }
}
