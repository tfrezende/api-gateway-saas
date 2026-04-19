# API Gateway

A production-ready API Gateway built with NestJS, providing a single entry point for routing, authentication, rate limiting, idempotency, circuit breaking, observability, and multi-tenant service discovery across multiple downstream services.

## Overview

This gateway sits between frontend clients and downstream services, handling cross-cutting concerns so individual services don't have to. Every request is authenticated, rate limited, logged, and tracked before being proxied to the appropriate upstream service.

## Architecture

Every incoming request flows through the following pipeline:

```
Client → JwtGuard → RolesGuard → ThrottlerGuard → LoggingInterceptor → IdempotencyInterceptor → ProxyController → CircuitBreaker → Downstream Service
```

**Why the proxy lives in a controller, not middleware**
NestJS middleware runs before guards, which would mean requests get proxied before JWT validation. Moving the proxy to a controller ensures the full guard chain runs first — auth, roles, and rate limiting — before any request is forwarded downstream.

**Why roles and scopes are split into separate guards**
`JwtGuard` has a single responsibility: validate the token and populate `request.user`. `RolesGuard` has a single responsibility: check whether the authenticated user has permission for the requested route and method. Separating them makes each independently testable and easier to reason about.

**Why rate limiting runs after auth**
An invalid token should return `401` before consuming a user's rate limit quota. Running `ThrottlerGuard` after `JwtGuard` and `RolesGuard` ensures auth failures are rejected early without touching the rate limiter.

**Why circuit breaking runs at the proxy boundary**
The circuit breaker is applied where outbound network calls happen, so it can fail fast when a downstream is unhealthy without bypassing auth, authorization, or throttling. This keeps protection scoped per target service while preserving the same request-validation behavior for every call.

**Why metrics are collected in the interceptor and filter**
`LoggingInterceptor` has visibility into every completed request — method, path, status code, and latency. `HttpExceptionFilter` has visibility into every error. These are the only two places in the pipeline where all the information needed for meaningful metrics is available simultaneously.

**Why tenant routes are stored in Redis and not a database**
Route configuration is read on every request, so it needs to be fast. Redis gives sub-millisecond reads. A 30-second in-process cache on top of that means most requests never touch the network at all. A database would add a round-trip on every cache miss without meaningful durability benefit — route config changes infrequently and can be re-applied if lost.

**Why the default tenant key pattern is used for non-tenant requests**
Requests without a `tenantId` claim fall back to the `'default'` key in Redis rather than a separate static config. This keeps the routing logic in one place — `RouterMatcherService` always goes through `TenantRouteRegistryService` — and mirrors how Kong and similar gateways handle default route groups. It also means default routes can be updated at runtime via the same Admin API without a redeployment.

**Why admin routes use a dedicated `AdminGuard` instead of `RolesGuard`**
`RolesGuard` delegates authorization to `RouterMatcherService`, which looks up the route in the tenant registry. Admin routes are not registered in the registry — they are gateway-internal endpoints. `RolesGuard` would return `undefined` for them, silent-passing every request. `AdminGuard` validates the token directly and checks for the `admin` role without any route lookup.

## Features

