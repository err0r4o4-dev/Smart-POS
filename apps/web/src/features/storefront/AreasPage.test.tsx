import { fireEvent, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render } from '../../test/render';
import { AreaDetailPage, AreasPage } from './AreasPage';

const fetchMock = vi.fn();
const shops = [
  { slug: 'yam', name: 'Yam House', accepting_orders: true },
  { slug: 'tea', name: 'ร้านชา', accepting_orders: false },
];

function view(entry: string) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/areas" element={<AreasPage />} />
          <Route path="/areas/:areaId" element={<AreaDetailPage />} />
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

it('lists the four areas as photo cards linking to their detail pages', () => {
  view('/areas');
  expect(
    screen.getByRole('heading', { level: 1, name: 'พื้นที่และชุมชน' }),
  ).toBeVisible();
  const list = within(screen.getByRole('list', { name: 'พื้นที่และชุมชน' }));
  const links = list.getAllByRole('link');
  expect(links.map((link) => link.getAttribute('href'))).toEqual([
    '/areas/campus',
    '/areas/market',
    '/areas/dorm',
    '/areas/community',
  ]);
  expect(list.getByRole('link', { name: /มศว องครักษ์/ })).toBeVisible();
  expect(links[0].querySelector('img')).toHaveAttribute(
    'src',
    '/images/customer/area-campus.webp',
  );
  expect(links[0].querySelector('img')).toHaveAttribute('alt', '');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('filters areas locally by name or description', () => {
  view('/areas');
  const search = screen.getByRole('searchbox', {
    name: 'ค้นหาพื้นที่หรือชุมชน',
  });
  fireEvent.change(search, { target: { value: 'ตลาด' } });
  expect(screen.getAllByRole('link', { name: /ตลาด/ })).toHaveLength(1);
  expect(
    screen.queryByRole('link', { name: /มศว องครักษ์/ }),
  ).not.toBeInTheDocument();
  fireEvent.change(search, { target: { value: 'zzz' } });
  expect(screen.getByText('ไม่พบพื้นที่ที่ตรงกับคำค้น')).toBeVisible();
});

it('shows an area hero, an honest matching note and all published stores', async () => {
  view('/areas/campus');
  expect(
    screen.getByRole('heading', { level: 1, name: 'มศว องครักษ์' }),
  ).toBeVisible();
  expect(
    screen.getByRole('link', { name: 'กลับไปหน้าพื้นที่' }),
  ).toHaveAttribute('href', '/areas');
  expect(
    screen.getByText(
      'ยังไม่สามารถจับคู่ร้านกับพื้นที่ได้ จึงแสดงร้านที่เปิดเผยแพร่ทั้งหมด',
    ),
  ).toBeVisible();
  expect(
    await screen.findByRole('heading', { name: 'Yam House' }),
  ).toBeVisible();
  expect(screen.getByRole('heading', { name: 'ร้านชา' })).toBeVisible();
  expect(screen.getByText('แสดง 2 ร้าน')).toBeVisible();
  expect(screen.queryByText(/ร้านในพื้นที่/)).toBeNull();
});

it.each(['/areas/unknown', '/areas/%3Cscript%3Ealert(1)%3C%2Fscript%3E'])(
  'treats %s as a missing area without echoing it',
  (path) => {
    view(path);
    expect(
      screen.getByRole('heading', { level: 1, name: 'ไม่พบพื้นที่นี้' }),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'กลับไปหน้าพื้นที่' }),
    ).toHaveAttribute('href', '/areas');
    expect(document.body.textContent).not.toContain('script');
    expect(document.querySelector('script')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  },
);
