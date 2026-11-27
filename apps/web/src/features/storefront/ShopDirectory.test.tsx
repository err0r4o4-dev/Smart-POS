import { fireEvent, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render } from '../../test/render';
import { StorefrontLayout } from '../../layouts/StorefrontLayout';
import { StorefrontPage } from './StorefrontPage';

const fetchMock = vi.fn();
const shops = [
  {
    slug: 'yam',
    name: 'yam',
    accepting_orders: true,
    category_codes: ['made-to-order', 'noodles'],
  },
  {
    slug: 'closed',
    name: 'ร้านพัก',
    accepting_orders: false,
    category_codes: ['drinks'],
  },
];

function view(entry = '/shop') {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route element={<StorefrontLayout />}>
            <Route path="/shop" element={<StorefrontPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

function typeGroup() {
  return within(screen.getByRole('group', { name: 'หมวดอาหาร' }));
}

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ data: shops }),
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

it('keeps the current directory search in navigation without offering area browsing', () => {
  view(
    '/shop?q=yam&filter=open&filter=delivery&category=noodles&sort=name&source=test',
  );
  const header = within(screen.getByRole('banner'));
  expect(header.getByRole('link', { name: 'ร้านอาหาร' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  const query = '?q=yam&filter=open&filter=delivery&category=noodles&sort=name';
  expect(header.getByRole('link', { name: 'ร้านอาหาร' })).toHaveAttribute(
    'href',
    `/shop${query}`,
  );
  expect(header.queryByRole('link', { name: 'พื้นที่' })).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox', { name: 'เลือกพื้นที่' })).not.toBeInTheDocument();
  expect(screen.getByRole('searchbox', { name: 'ค้นหาร้าน' })).toHaveValue(
    'yam',
  );
  expect(screen.getByRole('button', { name: 'ก๋วยเตี๋ยว' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  expect(screen.getByRole('combobox', { name: 'เรียงตาม' })).toHaveValue(
    'name',
  );
});

it('shows the discovery page and searches real shops outside the header', async () => {
  view();
  expect(
    screen.getByRole('heading', {
      level: 1,
      name: 'ค้นหาร้านอาหารในชุมชนของคุณ',
    }),
  ).toBeVisible();
  expect(await screen.findByRole('heading', { name: 'yam' })).toBeVisible();
  const search = screen.getByRole('searchbox', { name: 'ค้นหาร้าน' });
  expect(search.closest('header')).toBeNull();
  fireEvent.change(search, { target: { value: ' YAM ' } });
  expect(
    screen.queryByRole('heading', { name: 'ร้านพัก' }),
  ).not.toBeInTheDocument();
  fireEvent.change(search, { target: { value: 'missing' } });
  expect(screen.getByText('ไม่พบร้านที่ตรงกับคำค้น')).toBeVisible();
  fireEvent.change(search, { target: { value: '' } });
  expect(screen.getByRole('heading', { name: 'ร้านพัก' })).toBeVisible();
});

it('starts from the search and food category given in the home page link', async () => {
  view('/shop?q=ร้าน&category=drinks');
  expect(await screen.findByRole('heading', { name: 'ร้านพัก' })).toBeVisible();
  expect(screen.getByRole('searchbox', { name: 'ค้นหาร้าน' })).toHaveValue(
    'ร้าน',
  );
  expect(
    screen.queryByRole('heading', { name: 'yam' }),
  ).not.toBeInTheDocument();
});

it('links every store, including closed ones, to its storefront', async () => {
  view();
  expect(await screen.findByRole('link', { name: 'yam' })).toHaveAttribute(
    'href',
    '/shop/yam',
  );
  expect(screen.getByRole('link', { name: 'ร้านพัก' })).toHaveAttribute(
    'href',
    '/shop/closed',
  );
  expect(screen.getByText('ปิดรับออเดอร์ชั่วคราว')).toBeVisible();
});

it('restores filters from the URL and clears them when no shop matches', async () => {
  view('/shop?filter=open&q=ร้าน');
  expect(await screen.findByText('ไม่พบร้านที่ตรงกับคำค้น')).toBeVisible();
  expect(
    screen.getByRole('button', { name: 'เปิดรับออเดอร์' }),
  ).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'ล้างตัวกรอง' }));
  expect(screen.getByRole('heading', { name: 'ร้านพัก' })).toBeVisible();
  expect(screen.getByRole('searchbox', { name: 'ค้นหาร้าน' })).toHaveValue(
    'ร้าน',
  );
});

it('lists stores with a cart action when opened from the cart link', async () => {
  view('/shop?view=cart');
  expect(
    screen.getByRole('heading', { level: 1, name: 'ตะกร้าสินค้า' }),
  ).toBeVisible();
  await screen.findByRole('heading', { name: 'yam' });
  expect(
    screen.getAllByRole('link', { name: 'เปิดตะกร้า' })[0],
  ).toHaveAttribute('href', '/shop/yam/cart');
});

it('switches directory controls and reference copy to English', async () => {
  view();
  await screen.findByRole('heading', { name: 'yam' });
  fireEvent.click(screen.getAllByRole('button', { name: 'English' })[0]);
  expect(
    screen.getByRole('heading', {
      level: 1,
      name: 'Find restaurants in your community',
    }),
  ).toBeVisible();
  expect(
    screen.getByRole('searchbox', { name: 'Search stores' }),
  ).toBeVisible();
  expect(screen.getByRole('group', { name: 'Food categories' })).toBeVisible();
  expect(
    screen.getByText(
      'Find a restaurant, browse the menu and choose from its pickup or delivery options.',
    ),
  ).toBeVisible();
});

it('keeps the search available while loading and shows an honest empty state', async () => {
  let resolveDirectory!: (value: unknown) => void;
  fetchMock.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveDirectory = resolve;
      }),
  );
  view();
  expect(screen.getByText('กำลังโหลดหน้าร้าน…')).toBeVisible();
  expect(screen.getByRole('searchbox', { name: 'ค้นหาร้าน' })).toBeVisible();
  resolveDirectory({ ok: true, json: async () => ({ data: [] }) });
  expect(
    await screen.findByRole('heading', { name: 'ยังไม่มีร้านที่เปิดเผยแพร่' }),
  ).toBeVisible();
  expect(screen.queryByRole('article')).not.toBeInTheDocument();
});

