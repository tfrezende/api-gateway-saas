import { Module } from '@nestjs/common';
import { RedisClientService, RedisProvider } from './redis.provider';
import { TenantRouteRegistryService } from './tenant-route-registry.service';
import { AdminGuard } from './admin.guard';
import { AdminController } from './admin.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [AdminController],
  providers: [
    RedisClientService,
    RedisProvider,
    TenantRouteRegistryService,
    AdminGuard,
  ],
  exports: [TenantRouteRegistryService, RedisClientService, RedisProvider],
})
export class TenantModule {}
