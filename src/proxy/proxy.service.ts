import { BadGatewayException, Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import { request as httpRequest } from 'http';
import { RouterMatcherService } from '../shared/router-matcher.service';
import { CircuitBreakerService } from './circuit-breaker/circuit-breaker.service';
import { appConfig } from '../config/app.config';
import { BrokenCircuitError } from '../shared/utils/error.utils';

@Injectable()
export class ProxyService {
  constructor(
    private readonly routerMatcherService: RouterMatcherService,
    private readonly circuitBreakerService: CircuitBreakerService,
  ) {}

  forward(request: Request, response: Response) {
    const route = this.routerMatcherService.matchRoute(request.path);

    if (!route || !route.target) {
      throw new BadGatewayException('No matching route found');
    }

    const circuitBreaker = this.circuitBreakerService.getCircuitBreaker(
      route.target,
    );

    circuitBreaker
      .execute(() => this.pipe(request, response, route.target))
      .catch((err) => {
        if (err instanceof BrokenCircuitError) {
          if (!response.headersSent) {
            response.writeHead(503, { 'Content-Type': 'application/json' });
            response.end(
              JSON.stringify({
                statusCode: 503,
                message: `Service ${route.target} is currently unavailable - circuit is open`,
              }),
            );
            return;
          }
        }

        if (!response.headersSent) {
          response.writeHead(502, { 'Content-Type': 'application/json' });
          response.end(
            JSON.stringify({
              statusCode: 502,
              message: 'Bad gateway error',
            }),
          );
        }
      });
  }

  private pipe(
    request: Request,
    response: Response,
    target: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const targetUrl = new URL(target);

      const options = {
        hostname: targetUrl.hostname,
        port: targetUrl.port,
        path: request.url,
        method: request.method,
        headers: {
          ...request.headers,
          ...(request.user && {
            'X-Auth-User-Id': request.user.sub,
            'X-Auth-User-Email': request.user.email,
            'X-Auth-User-Roles': request.user.roles.join(','),
            'X-Auth-User-Scopes': request.user.scopes.join(','),
          }),
        },
      };

      const proxyReq = httpRequest(options, (proxyRes) => {
        response.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
        proxyRes.pipe(response, { end: true });

        proxyRes.on('end', resolve);
        proxyRes.on('error', reject);
      });

      proxyReq.setTimeout(appConfig.proxy.timeout, () => {
        proxyReq.destroy();
        reject(new Error('Upstream service timed out'));
      });

      proxyReq.on('error', (err: Error) => {
        reject(err);
      });

      request.pipe(proxyReq);
    });
  }
}
