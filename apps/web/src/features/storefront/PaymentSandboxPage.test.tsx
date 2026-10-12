import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PaymentSandboxPage } from './PaymentSandboxPage';

const scope = vi.hoisted(() => ({
  org: '11111111-1111-4111-8111-111111111111',
  can: true,
}));
vi.mock('../../app/OrganizationProvider', () => ({
  useOrganization: () => ({
    context: { organization: { id: scope.org } },
    can: () => scope.can,
  }),
}));
vi.mock('../../app/AuthProvider', () => ({
  useAuth: () => ({
    state: {
      session: {
        user: { id: '22222222-2222-4222-8222-222222222222' },
        csrf_token: 'synthetic-csrf',
      },
    },
  }),
}));
const fetchMock = vi.fn();
const status = {
  provider: 'stripe',
  mode: 'test',
  configured: true,
  amount_minor: 2000,
  currency: 'thb',
  customer_checkout_enabled: false,
};
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
function view(path = '/manage/settings/storefront/payments') {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <MemoryRouter initialEntries={[path]}>
        <PaymentSandboxPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  scope.can = true;
  scope.org = '11111111-1111-4111-8111-111111111111';
  sessionStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});
describe('Stripe sandbox management page', () => {
  it('shows setup instructions and disables Checkout when unconfigured', async () => {
    fetchMock.mockResolvedValue(ok({ ...status, configured: false }));
    view();
    expect(
      await screen.findByText(/STRIPE_TEST_SECRET_KEY/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'สร้าง Checkout ทดสอบ 20.00 บาท' }),
    ).toBeDisabled();
    expect(screen.getByText(/ไม่สร้างยอดขาย/)).toBeInTheDocument();
  });
  it('denies staff without calling the API', async () => {
    scope.can = false;
    view();
    expect(screen.getByRole('alert')).toHaveTextContent('ไม่มีสิทธิ์');
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it('creates a sandbox Checkout with CSRF and keeps the key on retry', async () => {
    let attempts = 0;
    const keys: string[] = [];
    fetchMock.mockImplementation(async (url: string, options: RequestInit) => {
      if (options.method === 'POST') {
        attempts++;
        const headers = options.headers as Record<string, string>;
        keys.push(headers['Idempotency-Key']);
        expect(headers['X-CSRF-Token']).toBe('synthetic-csrf');
        expect(options.body).toBe('{}');
        if (attempts === 1)
          return {
            ok: false,
            status: 503,
            json: async () => ({ error: { message: 'ลองใหม่ด้วยรายการเดิม' } }),
          };
        return ok(checkout);
      }
      return ok(url.endsWith('/checkouts/cs_test_fixture') ? checkout : status);
    });
    view();
    const button = await screen.findByRole('button', {
      name: 'สร้าง Checkout ทดสอบ 20.00 บาท',
    });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent('ลองใหม่');
    fireEvent.click(button);
    expect(
      await screen.findByRole('link', {
        name: 'เปิดหน้าชำระเงินทดสอบของ Stripe',
      }),
    ).toHaveAttribute('href', checkout.url);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBeTruthy();
    expect(keys[1]).toBe(keys[0]);
  });
  it('does not trust a success URL as proof of payment', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      ok(url.endsWith('/checkouts/cs_test_fixture') ? checkout : status),
    );
    view(
      '/manage/settings/storefront/payments?session_id=cs_test_fixture&success=1',
    );
    expect(await screen.findByText('ยังไม่ชำระ')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'ขอคืนเงินทดสอบเต็มจำนวน' }),
    ).not.toBeInTheDocument();
  });
  it('shows pending refunds without claiming success', async () => {
    const refund = {
      id: 're_fixture',
      status: 'pending',
      amount_minor: 2000,
      currency: 'thb',
    };
    fetchMock.mockImplementation(async (url: string) =>
      ok(
        url.endsWith('/checkouts/cs_test_fixture')
          ? {
              ...checkout,
              status: 'complete',
              payment_status: 'paid',
              url: '',
              refund,
            }
          : status,
      ),
    );
    view('/manage/settings/storefront/payments?session_id=cs_test_fixture');
    expect(await screen.findByText('คืนเงิน: รอดำเนินการ')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'ขอคืนเงินทดสอบเต็มจำนวน' }),
    ).not.toBeInTheDocument();
  });
  it('never renders an unsafe payment link', async () => {
    fetchMock.mockImplementation(async (url: string) =>
      ok(
        url.endsWith('/checkouts/cs_test_fixture')
          ? { ...checkout, url: 'https://evil.test/steal' }
          : status,
      ),
    );
    view('/manage/settings/storefront/payments?session_id=cs_test_fixture');
    expect(await screen.findByRole('alert')).toHaveTextContent('ข้อมูล');
    expect(
      screen.queryByRole('link', { name: 'เปิดหน้าชำระเงินทดสอบของ Stripe' }),
    ).not.toBeInTheDocument();
  });
});
