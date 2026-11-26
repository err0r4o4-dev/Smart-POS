import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

it('submits a rating with the existing tracking proof and displays the saved rating', async () => {
  const completed = { ...order, status: 'COMPLETED', review_eligible: true };
  request.mockImplementation(async (path: string) =>
    path.endsWith('/review') ? { rating: 4 } : completed,
  );
  view(undefined, true);
  const score = await screen.findByRole('combobox', {
    name: 'Rating from 1 to 5',
  });
  const submit = screen.getByRole('button', { name: 'Submit rating' });
  expect(submit).toBeDisabled();
  fireEvent.change(score, { target: { value: '4' } });
  fireEvent.click(submit);
  expect(await screen.findByText('Your rating: 4 / 5')).toBeVisible();
  expect(request).toHaveBeenCalledWith('/shop/review', {
    body: { order_id: 'order', access_token: token, rating: 4 },
  });
  expect(
    screen.queryByRole('button', { name: 'Submit rating' }),
  ).not.toBeInTheDocument();
});

it('does not offer a rating before completion and shows an existing rating without an edit action', async () => {
  const original = view(undefined, true);
  await screen.findByText('WEB-TEST');
  expect(
    screen.queryByRole('button', { name: 'Submit rating' }),
  ).not.toBeInTheDocument();
  original.unmount();
  request.mockResolvedValue({
    ...order,
    status: 'COMPLETED',
    review_eligible: true,
    review: { rating: 5 },
  });
  view(undefined, true);
  expect(await screen.findByText('Your rating: 5 / 5')).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Submit rating' }),
  ).not.toBeInTheDocument();
});

