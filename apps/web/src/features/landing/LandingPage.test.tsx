import { render } from '../../test/render';
import { fireEvent, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LandingPage } from './LandingPage';

const mocks = vi.hoisted(() => ({ status: 'anonymous' }));
const fetchMock = vi.fn();
const shops = [
  {
    slug: 'krapao',
    name: 'ครัวกะเพรา',
    accepting_orders: true,
    business_type: 'RESTAURANT',
  },
  {
    slug: 'tea',
    name: 'ร้านชาริมคลอง',
    accepting_orders: false,
    business_type: 'CAFE',
  },
];
vi.mock('../../app/AuthProvider', () => ({
  useAuth: () => ({ state: { status: mocks.status } }),
}));

function LocationProbe() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname + location.search}</p>;
}

function renderLanding() {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/shop" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mocks.status = 'anonymous';
  localStorage.clear();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({ data: shops }),
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

it('shows a directory rating, distinguishes zero reviews, and omits unavailable scores', async () => {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      data: [
        {
          ...shops[0],
          average_rating: 4.8,
          review_count: 126,
          delivery_enabled: true,
        },
        { ...shops[1], average_rating: null, review_count: 0 },
        { ...shops[1], name: 'ร้านไม่มีข้อมูลคะแนน', slug: 'unavailable' },
      ],
    }),
  });
  renderLanding();
  const cards = within(
    await screen.findByRole('list', { name: 'ร้านแนะนำ' }),
  ).getAllByRole('article');
  expect(within(cards[0]).getByText('4.8 / 5')).toBeVisible();
  expect(within(cards[0]).getByText('126 รีวิว')).toBeVisible();
  expect(within(cards[0]).getByText('มีจัดส่ง')).toBeVisible();
  expect(within(cards[1]).getByText('ยังไม่มีรีวิว')).toBeVisible();
  expect(within(cards[2]).queryByText(/รีวิว|\/ 5/)).not.toBeInTheDocument();
});

it('presents the mockup sections with the unchanged header destinations', () => {
  renderLanding();
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    'ค้นหาร้านอาหารในชุมชนของคุณ',
  );
  const nav = within(
    screen
      .getByRole('banner')
      .querySelector('.landing-desktop-navigation') as HTMLElement,
  );
  expect(nav.getByRole('link', { name: 'หน้าหลัก' })).toHaveAttribute(
    'href',
    '/',
  );
  expect(nav.getByRole('link', { name: 'สำรวจร้าน' })).toHaveAttribute(
    'href',
    '/shop',
  );
  expect(nav.getByRole('link', { name: 'เข้าสู่ระบบ' })).toHaveAttribute(
    'href',
    '/login',
  );
  expect(nav.getByRole('button', { name: 'English' })).toBeVisible();
  expect(
    nav.queryByRole('link', { name: 'ตะกร้าสินค้า' }),
  ).not.toBeInTheDocument();
  for (const name of [
    'สำรวจร้านตามพื้นที่',
    'เลือกตามประเภทอาหาร',
    'ร้านแนะนำ',
    'สั่งอาหารง่าย ๆ ใน 3 ขั้นตอน',
    'มีร้านอาหารเป็นของตัวเอง?',
  ])
    expect(screen.getByRole('heading', { name })).toBeVisible();
  expect(screen.getByRole('link', { name: /สมัครร้านค้าฟรี/ })).toHaveAttribute(
    'href',
    '/register',
  );
  expect(document.querySelector('#landing-main')).toHaveAttribute(
    'tabindex',
    '-1',
  );
});

