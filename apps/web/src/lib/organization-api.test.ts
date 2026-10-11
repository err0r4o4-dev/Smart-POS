import { afterEach, expect, it, vi } from 'vitest';
import { organizationRequest } from './organization-api';
import { ApiError, getSession } from './api';

afterEach(() => vi.unstubAllGlobals());

it('preserves scoped requests, decimal strings, credentials and retry keys', async () => {
  const controller = new AbortController();
  const fetcher = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ data: { total: '9999999999999999.99' } }),
  });
  vi.stubGlobal('fetch', fetcher);
  await expect(
    organizationRequest('/organizations/org/pos/checkouts', {
      method: 'POST',
      body: { total: '9999999999999999.99' },
      csrf: 'csrf',
      key: 'same-key',
      signal: controller.signal,
    }),
  ).resolves.toEqual({ total: '9999999999999999.99' });
  expect(fetcher).toHaveBeenCalledExactlyOnceWith(
    '/api/v1/organizations/org/pos/checkouts',
    expect.objectContaining({
      method: 'POST',
      credentials: 'same-origin',
      body: '{"total":"9999999999999999.99"}',
      signal: controller.signal,
      headers: expect.objectContaining({
        'X-CSRF-Token': 'csrf',
        'Idempotency-Key': 'same-key',
      }),
    }),
  );
});

it.each([401, 403, 409, 429, 503])(
  'retains status %s for a non-JSON error response',
  async (status) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status,
        json: async () => {
          throw new SyntaxError('HTML');
        },
      }),
    );
    const request = organizationRequest('/organizations');
    await expect(request).rejects.toBeInstanceOf(ApiError);
    await expect(request).rejects.toMatchObject({ status });
  },
);

it('treats a non-JSON 401 as an expired session but not a 503', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => {
          throw new SyntaxError('HTML');
        },
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => {
          throw new SyntaxError('HTML');
        },
      }),
  );
  await expect(getSession()).resolves.toBeNull();
  await expect(getSession()).rejects.toMatchObject({ status: 503 });
});

it.each([null, [], {}, { error: { message: 'not data' } }])(
  'rejects malformed success envelopes without a false success',
  async (value) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue({ ok: true, status: 200, json: async () => value }),
    );
    await expect(organizationRequest('/organizations')).rejects.toThrow(
      'ตรวจสอบสถานะรายการ',
    );
  },
);

it('does not retry an ambiguous write failure and provides recovery guidance', async () => {
  const fetcher = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
  vi.stubGlobal('fetch', fetcher);
  await expect(
    organizationRequest('/organizations/org/returns', {
      method: 'POST',
      body: {},
      key: 'retry-key',
    }),
  ).rejects.toThrow('ตรวจสอบสถานะรายการก่อนทำซ้ำ');
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it('preserves intentional cancellation', async () => {
  const aborted = new DOMException('Aborted', 'AbortError');
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(aborted));
  await expect(organizationRequest('/organizations')).rejects.toBe(aborted);
});

it('retains a server validation message for the form', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ error: { message: 'กรุณาระบุชื่อสินค้า' } }),
    }),
  );
  await expect(
    organizationRequest('/organizations/org/products'),
  ).rejects.toThrow('กรุณาระบุชื่อสินค้า');
});
