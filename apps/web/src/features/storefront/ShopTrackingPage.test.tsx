import { fireEvent, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { render, renderInEnglish } from '../../test/render';
import { ShopTrackingPage } from './ShopTrackingPage';

const request = vi.hoisted(() => vi.fn());
vi.mock('../../lib/storefront-api', async (original) => ({
  ...(await original<typeof import('../../lib/storefront-api')>()),
  storefrontRequest: request,
}));
const token = 'a'.repeat(64);
const order = {
  id: 'order',
  number: 'WEB-TEST',
  status: 'PENDING',
  payment_status: 'UNPAID',
  estimated_total: '10.00',
  final_total: null,
  receipt_number: null,
  store_name: 'ร้าน',
  store_phone: '',
  pickup_instructions: '',
  expires_at: '2026-12-01T00:00:00Z',
  items: [],
  events: [],
};
const attempt = {
  state: 'OPEN',
  amount_minor: 1000,
  currency: 'thb',
  stock_hold_released: false,
};
function view(
  path = `/shop/shop/orders/order#access=${token}`,
  english = false,
) {
  return (english ? renderInEnglish : render)(
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
        <Routes>
          <Route
            path="/shop/:slug/orders/:orderId"
            element={<ShopTrackingPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  sessionStorage.clear();
  request.mockReset();
  request.mockImplementation(async (path: string) =>
    path.endsWith('/track')
      ? order
      : { attempt, url: 'https://checkout.stripe.com/c/pay/cs_test_123' },
  );
});

it.each([
  ['REQUESTED', 'Payment requested'],
  ['OPEN', 'Awaiting payment'],
  ['PROCESSING', 'Processing payment'],
  ['EXPIRED', 'Payment session expired'],
  ['PAID', 'Payment verified'],
])(
  'shows a readable English label for payment state %s',
  async (state, label) => {
    request.mockImplementation(async (path: string) =>
      path.endsWith('/track') ? order : { ...attempt, state },
    );
    view(undefined, true);
    fireEvent.click(
      await screen.findByRole('button', { name: 'Check payment status' }),
    );
    expect(await screen.findByText(label, { exact: false })).toBeVisible();
  },
);

it('restores the tracking token after checkout returns without its fragment', async () => {
  const first = view();
  fireEvent.click(await screen.findByRole('button', { name: 'เริ่มชำระเงิน' }));
  const link = await screen.findByRole('link', { name: 'ไปหน้าชำระเงิน' });
  link.addEventListener('click', (event) => event.preventDefault(), {
    once: true,
  });
  fireEvent.click(link);
  expect(link.getAttribute('href')).not.toContain(token);
  first.unmount();
  request.mockClear();
  view('/shop/shop/orders/order?payment_return=1');
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      '/shop/track',
      expect.objectContaining({
        body: { order_id: 'order', access_token: token },
      }),
    ),
  );
});

it.each([
  [
    'expired',
    { slug: 'shop', orderId: 'order', token, savedAt: Date.now() - 3600001 },
    '/shop/shop/orders/order?payment_return=1',
  ],
  [
    'future',
    { slug: 'shop', orderId: 'order', token, savedAt: Date.now() + 3600000 },
    '/shop/shop/orders/order?payment_return=1',
  ],
  [
    'mismatched shop',
    { slug: 'other', orderId: 'order', token, savedAt: Date.now() },
    '/shop/shop/orders/order?payment_return=1',
  ],
  [
    'mismatched order',
    { slug: 'shop', orderId: 'other', token, savedAt: Date.now() },
    '/shop/shop/orders/order?payment_return=1',
  ],
  [
    'missing return marker',
    { slug: 'shop', orderId: 'order', token, savedAt: Date.now() },
    '/shop/shop/orders/order',
  ],
  [
    'duplicate return marker',
    { slug: 'shop', orderId: 'order', token, savedAt: Date.now() },
    '/shop/shop/orders/order?payment_return=1&payment_return=1',
  ],
  [
    'invalid token',
    { slug: 'shop', orderId: 'order', token: 'bad', savedAt: Date.now() },
    '/shop/shop/orders/order?payment_return=1',
  ],
])('rejects %s return state', async (_name, saved, path) => {
  sessionStorage.setItem(
    'shop-payment-return:shop:order',
    JSON.stringify(saved),
  );
  view(path);
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(request).not.toHaveBeenCalled();
});