it('opens published restaurants and keeps favorites after returning to the home page', async () => {
  const home = renderLanding();
  const list = await screen.findByRole('list', {
    name: 'ร้านแนะนำ',
  });
  expect(
    within(list).getByRole('link', { name: 'ครัวกะเพรา' }),
  ).toHaveAttribute('href', '/shop/krapao');
  expect(
    within(list).getByRole('link', { name: 'ร้านชาริมคลอง' }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'เปิดรับออเดอร์' }));
  expect(
    within(list).queryByRole('link', { name: 'ร้านชาริมคลอง' }),
  ).not.toBeInTheDocument();
  const favourite = screen.getByRole('button', {
    name: 'บันทึก ครัวกะเพรา เป็นร้านโปรด',
  });
  fireEvent.click(favourite);
  home.unmount();
  renderLanding();
  fireEvent.click(await screen.findByRole('button', { name: 'ร้านโปรด' }));
  expect(await screen.findByRole('link', { name: 'ครัวกะเพรา' })).toBeVisible();
  expect(
    screen.queryByRole('link', { name: 'ร้านชาริมคลอง' }),
  ).not.toBeInTheDocument();
});

it('recovers when the published restaurants request fails', async () => {
  fetchMock.mockRejectedValueOnce(new Error('Offline'));
  renderLanding();
  const retry = await screen.findByRole('button', { name: 'ลองอีกครั้ง' });
  fireEvent.click(retry);
  expect(await screen.findByRole('link', { name: 'ครัวกะเพรา' })).toBeVisible();
});

it('includes an orderable store even when it follows four closed stores', async () => {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      data: [
        ...['a', 'b', 'c', 'd'].map((slug) => ({
          ...shops[1],
          slug,
          name: `Closed ${slug}`,
        })),
        shops[0],
      ],
    }),
  });
  renderLanding();

  const list = await screen.findByRole('list', { name: 'ร้านแนะนำ' });
  expect(within(list).getAllByRole('link')).toHaveLength(4);
  expect(within(list).getByRole('link', { name: 'ครัวกะเพรา' })).toBeVisible();
});

it('sends hero searches to the shop directory', () => {
  renderLanding();
  fireEvent.change(screen.getByRole('searchbox', { name: 'ค้นหาร้านอาหาร' }), {
    target: { value: ' ข้าวมันไก่ ' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'ค้นหา' }));
  expect(screen.getByTestId('location')).toHaveTextContent(
    `/shop?q=${encodeURIComponent('ข้าวมันไก่')}`,
  );
});

it('links category and area shortcuts to directory searches', () => {
  renderLanding();
  const categories = within(
    screen.getByRole('list', { name: 'ประเภทอาหาร' }),
  ).getAllByRole('link');
  expect(categories).toHaveLength(8);
  expect(categories[1]).toHaveAttribute(
    'href',
    `/shop?q=${encodeURIComponent('ก๋วยเตี๋ยว')}`,
  );
  expect(
    within(screen.getByRole('list', { name: 'พื้นที่และชุมชน' })).getAllByRole(
      'link',
    ),
  ).toHaveLength(4);
});

it('provides the mockup footer columns and a language selector', () => {
  renderLanding();
  const footer = within(screen.getByRole('contentinfo'));
  for (const name of [
    'เกี่ยวกับ VELOPOS',
    'เมนูหลัก',
    'สำหรับร้านค้า',
    'ช่วยเหลือ',
    'ข้อกำหนด',
    'ติดต่อเรา',
  ])
    expect(footer.getByRole('heading', { name })).toBeVisible();
  expect(footer.getByRole('link', { name: 'สมัครร้านค้า' })).toHaveAttribute(
    'href',
    '/register',
  );
  const language = footer.getByRole('combobox', { name: 'ภาษา' });
  fireEvent.change(language, { target: { value: 'en' } });
  expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
    'Find restaurants in your community',
  );
});

it('offers the workspace to signed-in users instead of sign-in', () => {
  mocks.status = 'authenticated';
  renderLanding();
  for (const link of screen.getAllByRole('link', { name: 'เข้าพื้นที่ทำงาน' }))
    expect(link).toHaveAttribute('href', '/workspace');
  expect(
    screen.queryByRole('link', { name: 'เข้าสู่ระบบ' }),
  ).not.toBeInTheDocument();
});

it('keeps session actions disabled while checking authentication', () => {
  mocks.status = 'loading';
  renderLanding();
  const pending = screen.getAllByRole('button', { name: 'กำลังตรวจสอบ…' });
  expect(pending.length).toBeGreaterThan(0);
  for (const action of pending) expect(action).toBeDisabled();
});
