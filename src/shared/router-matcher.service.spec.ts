import { RouteConfig } from 'src/config/routes.config';
import { RouterMatcherService } from './router-matcher.service';
import { TenantRouteRegistryService } from 'src/tenant/tenant-route-registry.service';

const routeFixtures: RouteConfig[] = [
  {
    path: '/api/users/:id',
    target: 'http://localhost:3001',
    methods: {
      GET: { isPublic: true },
      PATCH: { roles: ['user'], scopes: ['write'] },
      DELETE: { roles: ['admin'], scopes: ['delete'] },
    },
  },
  {
    path: '/api/auth',
    target: 'http://localhost:3002',
    methods: {
      POST: { isPublic: true },
    },
  },
  {
    path: '/api/products',
    target: 'http://localhost:3003',
    methods: {
      GET: {},
    },
  },
];

const mockRegistry = {
  getRoutes: jest.fn(),
};

describe('RouterMatcherService', () => {
  let routerMatcherService: RouterMatcherService;

  beforeEach(() => {
    jest.clearAllMocks();
    mockRegistry.getRoutes.mockResolvedValue(routeFixtures);
    routerMatcherService = new RouterMatcherService(
      mockRegistry as unknown as TenantRouteRegistryService,
    );
  });
  it('should match an exact path', async () => {
    const route = await routerMatcherService.matchRoute('/api/auth');
    expect(route).toBeDefined();
    expect(route?.target).toBe('http://localhost:3002');
  });

  it('should match a path with no parameters', async () => {
    const route = await routerMatcherService.matchRoute('/api/products');
    expect(route).toBeDefined();
    expect(route?.target).toBe('http://localhost:3003');
  });

  it('should match a path with parameters', async () => {
    const route = await routerMatcherService.matchRoute('/api/users/123');
    expect(route).toBeDefined();
    expect(route?.target).toBe('http://localhost:3001');
  });

  it('should match a parameterized path with a uuid', async () => {
    const route = await routerMatcherService.matchRoute(
      '/api/users/550e8400-e29b-41d4-a716-446655440000',
    );
    expect(route).toBeDefined();
    expect(route?.target).toBe('http://localhost:3001');
  });

  it('should match a parameterized path with a string', async () => {
    const route = await routerMatcherService.matchRoute('/api/users/john-doe');
    expect(route).toBeDefined();
    expect(route?.target).toBe('http://localhost:3001');
  });

  it('should return undefined for an unmatched path', async () => {
    const route = await routerMatcherService.matchRoute('/api/unknown');
    expect(route).toBeUndefined();
  });

  it('should return undefined for an empty path', async () => {
    const route = await routerMatcherService.matchRoute('');
    expect(route).toBeUndefined();
  });

  it('should return undefined for a path that partially matches', async () => {
    const route = await routerMatcherService.matchRoute('/api/users');
    expect(route).toBeUndefined();
  });

  it('should return undefined for a path with extra segments', async () => {
    const route = await routerMatcherService.matchRoute(
      '/api/users/123/profile',
    );
    expect(route).toBeUndefined();
  });

  it('should return the full route config for a matched path', async () => {
    const route = await routerMatcherService.matchRoute('/api/users/123');
    expect(route).toBeDefined();
    expect(route?.path).toBe('/api/users/:id');
    expect(route?.target).toBe('http://localhost:3001');
    expect(route?.methods).toEqual({
      GET: { isPublic: true },
      PATCH: { roles: ['user'], scopes: ['write'] },
      DELETE: { roles: ['admin'], scopes: ['delete'] },
    });
  });

  it('should return the correct target for a parameterized path', async () => {
    const route = await routerMatcherService.matchRoute('/api/users/456');
    expect(route).toBeDefined();
    expect(route?.target).toBe('http://localhost:3001');
  });

  it('should use default tenant when no tenantId is provided', async () => {
    await routerMatcherService.matchRoute('/api/auth');
    expect(mockRegistry.getRoutes).toHaveBeenCalledWith('default');
  });
});
