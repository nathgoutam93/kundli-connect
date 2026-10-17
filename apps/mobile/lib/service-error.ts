export class ServiceError extends Error {
  constructor(message: string, readonly code: string, readonly status?: number) { super(message); }
}

export async function functionError(error: { message?: string; context?: unknown }) {
  const response = error.context;
  if (!(response instanceof Response)) return new ServiceError('Could not connect. Please try again.', 'NETWORK_ERROR');
  const body = await response.clone().json().catch(() => null) as { error?: string; code?: string } | null;
  if (response.status === 402) return new ServiceError('Add credits or choose a plan to continue.', 'CREDITS_REQUIRED', 402);
  if (response.status === 429) return new ServiceError('Too many requests. Please try again shortly.', 'RATE_LIMITED', 429);
  return new ServiceError(response.status < 500 && typeof body?.error === 'string' ? body.error : 'Something went wrong. Please try again.',
    body?.code ?? 'REQUEST_FAILED', response.status);
}
