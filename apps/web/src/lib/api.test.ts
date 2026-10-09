import { afterEach, expect, it, vi } from 'vitest';
import { getReadiness, getSession, login, logout } from './api';

afterEach(() => vi.unstubAllGlobals());
it('accepts actual readiness', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ status: 'ready' }) }),
  );
  await expect(getReadiness()).resolves.toEqual({ status: 'ready' });
});
it('does not replace dependency failures with demo success', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
  await expect(getReadiness()).rejects.toThrow('unavailable');
});
it('rejects malformed readiness', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'unknown' }),
    }),
  );
  await expect(getReadiness()).rejects.toThrow('unexpected');
});

it('uses same-origin cookies and sends the CSRF token on logout', async () => {
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      data: {
        user: { email: 'person@example.test' },
        csrf_token: 'csrf-value',
      },
    }),
  });
  vi.stubGlobal('fetch', fetcher);
  await login('person@example.test', 'password');
  await logout('csrf-value');
  expect(fetcher).toHaveBeenNthCalledWith(
    1,
    '/api/v1/auth/login',
    expect.objectContaining({ method: 'POST', credentials: 'same-origin' }),
  );
  expect(fetcher).toHaveBeenNthCalledWith(
    2,
    '/api/v1/auth/logout',
    expect.objectContaining({
      credentials: 'same-origin',
      headers: expect.objectContaining({ 'X-CSRF-Token': 'csrf-value' }),
    }),
  );
});

it('distinguishes an expired session from a service failure', async () => {
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Authentication required' } }),
    })
    .mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ error: { message: 'Authentication unavailable' } }),
    });
  vi.stubGlobal('fetch', fetcher);
  await expect(getSession()).resolves.toBeNull();
  await expect(getSession()).rejects.toThrow('Authentication unavailable');
});
