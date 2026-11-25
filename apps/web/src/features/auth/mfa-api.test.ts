import { afterEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import {
  beginMFAEnrollment,
  beginMFARecovery,
  confirmMFAEnrollment,
  confirmMFARecovery,
  getMFAStatus,
  verifyMFA,
} from './mfa-api';

afterEach(() => vi.unstubAllGlobals());

it('uses same-origin protected MFA contracts without caching or retry', async () => {
  const responses = [
    { enabled: false, session_verified: false },
    {
      factor_id: '41000000-0000-4000-8000-000000000001',
      secret: 'A'.repeat(32),
      expires_at: '2026-11-22T12:00:00Z',
    },
    {
      recovery_codes: Array.from(
        { length: 10 },
        (_, i) => String.fromCharCode(65 + i) + 'A'.repeat(25),
      ),
    },
    { session_verified: true },
  ];
  const fetcher = vi.fn().mockImplementation(async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: responses.shift() }),
  }));
  vi.stubGlobal('fetch', fetcher);
  await expect(getMFAStatus()).resolves.toEqual({
    enabled: false,
    session_verified: false,
  });
  await expect(beginMFAEnrollment('synthetic-csrf')).resolves.toMatchObject({
    secret: 'A'.repeat(32),
  });
  await expect(
    confirmMFAEnrollment('012345', 'synthetic-csrf'),
  ).resolves.toHaveProperty('recovery_codes');
  await expect(verifyMFA('012345', 'synthetic-csrf')).resolves.toEqual({
    session_verified: true,
  });
  expect(fetcher).toHaveBeenCalledTimes(4);
  for (const [index, path] of [
    '',
    '/enrollment',
    '/enrollment/confirm',
    '/challenge',
  ].entries()) {
    expect(fetcher).toHaveBeenNthCalledWith(
      index + 1,
      `/api/v1/auth/mfa${path}`,
      expect.objectContaining({
        method: index ? 'POST' : 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
      }),
    );
  }
  expect(fetcher.mock.calls[2][1]).toMatchObject({
    body: JSON.stringify({ code: '012345' }),
    headers: expect.objectContaining({ 'X-CSRF-Token': 'synthetic-csrf' }),
  });
});

it('rejects malformed assurance and never treats unavailable MFA as verified', async () => {
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: { enabled: false, session_verified: true } }),
  });
  vi.stubGlobal('fetch', fetcher);
  await expect(getMFAStatus()).rejects.toBeInstanceOf(ApiError);
  fetcher.mockResolvedValue({
    ok: false,
    status: 503,
    json: async () => ({ error: { message: 'MFA is unavailable' } }),
  });
  await expect(getMFAStatus()).rejects.toMatchObject({ status: 503 });
  expect(fetcher).toHaveBeenCalledTimes(2);
});

it('does not retry confirmation after a lost response', async () => {
  const fetcher = vi
    .fn()
    .mockRejectedValue(new TypeError('network unavailable'));
  vi.stubGlobal('fetch', fetcher);
  await expect(
    confirmMFAEnrollment('012345', 'synthetic-csrf'),
  ).rejects.toMatchObject({ status: 0 });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('stages a replacement with the recovery code and never retries a lost confirmation', async () => {
  const factor_id = '41000000-0000-4000-8000-000000000001';
  const recovery_code = 'A'.repeat(26);
  const staged = {
    factor_id,
    secret: 'A'.repeat(32),
    expires_at: '2026-11-24T12:00:00Z',
  };
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: staged }),
    })
    .mockRejectedValueOnce(new TypeError('network unavailable'));
  vi.stubGlobal('fetch', fetcher);
  await expect(
    beginMFARecovery(recovery_code, 'synthetic-csrf'),
  ).resolves.toEqual(staged);
  await expect(
    confirmMFARecovery(factor_id, '012345', 'synthetic-csrf'),
  ).rejects.toMatchObject({ status: 0 });
  for (const [index, [path, body]] of [
    ['/recovery', { recovery_code }],
    ['/recovery/confirm', { factor_id, code: '012345' }],
  ].entries()) {
    expect(fetcher).toHaveBeenNthCalledWith(
      index + 1,
      `/api/v1/auth/mfa${path}`,
      expect.objectContaining({
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify(body),
        headers: expect.objectContaining({ 'X-CSRF-Token': 'synthetic-csrf' }),
      }),
    );
  }
  expect(fetcher).toHaveBeenCalledTimes(2);
});
