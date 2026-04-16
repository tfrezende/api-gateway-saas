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

  async forward(request: Request, response: Response) {
    const route = await this.routerMatcherService.matchRoute(
      request.path,
      request.tenantId,
    );

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
            this.sendErrorResponse(
              request,
              response,
              503,
              `Service ${route.target} is currently unavailable - circuit is open`,
            );
            return;
          }
        }
        if (!response.headersSent) {
          this.sendErrorResponse(request, response, 502, 'Bad gateway error');
        }
      });
  }

  private sendErrorResponse(
    request: Request,
    response: Response,
    statusCode: number,
    message: string,
  ): void {
    response.writeHead(statusCode, { 'Content-Type': 'application/json' });
    response.end(
      JSON.stringify({
        statusCode,
        message,
        timestamp: new Date().toISOString(),
        path: request.originalUrl || request.url,
      }),
    );
  }

  private pipe(
    request: Request,
    response: Response,
    target: string,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;

      const settleResolve = () => {
        if (settled) {
          return;
        }

        settled = true;
        resolve();
      };

      const settleReject = (err: Error) => {
        if (settled) {
          return;
        }

        settled = true;
        reject(err);
      };

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

        proxyRes.on('end', settleResolve);
        proxyRes.on('error', settleReject);
        proxyRes.on('close', () => {
          if (proxyRes.complete) {
            settleResolve();
            return;
          }

          settleReject(new Error('Upstream response closed prematurely'));
        });
      });

      proxyReq.setTimeout(appConfig.proxy.timeout, () => {
        proxyReq.destroy();
        settleReject(new Error('Upstream service timed out'));
      });

      proxyReq.on('error', (err: Error) => {
        settleReject(err);
      });

      request.on('close', () => {
        if (request.complete) {
          return;
        }

        proxyReq.destroy();
        settleReject(new Error('Client request closed before completion'));
      });

      response.on('close', () => {
        if (response.writableEnded) {
          return;
        }

        proxyReq.destroy();
        settleReject(new Error('Client response closed before completion'));
      });

      request.pipe(proxyReq);
    });
  }
}
