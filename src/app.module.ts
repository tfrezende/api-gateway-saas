import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import { ProxyModule } from './proxy/proxy.module';
import { AuthModule } from './auth/auth.module';
import { SharedModule } from './shared/shared.module';
import { JwtGuard } from './common/guards/jwt.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { ThrottlerGuard } from './common/guards/throttler.guard';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { HealthModule } from './health/health.module';
import { appConfig } from './config/app.config';
import { MetricsModule } from './metrics/metrics.module';
import { TenantModule } from './tenant/tenant.module';

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [
        {
          name: 'ip',
          ttl: appConfig.throttler.ip.ttl,
          limit: appConfig.throttler.ip.limit,
        },
        {
          name: 'user',
          ttl: appConfig.throttler.user.ttl,
          limit: appConfig.throttler.user.limit,
        },
      ],
      storage: new ThrottlerStorageRedisService({
        host: appConfig.redis.host,
        port: appConfig.redis.port,
      }),
    }),
    SharedModule,
    AuthModule,
    HealthModule,
    MetricsModule,
    ProxyModule,
    TenantModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: LoggingInterceptor,
    },
    {
      provide: APP_FILTER,
      useClass: HttpExceptionFilter,
    },
  ],
})
export class AppModule {}
