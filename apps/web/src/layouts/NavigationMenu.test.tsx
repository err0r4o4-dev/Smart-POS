import { render, renderInEnglish } from '../test/render';
import { fireEvent, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { navigation, navigationGroups } from '../app/routes';
import type { Session } from '../app/access';
import { NavigationMenu } from './NavigationMenu';

beforeEach(() => {
  localStorage.clear();
});

const owner: Session = {
  authenticated: true,
  role: 'OWNER',
  permissions: [
    ...new Set(
      navigation.flatMap((item) => (item.permission ? [item.permission] : [])),
    ),
  ],
};

function renderMenu(
  path: string,
  access: Session = owner,
  onNavigate?: () => void,
) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <NavigationMenu
        items={navigation}
        groups={navigationGroups}
        homePath="/dashboard"
        access={access}
        onNavigate={onNavigate}
      />
    </MemoryRouter>,
  );
}

it('assigns every grouped operational module to exactly one group', () => {
  const groupedPaths = navigationGroups.flatMap((group) => group.paths);
  expect(new Set(groupedPaths).size).toBe(groupedPaths.length);
  expect(
    [
      ...groupedPaths.filter((path) =>
        navigation.some((item) => item.to === path),
      ),
      '/dashboard',
      '/help',
    ].sort(),
  ).toEqual(navigation.map((item) => item.to).sort());
});

it('assigns clean restaurant routes to the 3 functional zones', () => {
  const groupIds = navigationGroups.map((g) => g.id);
  expect(groupIds).toEqual(['operations', 'management', 'settings']);
  expect(navigationGroups.find((g) => g.id === 'operations')?.paths).toEqual([
    '/pos',
    '/orders',
    '/kitchen',
  ]);
  expect(navigationGroups.find((g) => g.id === 'management')?.paths).toEqual([
    '/menu',
    '/sales',
    '/receipts',
    '/refunds',
  ]);
  expect(navigationGroups.find((g) => g.id === 'settings')?.paths).toEqual([]);
});

it('renders clean divider zones without section header text or accordion buttons', () => {
  const { container } = renderMenu('/dashboard');
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.queryByText('การขายและหน้าร้าน')).not.toBeInTheDocument();
  expect(screen.queryByText('จัดการร้าน')).not.toBeInTheDocument();
  expect(screen.queryByText('ตั้งค่าระบบ')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'การตั้งค่า' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'หน้าร้านออนไลน์' }),
  ).not.toBeInTheDocument();

  const zones = container.querySelectorAll('.nav-zone');
  expect(zones).toHaveLength(3);

  const zone0Links = within(zones[0] as HTMLElement)
    .getAllByRole('link')
    .map((el) => el.textContent);
  expect(zone0Links).toEqual([
    'ภาพรวม',
    'รับออเดอร์หน้าร้าน',
    'ออเดอร์และคิว',
    'หน้าจอคิวอาหาร',
  ]);

  const zone1Links = within(zones[1] as HTMLElement)
    .getAllByRole('link')
    .map((el) => el.textContent);
  expect(zone1Links).toEqual(['เมนูอาหาร', 'ยอดขาย', 'ใบเสร็จ', 'คืนเงิน']);

  const zone2Links = within(zones[2] as HTMLElement)
    .getAllByRole('link')
    .map((el) => el.textContent);
  expect(zone2Links).toEqual(['คู่มือ']);

  expect(screen.getAllByRole('link')).toHaveLength(9);
  expect(screen.getByRole('link', { name: 'ภาพรวม' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

it.each([
  ['/sales', '/sales'],
  ['/sales/sale-42', '/sales'],
  ['/receipts', '/receipts'],
  ['/refunds', '/refunds'],
  ['/refunds/REF-01', '/refunds'],
  ['/orders', '/orders'],
  ['/orders/ord-1', '/orders'],
  ['/kitchen', '/kitchen'],
  ['/menu/categories', '/menu'],
  ['/menu/units', '/menu'],
])(
  'highlights exactly one active destination link for %s -> %s',
  (currentPath, expectedActiveHref) => {
    renderMenu(currentPath);
    const activeLinks = document.querySelectorAll('a[aria-current="page"]');
    expect(activeLinks).toHaveLength(1);
    expect(activeLinks[0]).toHaveAttribute('href', expectedActiveHref);
    expect(activeLinks[0]).toHaveClass('active');
  },
);

it('highlights the top-level menu link for a nested menu route', () => {
  renderMenu('/menu/item-1');
  expect(screen.getByRole('link', { name: 'เมนูอาหาร' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

it('filters items by permission and omits empty zones completely', () => {
  renderMenu('/dashboard', {
    authenticated: true,
    role: 'OWNER',
    permissions: ['catalog.read'],
  });

  expect(screen.getByRole('link', { name: 'ภาพรวม' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'เมนูอาหาร' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'คู่มือ' })).toBeVisible();
  expect(
    screen.queryByRole('link', { name: 'รับออเดอร์หน้าร้าน' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'การตั้งค่า' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'คืนเงิน' }),
  ).not.toBeInTheDocument();
});

it('does not show owner navigation to legacy staff', () => {
  renderMenu('/menu', {
    authenticated: true,
    role: 'INVENTORY_STAFF',
    permissions: ['catalog.read'],
  });
  expect(
    screen.queryByRole('link', { name: 'เมนูอาหาร' }),
  ).not.toBeInTheDocument();
});

it('invokes onNavigate callback when a navigation link is clicked', () => {
  const onNavigate = vi.fn();
  renderMenu('/dashboard', owner, onNavigate);

  fireEvent.click(screen.getByRole('link', { name: 'เมนูอาหาร' }));
  expect(onNavigate).toHaveBeenCalledTimes(1);
});

it('localizes menu links in English without rendering group titles in sidebar', () => {
  renderInEnglish(
    <MemoryRouter initialEntries={['/menu']}>
      <NavigationMenu
        items={navigation}
        groups={navigationGroups}
        homePath="/dashboard"
        access={owner}
      />
    </MemoryRouter>,
  );

  expect(screen.queryByText('Sales and storefront')).not.toBeInTheDocument();
  expect(screen.queryByText('Store management')).not.toBeInTheDocument();
  expect(screen.queryByText('System settings')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'Settings' }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Menu' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

it('removes preview links while retaining the real POS entry', () => {
  renderMenu('/pos');
  expect(document.querySelectorAll('a[href^="/preview/"]')).toHaveLength(0);
  expect(
    screen.getByRole('link', { name: 'รับออเดอร์หน้าร้าน' }),
  ).toHaveAttribute('href', '/pos');
});

it('does not expose removed shelf, replenishment, or purchasing navigation links', () => {
  expect(
    navigation.some(
      (item) =>
        item.to.includes('/purchasing') || item.to.includes('/suppliers'),
    ),
  ).toBe(false);
  expect(navigation.some((item) => item.to.includes('/shelves'))).toBe(false);
  expect(
    navigationGroups
      .flatMap((group) => group.paths)
      .some((path) => path.includes('/shelves')),
  ).toBe(false);
});

it('renders /help in the bottom zone and excludes /setup, /settings, and /account from management menu', () => {
  renderMenu('/dashboard');
  expect(
    screen.queryByRole('link', { name: 'ตั้งค่าร้าน' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'การตั้งค่า' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'บัญชี' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'คู่มือ' })).toBeVisible();
});
