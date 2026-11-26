import { render } from '../../test/render';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { CheckoutPage } from './CheckoutPage';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  mutate: vi.fn(),
  refresh: vi.fn(),
  policy: 'MENU_ONLY' as string | undefined,
  itemPolicy: 'MENU_ONLY' as string | undefined,
}));
vi.mock('./POSContext', () => ({
  usePOS: () => ({
    user: 'user',
    org: 'org',
    branch: 'branch',
    terminal: { id: 'terminal' },
    shift: { id: 'shift' },
    busy: false,
    cart: {
      id: 'cart',
      revision: 2,
      total: '10.00',
      stock_policy: mocks.policy,
      items: [{ variant_id: 'variant', stock_policy: mocks.itemPolicy }],
    },
    mutate: mocks.mutate,
    refresh: mocks.refresh,
    can: () => true,
  }),
}));
vi.mock('../../lib/pos-api', async (original) => ({
  ...(await original<typeof import('../../lib/pos-api')>()),
  posRequest: mocks.request,
}));
vi.mock('../pricing/PricingCheckoutControls', () => ({
  PricingCheckoutControls: () => null,
}));
vi.mock('../loyalty/LoyaltyCheckoutControls', () => ({
  LoyaltyCheckoutControls: () => null,
}));

it('keeps cash input and blocks a new checkout until pending server state can be loaded', async () => {
  mocks.request
    .mockRejectedValueOnce(new Error('โหลดสถานะรายการไม่สำเร็จ'))
    .mockResolvedValue({ items: [], total: 0 });
  mocks.mutate.mockResolvedValue(undefined);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <CheckoutPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  const prepare = screen.getByRole('button', {
    name: 'ตรวจสอบยอดและเตรียมชำระเงิน',
  });
  expect(prepare).toBeDisabled();
  fireEvent.change(screen.getByLabelText('เงินรับ'), {
    target: { value: '10.00' },
  });
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'โหลดสถานะรายการไม่สำเร็จ',
  );
  expect(prepare).toBeDisabled();
  expect(mocks.mutate).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'ลองโหลดใหม่' }));
  await waitFor(() => expect(prepare).toBeEnabled());
  expect(screen.getByLabelText('เงินรับ')).toHaveValue('10.00');
  fireEvent.click(prepare);
  await waitFor(() =>
    expect(mocks.mutate).toHaveBeenCalledWith(
      '/pos/checkout',
      expect.objectContaining({
        cart_id: 'cart',
        revision: 2,
        method: 'CASH',
        received: '10.00',
        expected_total: '10.00',
      }),
      'POST',
      expect.any(String),
    ),
  );
});

it.each([
  [undefined, 'MENU_ONLY'],
  ['UNKNOWN', 'MENU_ONLY'],
  ['MENU_ONLY', undefined],
  ['MENU_ONLY', 'TRACKED'],
])(
  'blocks direct checkout with invalid cart %s or item %s policy',
  async (policy, itemPolicy) => {
    mocks.policy = policy;
    mocks.itemPolicy = itemPolicy;
    mocks.mutate.mockReset();
    mocks.request.mockResolvedValue({ items: [], total: 0 });
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter>
          <CheckoutPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(
      /โหลดตะกร้าใหม่/,
    );
    expect(
      screen.getByRole('button', { name: 'ตรวจสอบยอดและเตรียมชำระเงิน' }),
    ).toBeDisabled();
    expect(mocks.mutate).not.toHaveBeenCalled();
    mocks.policy = 'MENU_ONLY';
    mocks.itemPolicy = 'MENU_ONLY';
  },
);

it.each([
  ['AWAITING_PAYMENT', 'ยืนยันรับเงินจริง', '/pos/payments/payment/confirm'],
  ['CONFIRMED', 'บันทึกการขาย', '/pos/checkouts/payment/complete'],
  [
    'RECONCILIATION_REQUIRED',
    'ลองบันทึกขายเดิมอีกครั้ง',
    '/pos/checkouts/payment/complete',
  ],
])(
  'allows existing %s payment recovery when cart policy is missing',
  async (status, button, path) => {
    mocks.policy = undefined;
    mocks.mutate.mockReset();
    mocks.request.mockResolvedValue({
      items: [
        {
          id: 'payment',
          cart_id: 'cart',
          status,
          method: 'CASH',
          total: '10.00',
          received: '10.00',
          change: '0.00',
        },
      ],
      total: 1,
    });
    render(
      <QueryClientProvider
        client={
          new QueryClient({ defaultOptions: { queries: { retry: false } } })
        }
      >
        <MemoryRouter>
          <CheckoutPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const action = await screen.findByRole('button', { name: button });
    if (status === 'AWAITING_PAYMENT')
      fireEvent.click(
        screen.getByRole('checkbox', {
          name: 'ฉันตรวจสอบแล้วว่าได้รับเงินจริง',
        }),
      );
    expect(action).toBeEnabled();
    fireEvent.click(action);
    await waitFor(() =>
      expect(mocks.mutate).toHaveBeenCalledWith(
        path,
        expect.any(Object),
        ...(status === 'AWAITING_PAYMENT' ? ['POST', expect.any(String)] : []),
      ),
    );
    mocks.policy = 'MENU_ONLY';
  },
);
