import { afterEach, expect, it, vi } from 'vitest';
import {
  centsText,
  estimatedLine,
  newTrackingToken,
  StorefrontError,
  storefrontRequest,
} from './storefront-api';

afterEach(() => vi.unstubAllGlobals());
it('estimates with exact POS HALF_UP rounding, including large decimals', () => {
  expect(estimatedLine('0.01', '0.500')).toBe(1n);
  expect(estimatedLine('12.34', '1.125')).toBe(1388n);
  expect(centsText(999999999999999999n)).toBe('9999999999999999.99');
  expect(estimatedLine('1.00', '1e2')).toBeNull();
  expect(estimatedLine('1.00', '0')).toBeNull();
});
it('creates cryptographically random tracking tokens without using order numbers', () => {
  const first = newTrackingToken();
  expect(first).toMatch(/^[a-f0-9]{64}$/);
  expect(newTrackingToken()).not.toBe(first);
});
it('uses a separate public client without employee cookies, CSRF or contact data in URLs', async () => {
  const fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ data: { id: 'order' } }),
  });
  vi.stubGlobal('fetch', fetch);
  await storefrontRequest('/shop/track', {
    body: { order_id: 'order', access_token: 'private' },
  });
  expect(fetch).toHaveBeenCalledWith(
    '/api/v1/storefronts/shop/track',
    expect.objectContaining({
      credentials: 'omit',
      method: 'POST',
      body: JSON.stringify({ order_id: 'order', access_token: 'private' }),
    }),
  );
  expect(fetch.mock.calls[0][1].headers).not.toHaveProperty('X-CSRF-Token');
});
it('preserves typed conflict codes and stable idempotency keys', async () => {
  const fetch = vi.fn().mockResolvedValue({
    ok: false,
    status: 409,
    json: async () => ({
      error: { code: 'PRICE_CHANGED', message: 'ราคาเปลี่ยน' },
    }),
  });
  vi.stubGlobal('fetch', fetch);
  await expect(
    storefrontRequest('/shop/orders', { body: {}, key: 'same-key' }),
  ).rejects.toEqual(new StorefrontError(409, 'PRICE_CHANGED', 'ราคาเปลี่ยน'));
  expect(fetch.mock.calls[0][1].headers['Idempotency-Key']).toBe('same-key');
});
