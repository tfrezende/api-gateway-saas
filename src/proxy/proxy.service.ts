import { BadGatewayException, Injectable } from '@nestjs/common';
import { Request, Response } from 'express';
import { request as httpRequest } from 'http';
import { RouterMatcherService } from '../shared/router-matcher.service';

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
      response.writeHead(proxyRes.statusCode || 500, proxyRes.headers);
      proxyRes.pipe(response, { end: true });
    });

    proxyReq.on('error', (err) => {
      throw new BadGatewayException(`Error forwarding request: ${err.message}`);
    });

    request.pipe(proxyReq);
  }
}
