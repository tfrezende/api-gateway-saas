import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { RolesGuard } from './roles.guard';
import { RouterMatcherService } from '../../shared/router-matcher.service';
import type { JwtPayload } from '../../auth/jwt.service';
import type { RouteConfig } from '../../config/routes.config';

const mockRoutes: Record<string, RouteConfig> = {
  public: {
    path: '/public',
    target: 'http://localhost:3000',
    methods: {
      POST: {
        isPublic: true,
      },
    },
  },
  protected: {
    path: '/protected',
    target: 'http://localhost:3000',
    methods: {
      GET: { isPublic: true },
      PATCH: { roles: ['user'], scopes: ['write'] },
      DELETE: { roles: ['admin'], scopes: ['delete'] },
    },
  },
  noConfig: {
    path: '/no-config',
    target: 'http://localhost:3000',
  },
};

const mockRouterMatcherService = {
  matchRoute: jest.fn(),
};

const buildUser = (overrides?: Partial<JwtPayload>): JwtPayload => ({
  sub: '1234567890',
  email: 'user@example.com',
  roles: ['user'],
  scopes: ['read'],
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 3600,
  ...overrides,
});

const buildMockContext = (method: string, path: string, user?: JwtPayload) => {
  const request = {
    method,
    path,
    user,
  };

  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;
};

describe('RolesGuard', () => {
  let rolesGuard: RolesGuard;

  beforeEach(() => {
    rolesGuard = new RolesGuard(
      mockRouterMatcherService as unknown as RouterMatcherService,
    );
  });

  describe('canActivate', () => {
    it('should allow access to public routes', () => {
      mockRouterMatcherService.matchRoute.mockReturnValue(mockRoutes.public);
      const context = buildMockContext('POST', '/public');
      expect(rolesGuard.canActivate(context)).toBe(true);
    });

    it('should allow access to protected routes with valid roles and scopes', () => {
      mockRouterMatcherService.matchRoute.mockReturnValue(mockRoutes.protected);
      const user = buildUser({ roles: ['user'], scopes: ['write'] });
      const context = buildMockContext('PATCH', '/protected', user);
      expect(rolesGuard.canActivate(context)).toBe(true);
    });

    it('should deny access to protected routes with insufficient roles', () => {
      mockRouterMatcherService.matchRoute.mockReturnValue(mockRoutes.protected);
      const user = buildUser({ roles: ['guest'], scopes: ['write'] });
      const context = buildMockContext('PATCH', '/protected', user);
      expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => rolesGuard.canActivate(context)).toThrow(
        'Insufficient permissions',
      );
    });

    it('should deny access to protected routes with insufficient scopes', () => {
      mockRouterMatcherService.matchRoute.mockReturnValue(mockRoutes.protected);
      const user = buildUser({ roles: ['user'], scopes: ['read'] });
      const context = buildMockContext('PATCH', '/protected', user);
      expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
      expect(() => rolesGuard.canActivate(context)).toThrow(
        'Insufficient permissions',
      );
    });

    it('should allow access if no method config is defined', () => {
      mockRouterMatcherService.matchRoute.mockReturnValue(mockRoutes.noConfig);
      const user = buildUser();
      const context = buildMockContext('GET', '/no-config', user);
      expect(rolesGuard.canActivate(context)).toBe(true);
    });

    it('should allow access if no route config is found', () => {
      mockRouterMatcherService.matchRoute.mockReturnValue(undefined);
      const user = buildUser();
      const context = buildMockContext('GET', '/unknown', user);
      expect(rolesGuard.canActivate(context)).toBe(true);
    });

    it('should allow access if user is not authenticated but route is public', () => {
      mockRouterMatcherService.matchRoute.mockReturnValue(mockRoutes.public);
      const context = buildMockContext('POST', '/public');
      expect(rolesGuard.canActivate(context)).toBe(true);
    });

    it('should allow access if user is not authenticated and route has no config', () => {
      mockRouterMatcherService.matchRoute.mockReturnValue(undefined);
      const context = buildMockContext('GET', '/no-config');
      expect(rolesGuard.canActivate(context)).toBe(true);
    });

    it('should allow access if route has no required roles', () => {
      const routeWithoutRoles: RouteConfig = {
        path: '/route-without-roles',
        target: 'http://localhost:3000',
        methods: {
          GET: { isPublic: true },
        },
      };
      mockRouterMatcherService.matchRoute.mockReturnValue(routeWithoutRoles);
      const user = buildUser({ roles: ['guest'] });
      const context = buildMockContext('GET', '/route-without-roles', user);
      expect(rolesGuard.canActivate(context)).toBe(true);
    });

    it('should allow access if route has no required scopes', () => {
      const routeWithoutScopes: RouteConfig = {
        path: '/route-without-scopes',
        target: 'http://localhost:3000',
        methods: {
          GET: { isPublic: true },
        },
      };
      mockRouterMatcherService.matchRoute.mockReturnValue(routeWithoutScopes);
      const user = buildUser({ scopes: ['read'] });
      const context = buildMockContext('GET', '/route-without-scopes', user);
      expect(rolesGuard.canActivate(context)).toBe(true);
    });
  });
});
