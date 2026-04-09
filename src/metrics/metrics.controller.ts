import { Controller, Get, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { MetricsGuard } from './metrics.guard';
import { MetricsService } from './metrics.service';

@Controller('metrics')
@UseGuards(MetricsGuard)
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get()
  async getMetrics(@Res() res: Response): Promise<void> {
    const metrics = await this.metricsService.getMetrics();
    res
      .status(200)
      .setHeader('Content-Type', this.metricsService.getContentType())
      .send(metrics);
  }
}
