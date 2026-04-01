import { Module } from '@nestjs/common';
import { RouterMatcherService } from './router-matcher.service';

@Module({
  providers: [RouterMatcherService],
  exports: [RouterMatcherService],
})
export class SharedModule {}
