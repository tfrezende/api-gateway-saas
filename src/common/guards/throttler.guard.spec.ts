import { ThrottlerGuard } from './throttler.guard';
import type { Request } from 'express';

const buildRequest = (overrides: Partial<Request> = {}): Request => {
  return {
    ip: '127.0.0.1',
    user: undefined,
    ...overrides,
  } as unknown as Request;
};

describe('ThrottlerGuard', () => {
  let throttlerGuard: ThrottlerGuard;

  beforeEach(() => {
    throttlerGuard = new ThrottlerGuard({} as never, {} as never, {} as never);
  });

  describe('getTracker', () => {
    it('should return user sub if user is present', async () => {
      const request = buildRequest({
        user: {
          sub: 'user123',
          email: 'user123@example.com',
          roles: ['user'],
          scopes: ['read'],
          iat: 0,
          exp: 0,
        },
      });
      const tracker = await throttlerGuard['getTracker'](request);
      expect(tracker).toBe('user123');
    });

    it('should return IP if user is not present', async () => {
      const request = buildRequest();
      const tracker = await throttlerGuard['getTracker'](request);
      expect(tracker).toBe('127.0.0.1');
    });

    it('should return "anonymous" if neither user nor IP is present', async () => {
      const request = buildRequest({ ip: undefined });
      const tracker = await throttlerGuard['getTracker'](request);
      expect(tracker).toBe('anonymous');
    });

    it('should prefer user ID over IP when both are present', async () => {
      const request = buildRequest({
        ip: '192.168.1.1',
        user: {
          sub: 'user123',
          email: 'user123@example.com',
          roles: ['user'],
          scopes: ['read'],
          iat: 0,
          exp: 0,
        },
      });
      const tracker = await throttlerGuard['getTracker'](request);
      expect(tracker).toBe('user123');
    });
  });
});
