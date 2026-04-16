import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  UseGuards,
  Param,
  NotFoundException,
  Body,
  BadRequestException,
  HttpCode,
  Query,
} from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { TenantRouteRegistryService } from './tenant-route-registry.service';
import type { RouteConfig } from '../config/routes.config';

@Controller('admin/tenants')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(
    private readonly tenantRouteRegistry: TenantRouteRegistryService,
  ) {}

  @Get(':tenantId/routes')
  async getTenantRoutes(@Param('tenantId') tenantId: string) {
    const routes = await this.tenantRouteRegistry.getRoutes(tenantId);
    if (!routes) {
      throw new NotFoundException(`No routes found for tenant ${tenantId}`);
    }
    return routes;
  }

  @HttpCode(204)
  @Put(':tenantId/routes')
  setTenantRoutes(
    @Param('tenantId') tenantId: string,
    @Body() body: RouteConfig[],
  ) {
    if (
      !Array.isArray(body) ||
      !body.every(
        (route) =>
          typeof route.path === 'string' && typeof route.target === 'string',
      )
    ) {
      throw new BadRequestException(
        'Request body must be an array of route configurations with "path" and "target" string properties',
      );
    }
    return this.tenantRouteRegistry.setRoutes(tenantId, body);
  }

  @Post(':tenantId/routes')
  addTenantRoutes(
    @Param('tenantId') tenantId: string,
    @Body() body: RouteConfig,
  ) {
    if (
      !body ||
      typeof body.path !== 'string' ||
      typeof body.target !== 'string'
    ) {
      throw new BadRequestException(
        'Request body must be a route configuration with "path" and "target" string properties',
      );
    }
    return this.tenantRouteRegistry.addRoutePath(tenantId, body);
  }

  @HttpCode(204)
  @Delete(':tenantId/routes')
  deleteTenantRoutes(
    @Param('tenantId') tenantId: string,
    @Query('path') routePath?: string,
  ) {
    if (routePath) {
      return this.tenantRouteRegistry.deleteRoutePath(tenantId, routePath);
    }
    return this.tenantRouteRegistry.deleteRoutes(tenantId);
  }
}
