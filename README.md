# API Gateway

A production-ready API Gateway built with NestJS, providing a single entry point for routing, authentication, rate limiting, and observability across multiple downstream services.

## Overview

This gateway sits between frontend clients and downstream services, handling cross-cutting concerns so individual services don't have to. Every request is authenticated, rate limited, logged, and tracked before being proxied to the appropriate upstream service.

## Architecture

Every incoming request flows through the following pipeline:

```
Client → JwtGuard → RolesGuard → ThrottlerGuard → LoggingInterceptor → ProxyController → CircuitBreaker → Downstream Service
```

**Why the proxy lives in a controller, not middleware**
NestJS middleware runs before guards, which would mean requests get proxied before JWT validation. Moving the proxy to a controller ensures the full guard chain runs first — auth, roles, and rate limiting — before any request is forwarded downstream.

**Why roles and scopes are split into separate guards**
`JwtGuard` has a single responsibility: validate the token and populate `request.user`. `RolesGuard` has a single responsibility: check whether the authenticated user has permission for the requested route and method. Separating them makes each independently testable and easier to reason about.

**Why rate limiting runs after auth**
An invalid token should return `401` before consuming a user's rate limit quota. Running `ThrottlerGuard` after `JwtGuard` and `RolesGuard` ensures auth failures are rejected early without touching the rate limiter.

**Why metrics are collected in the interceptor and filter**
`LoggingInterceptor` has visibility into every completed request — method, path, status code, and latency. `HttpExceptionFilter` has visibility into every error. These are the only two places in the pipeline where all the information needed for meaningful metrics is available simultaneously.

## Features

- **JWT authentication** — validates bearer tokens on all protected routes, extracts roles and scopes from claims
- **Role and scope based authorization** — per-route, per-method access control defined in a central config file
- **Dual rate limiting** — per-user ID when authenticated, per-IP as fallback, backed by Redis
- **Request proxying** — forwards requests to downstream services using Node's native HTTP module, streaming request and response bodies without buffering
- **User identity forwarding** — strips the JWT and injects `X-Auth-User-Id`, `X-Auth-User-Roles`, and `X-Auth-User-Scopes` headers for downstream services
- **Structured logging** — JSON logs via Pino with request ID correlation, latency, and user context. Pretty-printed in development, raw JSON in production
- **Prometheus metrics** — request rate, error rate, and latency histograms per route, exposed at `/metrics` behind an API key
- **Grafana dashboard** — pre-configured dashboard showing request rate, error rate, p50/p99 latency, and rate limited requests
- **Circuit breaking** — per-downstream-target circuit breaker that opens after a configurable number of consecutive failures and fast-fails with `503` until the target recovers. After a configurable wait, one probe request is allowed through; success closes the circuit, failure reopens it
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
|   ├── shared.module.ts
│   └── route-matcher.service.ts  # path matching shared between guards and proxy
│  
└── types/
    └── express.d.ts           # extends Express Request with user?: JwtPayload
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
| `LOGGER_LEVEL` | `info` | Pino log level (trace/debug/info/warn/error) |
| `NODE_ENV` | `development` | Enables pretty logging when not production |
| `GRAFANA_PASSWORD` | `admin` | Grafana admin password |

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

**Multi-tenant service discovery** — populate route targets dynamically per tenant instead of from a static config file, keeping tenant isolation at the routing layer and letting services be provisioned or deprovisioned per tenant without a gateway redeployment.