import { describe, expect, it, vi, afterEach } from 'vitest';
import { exactDecimal, adjustQuantity, moneyText, posRequest } from './pos-api';
afterEach(() => vi.unstubAllGlobals());
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
