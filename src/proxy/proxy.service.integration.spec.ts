import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import http from 'http';
import jwt from 'jsonwebtoken';
import { AppModule } from '../app.module';
import type { Role, Scope } from '../config/routes.config';

interface MockServerResponse {
  proxied: boolean;
  method: string;
  url: string;
  userId?: string;
  userRoles?: string;
  userScopes?: string;
  version?: string;
  name?: string;
  status?: string;
}

const TEST_SECRET = 'test-secret-that-is-long-enough-for-hmac';

const buildToken = (
  roles: Role[] = ['user'],
  scopes: Scope[] = ['read', 'write', 'delete'],
): string => {
  return jwt.sign(
    {
      sub: 'user-123',
      email: 'user@test.com',
      roles,
      scopes,
    },
    TEST_SECRET,
    { expiresIn: '1h' },
  );
};

const createMockServer = (): http.Server => {
  return http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(
      JSON.stringify({
        proxied: true,
        method: req.method,
        url: req.url,
        userId: req.headers['x-auth-user-id'],
        userRoles: req.headers['x-auth-user-roles'],
        userScopes: req.headers['x-auth-user-scopes'],
        version: req.headers['x-api-version'],
        name: req.headers['x-api-name'],
        status: req.headers['x-api-status'],
      }),
    );
  });
};

