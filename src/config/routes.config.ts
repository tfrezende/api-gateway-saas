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
  skipIdempotency?: boolean;
}
