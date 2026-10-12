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

function responseMessage(status: number) {
  if (status === 401) return 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบอีกครั้ง';
  if (status === 403) return 'คุณไม่มีสิทธิ์ทำรายการนี้';
  if (status === 409)
    return 'ข้อมูลเปลี่ยนแปลงแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนทำรายการ';
  if (status === 429) return 'มีคำขอมากเกินไป กรุณารอสักครู่แล้วลองอีกครั้ง';
  return 'บริการไม่พร้อมใช้งาน กรุณาลองโหลดข้อมูลอีกครั้ง';
}

function isAbort(error: unknown) {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    error.name === 'AbortError'
  );
}

// Shared by the existing auth and organization clients. A failed response does
// not establish whether a write committed, so this helper never retries writes.
export async function requestData<Result>(
  url: string,
  options: RequestInit,
  onSuccess?: (headers: Headers) => void,
): Promise<Result> {
  let response: Response;
  try {
    response = await fetch(url, options);
  } catch (error) {
    if (options.signal?.aborted || isAbort(error)) throw error;
    throw new ApiError(
      0,
      'เชื่อมต่อไม่สำเร็จ กรุณาตรวจสอบการเชื่อมต่อ หากกำลังบันทึก ให้ตรวจสอบสถานะรายการก่อนทำซ้ำ',
    );
  }
  let result: unknown;
  try {
    result = await response.json();
  } catch (error) {
    if (options.signal?.aborted || isAbort(error)) throw error;
    throw new ApiError(
      response.status,
      response.ok
        ? 'อ่านผลตอบกลับไม่สำเร็จ กรุณาตรวจสอบสถานะรายการก่อนทำซ้ำ'
        : responseMessage(response.status),
    );
  }
  const envelope =
    typeof result === 'object' && result !== null
      ? (result as { data?: Result; error?: { message?: unknown } })
      : undefined;
  if (!response.ok) {
    throw new ApiError(
      response.status,
      typeof envelope?.error?.message === 'string' && envelope.error.message
        ? envelope.error.message
        : responseMessage(response.status),
    );
  }
  if (!envelope || envelope.data === undefined) {
    throw new ApiError(
      response.status,
      'รูปแบบผลตอบกลับไม่ถูกต้อง กรุณาตรวจสอบสถานะรายการก่อนทำซ้ำ',
    );
  }
  onSuccess?.(response.headers);
  return envelope.data;
}

async function authRequest<T>(
  path: string,
  body?: object,
  csrf?: string,
): Promise<T> {
  return requestData<T>(`/api/v1/auth/${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(csrf ? { 'X-CSRF-Token': csrf } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
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
