import { ApiError, requestData } from '../../lib/api';

export interface MFAStatus {
  enabled: boolean;
  session_verified: boolean;
}

export interface MFAEnrollment {
  factor_id: string;
  secret: string;
  expires_at: string;
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidResponse(): never {
  throw new ApiError(
    502,
    'Invalid MFA response; check account status before retrying',
  );
}

async function request(
  path: string,
  body?: object,
  csrf?: string,
  signal?: AbortSignal,
) {
  return requestData<unknown>(`/api/v1/auth/mfa${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    cache: 'no-store',
    signal,
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

export async function getMFAStatus(signal?: AbortSignal): Promise<MFAStatus> {
  const value = await request('', undefined, undefined, signal);
  if (
    !object(value) ||
    typeof value.enabled !== 'boolean' ||
    typeof value.session_verified !== 'boolean' ||
    (!value.enabled && value.session_verified)
  )
    invalidResponse();
  return { enabled: value.enabled, session_verified: value.session_verified };
}

export async function beginMFAEnrollment(
  csrf: string,
  signal?: AbortSignal,
): Promise<MFAEnrollment> {
  return parseEnrollment(await request('/enrollment', {}, csrf, signal));
}

export async function beginMFARecovery(
  recoveryCode: string,
  csrf: string,
  signal?: AbortSignal,
): Promise<MFAEnrollment> {
  return parseEnrollment(
    await request('/recovery', { recovery_code: recoveryCode }, csrf, signal),
  );
}

function parseEnrollment(value: unknown): MFAEnrollment {
  if (
    !object(value) ||
    typeof value.factor_id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value.factor_id,
    ) ||
    typeof value.secret !== 'string' ||
    !/^[A-Z2-7]{32}$/.test(value.secret) ||
    typeof value.expires_at !== 'string' ||
    !Number.isFinite(Date.parse(value.expires_at))
  )
    invalidResponse();
  return {
    factor_id: value.factor_id,
    secret: value.secret,
    expires_at: value.expires_at,
  };
}

export async function confirmMFAEnrollment(
  code: string,
  csrf: string,
  signal?: AbortSignal,
): Promise<{ recovery_codes: string[] }> {
  return parseRecoveryCodes(
    await request('/enrollment/confirm', { code }, csrf, signal),
  );
}

export async function confirmMFARecovery(
  factorId: string,
  code: string,
  csrf: string,
  signal?: AbortSignal,
): Promise<{ recovery_codes: string[] }> {
  return parseRecoveryCodes(
    await request(
      '/recovery/confirm',
      { factor_id: factorId, code },
      csrf,
      signal,
    ),
  );
}

function parseRecoveryCodes(value: unknown): { recovery_codes: string[] } {
  if (
    !object(value) ||
    !Array.isArray(value.recovery_codes) ||
    value.recovery_codes.length !== 10 ||
    !value.recovery_codes.every(
      (item: unknown): item is string =>
        typeof item === 'string' && /^[A-Z2-7]{25}[AEIMQUY4]$/.test(item),
    ) ||
    new Set(value.recovery_codes).size !== 10
  )
    invalidResponse();
  return { recovery_codes: value.recovery_codes };
}

export async function verifyMFA(
  code: string,
  csrf: string,
  signal?: AbortSignal,
): Promise<{ session_verified: true }> {
  const value = await request('/challenge', { code }, csrf, signal);
  if (!object(value) || value.session_verified !== true) invalidResponse();
  return { session_verified: true };
}
