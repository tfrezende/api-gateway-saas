import type { Request } from 'express';

export function extractBearerToken(request: Request): string | null {
  const raw =
    request.headers['authorization'] ?? request.headers['Authorization'];
  const authHeader = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.slice('Bearer '.length);
}
