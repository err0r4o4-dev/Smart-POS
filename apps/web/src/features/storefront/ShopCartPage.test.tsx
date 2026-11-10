import { fireEvent, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { render, renderInEnglish } from '../../test/render';
import { ShopCartPage } from './ShopCartPage';

const request = vi.hoisted(() => vi.fn());
vi.mock('../../lib/storefront-api', async (original) => ({
  ...(await original<typeof import('../../lib/storefront-api')>()),
  storefrontRequest: request,
}));
const product = {
  variant_id: 'item',
  product_name: 'กาแฟ',
  variant_name: '',
  sku: 'A',
  unit: 'แก้ว',
  unit_type: 'COUNT',
  unit_price: '10.00',
  quantity: '1.000',
};
function view(
  search = '',
  english = false,
  initialPath = '/shop/test-shop/cart',
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
      <MemoryRouter initialEntries={[`${initialPath}${search}`]}>
        <Routes>
          <Route path="/shop/:slug/cart" element={<ShopCartPage />} />
          <Route path="/shop/:slug/checkout" element={<ShopCartPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  request.mockReset();
  localStorage.setItem('shop-cart:test-shop', JSON.stringify([product]));
  request.mockImplementation(async (path: string) =>
    path.endsWith('/quote')
      ? {
          quote_id: 'quote',
          items: [],
          estimated_total: '10.00',
          currency: 'THB',
          table_code: 'T01',
        }
      : { accepting_orders: true, delivery_enabled: true },
  );
});
it('shows the invalid table-link warning in English', async () => {
  view('?table=invalid', true);
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Invalid table link. Scan the QR code at your table again.',
  );
});

it('hides the default variant and clearly labels item removal', async () => {
  localStorage.setItem(
    'shop-cart:test-shop',
    JSON.stringify([{ ...product, variant_name: 'Default' }]),
  );
  view();
  expect(
    await screen.findByRole('heading', { name: product.product_name }),
  ).toBeVisible();
  expect(screen.queryByText('Default')).not.toBeInTheDocument();
  expect(screen.queryByText('เพิ่มลงตะกร้าแล้ว')).not.toBeInTheDocument();
  const remove = screen.getByRole('button', {
    name: `ลบสินค้า ${product.product_name}`,
  });
  expect(remove).toHaveTextContent('ลบสินค้า');
  fireEvent.click(remove);
  expect(
    screen.queryByRole('heading', { name: product.product_name }),
  ).not.toBeInTheDocument();
});

it('keeps meaningful variants and quantity controls available', async () => {
  localStorage.setItem(
    'shop-cart:test-shop',
    JSON.stringify([{ ...product, variant_name: 'เย็น' }]),
  );
  view();
  expect(await screen.findByText('เย็น')).toBeVisible();
  const quantity = screen.getByRole('textbox', {
    name: `จำนวน ${product.product_name}`,
  });
  expect(quantity).toHaveValue('1');
  fireEvent.click(
    screen.getByRole('button', { name: `เพิ่มจำนวน: ${product.product_name}` }),
  );
  expect(quantity).toHaveValue('2');
  fireEvent.click(
    screen.getByRole('button', { name: `ลดจำนวน: ${product.product_name}` }),
  );
  expect(quantity).toHaveValue('1');
});

