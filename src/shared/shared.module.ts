import { Module } from '@nestjs/common';
import { RouterMatcherService } from './router-matcher.service';
import { LoggerService } from './logger.service';

@Module({
  providers: [RouterMatcherService, LoggerService],
  exports: [RouterMatcherService, LoggerService],
})
export class SharedModule {}