- **JWT authentication** — validates bearer tokens on all protected routes, extracts roles, scopes, and tenant identity from claims
- **Role and scope based authorization** — per-route, per-method access control enforced at the guard layer
- **Multi-tenant service discovery** — routes are stored in Redis per tenant and resolved at request time from a `tenantId` claim in the JWT. An Admin API allows provisioning and updating tenant routes without redeploying the gateway
- **Dual rate limiting** — per-user ID when authenticated, per-IP as fallback, backed by Redis
- **Request proxying** — forwards requests to downstream services using Node's native HTTP module, streaming request and response bodies without buffering
- **User identity forwarding** — strips the JWT and injects `X-Auth-User-Id`, `X-Auth-User-Roles`, and `X-Auth-User-Scopes` headers for downstream services
- **Structured logging** — JSON logs via Pino with request ID correlation, latency, and user context. Pretty-printed in development, raw JSON in production
- **Prometheus metrics** — request rate, error rate, and latency histograms per route, exposed at `/metrics` behind an API key
- **Grafana dashboard** — pre-configured dashboard showing request rate, error rate, p50/p99 latency, and rate limited requests
- **Circuit breaking** — per-downstream-target circuit breaker that opens after a configurable number of consecutive failures and fast-fails with `503` until the target recovers. After a configurable wait, one probe request is allowed through; success closes the circuit, failure reopens it
- **Idempotency** — deduplicates mutating requests (POST, PUT, PATCH, DELETE) using a Redis-backed store. Clients can supply an `Idempotency-Key` header; without one, a SHA-256 hash of `tenantId:method:path:body` is used. Duplicate requests within the TTL window receive the original cached response with an `X-Idempotency-Replay: true` header. Concurrent in-flight requests for the same key return `409 Conflict`. Individual routes can opt out via `skipIdempotency: true` in the route config
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
│   │   ├── logging.interceptor.ts       # request/response logging with latency
│   │   ├── idempotency.interceptor.ts   # deduplicates mutating requests via Redis
│   │   └── idempotency-store.service.ts # Redis-backed key/value store for idempotency
│   └── filters/
│       └── http-exception.filter.ts  # global error handler, uniform JSON responses
├── proxy/
|   ├── proxy.module.ts
│   ├── proxy.controller.ts    # catches all routes, delegates to proxy service
│   ├── proxy.service.ts       # forwards requests to upstream via Node http module
│   └── circuit-breaker/
│       ├── circuit-breaker.ts         # core state machine: CLOSED → OPEN → HALF_OPEN
│       ├── circuit-breaker.service.ts # manages one CircuitBreaker instance per target
│       └── circuit-breaker.config.ts  # reads threshold and half-open window from env
├── health/
|   ├── health.module.ts
│   └── health.controller.ts   # /healthcheck and /version endpoints
├── metrics/
│   ├── metrics.controller.ts  # serves /metrics behind API key auth
│   ├── metrics.guard.ts       # validates X-Metrics-Api-Key or Bearer token
│   ├── metrics.module.ts
│   └── metrics.service.ts     # Prometheus counters and histograms
├── shared/
│   ├── shared.module.ts
│   ├── router-matcher.service.ts  # async path matching; resolves routes via tenant registry
│   └── utils/
│       ├── error.utils.ts         # toError helper and BrokenCircuitError
│       └── token.utils.ts         # extractBearerToken shared by JwtGuard and AdminGuard
├── tenant/
│   ├── tenant.module.ts
│   ├── tenant-route-registry.service.ts  # reads/writes tenant routes in Redis with in-process cache
│   ├── redis.provider.ts          # ioredis client provider
│   ├── admin.guard.ts             # validates JWT and checks for admin role on /admin/* routes
│   └── admin.controller.ts        # Admin API for provisioning tenant routes
└── types/
    └── express.d.ts               # extends Express Request with user and tenantId
```

## Getting started

### Prerequisites

- Node.js 20+
- Docker and Docker Compose

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
# fill in JWT_SECRET, METRICS_API_KEY, and GRAFANA_PASSWORD in .env
 
# start all services
docker-compose up --build -d
```

### Running locally
 
```bash
# start Redis
docker run -d --name gateway-redis -p 6379:6379 redis:7.2-alpine
 
# configure environment
cp .env.example .env
 
# start in development mode
npm run start:dev
```

The gateway starts on `http://localhost:3000` by default.

## Services
 
| Service    | URL                       | Description                        |
|------------|---------------------------|------------------------------------|
| Gateway    | http://localhost:3000     | API Gateway                        |
| Prometheus | http://localhost:9090     | Metrics collection                 |
| Grafana    | http://localhost:3001     | Metrics dashboard (admin/password) |
| Redis      | localhost:6379            | Rate limiter state                 |
 
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
| `CIRCUIT_BREAKER_THRESHOLD` | `5` | Consecutive failures before the circuit opens |
| `CIRCUIT_BREAKER_HALF_OPEN_AFTER` | `10000` | Milliseconds to wait before probing a recovering target |
| `METRICS_API_KEY` | — | **Required.** API key for /metrics endpoint |
| `TENANT_CACHE_TTL_MS` | `30000` | How long tenant route configs are cached in-process (milliseconds) |
| `IDEMPOTENCY_TTL_MS` | `86400000` | How long a cached idempotent response is kept in Redis (milliseconds) |
| `IDEMPOTENCY_PROCESSING_TTL_MS` | `30000` | How long an in-flight request sentinel is held before expiring (milliseconds) |
| `LOGGER_LEVEL` | `info` | Pino log level (trace/debug/info/warn/error) |
| `NODE_ENV` | `development` | Enables pretty logging when not production |
| `GRAFANA_PASSWORD` | `admin` | Grafana admin password |

