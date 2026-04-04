# API Gateway

A production-ready API Gateway built with NestJS, providing a single entry point for routing, authentication, and rate limiting across multiple downstream services.

## Overview

This gateway sits between frontend clients and downstream services, handling cross-cutting concerns so individual services don't have to. Every request is authenticated, rate limited, and logged before being proxied to the appropriate upstream service.

## Architecture

Every incoming request flows through the following pipeline:

```
Client → JwtGuard → RolesGuard → ThrottlerGuard → LoggingInterceptor → ProxyController → Downstream Service
```

**Why the proxy lives in a controller, not middleware**
NestJS middleware runs before guards, which would mean requests get proxied before JWT validation. Moving the proxy to a controller ensures the full guard chain runs first — auth, roles, and rate limiting — before any request is forwarded downstream.

**Why roles and scopes are split into separate guards**
`JwtGuard` has a single responsibility: validate the token and populate `request.user`. `RolesGuard` has a single responsibility: check whether the authenticated user has permission for the requested route and method. Separating them makes each independently testable and easier to reason about.

**Why rate limiting runs after auth**
An invalid token should return `401` before consuming a user's rate limit quota. Running `ThrottlerGuard` after `JwtGuard` and `RolesGuard` ensures auth failures are rejected early without touching the rate limiter.

## Features

- **JWT authentication** — validates bearer tokens on all protected routes, extracts roles and scopes from claims
- **Role and scope based authorization** — per-route, per-method access control defined in a central config file
- **Dual rate limiting** — per-user ID when authenticated, per-IP as fallback, backed by Redis
- **Request proxying** — forwards requests to downstream services using Node's native HTTP module, streaming request and response bodies without buffering
- **User identity forwarding** — strips the JWT and injects `X-Auth-User-Id`, `X-Auth-User-Roles`, and `X-Auth-User-Scopes` headers for downstream services
- **Request logging** — logs method, path, status code, and latency for every request
- **Consistent error responses** — all errors return a uniform JSON shape with status code, message, path, and timestamp
- **Health and version endpoints** — gateway-internal endpoints that bypass auth and proxying

## Project structure

```
src/
├── main.ts
├── app.module.ts
├── config/
│   ├── app.config.ts          # environment variables and app-wide settings
│   └── routes.config.ts       # proxy routing table with per-method auth config
├── auth/
│   ├── jwt.service.ts         # JWT validation using jsonwebtoken
│   └── auth.module.ts
├── common/
│   ├── guards/
│   │   ├── jwt.guard.ts       # validates bearer token, populates request.user
│   │   ├── roles.guard.ts     # enforces per-route role and scope requirements
│   │   └── throttler.guard.ts # dual key rate limiting (user ID / IP fallback)
│   ├── interceptors/
│   │   └── logging.interceptor.ts  # request/response logging with latency
│   └── filters/
│       └── http-exception.filter.ts  # global error handler, uniform JSON responses
├── proxy/
|   ├── proxy.module.ts
│   ├── proxy.controller.ts    # catches all routes, delegates to proxy service
│   └── proxy.service.ts       # forwards requests to upstream via Node http module
├── health/
|   ├── health.module.ts
│   └── health.controller.ts   # /healthcheck and /version endpoints
├── shared/
|   ├── shared.module.ts
│   └── route-matcher.service.ts  # path matching shared between guards and proxy
│  
└── types/
    └── express.d.ts           # extends Express Request with user?: JwtPayload
```

## Getting started

### Prerequisites

- Node.js 20+
- Docker

### Setup

```bash
# start Redis
docker run -d --name gateway-redis -p 6379:6379 redis:7.2-alpine

# clone and install
git clone https://github.com/tfrezende/api-gateway
cd api-gateway
npm install

# configure environment
cp .env.example .env

# start in development mode
npm run start:dev
```

The gateway starts on `http://localhost:3000` by default.

## Configuration

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Port the gateway listens on |
| `JWT_SECRET` | — | **Required.** Secret key for JWT validation |
| `JWT_EXPIRES_IN` | `1h` | JWT expiration window |
| `PROXY_TIMEOUT` | `5000` | Upstream request timeout in milliseconds |
| `REDIS_HOST` | `localhost` | Redis hostname |
| `REDIS_PORT` | `6379` | Redis port |
| `THROTTLER_IP_TTL` | `60000` | IP rate limit window in milliseconds |
| `THROTTLER_IP_LIMIT` | `200` | Max requests per IP per window |
| `THROTTLER_USER_TTL` | `60000` | User rate limit window in milliseconds |
| `THROTTLER_USER_LIMIT` | `300` | Max requests per user per window |

## Adding a route

All routes are defined in `src/config/routes.config.ts`. Add an entry to the `routes` array:

```typescript
{
  path: '/api/orders',
  target: 'http://localhost:3004',
  methods: {
    GET:  { roles: ['admin', 'user'], scopes: ['read'] },
    POST: { roles: ['admin', 'user'], scopes: ['write'] },
  },
},
```

Public routes that bypass JWT validation:

```typescript
{
  path: '/api/products',
  target: 'http://localhost:3005',
  methods: {
    GET: { isPublic: true },
  },
},
```

No other files need to change — the guards and proxy service read from this config automatically.

## Running tests

```bash
# unit tests with coverage
npm run test

# integration tests (requires Docker for Redis)
npm run test:integration

# both
npm run test:all
```

Coverage is collected separately for unit and integration tests. Unit tests cover guards, filters, interceptors, and services. Integration tests cover the full request lifecycle including proxying, header forwarding, auth enforcement, and rate limiting.

## API reference

### Gateway endpoints

These endpoints are served directly by the gateway and do not require authentication.

| Method | Path | Description |
|---|---|---|
| `GET` | `/healthcheck` | Returns gateway health status |
| `GET` | `/version` | Returns gateway name and version |

### Error responses

All errors return a consistent JSON body:

```json
{
  "statusCode": 401,
  "message": "Token has expired",
  "path": "/api/users",
  "timestamp": "2026-04-03T03:00:00.000Z"
}
```

### Rate limiting

Rate limited responses return HTTP `429` with a `Retry-After` header indicating how many seconds to wait before retrying:

```
HTTP/1.1 429 Too Many Requests
Retry-After: 60
```

### Headers forwarded to downstream services

Downstream services receive the following headers on authenticated requests:

| Header | Value |
|---|---|
| `X-Auth-User-Id` | Subject claim from JWT |
| `X-Auth-User-Email` | Email claim from JWT |
| `X-Auth-User-Roles` | Comma-separated roles from JWT |
| `X-Auth-User-Scopes` | Comma-separated scopes from JWT |

Downstream services do not need to validate tokens — they can trust these headers since only the gateway has access to the JWT secret.

## Planned extensions

These features are architecturally straightforward to add given the current structure:

**Observability** - integrate metrics and structured logging to make the gateway's behavior visible in production. Expose a /metrics endpoint track request rates, latency percentiles, and error rates per route. Add distributed tracing to propagate trace IDs across the gateway and downstream services, making it possible to follow a single request end to end across the entire system.

**Circuit breaking** — when a downstream service exceeds its failure threshold, the circuit opens and requests fail fast with a `503` instead of waiting for timeouts.

**Per-route rate limiting** — extend `RouteConfig` with a `rateLimit` field (same pattern as `roles` and `scopes`) and override the global throttler config per route in a custom `ThrottlerGuard`.

**Load balancing** — replace the static `target` in `RouteConfig` with a `targets` array and implement round-robin or weighted selection in `ProxyService`.

**Service discovery** — populate route targets dynamically instead of from a static config file.