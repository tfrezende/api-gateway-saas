import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { JwtGuard } from './jwt.guard';
import { JwtService, JwtPayload } from '../../auth/jwt.service';

const mockPayload: JwtPayload = {
  sub: '1234567890',
  email: 'user@example.com',
  roles: ['user'],
  scopes: ['read'],
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
};

const mockJwtService = {
  verifySignature: jest.fn(),
};

const buildMockContext = (
  path: string,
  authHeader?: string,
  headerKey: string = 'authorization',
): ExecutionContext => {
  const request: {
    headers: Record<string, string | undefined>;
    user?: JwtPayload;
    path: string;
  } = {
    headers: { [headerKey]: authHeader },
    user: undefined,
    path,
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
};

describe('JwtGuard', () => {
  let jwtGuard: JwtGuard;

  beforeEach(() => {
    jwtGuard = new JwtGuard(mockJwtService as unknown as JwtService);
    jest.clearAllMocks();
  });

  describe('canActivate', () => {
    it('should allow access for public paths without token', () => {
      const context = buildMockContext('/healthcheck');
      context.switchToHttp().getRequest<{ user?: JwtPayload }>();

      expect(jwtGuard.canActivate(context)).toBe(true);
      expect(mockJwtService.verifySignature).not.toHaveBeenCalled();
    });

    it('should allow access for valid token', () => {
      mockJwtService.verifySignature.mockReturnValue(mockPayload);
      const token = 'Bearer valid.jwt.token';
      const context = buildMockContext('/protected', token);
      const request = context
        .switchToHttp()
        .getRequest<{ user?: JwtPayload }>();

      expect(jwtGuard.canActivate(context)).toBe(true);
      expect(mockJwtService.verifySignature).toHaveBeenCalledWith(
        'valid.jwt.token',
      );
      expect(request.user).toEqual(mockPayload);
    });

    it('should allow access for valid token with capitalized Authorization header', () => {
      mockJwtService.verifySignature.mockReturnValue(mockPayload);
      const token = 'Bearer valid.jwt.token';
      const context = buildMockContext('/protected', token, 'Authorization');
      const request = context
        .switchToHttp()
        .getRequest<{ user?: JwtPayload }>();

      expect(jwtGuard.canActivate(context)).toBe(true);
      expect(mockJwtService.verifySignature).toHaveBeenCalledWith(
        'valid.jwt.token',
      );
      expect(request.user).toEqual(mockPayload);
    });
    it('should throw UnauthorizedException for missing Authorization header', () => {
      const context = buildMockContext('/protected');
      context.switchToHttp().getRequest<{ user?: JwtPayload }>();

      expect(() => jwtGuard.canActivate(context)).toThrow(
        UnauthorizedException,
      );
      expect(mockJwtService.verifySignature).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException for malformed Authorization header', () => {
      const token = 'InvalidHeader';
      const context = buildMockContext('/protected', token);
      context.switchToHttp().getRequest<{ user?: JwtPayload }>();

      expect(() => jwtGuard.canActivate(context)).toThrow(
        UnauthorizedException,
      );
      expect(mockJwtService.verifySignature).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException for invalid token', () => {
      mockJwtService.verifySignature.mockImplementation(() => {
        throw new UnauthorizedException('Invalid token');
      });

      const token = 'Bearer invalid.jwt.token';
      const context = buildMockContext('/protected', token);
      context.switchToHttp().getRequest<{ user?: JwtPayload }>();

      expect(() => jwtGuard.canActivate(context)).toThrow(
        UnauthorizedException,
      );
      expect(mockJwtService.verifySignature).toHaveBeenCalledWith(
        'invalid.jwt.token',
      );
    });

    it('should throw UnauthorizedException for expired token', () => {
      mockJwtService.verifySignature.mockImplementation(() => {
        throw new UnauthorizedException('Token has expired');
      });

      const token = 'Bearer expired.jwt.token';
      const context = buildMockContext('/protected', token);
      context.switchToHttp().getRequest<{ user?: JwtPayload }>();

      expect(() => jwtGuard.canActivate(context)).toThrow(
        UnauthorizedException,
      );
      expect(mockJwtService.verifySignature).toHaveBeenCalledWith(
        'expired.jwt.token',
      );
    });

    it('should not populate request.user for public paths', () => {
      const context = buildMockContext('/version');
      const request = context
        .switchToHttp()
        .getRequest<{ user?: JwtPayload }>();

      expect(jwtGuard.canActivate(context)).toBe(true);
      expect(request.user).toBeUndefined();
    });

    it('should not populate request.user for invalid token', () => {
      mockJwtService.verifySignature.mockImplementation(() => {
        throw new UnauthorizedException('Invalid token');
      });

      const token = 'Bearer invalid.jwt.token';
      const context = buildMockContext('/protected', token);
      const request = context
        .switchToHttp()
        .getRequest<{ user?: JwtPayload }>();

      expect(() => jwtGuard.canActivate(context)).toThrow(
        UnauthorizedException,
      );
      expect(request.user).toBeUndefined();
    });
  });
});
