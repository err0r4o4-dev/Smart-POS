import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { StorefrontLayout } from '../../layouts/StorefrontLayout';
import { StorefrontPage } from './StorefrontPage';
import { ShopCartPage } from './ShopCartPage';
import { ShopTrackingPage } from './ShopTrackingPage';

const product = {
  variant_id: '11111111-1111-4111-8111-111111111111',
  product_name: 'กาแฟ',
  variant_name: '250 กรัม',
  sku: 'COFFEE',
  unit: 'ถุง',
  unit_type: 'COUNT',
  unit_price: '19.99',
  available: '5.000',
  saleable: true,
  published: true,
};
const settings = {
  slug: 'test-shop',
  name: 'ร้านทดสอบ',
  description: 'สินค้าจริงจากร้าน',
  contact_phone: '020000000',
  pickup_instructions: 'รับที่เคาน์เตอร์ 09:00–18:00',
  published: true,
  accepting_orders: true,
  revision: 1,
};
const quote = {
  quote_id: 'a'.repeat(64),
  items: [{ ...product, quantity: '1.000', line_total: '19.99' }],
  estimated_total: '19.99',
  currency: 'THB',
};
const order = {
  id: 'order',
  number: 'WEB-TEST',
  status: 'PENDING',
  payment_status: 'UNPAID',
  estimated_total: '19.99',
  final_total: null,
  receipt_number: null,
  store_name: 'ร้านทดสอบ',
  store_phone: '020000000',
  pickup_instructions: settings.pickup_instructions,
  expires_at: '2026-10-13T00:00:00Z',
  items: quote.items,
  events: [],
};
const fetchMock = vi.fn();
const response = (data: unknown) => ({
  ok: true,
  status: 200,
  json: async () => ({ data }),
});
function view(path: string) {
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
        <Routes>
          <Route path="/shop" element={<StorefrontLayout />}>
            <Route index element={<StorefrontPage />} />
            <Route path=":slug" element={<StorefrontPage />} />
            <Route path=":slug/cart" element={<ShopCartPage />} />
            <Route path=":slug/track/:orderId" element={<ShopTrackingPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) => {
    if (url === '/api/v1/storefronts') return response([]);
    if (url.includes('/products?'))
      return response({ items: [product], total: 1, page: 1, page_size: 24 });
    if (url.endsWith('/quote')) return response(quote);
    if (url.endsWith('/orders') || url.endsWith('/track'))
      return response(order);
    return response(settings);
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

it('keeps the customer area independent of auth and organization providers', async () => {
  view('/shop');
  expect(
    screen.getByRole('heading', { level: 1, name: 'หน้าร้านออนไลน์' }),
  ).toBeVisible();
  expect(screen.getByText('สำหรับลูกค้า')).toBeVisible();
  expect(
    screen.getByRole('navigation', { name: 'เมนูหน้าร้านลูกค้า' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('navigation', { name: 'Main navigation' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  for (const path of [
    '/pos',
    '/employees',
    '/inventory',
    '/settings/store',
    '/register',
  ])
    expect(document.querySelector(`a[href="${path}"]`)).not.toBeInTheDocument();
  expect(
    await screen.findByRole('heading', { name: 'ยังไม่มีร้านที่เปิดเผยแพร่' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('button', { name: /ส่งออเดอร์/ }),
  ).not.toBeInTheDocument();
  expect(
    fetchMock.mock.calls.every(
      ([url]) => !String(url).includes('/organizations/'),
    ),
  ).toBe(true);
  expect(document.querySelector('main main')).not.toBeInTheDocument();
});

it('shows real published products and persists cart separately for each store', async () => {
  view('/shop/test-shop');
  expect(await screen.findByRole('heading', { name: 'กาแฟ' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'เพิ่มลงตะกร้า' }));
  expect(screen.getByRole('link', { name: 'ตะกร้า (1)' })).toBeVisible();
  expect(
    JSON.parse(localStorage.getItem('shop-cart:test-shop')!)[0].variant_id,
  ).toBe(product.variant_id);
  expect(localStorage.getItem('shop-cart:another-shop')).toBeNull();
  expect(screen.getByText(/การส่งออเดอร์ยังไม่กันสต็อก/)).toBeVisible();
});
it('disables ordering while the published store is closed', async () => {
  fetchMock.mockImplementation(async (url: string) =>
    response(
      url.includes('/products?')
        ? { items: [product], total: 1, page: 1, page_size: 24 }
        : { ...settings, accepting_orders: false },
    ),
  );
  view('/shop/test-shop');
  expect(
    await screen.findByRole('button', { name: 'เพิ่มลงตะกร้า' }),
  ).toBeDisabled();
  expect(screen.getByText('ปิดรับออเดอร์ชั่วคราว')).toBeVisible();
});
it('does not invent an empty shop when loading fails', async () => {
  fetchMock.mockResolvedValue({
    ok: false,
    status: 503,
    json: async () => ({ error: { message: 'ระบบยังไม่พร้อม' } }),
  });
  view('/shop');
  expect(await screen.findByRole('alert')).toHaveTextContent('ระบบยังไม่พร้อม');
  expect(
    screen.queryByText('ยังไม่มีร้านที่เปิดเผยแพร่'),
  ).not.toBeInTheDocument();
});
it('invalidates a reviewed quote after quantity changes', async () => {
  localStorage.setItem(
    'shop-cart:test-shop',
    JSON.stringify([{ ...product, quantity: '1.000' }]),
  );
  view('/shop/test-shop/cart');
  const review = await screen.findByRole('button', {
    name: 'ตรวจรายการและยอดล่าสุด',
  });
  await waitFor(() => expect(review).toBeEnabled());
  fireEvent.click(review);
  expect(
    await screen.findByRole('button', { name: 'ส่งออเดอร์ · ยังไม่ชำระเงิน' }),
  ).toBeVisible();
  fireEvent.change(screen.getByLabelText('จำนวน กาแฟ'), {
    target: { value: '2' },
  });
  expect(
    screen.queryByRole('button', { name: 'ส่งออเดอร์ · ยังไม่ชำระเงิน' }),
  ).not.toBeInTheDocument();
});
it('retries an uncertain order with the same body, token and idempotency key', async () => {
  let attempts = 0;
  fetchMock.mockImplementation(async (url: string) => {
    if (url.endsWith('/orders') && attempts++ === 0)
      return {
        ok: false,
        status: 503,
        json: async () => ({
          error: {
            code: 'DEPENDENCY_UNAVAILABLE',
            message: 'เครือข่ายขัดข้อง',
          },
        }),
      };
    return response(
      url.endsWith('/quote')
        ? quote
        : url.endsWith('/orders') || url.endsWith('/track')
          ? order
          : settings,
    );
  });
  localStorage.setItem(
    'shop-cart:test-shop',
    JSON.stringify([{ ...product, quantity: '1.000' }]),
  );
  view('/shop/test-shop/cart');
  const review = await screen.findByRole('button', {
    name: 'ตรวจรายการและยอดล่าสุด',
  });
  await waitFor(() => expect(review).toBeEnabled());
  fireEvent.click(review);
  fireEvent.change(await screen.findByLabelText('ชื่อผู้รับสินค้า'), {
    target: { value: 'ลูกค้าทดสอบ' },
  });
  fireEvent.change(screen.getByLabelText('เบอร์ติดต่อ'), {
    target: { value: '0812345678' },
  });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(
    screen.getByRole('button', { name: 'ส่งออเดอร์ · ยังไม่ชำระเงิน' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'เครือข่ายขัดข้อง',
  );
  expect(sessionStorage.getItem('shop-pending:test-shop')).not.toContain(
    '0812345678',
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'ลองส่งคำขอเดิมอีกครั้ง' }),
  );
  expect(
    await screen.findByRole('heading', { name: 'ติดตามออเดอร์' }),
  ).toBeVisible();
  const writes = fetchMock.mock.calls.filter(([url]) =>
    String(url).endsWith('/orders'),
  );
  expect(writes).toHaveLength(2);
  expect(writes[0][1].body).toBe(writes[1][1].body);
  expect(writes[0][1].headers['Idempotency-Key']).toBe(
    writes[1][1].headers['Idempotency-Key'],
  );
  expect(localStorage.getItem('shop-cart:test-shop')).toBe('[]');
  expect(sessionStorage.getItem('shop-pending:test-shop')).toBeNull();
});
it('requires the private access fragment to track an order', () => {
  view('/shop/test-shop/track/order');
  expect(screen.getByRole('alert')).toHaveTextContent('ลิงก์ติดตามไม่ครบ');
  expect(fetchMock).not.toHaveBeenCalled();
});