## Adding a route

Routes are managed at runtime via the Admin API — no redeployment required. All write endpoints require a valid JWT with an `admin` role.

**Add or replace all routes for a tenant (full upsert):**

```bash
curl -X PUT http://localhost:3000/admin/tenants/my-tenant/routes \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '[
    { "path": "/api/orders", "target": "http://localhost:3004", "methods": { "GET": { "roles": ["user"], "scopes": ["read"] }, "POST": { "roles": ["user"], "scopes": ["write"] } } },
    { "path": "/api/products", "target": "http://localhost:3005", "methods": { "GET": { "isPublic": true } } }
  ]'
```

**Add or update a single route (upsert by path):**

```bash
curl -X POST http://localhost:3000/admin/tenants/my-tenant/routes \
  -H "Authorization: Bearer <admin-token>" \
  -H "Content-Type: application/json" \
  -d '{ "path": "/api/orders", "target": "http://localhost:3004" }'
```

**Delete a single route:**

```bash
curl -X DELETE "http://localhost:3000/admin/tenants/my-tenant/routes?path=/api/orders" \
  -H "Authorization: Bearer <admin-token>"
```

**Delete all routes for a tenant:**

```bash
curl -X DELETE http://localhost:3000/admin/tenants/my-tenant/routes \
  -H "Authorization: Bearer <admin-token>"
```

The `tenantId` in the path must match the `tenantId` claim in the JWTs issued to that tenant's users. Requests from users without a `tenantId` claim are routed against the `default` tenant. Seed the `default` tenant to configure routing for non-tenant traffic.

## Running tests

```bash
# unit + integration tests with coverage
npm run test
```

Unit tests cover guards, filters, interceptors, and services. Integration tests cover the full request lifecycle including proxying, header forwarding, auth enforcement, and rate limiting.

## API reference

### Gateway endpoints

These endpoints are served directly by the gateway and do not require authentication.

| Method | Path | Description |
|---|---|---|
| `GET` | `/healthcheck` | Returns gateway health status |
| `GET` | `/version` | Returns gateway name and version |
| `GET` | `/metrics` | Prometheus metrics (requires `X-Metrics-Api-Key` header) |

### Admin API

All Admin API endpoints require a valid JWT with an `admin` role in the `Authorization: Bearer <token>` header.

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin/tenants/:tenantId/routes` | Returns all routes for a tenant. `404` if none exist |
| `PUT` | `/admin/tenants/:tenantId/routes` | Replaces all routes for a tenant with the request body (`RouteConfig[]`) |
| `POST` | `/admin/tenants/:tenantId/routes` | Adds or updates a single route by path (`RouteConfig`) |
| `DELETE` | `/admin/tenants/:tenantId/routes` | Deletes all routes for a tenant |
| `DELETE` | `/admin/tenants/:tenantId/routes?path=<routePath>` | Deletes a single route by path |

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
| `X-Request-Id` | UUID generated per request for log correlation |

Downstream services do not need to validate tokens — they can trust these headers since only the gateway has access to the JWT secret.

## Circuit breaker

Each downstream target gets its own circuit breaker instance. The circuit has three states:

- **CLOSED** — normal operation. Requests pass through. Each failure increments a counter; a successful response resets it to zero.
- **OPEN** — the circuit has tripped because the failure count hit the threshold. All requests to that target are immediately rejected with `503 Service Unavailable` without touching the network. After `CIRCUIT_BREAKER_HALF_OPEN_AFTER` milliseconds, the circuit moves to half-open.
- **HALF_OPEN** — recovery probe. One request is allowed through. If it succeeds the circuit closes and traffic resumes normally. If it fails the circuit opens again and the timer resets. Any additional requests that arrive while the probe is in flight are rejected, not queued.

The state machine looks like this:

```
             ┌─────────────────────────────────────────────────┐
             │                    CLOSED                       │
             │ Requests pass through. Counter resets on success│
             └──────────────────┬──────────────────────────────┘
                                │ failures >= threshold
                                ▼
             ┌─────────────────────────────────────────────────┐
             │                     OPEN                        │
             │  All requests rejected instantly with 503       │
             └──────────────────┬──────────────────────────────┘
                                │ halfOpenAfter elapsed
                                ▼
             ┌─────────────────────────────────────────────────┐
             │                  HALF_OPEN                      │
             │  One probe request allowed through              │
             └──────┬──────────────────────────────┬───────────┘
            success │                              │ failure
                    ▼                              ▼
                 CLOSED                          OPEN
