import type { Request, Response } from 'express';
import { All, Controller, Req, Res, UseGuards } from '@nestjs/common';
import { ProxyService } from './proxy.service';
import { JwtGuard } from '../common/guards/jwt.guard';
import { RolesGuard } from '../common/guards/roles.guard';

@Controller()
@UseGuards(JwtGuard, RolesGuard)
export class ProxyController {
  constructor(private readonly proxyService: ProxyService) {}

  @All('*')
  forward(@Req() request: Request, @Res() response: Response) {
    this.proxyService.forward(request, response);
  }
}