it('recovers from directory failures without losing the search', async () => {
  fetchMock.mockRejectedValueOnce(new Error('โหลดข้อมูลไม่สำเร็จ'));
  view();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'โหลดข้อมูลไม่สำเร็จ',
  );
  fireEvent.change(screen.getByRole('searchbox', { name: 'ค้นหาร้าน' }), {
    target: { value: 'yam' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'ลองอีกครั้ง' }));
  expect(await screen.findByRole('heading', { name: 'yam' })).toBeVisible();
  expect(screen.getByRole('searchbox')).toHaveValue('yam');
  expect(
    screen.queryByRole('heading', { name: 'ร้านพัก' }),
  ).not.toBeInTheDocument();
});

it('filters by saved food category alongside search without treating closed stores as a category', async () => {
  view();
  await screen.findByRole('heading', { name: 'yam' });
  const cafe = typeGroup().getByRole('button', { name: 'เครื่องดื่ม' });
  fireEvent.click(cafe);
  expect(cafe).toHaveAttribute('aria-pressed', 'true');
  expect(
    screen.queryByRole('heading', { name: 'yam' }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'ร้านพัก' })).toBeVisible();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'yam' } });
  expect(screen.getByText('ไม่พบร้านที่ตรงกับคำค้น')).toBeVisible();
  fireEvent.click(typeGroup().getByRole('button', { name: 'ทั้งหมด' }));
  expect(screen.getByRole('heading', { name: 'yam' })).toBeVisible();
  expect(
    typeGroup()
      .getAllByRole('button')
      .map((button) => button.textContent),
  ).not.toContain('ปิดรับออเดอร์ชั่วคราว');
});

it('keeps uncategorized stores in All and ignores old type links', async () => {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      data: [
        ...shops,
        { slug: 'unassigned', name: 'yam unassigned', accepting_orders: true },
      ],
    }),
  });
  view('/shop?q=yam&type=cafe');
  expect(
    await screen.findByRole('heading', { name: 'yam unassigned' }),
  ).toBeVisible();
  expect(screen.getByRole('searchbox')).toHaveValue('yam');
  fireEvent.click(typeGroup().getByRole('button', { name: 'ก๋วยเตี๋ยว' }));
  expect(screen.getByRole('heading', { name: /^yam$/ })).toBeVisible();
  expect(
    screen.queryByRole('heading', { name: 'yam unassigned' }),
  ).not.toBeInTheDocument();
});
