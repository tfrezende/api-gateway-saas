import { Module } from '@nestjs/common';
import { RedisProvider } from './redis.provider';
import { TenantRouteRegistryService } from './tenant-route-registry.service';
import { AdminGuard } from './admin.guard';
import { AdminController } from './admin.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [RedisProvider, TenantRouteRegistryService, AdminGuard],
  exports: [TenantRouteRegistryService],
})
export class TenantModule {}
