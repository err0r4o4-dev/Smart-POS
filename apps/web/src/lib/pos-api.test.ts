import { describe, expect, it, vi, afterEach } from 'vitest';
import { exactDecimal, adjustQuantity, moneyText, posRequest } from './pos-api';
afterEach(() => vi.unstubAllGlobals());
it.each([
  { path: '/pos/carts', method: 'POST' },
  { path: '/pos/carts/cart-a', method: 'PATCH' },
  { path: '/pos/carts/cart-a/hold', method: 'POST' },
  { path: '/pos/carts/cart-a/resume', method: 'POST' },
  { path: '/pos/carts/cart-a/cancel', method: 'POST' },
  { path: '/pos/checkout', method: 'POST' },
  { path: '/pos/payments/checkout-a/confirm', method: 'POST' },
  { path: '/pos/checkouts/checkout-a/complete', method: 'POST' },
  { path: '/pos/checkouts/checkout-a/cancel', method: 'POST' },
  { path: '/pos/checkouts/checkout-a/resolve', method: 'POST' },
])(
  'retains POS mutation authority errors and request identity for $path',
  async ({ path, method }) => {
    for (const denial of [
      { status: 401, code: 'UNAUTHENTICATED' },
      { status: 403, code: 'MFA_REQUIRED' },
      { status: 403, code: 'FORBIDDEN' },
      { status: 403, code: 'INVALID_CSRF' },
    ]) {
      const controller = new AbortController();
      const fetcher = vi.fn().mockResolvedValue({
        ok: false,
        status: denial.status,
        json: async () => ({
          error: { code: denial.code, message: 'Verify access' },
        }),
      });
      vi.stubGlobal('fetch', fetcher);
      await expect(
        posRequest('org-a', path, {
          method,
          body: { revision: 1 },
          csrf: 'synthetic-csrf',
          key: 'same-cart-operation',
          signal: controller.signal,
        }),
      ).rejects.toMatchObject(denial);
      expect(fetcher).toHaveBeenCalledExactlyOnceWith(
        `/api/v1/organizations/org-a${path}`,
        expect.objectContaining({
          method,
          credentials: 'same-origin',
          signal: controller.signal,
          body: '{"revision":1}',
          headers: expect.objectContaining({
            'X-CSRF-Token': 'synthetic-csrf',
            'Idempotency-Key': 'same-cart-operation',
          }),
        }),
      );
    }
  },
);
it.each([
  { path: '/pos/terminals', method: 'POST' },
  { path: '/pos/terminals/terminal-a', method: 'PATCH' },
  { path: '/pos/shifts/open', method: 'POST' },
  { path: '/pos/shifts/shift-a/close', method: 'POST' },
])(
  'retains register authority errors and request identity for $path',
  async ({ path, method }) => {
    for (const denial of [
      { status: 401, code: 'UNAUTHENTICATED' },
      { status: 403, code: 'MFA_REQUIRED' },
      { status: 403, code: 'FORBIDDEN' },
      { status: 403, code: 'INVALID_CSRF' },
    ]) {
      const controller = new AbortController();
      const fetcher = vi.fn().mockResolvedValue({
        ok: false,
        status: denial.status,
        json: async () => ({
          error: { code: denial.code, message: 'Verify access' },
        }),
      });
      vi.stubGlobal('fetch', fetcher);
      await expect(
        posRequest('org-a', path, {
          method,
          body: { revision: 1 },
          csrf: 'synthetic-csrf',
          key: 'same-operation',
          signal: controller.signal,
        }),
      ).rejects.toMatchObject(denial);
      expect(fetcher).toHaveBeenCalledExactlyOnceWith(
        `/api/v1/organizations/org-a${path}`,
        expect.objectContaining({
          method,
          credentials: 'same-origin',
          signal: controller.signal,
          body: '{"revision":1}',
          headers: expect.objectContaining({
            'X-CSRF-Token': 'synthetic-csrf',
            'Idempotency-Key': 'same-operation',
          }),
        }),
      );
    }
  },
);
it.each([
  '/pos/terminals',
  '/pos/carts',
  '/pos/shifts',
  '/pos/checkouts',
  '/sales',
  '/receipts',
  '/pos/products?terminal_id=terminal-a',
  '/pos/barcodes/POSLIST?terminal_id=terminal-a',
])('preserves list MFA denial and request signal for %s', async (path) => {
  for (const denial of [
    { status: 401, code: 'UNAUTHENTICATED' },
    { status: 403, code: 'MFA_REQUIRED' },
    { status: 403, code: 'FORBIDDEN' },
  ]) {
    const controller = new AbortController();
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: denial.status,
      json: async () => ({
        error: { code: denial.code, message: 'Verify access' },
      }),
    });
    vi.stubGlobal('fetch', fetcher);
    await expect(
      posRequest('org-a', path, { signal: controller.signal }),
    ).rejects.toMatchObject(denial);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      `/api/v1/organizations/org-a${path}`,
      expect.objectContaining({
        method: 'GET',
        credentials: 'same-origin',
        signal: controller.signal,
      }),
    );
  }
});
it.each([
  '/pos/carts/cart-a',
  '/pos/checkouts/checkout-a',
  '/pos/shifts/shift-a',
  '/sales/sale-a',
  '/receipts/receipt-a',
  '/pos/carts/cart-a/quote?loyalty_points=0',
  '/pos/payment-methods',
])(
  'retains detail-read authority errors and cancellation for %s',
  async (path) => {
    for (const denial of [
      { status: 401, code: 'UNAUTHENTICATED' },
      { status: 403, code: 'MFA_REQUIRED' },
      { status: 403, code: 'FORBIDDEN' },
    ]) {
      const controller = new AbortController();
      const fetcher = vi.fn().mockResolvedValue({
        ok: false,
        status: denial.status,
        json: async () => ({
          error: { code: denial.code, message: 'Verify access' },
        }),
      });
      vi.stubGlobal('fetch', fetcher);
      await expect(
        posRequest('org-a', path, { signal: controller.signal }),
      ).rejects.toMatchObject(denial);
      expect(fetcher).toHaveBeenCalledExactlyOnceWith(
        `/api/v1/organizations/org-a${path}`,
        expect.objectContaining({
          method: 'GET',
          credentials: 'same-origin',
          signal: controller.signal,
        }),
      );
    }
  },
);
it.each([
  { status: 401, code: 'UNAUTHENTICATED' },
  { status: 403, code: 'MFA_REQUIRED' },
  { status: 403, code: 'FORBIDDEN' },
  { status: 403, code: 'INVALID_CSRF' },
])(
  'retains POS customer selection denial $code without retry',
  async (denial) => {
    const controller = new AbortController();
    const fetcher = vi.fn().mockResolvedValue({
      ok: false,
      status: denial.status,
      json: async () => ({
        error: { code: denial.code, message: 'Verify access' },
      }),
    });
    vi.stubGlobal('fetch', fetcher);
    await expect(
      posRequest('org-a', '/pos/carts/cart-a/customer', {
        method: 'PATCH',
        body: { revision: 7, customer_id: 'customer-a' },
        csrf: 'synthetic-csrf',
        signal: controller.signal,
      }),
    ).rejects.toMatchObject(denial);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      '/api/v1/organizations/org-a/pos/carts/cart-a/customer',
      expect.objectContaining({
        method: 'PATCH',
        credentials: 'same-origin',
        signal: controller.signal,
        body: '{"revision":7,"customer_id":"customer-a"}',
        headers: expect.objectContaining({ 'X-CSRF-Token': 'synthetic-csrf' }),
      }),
    );
  },
);
describe('exact POS amounts', () => {
  it('keeps decimal string precision with bigint', () => {
    expect(exactDecimal('9999999999999999.99')).toBe(999999999999999999n);
    expect(exactDecimal('0.1')).toBe(10n);
    expect(exactDecimal('1.125', 3)).toBe(1125n);
    for (const value of ['1e2', '1.001', 'NaN', '-1', '10000000000000000'])
      expect(exactDecimal(value)).toBeNull();
  });
  it('formats without floats and adjusts exact quantity', () => {
    expect(moneyText('1000000000000000.99')).toBe('1,000,000,000,000,000.99');
    expect(adjustQuantity('1.125', 1000n)).toBe('2.125');
    expect(adjustQuantity('1', -1000n)).toBe('1');
  });
  it('scopes writes to org and passes CSRF/idempotency', async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: { id: 'checkout' } }),
    });
    vi.stubGlobal('fetch', fetch);
    await posRequest('tenant', '/pos/checkout', {
      method: 'POST',
      body: { cart_id: 'cart' },
      csrf: 'csrf',
      key: 'retry-key',
    });
    expect(fetch).toHaveBeenCalledWith(
      '/api/v1/organizations/tenant/pos/checkout',
      expect.objectContaining({
        credentials: 'same-origin',
        headers: expect.objectContaining({
          'X-CSRF-Token': 'csrf',
          'Idempotency-Key': 'retry-key',
        }),
      }),
    );
  });
});
