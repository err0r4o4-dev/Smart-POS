import { render } from '../../test/render';
import { fireEvent, screen, waitFor } from '@testing-library/react';
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
it.each(['single', 'multi', undefined])(
  'opens the only store directly without a public store selector (mode: %s)',
  async (mode) => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url === '/api/v1/storefronts')
        return {
          ...response([
            {
              slug: settings.slug,
              name: settings.name,
              accepting_orders: true,
            },
          ]),
          headers: new Headers(mode ? { 'X-SmartPOS-Store-Mode': mode } : {}),
        };
      if (url.endsWith('/products?search=&page=1'))
        return response({ items: [product], total: 1, page: 1, page_size: 24 });
      return response(settings);
    });
    view('/shop');
    expect(await screen.findByText('กาแฟ')).toBeVisible();
    expect(
      screen.queryByRole('link', { name: 'ดูสินค้า' }),
    ).not.toBeInTheDocument();
  },
);
it('does not fall back to another store when the configured store is unpublished', async () => {
  fetchMock.mockResolvedValue({
    ...response([]),
    headers: new Headers({ 'X-SmartPOS-Store-Mode': 'single' }),
  });
  view('/shop');
  expect(await screen.findByText('ยังไม่มีร้านที่เปิดเผยแพร่')).toBeVisible();
  expect(
    screen.queryByRole('link', { name: 'ดูสินค้า' }),
  ).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it.each(['single', 'multi', undefined])(
  'rejects multiple shops instead of presenting a selector (mode: %s)',
  async (mode) => {
    fetchMock.mockResolvedValue({
      ...response([
        { slug: 'first', name: 'First', accepting_orders: true },
        { slug: 'second', name: 'Second', accepting_orders: true },
      ]),
      headers: new Headers(mode ? { 'X-SmartPOS-Store-Mode': mode } : {}),
    });
    view('/shop');
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ข้อมูลร้านเดียวไม่ถูกต้อง',
    );
    expect(
      screen.queryByRole('link', { name: 'ดูสินค้า' }),
    ).not.toBeInTheDocument();
  },
);
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
  expect(screen.queryByRole('link', { name: /^หน้าร้าน$/ })).toBeNull();
  expect(screen.queryByRole('link', { name: 'ค้นหาสินค้า' })).toBeNull();
  expect(
    screen.queryByRole('region', { name: 'ข้อมูลร้าน' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText('ข้อมูลการรับสินค้า')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'สถานะการเปิดขาย' }),
  ).not.toBeInTheDocument();
});

it('adds the selected exact quantity and updates the shared header cart badge', async () => {
  view('/shop/test-shop');
  await screen.findByRole('heading', { name: 'กาแฟ' });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'จำนวน กาแฟ' }), {
    target: { value: '3' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'เพิ่มลงตะกร้า' }));
  expect(
    JSON.parse(localStorage.getItem('shop-cart:test-shop')!)[0].quantity,
  ).toBe('3.000');
  expect(screen.getByRole('link', { name: 'ตะกร้า (1)' })).toBeVisible();
  expect(
    screen.getByRole('status', { name: 'ผลการเพิ่มสินค้า' }),
  ).toHaveTextContent('เพิ่ม กาแฟ');
});

it('validates quantity against available stock including the existing cart', async () => {
  localStorage.setItem(
    'shop-cart:test-shop',
    JSON.stringify([{ ...product, quantity: '4.000' }]),
  );
  view('/shop/test-shop');
  await screen.findByRole('heading', { name: 'กาแฟ' });
  const input = screen.getByRole('spinbutton', { name: 'จำนวน กาแฟ' });
  fireEvent.change(input, { target: { value: '2' } });
  expect(screen.getByRole('button', { name: 'เพิ่มลงตะกร้า' })).toBeDisabled();
  fireEvent.change(input, { target: { value: '0.5' } });
  expect(screen.getByRole('button', { name: 'เพิ่มลงตะกร้า' })).toBeDisabled();
  fireEvent.change(input, { target: { value: '1' } });
  fireEvent.click(screen.getByRole('button', { name: 'เพิ่มลงตะกร้า' }));
  expect(
    JSON.parse(localStorage.getItem('shop-cart:test-shop')!)[0].quantity,
  ).toBe('5.000');
  expect(screen.getByRole('button', { name: 'เพิ่มลงตะกร้า' })).toBeDisabled();
});

