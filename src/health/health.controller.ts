import { Controller, Get } from '@nestjs/common';

interface HealthResponse {
  status: string;
  timestamp: string;
}

interface VersionResponse {
  version: string;
  name: string;
}

@Controller()
export class HealthController {
  @Get('healthcheck')
  healthCheck(): HealthResponse {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }

  @Get('version')
  version(): VersionResponse {
    return {
      version: process.env.npm_package_version || 'unknown',
      name: process.env.npm_package_name || 'api-gateway',
    };
  }
}
