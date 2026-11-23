import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSandboxCheckout,
  refundSandboxCheckout,
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
    { status: 401, code: 'UNAUTHENTICATED' },
    { status: 403, code: 'MFA_REQUIRED' },
  ])(
    'preserves $code and the original recovery key',
    async ({ status, code }) => {
      fetchMock.mockResolvedValue({
        ok: false,
        status,
        json: async () => ({
          error: { code, message: 'Verify account access' },
        }),
      });
      const key = 'de000000-0000-4000-8000-000000000002';
      const operations = [
        () => createSandboxCheckout('org', 'synthetic-csrf', key),
        () => sandboxStatus('org'),
        () => sandboxCheckout('org', checkout.id),
        () => refundSandboxCheckout('org', 'synthetic-csrf', checkout.id),
      ];
      for (const [index, operation] of operations.entries()) {
        await expect(operation()).rejects.toMatchObject({ status, code });
        expect(fetchMock).toHaveBeenCalledTimes(index + 1);
      }
      fetchMock.mockResolvedValue(ok(checkout));
      await expect(
        createSandboxCheckout('org', 'synthetic-csrf', key),
      ).resolves.toEqual(checkout);
      expect(fetchMock).toHaveBeenCalledTimes(5);
      for (const index of [0, 4]) {
        expect(fetchMock.mock.calls[index]).toEqual([
          '/api/v1/organizations/org/storefront/payment-sandbox/checkouts',
          expect.objectContaining({
            headers: expect.objectContaining({ 'Idempotency-Key': key }),
          }),
        ]);
      }
    },
  );

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