it('requests category, price and sort without an availability filter and resets pagination', async () => {
  const category = '22222222-2222-4222-8222-222222222222';
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('/products?')) {
      const page = Number(
        new URL(url, 'http://fixture.test').searchParams.get('page'),
      );
      return response({
        items: [
          { ...product, category_id: category, category_name: 'เครื่องดื่ม' },
        ],
        total: 30,
        page,
        page_size: 24,
        categories: [{ id: category, name: 'เครื่องดื่ม', count: 30 }],
      });
    }
    return response(settings);
  });
  view('/shop/test-shop');
  await screen.findByRole('heading', { name: 'กาแฟ' });
  fireEvent.click(screen.getByRole('button', { name: 'ถัดไป' }));
  await screen.findByText('หน้า 2 · 30 รายการ');
  fireEvent.click(screen.getByRole('button', { name: 'เครื่องดื่ม 30' }));
  await waitFor(() => {
    const url = new URL(fetchMock.mock.calls.at(-1)![0], 'http://fixture.test');
    expect(url.searchParams.get('category_id')).toBe(category);
    expect(url.searchParams.get('page')).toBe('1');
  });
  fireEvent.change(screen.getByLabelText('ราคาต่ำสุด'), {
    target: { value: '10' },
  });
  fireEvent.change(screen.getByLabelText('ราคาสูงสุด'), {
    target: { value: '50' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'ใช้ช่วงราคา' }));
  expect(screen.queryByLabelText('สถานะสินค้า')).toBeNull();
  fireEvent.change(screen.getByLabelText('เรียงสินค้า'), {
    target: { value: 'price_asc' },
  });
  await waitFor(() => {
    const url = new URL(fetchMock.mock.calls.at(-1)![0], 'http://fixture.test');
    expect(url.searchParams.get('min_price')).toBe('10');
    expect(url.searchParams.get('max_price')).toBe('50');
    expect(url.searchParams.has('availability')).toBe(false);
    expect(url.searchParams.get('sort')).toBe('price_asc');
  });
  fireEvent.click(screen.getByRole('button', { name: 'ล้างตัวกรอง' }));
  await waitFor(() => {
    const url = new URL(fetchMock.mock.calls.at(-1)![0], 'http://fixture.test');
    expect(url.searchParams.has('category_id')).toBe(false);
    expect(url.searchParams.has('min_price')).toBe(false);
    expect(url.searchParams.has('availability')).toBe(false);
  });
});

it('switches grid/list display without discarding the cart', async () => {
  view('/shop/test-shop');
  await screen.findByRole('heading', { name: 'กาแฟ' });
  fireEvent.click(screen.getByRole('button', { name: 'เพิ่มลงตะกร้า' }));
  fireEvent.click(screen.getByRole('button', { name: 'แสดงแบบรายการ' }));
  expect(screen.getByRole('button', { name: 'แสดงแบบรายการ' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getByRole('link', { name: 'ตะกร้า (1)' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'แสดงแบบตาราง' }));
  expect(screen.getByRole('button', { name: 'แสดงแบบตาราง' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

it('rejects an invalid price range without requesting incorrect results', async () => {
  fetchMock.mockImplementation(async (url: string) =>
    url.includes('/products?')
      ? response({
          items: [product],
          total: 1,
          page: 1,
          page_size: 24,
          categories: [],
        })
      : response(settings),
  );
  view('/shop/test-shop');
  await screen.findByRole('heading', { name: 'กาแฟ' });
  const calls = fetchMock.mock.calls.length;
  fireEvent.change(screen.getByLabelText('ราคาต่ำสุด'), {
    target: { value: '20' },
  });
  fireEvent.change(screen.getByLabelText('ราคาสูงสุด'), {
    target: { value: '10' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'ใช้ช่วงราคา' }));
  expect(screen.getByRole('alert')).toHaveTextContent(
    'ราคาต่ำสุดต้องไม่เกินราคาสูงสุด',
  );
  expect(fetchMock).toHaveBeenCalledTimes(calls);
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
  expect(
    screen.queryByRole('region', { name: 'ข้อมูลร้าน' }),
  ).not.toBeInTheDocument();
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
  expect(
    screen.getByRole('checkbox', {
      name: /ฉันเข้าใจว่าระบบกันสินค้าหลังส่งออเดอร์สำเร็จ/,
    }),
  ).toBeRequired();
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
  expect(
    await screen.findByText(/กรุณารอร้านยืนยันพร้อมรับก่อนเดินทาง/),
  ).toBeVisible();
  expect(screen.queryByText(/ยังไม่กันสต็อก/)).not.toBeInTheDocument();
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