it('blocks provider navigation if session storage cannot save the tracking token', async () => {
  view();
  fireEvent.click(await screen.findByRole('button', { name: 'เริ่มชำระเงิน' }));
  const link = await screen.findByRole('link', { name: 'ไปหน้าชำระเงิน' });
  const write = vi
    .spyOn(Storage.prototype, 'setItem')
    .mockImplementation(() => {
      throw new Error('blocked');
    });
  const event = new MouseEvent('click', { bubbles: true, cancelable: true });
  fireEvent(link, event);
  expect(event.defaultPrevented).toBe(true);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'ไม่สามารถบันทึกลิงก์ติดตาม',
  );
  write.mockRestore();
});

it('rejects a provider link containing the private tracking token', async () => {
  request.mockImplementation(async (path: string) =>
    path.endsWith('/track')
      ? order
      : {
          attempt,
          url: `https://checkout.stripe.com/c/pay/cs_test_123?access=${token}`,
        },
  );
  view();
  fireEvent.click(await screen.findByRole('button', { name: 'เริ่มชำระเงิน' }));
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(
    screen.queryByRole('link', { name: 'ไปหน้าชำระเงิน' }),
  ).not.toBeInTheDocument();
});
it('starts checkout only on request and offers a validated provider link', async () => {
  view();
  const start = await screen.findByRole('button', { name: 'เริ่มชำระเงิน' });
  expect(request).toHaveBeenCalledTimes(1);
  fireEvent.click(start);
  expect(
    await screen.findByRole('link', { name: 'ไปหน้าชำระเงิน' }),
  ).toHaveAttribute('href', 'https://checkout.stripe.com/c/pay/cs_test_123');
  expect(request).toHaveBeenCalledWith(
    '/shop/payment/checkout',
    expect.objectContaining({
      body: { order_id: 'order', access_token: token },
    }),
  );
});
it('rejects an unsafe checkout URL', async () => {
  request.mockImplementation(async (path: string) =>
    path.endsWith('/track')
      ? order
      : { attempt, url: 'https://attacker.invalid/c/pay/cs_test_123' },
  );
  view();
  fireEvent.click(await screen.findByRole('button', { name: 'เริ่มชำระเงิน' }));
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(
    screen.queryByRole('link', { name: 'ไปหน้าชำระเงิน' }),
  ).not.toBeInTheDocument();
});
it('checks payment status explicitly and refreshes the order after verified payment', async () => {
  request.mockImplementation(async (path: string) =>
    path.endsWith('/track') ? order : { ...attempt, state: 'PAID' },
  );
  view();
  fireEvent.click(
    await screen.findByRole('button', { name: 'ตรวจสอบสถานะชำระเงิน' }),
  );
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      '/shop/payment/status',
      expect.objectContaining({
        body: { order_id: 'order', access_token: token },
      }),
    ),
  );
  await waitFor(() =>
    expect(
      request.mock.calls.filter(([path]) => path.endsWith('/track')),
    ).toHaveLength(2),
  );
  expect(screen.getByText('ยืนยันการชำระเงินแล้ว')).toBeVisible();
});
it('offers explicit recovery and shows server errors', async () => {
  request.mockImplementation(async (path: string) => {
    if (path.endsWith('/track')) return order;
    throw new Error('ชำระเงินยังไม่พร้อม');
  });
  view();
  fireEvent.click(
    await screen.findByRole('button', { name: 'กู้คืนหน้าชำระเงิน' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'ชำระเงินยังไม่พร้อม',
  );
  expect(request).toHaveBeenCalledWith(
    '/shop/payment/recover',
    expect.anything(),
  );
});
it('does not expose a checkout link after the stock hold is released', async () => {
  request.mockImplementation(async (path: string) =>
    path.endsWith('/track')
      ? order
      : {
          attempt: { ...attempt, stock_hold_released: true },
          url: 'https://checkout.stripe.com/c/pay/cs_test_123',
        },
  );
  view();
  fireEvent.click(await screen.findByRole('button', { name: 'เริ่มชำระเงิน' }));
  expect(await screen.findByRole('alert')).toBeVisible();
  expect(
    screen.queryByRole('link', { name: 'ไปหน้าชำระเงิน' }),
  ).not.toBeInTheDocument();
});

it('accepts the current server DTO when the hold flag is omitted', async () => {
  request.mockImplementation(async (path: string) =>
    path.endsWith('/track')
      ? order
      : {
          attempt: { state: 'OPEN', amount_minor: 1000, currency: 'thb' },
          url: 'https://checkout.stripe.com/c/pay/cs_test_123',
        },
  );
  view();
  fireEvent.click(await screen.findByRole('button', { name: 'เริ่มชำระเงิน' }));
  expect(
    await screen.findByRole('link', { name: 'ไปหน้าชำระเงิน' }),
  ).toBeVisible();
});
