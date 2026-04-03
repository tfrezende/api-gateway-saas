import { BadGatewayException, Injectable } from '@nestjs/common';
import { Request, Response } from 'express';
import { request as httpRequest } from 'http';
import { RouterMatcherService } from '../shared/router-matcher.service';
import { appConfig } from '../config/app.config';

@Injectable()
export class ProxyService {
  constructor(private readonly routerMatcherService: RouterMatcherService) {}

  forward(request: Request, response: Response) {
    const route = this.routerMatcherService.matchRoute(request.path);

    if (!route || !route.target) {
      throw new BadGatewayException('No matching route found');
    }

    const targetUrl = new URL(route.target);

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
    });

    proxyReq.setTimeout(appConfig.proxy.timeout, () => {
      proxyReq.destroy();
      if (!response.headersSent) {
        response.writeHead(502, { 'Content-Type': 'application/json' });
        response.end(
          JSON.stringify({
            statusCode: 502,
            message: 'Upstream service timed out',
          }),
        );
      }
    });

    proxyReq.on('error', (err: Error) => {
      if (!response.headersSent) {
        response.writeHead(502, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ statusCode: 502, message: err.message }));
      }
    });

    request.pipe(proxyReq);
  }
}
