import { Injectable } from '@nestjs/common';
import { match } from 'path-to-regexp';
import { RouteConfig } from '../config/routes.config';
import { TenantRouteRegistryService } from '../tenant/tenant-route-registry.service';

@Injectable()
export class RouterMatcherService {
  constructor(
    private readonly tenantRouteRegistry: TenantRouteRegistryService,
  ) {}

  private findMatch(
    path: string,
    routeConfigs: RouteConfig[],
  ): RouteConfig | undefined {
    return routeConfigs.find((route) => {
      const matcher = match(route.path, { decode: decodeURIComponent });
      return matcher(path);
    });
  }

  async matchRoute(
    path: string,
    tenantId?: string,
  ): Promise<RouteConfig | undefined> {
    const tenantRoutes = await this.tenantRouteRegistry.getRoutes(
      tenantId ?? 'default',
    );

    if (!tenantRoutes) {
      return undefined;
    }

    return this.findMatch(path, tenantRoutes);
  }
}
