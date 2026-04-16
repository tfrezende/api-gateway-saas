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
    it('should allow access to public routes', async () => {
      mockRouterMatcherService.matchRoute.mockResolvedValue(mockRoutes.public);
      const context = buildMockContext('POST', '/public');
      expect(await rolesGuard.canActivate(context)).toBe(true);
    });

    it('should allow access to protected routes with valid roles and scopes', async () => {
      mockRouterMatcherService.matchRoute.mockResolvedValue(mockRoutes.protected);
      const user = buildUser({ roles: ['user'], scopes: ['write'] });
      const context = buildMockContext('PATCH', '/protected', user);
      expect(await rolesGuard.canActivate(context)).toBe(true);
    });

    it('should deny access to protected routes with insufficient roles', async () => {
      mockRouterMatcherService.matchRoute.mockResolvedValue(mockRoutes.protected);
      const user = buildUser({ roles: ['guest'], scopes: ['write'] });
      const context = buildMockContext('PATCH', '/protected', user);
      await expect(rolesGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
      await expect(rolesGuard.canActivate(context)).rejects.toThrow(
        'Insufficient permissions',
      );
    });

    it('should deny access to protected routes with insufficient scopes', async () => {
      mockRouterMatcherService.matchRoute.mockResolvedValue(mockRoutes.protected);
      const user = buildUser({ roles: ['user'], scopes: ['read'] });
      const context = buildMockContext('PATCH', '/protected', user);
      await expect(rolesGuard.canActivate(context)).rejects.toThrow(ForbiddenException);
      await expect(rolesGuard.canActivate(context)).rejects.toThrow(
        'Insufficient permissions',
      );
    });

    it('should allow access if no method config is defined', async () => {
      mockRouterMatcherService.matchRoute.mockResolvedValue(mockRoutes.noConfig);
      const user = buildUser();
      const context = buildMockContext('GET', '/no-config', user);
      expect(await rolesGuard.canActivate(context)).toBe(true);
    });

    it('should allow access if no route config is found', async () => {
      mockRouterMatcherService.matchRoute.mockResolvedValue(undefined);
      const user = buildUser();
      const context = buildMockContext('GET', '/unknown', user);
      expect(await rolesGuard.canActivate(context)).toBe(true);
    });

    it('should allow access if user is not authenticated but route is public', async () => {
      mockRouterMatcherService.matchRoute.mockResolvedValue(mockRoutes.public);
      const context = buildMockContext('POST', '/public');
      expect(await rolesGuard.canActivate(context)).toBe(true);
    });

    it('should allow access if user is not authenticated and route has no config', async () => {
      mockRouterMatcherService.matchRoute.mockResolvedValue(undefined);
      const context = buildMockContext('GET', '/no-config');
      expect(await rolesGuard.canActivate(context)).toBe(true);
    });

    it('should allow access if route has no required roles', async () => {
      const routeWithoutRoles: RouteConfig = {
        path: '/route-without-roles',
        target: 'http://localhost:3000',
        methods: {
          GET: { isPublic: true },
        },
      };
      mockRouterMatcherService.matchRoute.mockResolvedValue(routeWithoutRoles);
      const user = buildUser({ roles: ['guest'] });
      const context = buildMockContext('GET', '/route-without-roles', user);
      expect(await rolesGuard.canActivate(context)).toBe(true);
    });

    it('should allow access if route has no required scopes', async () => {
      const routeWithoutScopes: RouteConfig = {
        path: '/route-without-scopes',
        target: 'http://localhost:3000',
        methods: {
          GET: { isPublic: true },
        },
      };
      mockRouterMatcherService.matchRoute.mockResolvedValue(routeWithoutScopes);
      const user = buildUser({ scopes: ['read'] });
      const context = buildMockContext('GET', '/route-without-scopes', user);
      expect(await rolesGuard.canActivate(context)).toBe(true);
    });
  });
});
