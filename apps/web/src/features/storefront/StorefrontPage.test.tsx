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
  stock_policy: 'TRACKED',
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
            <Route
              path=":slug/orders/:orderId"
              element={<ShopTrackingPage />}
            />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
it('renders a storefront directory with one or more published shops', async () => {
  fetchMock.mockResolvedValue({
    ...response([
      { slug: settings.slug, name: settings.name, accepting_orders: true },
      {
        slug: 'closed-shop',
        name: 'ร้านปิดรับออเดอร์',
        accepting_orders: false,
      },
    ]),
    headers: new Headers({ 'X-SmartPOS-Store-Mode': 'multi' }),
  });
  view('/shop');
  expect(
    await screen.findByRole('heading', { name: settings.name }),
  ).toBeVisible();
  expect(screen.getByText('ร้านปิดรับออเดอร์')).toBeVisible();
  expect(screen.getByText('กำลังรับออเดอร์')).toBeVisible();
  expect(screen.getByText('ปิดรับออเดอร์ชั่วคราว')).toBeVisible();
  expect(
    screen.getAllByRole('link', { name: 'ดูหน้าร้าน' })[0],
  ).toHaveAttribute('href', `/shop/${settings.slug}`);
});
it.each(['single', 'multi'])(
  'keeps the directory visible with one published shop in %s mode',
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
          headers: new Headers({ 'X-SmartPOS-Store-Mode': mode }),
        };
      return response(settings);
    });
    view('/shop');
    expect(
      await screen.findByRole('link', { name: 'ดูหน้าร้าน' }),
    ).toHaveAttribute('href', `/shop/${settings.slug}`);
    expect(fetchMock).toHaveBeenCalledTimes(1);
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

it.each([
  '/shop/test-shop',
  '/shop/test-shop/cart',
  '/shop/test-shop/orders/order',
])('uses the directory visual shell and compact footer on %s', async (path) => {
  view(path);
  expect(document.querySelector('.storefront-shell')).toHaveClass(
    'shop-directory-shell',
  );
  expect(screen.getByRole('contentinfo')).toHaveClass('shop-directory-footer');
  expect(
    screen.getByRole('link', { name: 'เงื่อนไขการให้บริการ' }),
  ).toBeVisible();
  if (path.endsWith('/test-shop')) {
    expect(
      await screen.findByRole('heading', { level: 1, name: settings.name }),
    ).toBeVisible();
    expect(screen.getByText(settings.description)).toBeVisible();
    expect(screen.getByText('กำลังรับออเดอร์')).toBeVisible();
  } else {
    expect(
      screen.queryByRole('button', { name: 'เมนู' }),
    ).not.toBeInTheDocument();
  }
});

it('keeps the customer area independent of auth and organization providers', async () => {
  view('/shop');
  expect(
    screen.getByRole('heading', { level: 1, name: 'หน้าร้านออนไลน์' }),
  ).toBeVisible();
  expect(screen.queryByText('สำหรับลูกค้า')).not.toBeInTheDocument();
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

it('allows a menu-only item without displaying a stock balance', async () => {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes('/products?'))
      return response({
        items: [{ ...product, stock_policy: 'MENU_ONLY', available: null }],
        total: 1,
        page: 1,
        page_size: 24,
      });
    return response(settings);
  });
  view('/shop/test-shop');
  await screen.findByRole('heading', { name: 'กาแฟ' });
  const input = screen.getByRole('spinbutton', { name: 'จำนวน กาแฟ' });
  expect(input).toBeEnabled();
  expect(screen.queryByText(/คงเหลือ 0/)).not.toBeInTheDocument();
  fireEvent.change(input, { target: { value: '2' } });
  fireEvent.click(screen.getByRole('button', { name: 'เพิ่มลงตะกร้า' }));
  expect(
    JSON.parse(localStorage.getItem('shop-cart:test-shop')!)[0].quantity,
  ).toBe('2.000');
});