```

State transitions are recorded as Prometheus metrics (`api_gateway_circuit_breaker_total`) so you can alert on circuits opening.

## Idempotency

Mutating requests (POST, PUT, PATCH, DELETE) are automatically deduplicated. On the first request the interceptor stores the response in Redis. Any identical repeat request within the TTL window receives the cached response immediately without touching the upstream, with an `X-Idempotency-Replay: true` header added.

### Key resolution

If the client sends an `Idempotency-Key` header, that value is used as the key (scoped per tenant). If no header is sent, the key is derived automatically as a SHA-256 hash of `tenantId:method:path:body` — so identical payloads to the same route are deduplicated even without client cooperation.

### Concurrent requests

If two requests with the same key arrive simultaneously (before the first one completes), the second receives `409 Conflict`. Once the first request finishes the cached response is available for subsequent requests.

### Opting out

Individual routes can bypass idempotency by setting `skipIdempotency: true` in the route config:

```json
{ "path": "/api/events", "target": "http://localhost:3004", "skipIdempotency": true, "methods": { "POST": { "roles": ["user"] } } }
```

Use this for endpoints that are intentionally non-idempotent (e.g. event streams, fire-and-forget webhooks).

### Headers

| Header | Direction | Description |
|---|---|---|
| `Idempotency-Key` | Request | Client-supplied deduplication key |
| `X-Idempotency-Replay` | Response | Present and set to `true` on replayed responses |

## Scraping metrics
 
Prometheus scrapes `/metrics` using a Bearer token. To query metrics manually:
 
```bash
curl http://localhost:3000/metrics \
  -H "X-Metrics-Api-Key: your-metrics-key"
```
 
## Observability
 
### Logs
 
Logs are structured JSON in production and pretty-printed in development. Every log line includes:
 
- `requestId` — UUID for correlating request and response log entries
- `method` and `path` — HTTP method and route pattern
- `statusCode` — response status code
- `latencyMs` — total request duration
- `userId` — authenticated user ID when present
 
### Metrics
 
The following metrics are exposed at `/metrics`:
 
| Metric | Type | Description |
|---|---|---|
| `api_gateway_requests_total` | Counter | Total requests by method, path, status code |
| `api_gateway_errors_total` | Counter | Total errors by method, path, status code |
| `api_gateway_request_latency_seconds` | Histogram | Request latency by method and path |
| `api_gateway_circuit_breaker_total` | Counter | Circuit breaker state transitions by state (OPEN/HALF\_OPEN/CLOSED) and target |
 
### Grafana dashboard
 
The pre-configured dashboard at `http://localhost:3001` includes:
 
- Request rate per route
- Error rate per route and status code
- p50 and p99 latency per route
- Rate limited request rate
- Total request count

## Planned extensions

These features are architecturally straightforward to add given the current structure:

**Per-route rate limiting** — extend `RouteConfig` with a `rateLimit` field (same pattern as `roles` and `scopes`) and override the global throttler config per route in a custom `ThrottlerGuard`.

**Load balancing** — replace the static `target` in `RouteConfig` with a `targets` array and implement round-robin or weighted selection in `ProxyService`.