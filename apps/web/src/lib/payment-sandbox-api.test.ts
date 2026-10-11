import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSandboxCheckout,
  sandboxCheckout,
  sandboxStatus,
} from './payment-sandbox-api';

const fetchMock = vi.fn();
const checkout = {
  id: 'cs_test_fixture',
  url: 'https://checkout.stripe.com/c/pay/cs_test_fixture',
  status: 'open',
  payment_status: 'unpaid',
  amount_minor: 2000,
  currency: 'thb',
  refund: null,
};
const ok = (data: unknown) => ({
  ok: true,
  status: 200,
  json: async () => ({ data }),
});
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
describe('sandbox API boundary', () => {
  it.each([
    { ...checkout, amount_minor: '2000' },
    { ...checkout, amount_minor: 1 },
    { ...checkout, currency: 'usd' },
    { ...checkout, id: 'cs_live_fixture' },
    { ...checkout, status: ['open'] },
    { ...checkout, payment_status: ['paid'] },
    { ...checkout, status: 'mystery' },
    { ...checkout, payment_status: 'paid' },
    {
      ...checkout,
      url: 'https://checkout.stripe.com.evil.test/c/pay/cs_test_fixture',
    },
    {
      ...checkout,
      url: 'https://user:pass@checkout.stripe.com/c/pay/cs_test_fixture',
    },
    { ...checkout, url: 'javascript:alert(1)' },
    {
      ...checkout,
      refund: {
        id: 're_fixture',
        status: 'succeeded',
        amount_minor: 2000,
        currency: 'thb',
      },
    },
  ])('rejects malformed provider result %#', async (value) => {
    fetchMock.mockResolvedValue(ok(value));
    await expect(
      createSandboxCheckout('org', 'synthetic-csrf', 'key'),
    ).rejects.toThrow('ข้อมูล');
  });
  it('does not request arbitrary session paths', async () => {
    await expect(sandboxCheckout('org', '../other')).rejects.toThrow('ข้อมูล');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('requires customer checkout to remain disabled in diagnostic status', async () => {
    fetchMock.mockResolvedValue(
      ok({
        provider: 'stripe',
        mode: 'test',
        configured: true,
        amount_minor: 2000,
        currency: 'thb',
        customer_checkout_enabled: true,
      }),
    );
    await expect(sandboxStatus('org')).rejects.toThrow('ข้อมูล');
  });
});
