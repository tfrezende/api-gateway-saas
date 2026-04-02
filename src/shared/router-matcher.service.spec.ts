import { RouterMatcherService } from './router-matcher.service';
import { RouteConfig } from '../config/routes.config';

jest.mock('../config/routes.config', () => ({
  routes: [
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
  ] as RouteConfig[],
}));

describe('RouterMatcherService', () => {
  let routerMatcherService: RouterMatcherService;

  beforeEach(() => {
    routerMatcherService = new RouterMatcherService();
  });

  it('should match an exact path', () => {
    const route = routerMatcherService.matchRoute('/api/auth');
    expect(route).toBeDefined();
    expect(route?.target).toBe('http://localhost:3002');
  });

  it('should match a path with no parameters', () => {
    const route = routerMatcherService.matchRoute('/api/products');
    expect(route).toBeDefined();
    expect(route?.target).toBe('http://localhost:3003');
  });

  it('should match a path with parameters', () => {
    const route = routerMatcherService.matchRoute('/api/users/123');
    expect(route).toBeDefined();
    expect(route?.target).toBe('http://localhost:3001');
  });

  it('should match a parameterized path with a uuid', () => {
    const route = routerMatcherService.matchRoute(
      '/api/users/550e8400-e29b-41d4-a716-446655440000',
    );
    expect(route).toBeDefined();
    expect(route?.target).toBe('http://localhost:3001');
  });

  it('should match a parameterized path with a string', () => {
    const route = routerMatcherService.matchRoute('/api/users/john-doe');
    expect(route).toBeDefined();
    expect(route?.target).toBe('http://localhost:3001');
  });

  it('should return undefined for an unmatched path', () => {
    const route = routerMatcherService.matchRoute('/api/unknown');
    expect(route).toBeUndefined();
  });

  it('should return undefined for an empty path', () => {
    const route = routerMatcherService.matchRoute('');
    expect(route).toBeUndefined();
  });

  it('should return undefined for a path that partially matches', () => {
    const route = routerMatcherService.matchRoute('/api/users');
    expect(route).toBeUndefined();
  });

  it('should return undefined for a path with extra segments', () => {
    const route = routerMatcherService.matchRoute('/api/users/123/profile');
    expect(route).toBeUndefined();
  });

  it('should return the full route config for a matched path', () => {
    const route = routerMatcherService.matchRoute('/api/users/123');
    expect(route).toBeDefined();
    expect(route?.path).toBe('/api/users/:id');
    expect(route?.target).toBe('http://localhost:3001');
    expect(route?.methods).toEqual({
      GET: { isPublic: true },
      PATCH: { roles: ['user'], scopes: ['write'] },
      DELETE: { roles: ['admin'], scopes: ['delete'] },
    });
  });

  it('should return the correct target for a parameterized path', () => {
    const route = routerMatcherService.matchRoute('/api/users/456');
    expect(route).toBeDefined();
    expect(route?.target).toBe('http://localhost:3001');
  });
});