it.each([undefined, 'FUTURE'])(
  'disables storefront products with a missing or unknown policy %s',
  async (policy) => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/products?'))
        return response({
          items: [{ ...product, stock_policy: policy }],
          total: 1,
          page: 1,
          page_size: 24,
        });
      return response(settings);
    });
    view('/shop/test-shop');
    await screen.findByRole('heading', { name: 'กาแฟ' });
    expect(
      screen.getByRole('button', { name: 'เพิ่มลงตะกร้า' }),
    ).toBeDisabled();
  },
);

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
it('keeps table QR context through cart review and submission', async () => {
  const tableToken = 'c'.repeat(64);
  fetchMock.mockImplementation(async (url: string) => {
    if (url.endsWith('/quote'))
      return response({ ...quote, table_code: 'T01' });
    if (url.endsWith('/orders') || url.endsWith('/track'))
      return response({ ...order, table_code: 'T01' });
    if (url.includes('/products?'))
      return response({ items: [product], total: 1, page: 1, page_size: 24 });
    return response(settings);
  });
  localStorage.setItem(
    'shop-cart:test-shop',
    JSON.stringify([{ ...product, quantity: '1.000' }]),
  );
  view(`/shop/test-shop?table=${tableToken}`);
  const cartLink = screen.getByRole('link', { name: /ตะกร้า/ });
  expect(cartLink).toHaveAttribute(
    'href',
    `/shop/test-shop/cart?table=${tableToken}`,
  );
  fireEvent.click(cartLink);
  const review = await screen.findByRole('button', {
    name: 'ตรวจรายการและยอดล่าสุด',
  });
  await waitFor(() => expect(review).toBeEnabled());
  fireEvent.click(review);
  expect(await screen.findByText('โต๊ะ T01')).toBeVisible();
  fireEvent.change(screen.getByLabelText('ชื่อผู้รับสินค้า'), {
    target: { value: 'Synthetic guest' },
  });
  fireEvent.change(screen.getByLabelText('เบอร์ติดต่อ'), {
    target: { value: '0800000000' },
  });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(
    screen.getByRole('button', { name: 'ส่งออเดอร์ · ยังไม่ชำระเงิน' }),
  );
  expect(
    await screen.findByRole('heading', { name: 'ติดตามออเดอร์' }),
  ).toBeVisible();
  expect(await screen.findByText('โต๊ะ T01')).toBeVisible();
  for (const endpoint of ['/quote', '/orders']) {
    const call = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith(endpoint),
    );
    expect(JSON.parse(call![1].body)).toEqual(
      expect.objectContaining({
        table_token: tableToken,
        fulfillment: 'PICKUP',
      }),
    );
  }
});

it.each([
  'table=invalid',
  'table=',
  `table=${'A'.repeat(64)}`,
  `table=${'a'.repeat(64)}&table=${'b'.repeat(64)}`,
])(
  'does not silently change an invalid QR into ordinary pickup: %s',
  async (search) => {
    localStorage.setItem(
      'shop-cart:test-shop',
      JSON.stringify([{ ...product, quantity: '1.000' }]),
    );
    view(`/shop/test-shop/cart?${search}`);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'ลิงก์โต๊ะไม่ถูกต้อง',
    );
    expect(
      screen.getByRole('button', { name: 'ตรวจรายการและยอดล่าสุด' }),
    ).toBeDisabled();
    expect(
      fetchMock.mock.calls.some(([url]) => String(url).endsWith('/quote')),
    ).toBe(false);
  },
);

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
      name: /ฉันเข้าใจว่ารายการที่ติดตามสต็อกจะถูกกันหลังส่งออเดอร์สำเร็จ/,
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
it('renders product image in cart when image_url is available', async () => {
  localStorage.setItem(
    'shop-cart:test-shop',
    JSON.stringify([
      {
        ...product,
        quantity: '1.000',
        image_url: 'https://example.com/coffee.jpg',
      },
    ]),
  );
  view('/shop/test-shop/cart');
  const img = await screen.findByRole('img', { name: product.product_name });
  expect(img).toHaveAttribute('src', 'https://example.com/coffee.jpg');
});

it('requires the private access fragment to track an order', () => {
  view('/shop/test-shop/orders/order');
  expect(screen.getByRole('alert')).toHaveTextContent('ลิงก์ติดตามไม่ครบ');
  expect(fetchMock).not.toHaveBeenCalled();
});
