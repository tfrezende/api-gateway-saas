export type Role = 'admin' | 'user' | 'guest';
export type Scope = 'read' | 'write' | 'delete';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface MethodConfig {
  roles?: Role[];
  scopes?: Scope[];
  isPublic?: boolean;
}

export interface RouteConfig {
  path: string;
  target: string;
  methods?: Partial<Record<HttpMethod, MethodConfig>>;
}

export const routes: RouteConfig[] = [
  {
    path: '/auth',
    target: 'http://localhost:3001',
    methods: {
      GET: {
        isPublic: true,
      },
    },
  },
  {
    path: '/users',
    target: 'http://localhost:3002',
    methods: {
      GET: {
        roles: ['admin', 'user'],
        scopes: ['read'],
      },
      POST: {
        roles: ['admin', 'user'],
        scopes: ['write'],
      },
    },
  },
  {
    path: '/users/:id',
    target: 'http://localhost:3002',
    methods: {
      GET: {
        roles: ['admin', 'user'],
        scopes: ['read'],
      },
      PUT: {
        roles: ['user'],
        scopes: ['write'],
      },
      DELETE: {
        roles: ['admin'],
        scopes: ['delete'],
      },
    },
  },
];