describe('ProxyService (integration)', () => {
  let app: INestApplication;
  let authServer: http.Server;
  let usersServer: http.Server;
  let httpServer: http.Server;

  beforeAll(async () => {
    // spin up mock downstream services
    authServer = createMockServer();
    usersServer = createMockServer();

    await Promise.all([
      new Promise<void>((resolve) => authServer.listen(3001, resolve)),
      new Promise<void>((resolve) => usersServer.listen(3002, resolve)),
    ]);

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    httpServer = app.getHttpServer() as http.Server;
  });

  afterAll(async () => {
    await app.close();
    authServer.close();
    usersServer.close();
  });

  // ── Public routes ──────────────────────────────────────────────────

  describe('public routes', () => {
    it('should proxy GET /auth without a token', async () => {
      await request(httpServer)
        .get('/auth')
        .expect(200)
        .expect((res) => {
          const body = res.body as MockServerResponse;
          expect(body.proxied).toBe(true);
          expect(body.method).toBe('GET');
        });
    });

    it('should proxy GET /auth with a valid token', async () => {
      const token = buildToken();

      await request(httpServer)
        .get('/auth')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          const body = res.body as MockServerResponse;
          expect(body.proxied).toBe(true);
        });
    });
  });

  // ── Authenticated routes ───────────────────────────────────────────

  describe('authenticated routes', () => {
    it('should proxy GET /users with valid token and roles', async () => {
      const token = buildToken(['user'], ['read']);

      await request(httpServer)
        .get('/users')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          const body = res.body as MockServerResponse;
          expect(body.proxied).toBe(true);
          expect(body.method).toBe('GET');
        });
    });

    it('should proxy POST /users with valid token and roles', async () => {
      const token = buildToken(['user'], ['write']);

      await request(httpServer)
        .post('/users')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          const body = res.body as MockServerResponse;
          expect(body.proxied).toBe(true);
          expect(body.method).toBe('POST');
        });
    });

    it('should return 401 for GET /users without a token', async () => {
      await request(httpServer).get('/users').expect(401);
    });

    it('should return 401 for GET /users with an invalid token', async () => {
      await request(httpServer)
        .get('/users')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });

    it('should return 401 for GET /users with an expired token', async () => {
      const token = jwt.sign(
        {
          sub: 'user-123',
          email: 'user@test.com',
          roles: ['user'],
          scopes: ['read'],
        },
        TEST_SECRET,
        { expiresIn: '0s' },
      );

      await request(httpServer)
        .get('/users')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    });

    it('should return 403 for GET /users with insufficient roles', async () => {
      const token = buildToken(['guest'], ['read']);

      await request(httpServer)
        .get('/users')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('should return 403 for GET /users with insufficient scopes', async () => {
      const token = buildToken(['user'], ['write']);

      await request(httpServer)
        .get('/users')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  // ── Parameterized routes ───────────────────────────────────────────

  describe('parameterized routes', () => {
    it('should proxy GET /users/:id with valid token', async () => {
      const token = buildToken(['user'], ['read']);

      await request(httpServer)
        .get('/users/123')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          const body = res.body as MockServerResponse;
          expect(body.proxied).toBe(true);
        });
    });

    it('should proxy PUT /users/:id for user role', async () => {
      const token = buildToken(['user'], ['write']);

      await request(httpServer)
        .put('/users/123')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('should proxy DELETE /users/:id for admin role', async () => {
      const token = buildToken(['admin'], ['delete']);

      await request(httpServer)
        .delete('/users/123')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
    });

    it('should return 403 for DELETE /users/:id with user role', async () => {
      const token = buildToken(['user'], ['delete']);

      await request(httpServer)
        .delete('/users/123')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });

    it('should return 403 for PUT /users/:id with admin role', async () => {
      const token = buildToken(['admin'], ['write']);

      await request(httpServer)
        .put('/users/123')
        .set('Authorization', `Bearer ${token}`)
        .expect(403);
    });
  });

  // ── Header forwarding ──────────────────────────────────────────────

  describe('header forwarding', () => {
    it('should forward user identity headers to downstream service', async () => {
      const token = buildToken(['user'], ['read']);

      await request(httpServer)
        .get('/users')
        .set('Authorization', `Bearer ${token}`)
        .expect(200)
        .expect((res) => {
          const body = res.body as MockServerResponse;
          expect(body.userId).toBe('user-123');
          expect(body.userRoles).toBe('user');
          expect(body.userScopes).toContain('read');
        });
    });

    it('should not forward user headers on public routes', async () => {
      await request(httpServer)
        .get('/auth')
        .expect(200)
        .expect((res) => {
          const body = res.body as MockServerResponse;
          expect(body.userId).toBeUndefined();
        });
    });
  });

  // ── Gateway endpoints ──────────────────────────────────────────────

  describe('gateway endpoints', () => {
    it('should return 200 for /healthcheck without a token', async () => {
      await request(httpServer)
        .get('/healthcheck')
        .expect(200)
        .expect((res) => {
          const body = res.body as MockServerResponse;
          expect(body.status).toBe('ok');
        });
    });

    it('should return 200 for /version without a token', async () => {
      await request(httpServer)
        .get('/version')
        .expect(200)
        .expect((res) => {
          const body = res.body as MockServerResponse;
          expect(body.version).toBeDefined();
          expect(body.name).toBeDefined();
        });
    });
  });

  it('should return 502 when the downstream service is unreachable', async () => {
    const token = buildToken(['admin'], ['read']);

    await request(httpServer)
      .get('/unreachable')
      .set('Authorization', `Bearer ${token}`)
      .expect(502);
  }, 10000);

  it('should return 502 when the downstream service times out', async () => {
    const slowServer = http.createServer(() => {
      // deliberately never respond
    });

    await new Promise<void>((resolve, reject) => {
      slowServer.listen(3003, (err?: Error) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // temporarily point a route at the slow server
    // by closing the users server and starting the slow one on its port
    await new Promise<void>((resolve, reject) => {
      usersServer.close((err?: Error) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const slowOnUsersPort = http.createServer(() => {
      // never respond
    });

    await new Promise<void>((resolve, reject) => {
      slowOnUsersPort.listen(3002, (err?: Error) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const token = buildToken(['user'], ['read']);

    await request(httpServer)
      .get('/users')
      .set('Authorization', `Bearer ${token}`)
      .expect(502);

    await new Promise<void>((resolve, reject) => {
      slowOnUsersPort.close((err?: Error) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await new Promise<void>((resolve, reject) => {
      usersServer.listen(3002, (err?: Error) => {
        if (err) reject(err);
        else resolve();
      });
    });

    slowServer.close();
  }, 15000);

  it('should return 502 when an inexistent route is accessed', async () => {
    const token = buildToken(['admin'], ['read']);

    await request(httpServer)
      .get('/nonexistent')
      .set('Authorization', `Bearer ${token}`)
      .expect(502);
  });
});
