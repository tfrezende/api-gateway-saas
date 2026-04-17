import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { TenantRouteRegistryService } from './tenant-route-registry.service';
import type { RouteConfig } from '../config/routes.config';

const mockRegistry = {
  getRoutes: jest.fn(),
  setRoutes: jest.fn(),
  addRoutePath: jest.fn(),
  deleteRoutes: jest.fn(),
  deleteRoutePath: jest.fn(),
};

const routeFixtures: RouteConfig[] = [
  { path: '/api/users', target: 'http://localhost:3001' },
  { path: '/api/products', target: 'http://localhost:3002' },
];

const tenantId = 'tenant-abc';

describe('AdminController', () => {
  let controller: AdminController;

  beforeEach(() => {
    controller = new AdminController(
      mockRegistry as unknown as TenantRouteRegistryService,
    );
    jest.clearAllMocks();
  });

  // ── GET /:tenantId/routes ──────────────────────────────────────────

  describe('getTenantRoutes', () => {
    it('should return routes when registry has data for the tenant', async () => {
      mockRegistry.getRoutes.mockResolvedValue(routeFixtures);

      const result = await controller.getTenantRoutes(tenantId);

      expect(result).toEqual(routeFixtures);
      expect(mockRegistry.getRoutes).toHaveBeenCalledWith(tenantId);
    });

    it('should throw NotFoundException when tenant has no routes', async () => {
      mockRegistry.getRoutes.mockResolvedValue(null);

      await expect(controller.getTenantRoutes(tenantId)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── PUT /:tenantId/routes ──────────────────────────────────────────

  describe('setTenantRoutes', () => {
    it('should call setRoutes with the tenant and body', () => {
      mockRegistry.setRoutes.mockResolvedValue(undefined);

      controller.setTenantRoutes(tenantId, routeFixtures);

      expect(mockRegistry.setRoutes).toHaveBeenCalledWith(
        tenantId,
        routeFixtures,
      );
    });

    it('should throw BadRequestException when body is not an array', () => {
      expect(() =>
        controller.setTenantRoutes(
          tenantId,
          'not-an-array' as unknown as RouteConfig[],
        ),
      ).toThrow(BadRequestException);
    });

    it('should throw BadRequestException when an item is missing path', () => {
      const invalid = [{ target: 'http://localhost:3001' }] as RouteConfig[];
      expect(() => controller.setTenantRoutes(tenantId, invalid)).toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when an item is missing target', () => {
      const invalid = [{ path: '/api/users' }] as RouteConfig[];
      expect(() => controller.setTenantRoutes(tenantId, invalid)).toThrow(
        BadRequestException,
      );
    });
  });

  // ── POST /:tenantId/routes ─────────────────────────────────────────

  describe('addTenantRoutes', () => {
    const newRoute: RouteConfig = {
      path: '/api/orders',
      target: 'http://localhost:3003',
    };

    it('should call addRoutePath with the tenant and body', () => {
      mockRegistry.addRoutePath.mockResolvedValue(undefined);

      controller.addTenantRoutes(tenantId, newRoute);

      expect(mockRegistry.addRoutePath).toHaveBeenCalledWith(
        tenantId,
        newRoute,
      );
    });

    it('should throw BadRequestException when body is missing path', () => {
      const invalid = { target: 'http://localhost:3003' } as RouteConfig;
      expect(() => controller.addTenantRoutes(tenantId, invalid)).toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when body is missing target', () => {
      const invalid = { path: '/api/orders' } as RouteConfig;
      expect(() => controller.addTenantRoutes(tenantId, invalid)).toThrow(
        BadRequestException,
      );
    });
  });

  // ── DELETE /:tenantId/routes ───────────────────────────────────────

  describe('deleteTenantRoutes', () => {
    it('should call deleteRoutes when no path query param is provided', () => {
      mockRegistry.deleteRoutes.mockResolvedValue(undefined);

      controller.deleteTenantRoutes(tenantId);

      expect(mockRegistry.deleteRoutes).toHaveBeenCalledWith(tenantId);
      expect(mockRegistry.deleteRoutePath).not.toHaveBeenCalled();
    });

    it('should call deleteRoutePath when a path query param is provided', () => {
      mockRegistry.deleteRoutePath.mockResolvedValue(undefined);

      controller.deleteTenantRoutes(tenantId, '/api/users');

      expect(mockRegistry.deleteRoutePath).toHaveBeenCalledWith(
        tenantId,
        '/api/users',
      );
      expect(mockRegistry.deleteRoutes).not.toHaveBeenCalled();
    });
  });
});
