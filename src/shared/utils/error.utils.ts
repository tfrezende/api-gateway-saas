export function toError(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error(String(error));
}

export class BrokenCircuitError extends Error {
  constructor(target: string) {
    super(`Circuit breaker is open for target: ${target}`);
    this.name = 'BrokenCircuitError';
  }
}
