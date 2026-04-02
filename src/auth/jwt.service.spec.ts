import { UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { JwtService, JwtPayload } from './jwt.service';

const TEST_SECRET = 'test-secret-that-is-long-enough-for-hmac';

const buildToken = (
  overrides: Partial<JwtPayload> & { exp?: number } = {},
): string => {
  const payload: Partial<JwtPayload> = {
    sub: '1234567890',
    email: 'user@example.com',
    roles: ['user'],
    scopes: ['read'],
    ...overrides,
  };
  return jwt.sign(payload, TEST_SECRET, { expiresIn: '1h' });
};

const buildExpiredToken = (): string => {
  const payload: Partial<JwtPayload> = {
    sub: '1234567890',
    email: 'user@example.com',
    roles: ['user'],
    scopes: ['read'],
  };
  return jwt.sign(payload, TEST_SECRET, { expiresIn: '0s' });
};

describe('JwtService', () => {
  let jwtService: JwtService;

  beforeEach(() => {
    jwtService = new JwtService();
    Object.defineProperty(jwtService, 'secret', { value: TEST_SECRET });
  });

  describe('verifySignature', () => {
    it('should verify a valid token and return the payload', () => {
      const token = buildToken();
      const payload = jwtService.verifySignature(token);

      expect(payload.sub).toBe('1234567890');
      expect(payload.email).toBe('user@example.com');
      expect(payload.roles).toEqual(['user']);
      expect(payload.scopes).toEqual(['read']);
    });

    it('should return the correct payload for admin role', () => {
      const token = buildToken({
        roles: ['admin'],
        scopes: ['read', 'write', 'delete'],
      });
      const payload = jwtService.verifySignature(token);

      expect(payload.roles).toEqual(['admin']);
      expect(payload.scopes).toEqual(['read', 'write', 'delete']);
    });

    it('should throw UnauthorizedException for an expired token', () => {
      const expiredToken = buildExpiredToken();

      expect(() => jwtService.verifySignature(expiredToken)).toThrow(
        UnauthorizedException,
      );
      expect(() => jwtService.verifySignature(expiredToken)).toThrow(
        'Token has expired',
      );
    });

    it('should throw UnauthorizedException for an invalid token', () => {
      const invalidToken = 'invalid.token.value';

      expect(() => jwtService.verifySignature(invalidToken)).toThrow(
        UnauthorizedException,
      );
      expect(() => jwtService.verifySignature(invalidToken)).toThrow(
        'Invalid token',
      );
    });

    it('should throw UnauthorizedException for a token with invalid signature', () => {
      const token = buildToken();
      const tamperedToken = token.replace(/\w/, 'x'); // Tamper with the token

      expect(() => jwtService.verifySignature(tamperedToken)).toThrow(
        UnauthorizedException,
      );
      expect(() => jwtService.verifySignature(tamperedToken)).toThrow(
        'Invalid token',
      );
    });

    it('should throw UnauthorizedException for a token with missing signature', () => {
      const token = buildToken();
      const parts = token.split('.');
      const unsignedToken = `${parts[0]}.${parts[1]}.`;

      expect(() => jwtService.verifySignature(unsignedToken)).toThrow(
        UnauthorizedException,
      );
      expect(() => jwtService.verifySignature(unsignedToken)).toThrow(
        'Invalid token',
      );
    });

    it('should throw UnauthorizedException for a token with invalid format', () => {
      const invalidFormatToken = 'justastringwithoutdots';

      expect(() => jwtService.verifySignature(invalidFormatToken)).toThrow(
        UnauthorizedException,
      );
      expect(() => jwtService.verifySignature(invalidFormatToken)).toThrow(
        'Invalid token',
      );
    });

    it('should throw UnauthorizedException for a token signed with a different secret', () => {
      const differentSecretToken = jwt.sign(
        {
          sub: '1234567890',
          email: 'user@example.com',
          roles: ['user'],
          scopes: ['read'],
        },
        'different-secret',
        { expiresIn: '1h' },
      );

      expect(() => jwtService.verifySignature(differentSecretToken)).toThrow(
        UnauthorizedException,
      );
      expect(() => jwtService.verifySignature(differentSecretToken)).toThrow(
        'Invalid token',
      );
    });
  });
});
