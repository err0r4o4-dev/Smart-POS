import { fireEvent, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it } from 'vitest';
import type { ShopDirectoryEntry } from '../../lib/storefront-api';
import { render } from '../../test/render';
import { ShopDirectoryGrid } from './ShopDirectoryGrid';

const shops: ShopDirectoryEntry[] = [
  {
    slug: 'yam',
    name: 'Yam House',
    accepting_orders: true,
    business_type: 'RESTAURANT',
    average_rating: 4.6,
    review_count: 12,
    delivery_enabled: true,
  },
  {
    slug: 'closed',
    name: 'ร้านพัก',
    accepting_orders: false,
    business_type: 'cafe',
    average_rating: null,
    review_count: 0,
  },
  {
    slug: 'bad-rating',
    name: 'Apple Bakery',
    accepting_orders: true,
    business_type: 'BAKERY',
    average_rating: 7,
    review_count: 3,
  },
];

function grid(props: Partial<Parameters<typeof ShopDirectoryGrid>[0]> = {}) {
  return render(
    <MemoryRouter>
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

it('starts from the query and business type given in the link', () => {
  grid({ initialQuery: 'ร้าน', initialType: 'CAFE' });
  expect(screen.getByRole('searchbox')).toHaveValue('ร้าน');
  expect(headings()).toEqual(['ร้านพัก']);
  expect(screen.getByRole('button', { name: 'คาเฟ่' })).toHaveAttribute(
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

it('offers only the business types present and filters by them', () => {
  grid();
  const types = within(screen.getByRole('group', { name: 'ประเภทร้าน' }));
  expect(
    types.getAllByRole('button').map((button) => button.textContent),
  ).toEqual(['ทั้งหมด', 'เบเกอรี่', 'คาเฟ่', 'ร้านอาหาร']);
  fireEvent.click(types.getByRole('button', { name: 'เบเกอรี่' }));
  expect(headings()).toEqual(['Apple Bakery']);
  fireEvent.click(types.getByRole('button', { name: 'ทั้งหมด' }));
  expect(headings()).toHaveLength(3);
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
