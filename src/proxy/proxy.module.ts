import { Module } from '@nestjs/common';
import { ProxyController } from './proxy.controller';
import { ProxyService } from './proxy.service';
import { AuthModule } from '../auth/auth.module';
import { SharedModule } from '../shared/shared.module';

@Module({
  imports: [AuthModule, SharedModule],
  controllers: [ProxyController],
  providers: [ProxyService],
})
export class ProxyModule {}
