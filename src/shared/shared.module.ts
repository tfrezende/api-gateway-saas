import { Module } from '@nestjs/common';
import { RouterMatcherService } from './router-matcher.service';
import { LoggerService } from './logger.service';
import { TenantModule } from '../tenant/tenant.module';

@Module({
  imports: [TenantModule],
  providers: [RouterMatcherService, LoggerService],
  exports: [RouterMatcherService, LoggerService],
})
export class SharedModule {}