it('shows tracking as the third step without starting a payment', async () => {
  view(undefined, true);
  const steps = screen.getByRole('navigation', { name: 'Order steps' });
  expect(steps.querySelector('[aria-current="step"]')).toHaveTextContent(
    'Track order',
  );
  expect(steps.querySelectorAll('li')).toHaveLength(3);
  await screen.findByText('WEB-TEST');
  expect(
    request.mock.calls.every(([path]) => String(path).endsWith('/track')),
  ).toBe(true);
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

describe('order tracking reference layout', () => {
  const line = {
    variant_id: 'v1',
    product_name: 'กะเพราหมูสับ',
    variant_name: '',
    sku: 'K',
    unit: 'จาน',
    quantity: '1.000',
    unit_price: '65.00',
    line_total: '65.00',
  };
  const tracked = {
    ...order,
    store_name: 'กะเพราพี่ต้น',
    number: 'VP-240115-0001',
    estimated_total: '80.00',
    items: [line, { ...line, variant_id: 'v2', product_name: 'ไข่ดาว' }],
    events: [
      {
        status: 'PENDING',
        message: 'received',
        created_at: '2026-11-26T03:24:00Z',
      },
      {
        status: 'PREPARING',
        message: 'cooking',
        created_at: '2026-11-26T03:26:00Z',
      },
    ],
    status: 'PREPARING',
  };

  function respond(value: unknown) {
    request.mockImplementation(async (path: string) =>
      path.endsWith('/track') ? value : attempt,
    );
  }

  it('summarises the order card with store, number, item count and total', async () => {
    respond(tracked);
    view();
    expect(
      screen.getByRole('heading', { level: 1, name: 'คำสั่งซื้อของฉัน' }),
    ).toBeVisible();
    const card = await screen.findByRole('region', {
      name: 'กะเพราพี่ต้น',
    });
    const scope = within(card);
    expect(scope.getByText('เลขที่คำสั่งซื้อ VP-240115-0001')).toBeVisible();
    expect(scope.getByText('2 รายการ')).toBeVisible();
    expect(scope.getAllByText('฿80.00')[0]).toBeVisible();
  });

  it('draws the full status timeline with text cues and times', async () => {
    respond(tracked);
    view();
    const timeline = await screen.findByRole('list', {
      name: 'สถานะคำสั่งซื้อ',
    });
    const steps = within(timeline).getAllByRole('listitem');
    expect(steps).toHaveLength(4);
    expect(steps[0]).toHaveTextContent('ได้รับคำสั่งซื้อ');
    expect(steps[0]).toHaveTextContent('เสร็จแล้ว');
    expect(steps[0].querySelector('time')).toHaveAttribute(
      'datetime',
      '2026-11-26T03:24:00Z',
    );
    expect(steps[1]).toHaveAttribute('aria-current', 'step');
    expect(steps[1]).toHaveTextContent('สถานะปัจจุบัน');
    expect(steps[1].querySelector('time')).toHaveAttribute(
      'datetime',
      '2026-11-26T03:26:00Z',
    );
    for (const pending of steps.slice(2)) {
      expect(pending).toHaveTextContent('รอดำเนินการ');
      expect(pending.querySelector('time')).toBeNull();
    }
  });

  it('ends the timeline with the cancellation instead of pending steps', async () => {
    respond({
      ...tracked,
      status: 'CANCELLED',
      events: [
        ...tracked.events.slice(0, 1),
        {
          status: 'CANCELLED',
          message: 'cancelled',
          created_at: '2026-11-26T03:30:00Z',
        },
      ],
    });
    view();
    const timeline = await screen.findByRole('list', {
      name: 'สถานะคำสั่งซื้อ',
    });
    const steps = within(timeline).getAllByRole('listitem');
    expect(steps).toHaveLength(2);
    expect(steps[1]).toHaveTextContent('ยกเลิกแล้ว');
    expect(steps[1]).toHaveAttribute('aria-current', 'step');
    expect(timeline).not.toHaveTextContent('รอดำเนินการ');
  });

  it('shows the store reason when an order is rejected', async () => {
    respond({
      ...tracked,
      status: 'REJECTED',
      events: [
        ...tracked.events.slice(0, 1),
        {
          status: 'REJECTED',
          message: 'วัตถุดิบหมด ขออภัยค่ะ',
          created_at: '2026-11-26T03:28:00Z',
        },
      ],
    });
    view();
    const timeline = await screen.findByRole('list', {
      name: 'สถานะคำสั่งซื้อ',
    });
    const steps = within(timeline).getAllByRole('listitem');
    expect(steps.at(-1)).toHaveTextContent('วัตถุดิบหมด ขออภัยค่ะ');
  });

  it('places a clearly labelled test-mode payment row before the order card', async () => {
    respond({
      ...tracked,
      status: 'PENDING',
      events: tracked.events.slice(0, 1),
    });
    view();
    const payment = await screen.findByRole('region', { name: 'ชำระเงิน' });
    const scope = within(payment);
    expect(scope.getByText('โหมดทดสอบ')).toBeVisible();
    expect(
      scope.getByText(
        'ระบบนี้ใช้การชำระเงินทดสอบ ยังไม่ใช่ PromptPay จริง และจะไม่มีการตัดเงินจริง',
      ),
    ).toBeVisible();
    expect(scope.getByText('ยอดชำระเงิน')).toBeVisible();
    for (const name of [
      'เริ่มชำระเงิน',
      'กู้คืนหน้าชำระเงิน',
      'ตรวจสอบสถานะชำระเงิน',
    ])
      expect(scope.getByRole('button', { name })).toBeVisible();
    const card = screen.getByRole('region', { name: 'กะเพราพี่ต้น' });
    expect(
      payment.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.queryByRole('img', { name: /QR|PromptPay/i })).toBeNull();
    expect(document.body.textContent).not.toMatch(
      /ตรวจสอบอัตโนมัติ|verified automatically/i,
    );
  });

  it('hides payment once the order is being prepared', async () => {
    respond(tracked);
    view();
    await screen.findByRole('region', { name: 'กะเพราพี่ต้น' });
    expect(screen.queryByRole('region', { name: 'ชำระเงิน' })).toBeNull();
    expect(screen.getByRole('button', { name: 'อัปเดตสถานะ' })).toBeVisible();
    expect(
      screen.getByText(
        'เก็บลิงก์นี้เป็นส่วนตัว ผู้ที่มีลิงก์สามารถดูออเดอร์ได้',
      ),
    ).toBeVisible();
  });
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
