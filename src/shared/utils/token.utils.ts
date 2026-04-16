import type { Request } from 'express';

export function extractBearerToken(request: Request): string | null {
  const authHeader =
    (request.headers['authorization'] as string) ||
    (request.headers['Authorization'] as string);
  if (!authHeader?.startsWith('Bearer ')) {
    return null;
  }
  return authHeader.split(' ')[1];
}
