import { fireEvent, screen } from '@testing-library/react';
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
    business_type: 'RESTAURANT',
  },
  {
    slug: 'closed',
    name: 'ร้านพัก',
    accepting_orders: false,
    business_type: 'cafe',
  },
];

function view() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={['/shop']}>
        <Routes>
          <Route path="/shop" element={<StorefrontLayout />}>
            <Route index element={<StorefrontPage />} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
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

it('searches real shops from the results toolbar and recovers from no matches', async () => {
  view();
  expect(await screen.findByRole('heading', { name: 'yam' })).toBeVisible();
  const search = screen.getByRole('searchbox', { name: 'ค้นหาร้าน' });
  expect(search.closest('header')).toBeNull();
  const toolbar = screen.getByRole('group', { name: 'ค้นหาร้าน' });
  expect(Array.from(toolbar.children)).toEqual([
    screen.getByRole('heading', { name: 'ค้นหาร้าน' }),
    search.closest('label'),
    screen.getByRole('button', { name: 'ประเภทร้าน' }),
    screen.getByRole('group', { name: 'รูปแบบการแสดงร้าน' }),
  ]);
  fireEvent.change(search, { target: { value: ' YAM ' } });
  expect(
    screen.queryByRole('heading', { name: 'ร้านพัก' }),
  ).not.toBeInTheDocument();
  fireEvent.change(search, { target: { value: 'missing' } });
  expect(screen.getByText('ไม่พบร้านที่ตรงกับคำค้น')).toBeVisible();
  fireEvent.change(search, { target: { value: '' } });
  expect(screen.getByRole('heading', { name: 'ร้านพัก' })).toBeVisible();
});

it('switches directory views without changing shop links or availability', async () => {
  view();
  await screen.findByRole('heading', { name: 'yam' });
  const list = screen.getByRole('button', { name: 'มุมมองรายการ' });
  const grid = screen.getByRole('button', { name: 'มุมมองตาราง' });
  expect(list).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(grid);
  expect(grid).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('list', { name: 'ร้านที่เผยแพร่' })).toHaveAttribute(
    'data-view',
    'grid',
  );
  expect(
    screen.getAllByRole('link', { name: 'ดูหน้าร้าน' })[0],
  ).toHaveAttribute('href', '/shop/yam');
  expect(
    screen.getAllByRole('link', { name: 'ดูหน้าร้าน' })[1],
  ).toHaveAttribute('aria-disabled', 'true');
  fireEvent.click(list);
  expect(screen.getByRole('list', { name: 'ร้านที่เผยแพร่' })).toHaveAttribute(
    'data-view',
    'list',
  );
});

it('switches directory controls and reference copy to English', async () => {
  view();
  await screen.findByRole('heading', { name: 'yam' });
  fireEvent.click(screen.getByRole('button', { name: 'English' }));
  expect(
    screen.getByRole('searchbox', { name: 'Search stores' }),
  ).toBeVisible();
  expect(screen.getByRole('button', { name: 'List view' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Shop type' })).toHaveTextContent(
    'Shop type',
  );
  expect(
    screen.getByText('Choose a restaurant and start your order.'),
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
  expect(
    screen.queryByRole('link', { name: 'ดูหน้าร้าน' }),
  ).not.toBeInTheDocument();
});

it('recovers from directory failures without losing the search', async () => {
  fetchMock.mockRejectedValueOnce(new Error('Directory unavailable'));
  view();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Directory unavailable',
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

it('filters by saved business type alongside search without treating closed stores as a category', async () => {
  view();
  await screen.findByRole('heading', { name: 'yam' });
  const toggle = screen.getByRole('button', { name: 'ประเภทร้าน' });
  expect(toggle).toHaveTextContent('ประเภทร้าน');
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const cafe = screen.getByRole('button', { name: 'คาเฟ่' });
  fireEvent.click(cafe);
  expect(cafe).toHaveAttribute('aria-pressed', 'true');
  expect(
    screen.queryByRole('heading', { name: 'yam' }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'ร้านพัก' })).toBeVisible();
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'yam' } });
  expect(screen.getByText('ไม่พบร้านที่ตรงกับคำค้น')).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'ทั้งหมด' }));
  expect(screen.getByRole('heading', { name: 'yam' })).toBeVisible();
  fireEvent.keyDown(cafe, { key: 'Escape' });
  expect(toggle).toHaveAttribute('aria-expanded', 'false');
  expect(toggle).toHaveFocus();
  expect(cafe).not.toBeVisible();
  expect(screen.getByRole('searchbox')).toHaveValue('yam');
});

it('preserves unknown and missing types without inventing a restaurant classification', async () => {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      data: [
        ...shops,
        {
          slug: 'unknown',
          name: 'Unknown type',
          accepting_orders: true,
          business_type: 'OTHER_TYPE',
        },
        { slug: 'missing', name: 'Missing type', accepting_orders: true },
        {
          slug: 'cafe-two',
          name: 'Cafe two',
          accepting_orders: true,
          business_type: ' CAFE ',
        },
      ],
    }),
  });
  view();
  await screen.findByRole('heading', { name: 'Unknown type' });
  fireEvent.click(screen.getByRole('button', { name: 'ประเภทร้าน' }));
  fireEvent.click(screen.getByRole('button', { name: 'OTHER_TYPE' }));
  expect(screen.getByRole('heading', { name: 'Unknown type' })).toBeVisible();
  expect(
    screen.queryByRole('heading', { name: 'yam' }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'ไม่ระบุประเภท' }));
  expect(screen.getByRole('heading', { name: 'Missing type' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'คาเฟ่' }));
  expect(screen.getByRole('heading', { name: 'ร้านพัก' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Cafe two' })).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'English' }));
  expect(
    screen.getByRole('button', { name: 'Cafe' }),
  ).toHaveAttribute('aria-pressed', 'true');
  expect(
    screen.getByRole('button', { name: 'Shop type' }),
  ).toHaveAttribute('aria-expanded', 'true');
});
