import { config } from '../app/config';

export async function getReadiness(
  signal?: AbortSignal,
): Promise<{ status: 'ready' }> {
  const response = await fetch(config.readinessPath, {
    signal,
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok)
    throw new Error(
      'The API or its database is unavailable. Start the local stack, then retry.',
    );
  const body: unknown = await response.json();
  if (
    typeof body !== 'object' ||
    body === null ||
    !('status' in body) ||
    body.status !== 'ready'
  )
    throw new Error('The API returned an unexpected readiness response.');
  return { status: 'ready' };
}

export interface AuthUser {
  id: string;
  email: string;
  display_name: string;
  status: 'ACTIVE' | 'DISABLED';
  onboarding: 'PENDING_ORGANIZATION';
}

export interface AuthSession {
  user: AuthUser;
  csrf_token: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function authRequest<T>(
  path: string,
  body?: object,
  csrf?: string,
): Promise<T> {
  const response = await fetch(`/api/v1/auth/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = (await response.json()) as {
    data?: T;
    error?: { message?: string };
  };
  if (!response.ok || !result.data) {
    throw new ApiError(
      response.status,
      result.error?.message || 'Authentication service unavailable',
    );
  }
  return result.data;
}

export async function getSession(): Promise<AuthSession | null> {
  try {
    return await authRequest<AuthSession>('me');
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}

export function login(email: string, password: string) {
  return authRequest<AuthSession>('login', { email, password });
}

export function register(
  email: string,
  password: string,
  display_name: string,
) {
  return authRequest<AuthUser>('register', { email, password, display_name });
}

export function forgotPassword(email: string) {
  return authRequest<{ message: string }>('forgot-password', { email });
}

export function resetPassword(token: string, password: string) {
  return authRequest<{ reset: boolean }>('reset-password', { token, password });
}

export function logout(csrf: string) {
  return authRequest<{ revoked: boolean }>('logout', {}, csrf);
}
