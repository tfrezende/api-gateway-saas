import { Injectable } from '@nestjs/common';
import { match } from 'path-to-regexp';
import { routes, RouteConfig } from '../config/routes.config';

@Injectable()
export class RouterMatcherService {
  matchRoute(path: string): RouteConfig | undefined {
    return routes.find((route) => {
      const matcher = match(route.path, { decode: decodeURIComponent });
      return matcher(path);
    });
  }
}
