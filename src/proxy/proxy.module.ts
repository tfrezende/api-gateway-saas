import { Module } from '@nestjs/common';
import { ProxyController } from './proxy.controller';
import { ProxyService } from './proxy.service';
import { AuthModule } from '../auth/auth.module';
import { SharedModule } from '../shared/shared.module';
import { CircuitBreakerService } from './circuit-breaker/circuit-breaker.service';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [AuthModule, SharedModule, MetricsModule],
  controllers: [ProxyController],
  providers: [ProxyService, CircuitBreakerService],
})
export class ProxyModule {}
