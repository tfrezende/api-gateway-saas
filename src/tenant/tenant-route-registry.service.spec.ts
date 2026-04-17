import { TenantRouteRegistryService } from './tenant-route-registry.service';
import type Redis from 'ioredis';
import type { RouteConfig } from '../config/routes.config';

const mockRedis = {
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
};

const routeFixtures: RouteConfig[] = [
  {
    path: '/api/users',
    target: 'http://localhost:3001',
    methods: { GET: { roles: ['user'], scopes: ['read'] } },
  },
  {
    path: '/api/products',
    target: 'http://localhost:3002',
    methods: { GET: { isPublic: true } },
  },
];

const tenantId = 'tenant-abc';
const redisKey = `tenant:${tenantId}:routes`;

describe('TenantRouteRegistryService', () => {
  let service: TenantRouteRegistryService;

  beforeEach(() => {
    service = new TenantRouteRegistryService(mockRedis as unknown as Redis);
    jest.clearAllMocks();
  });

  // ── getRoutes ──────────────────────────────────────────────────────

  describe('getRoutes', () => {
    it('should return from cache and not call Redis when cache is warm', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(routeFixtures));
      await service.getRoutes(tenantId); // warms the cache
      mockRedis.get.mockClear();

      const result = await service.getRoutes(tenantId);

      expect(result).toEqual(routeFixtures);
      expect(mockRedis.get).not.toHaveBeenCalled();
    });

    it('should fetch from Redis on cache miss and populate the cache', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(routeFixtures));

      const result = await service.getRoutes(tenantId);

      expect(mockRedis.get).toHaveBeenCalledWith(redisKey);
      expect(result).toEqual(routeFixtures);
    });

    it('should return null and clear cache when Redis has no data', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.getRoutes(tenantId);

      expect(result).toBeNull();
    });

    it('should throw when Redis returns invalid JSON', async () => {
      mockRedis.get.mockResolvedValue('not-valid-json{');

      await expect(service.getRoutes(tenantId)).rejects.toThrow(tenantId);
    });
  });

  // ── setRoutes ──────────────────────────────────────────────────────

  describe('setRoutes', () => {
    it('should write serialized routes to Redis with the correct key', async () => {
      mockRedis.set.mockResolvedValue('OK');

      await service.setRoutes(tenantId, routeFixtures);

      expect(mockRedis.set).toHaveBeenCalledWith(
        redisKey,
        JSON.stringify(routeFixtures),
      );
    });

    it('should populate the cache so a subsequent getRoutes skips Redis', async () => {
      mockRedis.set.mockResolvedValue('OK');

      await service.setRoutes(tenantId, routeFixtures);
      mockRedis.get.mockClear();

      const result = await service.getRoutes(tenantId);

      expect(result).toEqual(routeFixtures);
      expect(mockRedis.get).not.toHaveBeenCalled();
    });
  });

  // ── addRoutePath ───────────────────────────────────────────────────

  describe('addRoutePath', () => {
    const newRoute: RouteConfig = {
      path: '/api/orders',
      target: 'http://localhost:3003',
    };

    it('should create a new array when the tenant has no existing routes', async () => {
      mockRedis.get.mockResolvedValue(null);
      mockRedis.set.mockResolvedValue('OK');

      await service.addRoutePath(tenantId, newRoute);

      expect(mockRedis.set).toHaveBeenCalledWith(
        redisKey,
        JSON.stringify([newRoute]),
      );
    });

    it('should append the route when the path does not already exist', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(routeFixtures));
      mockRedis.set.mockResolvedValue('OK');

      await service.addRoutePath(tenantId, newRoute);

      expect(mockRedis.set).toHaveBeenCalledWith(
        redisKey,
        JSON.stringify([...routeFixtures, newRoute]),
      );
    });

    it('should replace the existing route when the path already exists', async () => {
      const updatedRoute: RouteConfig = {
        path: '/api/users',
        target: 'http://localhost:9999',
      };
      mockRedis.get.mockResolvedValue(JSON.stringify(routeFixtures));
      mockRedis.set.mockResolvedValue('OK');

      await service.addRoutePath(tenantId, updatedRoute);

      const saved = JSON.parse(
        (mockRedis.set.mock.calls[0] as [string, string])[1],
      ) as RouteConfig[];
      expect(saved.find((r) => r.path === '/api/users')?.target).toBe(
        'http://localhost:9999',
      );
      expect(saved).toHaveLength(routeFixtures.length);
    });
  });

  // ── deleteRoutes ───────────────────────────────────────────────────

  describe('deleteRoutes', () => {
    it('should call redis.del with the correct key', async () => {
      mockRedis.del.mockResolvedValue(1);

      await service.deleteRoutes(tenantId);

      expect(mockRedis.del).toHaveBeenCalledWith(redisKey);
    });

    it('should evict the cache so a subsequent getRoutes hits Redis', async () => {
      mockRedis.set.mockResolvedValue('OK');
      mockRedis.del.mockResolvedValue(1);
      mockRedis.get.mockResolvedValue(null);

      await service.setRoutes(tenantId, routeFixtures); // warms cache
      await service.deleteRoutes(tenantId); // evicts
      await service.getRoutes(tenantId);

      expect(mockRedis.get).toHaveBeenCalledWith(redisKey);
    });
  });

  // ── deleteRoutePath ────────────────────────────────────────────────

  describe('deleteRoutePath', () => {
    it('should remove the route and call setRoutes when other routes remain', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify(routeFixtures));
      mockRedis.set.mockResolvedValue('OK');

      await service.deleteRoutePath(tenantId, '/api/users');

      const saved = JSON.parse(
        (mockRedis.set.mock.calls[0] as [string, string])[1],
      ) as RouteConfig[];
      expect(saved.find((r) => r.path === '/api/users')).toBeUndefined();
      expect(saved).toHaveLength(routeFixtures.length - 1);
    });

    it('should call deleteRoutes when the deleted route was the last one', async () => {
      const singleRoute: RouteConfig[] = [routeFixtures[0]];
      mockRedis.get.mockResolvedValue(JSON.stringify(singleRoute));
      mockRedis.del.mockResolvedValue(1);

      await service.deleteRoutePath(tenantId, '/api/users');

      expect(mockRedis.del).toHaveBeenCalledWith(redisKey);
      expect(mockRedis.set).not.toHaveBeenCalled();
    });

    it('should do nothing when the tenant has no routes', async () => {
      mockRedis.get.mockResolvedValue(null);

      await service.deleteRoutePath(tenantId, '/api/users');

      expect(mockRedis.set).not.toHaveBeenCalled();
      expect(mockRedis.del).not.toHaveBeenCalled();
    });
  });
});
