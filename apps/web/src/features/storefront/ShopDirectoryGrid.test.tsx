import { fireEvent, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, expect, it } from 'vitest';
import type { ShopDirectoryEntry } from '../../lib/storefront-api';
import { render } from '../../test/render';
import { ShopDirectoryGrid } from './ShopDirectoryGrid';

const shops: ShopDirectoryEntry[] = [
  {
    slug: 'yam',
    name: 'Yam House',
    accepting_orders: true,
    category_codes: ['made-to-order', 'noodles'],
    average_rating: 4.6,
    review_count: 12,
    delivery_enabled: true,
  },
  {
    slug: 'closed',
    name: 'ร้านพัก',
    accepting_orders: false,
    category_codes: ['drinks'],
    average_rating: null,
    review_count: 0,
  },
  {
    slug: 'bad-rating',
    name: 'Apple Bakery',
    accepting_orders: true,
    category_codes: ['desserts'],
    average_rating: 7,
    review_count: 3,
  },
];

function grid(
  props: Partial<Parameters<typeof ShopDirectoryGrid>[0]> = {},
  entry = '/shop',
) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <ShopDirectoryGrid shops={shops} headingId="results" {...props} />
    </MemoryRouter>,
  );
}

function headings() {
  return screen
    .getAllByRole('heading', { level: 3 })
    .map((heading) => heading.textContent);
}

beforeEach(() => localStorage.clear());

it('searches store names ignoring case and surrounding spaces', () => {
  grid();
  const search = screen.getByRole('searchbox', { name: 'ค้นหาร้าน' });
  fireEvent.change(search, { target: { value: '  YAM ' } });
  expect(headings()).toEqual(['Yam House']);
  fireEvent.change(search, { target: { value: 'missing' } });
  expect(screen.getByText('ไม่พบร้านที่ตรงกับคำค้น')).toBeVisible();
});

