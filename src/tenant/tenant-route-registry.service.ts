import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { RouteConfig } from '../config/routes.config';
import { toError } from '../shared/utils/error.utils';
import { appConfig } from '../config/app.config';

@Injectable()
export class TenantRouteRegistryService {
  private cache = new Map<
    string,
    { routes: RouteConfig[]; expiresAt: number }
  >();

  constructor(@Inject('REDIS_CLIENT') private readonly redisClient: Redis) {}

  async getRoutes(tenantId: string): Promise<RouteConfig[] | null> {
    const now = Date.now();

    const cached = this.cache.get(tenantId);
    if (cached) {
      if (cached.expiresAt > now) {
        return cached.routes;
      }
      this.cache.delete(tenantId);
    }

    const redisKey = `tenant:${tenantId}:routes`;
    const routesJson = await this.redisClient.get(redisKey);

    if (!routesJson) {
      this.cache.delete(tenantId);
      return null;
    }

    try {
      const routes: RouteConfig[] = JSON.parse(routesJson) as RouteConfig[];
      this.cache.set(tenantId, {
        routes,
        expiresAt: now + appConfig.tenant.cacheTtlMs,
      });
      return routes;
    } catch (error: unknown) {
      this.cache.delete(tenantId);
      throw new Error(
        `Failed to parse route config for tenant ${tenantId}: ${toError(error).message}`,
      );
    }
  }

  async setRoutes(tenantId: string, routes: RouteConfig[]): Promise<void> {
    const redisKey = `tenant:${tenantId}:routes`;
    await this.redisClient.set(redisKey, JSON.stringify(routes));

    this.cache.set(tenantId, {
      routes,
      expiresAt: Date.now() + appConfig.tenant.cacheTtlMs,
    });
  }

  async addRoutePath(tenantId: string, route: RouteConfig): Promise<void> {
    const routes = (await this.getRoutes(tenantId)) || [];
    const existingIndex = routes.findIndex((r) => r.path === route.path);
    if (existingIndex !== -1) {
      routes[existingIndex] = route;
    } else {
      routes.push(route);
    }
    await this.setRoutes(tenantId, routes);
  }

  async deleteRoutes(tenantId: string): Promise<void> {
    const redisKey = `tenant:${tenantId}:routes`;
    await this.redisClient.del(redisKey);
    this.cache.delete(tenantId);
  }

  async deleteRoutePath(tenantId: string, routePath: string): Promise<void> {
    const routes = await this.getRoutes(tenantId);
    if (!routes) {
      return;
    }
    const updatedRoutes = routes.filter((route) => route.path !== routePath);
    if (!updatedRoutes.length) {
      await this.deleteRoutes(tenantId);
      return;
    }
    await this.setRoutes(tenantId, updatedRoutes);
  }
}
