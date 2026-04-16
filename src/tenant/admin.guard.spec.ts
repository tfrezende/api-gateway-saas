import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { JwtService, JwtPayload } from '../auth/jwt.service';

const mockJwtService = {
  verifySignature: jest.fn(),
};

const buildMockContext = (authHeader?: string): ExecutionContext => {
  const request = {
    headers: authHeader ? { authorization: authHeader } : {},
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
};

const buildPayload = (overrides?: Partial<JwtPayload>): JwtPayload => ({
  sub: 'user-123',
  email: 'admin@example.com',
  roles: ['admin'],
  scopes: ['read'],
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
  ...overrides,
});

describe('AdminGuard', () => {
  let guard: AdminGuard;

  beforeEach(() => {
    guard = new AdminGuard(mockJwtService as unknown as JwtService);
    jest.clearAllMocks();
  });

  it('should throw UnauthorizedException when no Authorization header is present', () => {
    const context = buildMockContext();
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(mockJwtService.verifySignature).not.toHaveBeenCalled();
  });

  it('should throw UnauthorizedException when Authorization header is malformed', () => {
    const context = buildMockContext('InvalidHeader');
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
    expect(mockJwtService.verifySignature).not.toHaveBeenCalled();
  });

  it('should propagate exceptions thrown by verifySignature', () => {
    mockJwtService.verifySignature.mockImplementation(() => {
      throw new UnauthorizedException('Token has expired');
    });
    const context = buildMockContext('Bearer expired.token');
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should throw ForbiddenException when token is valid but user is not admin', () => {
    mockJwtService.verifySignature.mockReturnValue(buildPayload({ roles: ['user'] }));
    const context = buildMockContext('Bearer valid.token');
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should return true when token is valid and user has admin role', () => {
    mockJwtService.verifySignature.mockReturnValue(buildPayload({ roles: ['admin'] }));
    const context = buildMockContext('Bearer valid.token');
    expect(guard.canActivate(context)).toBe(true);
  });
});