it('starts from the query and food category given in the link', () => {
  grid({}, '/shop?q=ร้าน&category=drinks');
  expect(screen.getByRole('searchbox')).toHaveValue('ร้าน');
  expect(headings()).toEqual(['ร้านพัก']);
  expect(screen.getByRole('button', { name: 'เครื่องดื่ม' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});

it('filters to open stores and to saved favorites with honest empty states', () => {
  grid();
  const filters = within(screen.getByRole('group', { name: 'ตัวกรองร้าน' }));
  fireEvent.click(filters.getByRole('button', { name: 'เปิดรับออเดอร์' }));
  expect(headings()).toEqual(['Yam House', 'Apple Bakery']);

  fireEvent.click(filters.getByRole('button', { name: 'ร้านโปรด' }));
  expect(
    screen.getByText('ยังไม่มีร้านโปรด กดรูปหัวใจที่ร้านเพื่อบันทึก'),
  ).toBeVisible();

  fireEvent.click(filters.getByRole('button', { name: 'แนะนำ' }));
  fireEvent.click(
    screen.getByRole('button', { name: 'บันทึก ร้านพัก เป็นร้านโปรด' }),
  );
  fireEvent.click(filters.getByRole('button', { name: 'ร้านโปรด' }));
  expect(headings()).toEqual(['ร้านพัก']);
});

it('lists open stores first by default and sorts by name on request', () => {
  grid();
  expect(headings()).toEqual(['Yam House', 'Apple Bakery', 'ร้านพัก']);
  fireEvent.change(screen.getByRole('combobox', { name: 'เรียงตาม' }), {
    target: { value: 'name' },
  });
  // Thai collation places Thai names before Latin ones.
  expect(headings()).toEqual(['ร้านพัก', 'Apple Bakery', 'Yam House']);
});

it('offers the shared food categories and filters stores by membership', () => {
  grid();
  const types = within(screen.getByRole('group', { name: 'หมวดอาหาร' }));
  expect(
    types.getAllByRole('button').map((button) => button.textContent),
  ).toEqual([
    'ทั้งหมด',
    'อาหารตามสั่ง',
    'ก๋วยเตี๋ยว',
    'อาหารอีสาน',
    'ของทอด',
    'เครื่องดื่ม',
    'ของหวาน',
    'อาหารสุขภาพ',
    'อาหารทานเล่น',
    'อาหารใต้และข้าวแกง',
    'อาหารเหนือ',
    'ซีฟู้ด',
    'อาหารเช้า',
    'อาหารเอเชีย',
  ]);
  fireEvent.click(types.getByRole('button', { name: 'ของหวาน' }));
  expect(headings()).toEqual(['Apple Bakery']);
  fireEvent.click(types.getByRole('button', { name: 'ทั้งหมด' }));
  expect(headings()).toHaveLength(3);
});

it('filters published seafood storefronts even while orders are paused', () => {
  grid({
    shops: [
      ...shops,
      {
        slug: 'sea',
        name: 'Seafood pilot',
        category_codes: ['seafood'],
        accepting_orders: false,
      },
    ],
  });
  fireEvent.click(
    within(screen.getByRole('group', { name: 'หมวดอาหาร' })).getByRole(
      'button',
      { name: 'ซีฟู้ด' },
    ),
  );
  expect(headings()).toEqual(['Seafood pilot']);
  expect(screen.getByText('ปิดรับออเดอร์ชั่วคราว')).toBeInTheDocument();
});

it('shows each store with a cover, a text status and a favorite toggle', () => {
  grid();
  const card = screen.getByRole('article', { name: 'ร้านพัก' });
  const card$ = within(card);
  expect(card.querySelector('img')).toHaveAttribute('alt', '');
  expect(card.querySelector('img')).toHaveAttribute(
    'src',
    '/images/customer/cover-cafe.webp',
  );
  expect(card$.getByText('ปิดรับออเดอร์ชั่วคราว')).toBeVisible();
  expect(card$.getByRole('link', { name: 'ร้านพัก' })).toHaveAttribute(
    'href',
    '/shop/closed',
  );
  expect(
    card$.getByRole('button', { name: 'บันทึก ร้านพัก เป็นร้านโปรด' }),
  ).toHaveAttribute('aria-pressed', 'false');
});

it('shows ratings only when the API reports a real one', () => {
  grid();
  const rated = within(screen.getByRole('article', { name: 'Yam House' }));
  expect(rated.getByText('4.6')).toBeVisible();
  expect(rated.getByText('12 รีวิว')).toBeVisible();
  expect(rated.getByText('มีจัดส่ง')).toBeVisible();

  const unrated = within(screen.getByRole('article', { name: 'ร้านพัก' }));
  expect(unrated.getByText('ยังไม่มีรีวิว')).toBeVisible();

  const invalid = within(screen.getByRole('article', { name: 'Apple Bakery' }));
  expect(invalid.queryByText('7.0')).toBeNull();
  expect(invalid.queryByText(/รีวิว/)).toBeNull();
});

it('hides rating text entirely when rating fields are missing', () => {
  grid({ shops: [{ slug: 'x', name: 'Plain', accepting_orders: true }] });
  const card = within(screen.getByRole('article', { name: 'Plain' }));
  expect(card.queryByText(/รีวิว/)).toBeNull();
});

it('links each store to its cart in cart mode', () => {
  grid({ action: 'cart' });
  expect(
    within(screen.getByRole('article', { name: 'Yam House' })).getByRole(
      'link',
      { name: 'เปิดตะกร้า' },
    ),
  ).toHaveAttribute('href', '/shop/yam/cart');
});

it('renders a status slot instead of results while loading', () => {
  grid({ shops: [], status: <p>loading-slot</p> });
  expect(screen.getByText('loading-slot')).toBeVisible();
  expect(screen.getByRole('searchbox', { name: 'ค้นหาร้าน' })).toBeVisible();
  expect(screen.queryByText('ไม่พบร้านที่ตรงกับคำค้น')).toBeNull();
});

it('combines directory filters and resets pagination when filters change', () => {
  const many = Array.from({ length: 10 }, (_, index) => ({
    slug: `shop-${index}`,
    name: `Shop ${index}`,
    accepting_orders: true,
    delivery_enabled: index === 0,
  }));
  grid({ directoryMode: true, shops: many });
  expect(headings()).toHaveLength(8);
  fireEvent.click(screen.getByRole('button', { name: '2' }));
  expect(headings()).toHaveLength(2);
  const filters = within(screen.getByRole('group', { name: 'ตัวกรองร้าน' }));
  fireEvent.click(filters.getByRole('button', { name: 'เปิดรับออเดอร์' }));
  fireEvent.click(filters.getByRole('button', { name: 'มีจัดส่ง' }));
  expect(headings()).toEqual(['Shop 0']);
  expect(
    filters.getByRole('button', { name: 'เปิดรับออเดอร์' }),
  ).toHaveAttribute('aria-pressed', 'true');
});

it('preserves directory URL state when opening a store', () => {
  function Store() {
    const location = useLocation();
    return <p>{location.state.directorySearch}</p>;
  }
  render(
    <MemoryRouter
      initialEntries={[
        '/shop?q=yam&filter=open&filter=delivery&sort=name&page=2',
      ]}
    >
      <Routes>
        <Route
          path="/shop"
          element={
            <ShopDirectoryGrid
              shops={shops}
              headingId="results"
              directoryMode
            />
          }
        />
        <Route path="/shop/:slug" element={<Store />} />
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('link', { name: 'Yam House' }));
  expect(
    screen.getByText('?q=yam&filter=open&filter=delivery&sort=name&page=2'),
  ).toBeVisible();
});