it('hides table selection for takeaway carts', async () => {
  view();
  expect(
    await screen.findByRole('button', { name: 'ซื้อกลับบ้าน' }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(screen.queryByLabelText('โต๊ะ')).not.toBeInTheDocument();
});

it('navigates to checkout and allows returning to cart', async () => {
  view();
  const steps = screen.getByRole('navigation', { name: 'ขั้นตอนการสั่งซื้อ' });
  expect(steps.querySelector('[aria-current="step"]')).toHaveTextContent(
    'ตะกร้าสินค้า',
  );
  expect(steps.querySelector('ol')).toBeInTheDocument();
  const review = await screen.findByRole('button', {
    name: 'ตรวจสอบรายการและยอดล่าสุด',
  });
  await waitFor(() => expect(review).toBeEnabled());
  fireEvent.click(review);
  await screen.findByRole('heading', {
    level: 1,
    name: 'ตรวจสอบและยืนยันคำสั่งซื้อ',
  });
  const visibleSteps = screen.getByRole('navigation', {
    name: 'ขั้นตอนการสั่งซื้อ',
  });
  expect(visibleSteps.querySelector('[aria-current="step"]')).toHaveTextContent(
    'ตรวจสอบและยืนยันคำสั่งซื้อ',
  );
  fireEvent.click(screen.getAllByRole('button', { name: 'กลับไปตะกร้า' })[0]);
  expect(
    screen.getByRole('heading', { level: 1, name: 'ตะกร้าสินค้า' }),
  ).toBeVisible();
});

it('allows QR dine-in review and preserves the token in the quote and order', async () => {
  const token = 'a'.repeat(64);
  view(`?table=${token}`);
  fireEvent.click(screen.getByRole('button', { name: 'ทานที่ร้าน' }));
  const review = await screen.findByRole('button', {
    name: 'ตรวจสอบรายการและยอดล่าสุด',
  });
  await waitFor(() => expect(review).toBeEnabled());
  fireEvent.click(review);
  expect(await screen.findByText('โต๊ะ T01')).toBeVisible();
  fireEvent.change(screen.getByLabelText('ชื่อผู้สั่งซื้อหรือผู้รับสินค้า'), {
    target: { value: 'Guest' },
  });
  fireEvent.change(screen.getByLabelText('เบอร์ติดต่อ'), {
    target: { value: '0800000000' },
  });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(
    screen.getByRole('button', { name: 'ยืนยันและส่งคำสั่งซื้อ' }),
  );
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      '/test-shop/orders',
      expect.objectContaining({
        body: expect.objectContaining({
          fulfillment: 'PICKUP',
          table_token: token,
        }),
      }),
    ),
  );
  expect(request).toHaveBeenCalledWith(
    '/test-shop/quote',
    expect.objectContaining({
      body: expect.objectContaining({
        fulfillment: 'PICKUP',
        table_token: token,
      }),
    }),
  );
});
it('quotes and submits delivery with the customer address', async () => {
  view();
  fireEvent.click(await screen.findByRole('button', { name: 'จัดส่ง' }));
  fireEvent.click(
    screen.getByRole('button', { name: 'ตรวจสอบรายการและยอดล่าสุด' }),
  );
  await screen.findByRole('button', { name: 'ยืนยันและส่งคำสั่งซื้อ' });
  fireEvent.change(screen.getByLabelText('ชื่อผู้สั่งซื้อหรือผู้รับสินค้า'), {
    target: { value: 'Guest' },
  });
  fireEvent.change(screen.getByLabelText('เบอร์ติดต่อ'), {
    target: { value: '0800000000' },
  });
  fireEvent.change(screen.getByLabelText('ที่อยู่จัดส่งโดยละเอียด'), {
    target: { value: '123 Bangkok' },
  });
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(
    screen.getByRole('button', { name: 'ยืนยันและส่งคำสั่งซื้อ' }),
  );
  await waitFor(() =>
    expect(request).toHaveBeenCalledWith(
      '/test-shop/orders',
      expect.objectContaining({
        body: expect.objectContaining({
          fulfillment: 'DELIVERY',
          delivery_address: '123 Bangkok',
        }),
      }),
    ),
  );
  expect(request).toHaveBeenCalledWith(
    '/test-shop/quote',
    expect.objectContaining({
      body: expect.objectContaining({ fulfillment: 'DELIVERY' }),
    }),
  );
});

it('keeps the quoted delivery total as a heading', async () => {
  request.mockImplementation(async (path: string) =>
    path.endsWith('/quote')
      ? {
          quote_id: 'quote',
          items: [],
          estimated_total: '15.00',
          shipping_fee: '5.00',
          currency: 'THB',
        }
      : { accepting_orders: true, delivery_enabled: true },
  );
  view();
  fireEvent.click(await screen.findByRole('button', { name: 'จัดส่ง' }));
  fireEvent.click(
    screen.getByRole('button', { name: 'ตรวจสอบรายการและยอดล่าสุด' }),
  );
  expect(await screen.findByRole('heading', { name: /15\.00/ })).toBeVisible();
});

it('shows delivery fee copy without the pickup-only disclaimer', async () => {
  request.mockImplementation(async (path: string) =>
    path.endsWith('/quote')
      ? {
          quote_id: 'quote',
          items: [],
          estimated_total: '15.00',
          shipping_fee: '5.00',
          currency: 'THB',
        }
      : { accepting_orders: true, delivery_enabled: true },
  );
  view();
  fireEvent.click(await screen.findByRole('button', { name: 'จัดส่ง' }));
  fireEvent.click(
    screen.getByRole('button', { name: 'ตรวจสอบรายการและยอดล่าสุด' }),
  );
  expect(await screen.findByText('ค่าจัดส่ง ฿5.00')).toBeVisible();
  expect(
    screen.queryByText(/ไม่มีค่าจัดส่ง เพราะรับที่ร้านเท่านั้น/),
  ).not.toBeInTheDocument();
  expect(
    screen.getByText(
      'ยอดรวมรวมค่าจัดส่งแล้ว ยังไม่รวมส่วนลด/รางวัลที่อาจใช้ได้ที่ POS',
    ),
  ).toBeVisible();
});

it('requires a QR token for dine-in and never submits an example table', async () => {
  view();
  fireEvent.click(screen.getByRole('button', { name: 'ทานที่ร้าน' }));
  const review = await screen.findByRole('button', {
    name: 'ตรวจสอบรายการและยอดล่าสุด',
  });
  expect(review).toBeDisabled();
  expect(request).not.toHaveBeenCalledWith(
    '/test-shop/quote',
    expect.anything(),
  );
});
