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
        homePath="/manage/dashboard"
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
      '/manage/dashboard',
      '/help',
    ].sort(),
  ).toEqual(navigation.map((item) => item.to).sort());
});

it('assigns restaurant management routes to the 3 new functional sections', () => {
  const groupIds = navigationGroups.map((g) => g.id);
  expect(groupIds).toEqual(['operations', 'management', 'settings']);
  expect(navigationGroups.find((g) => g.id === 'operations')?.paths).toEqual([
    '/manage/pos',
    '/manage/online-orders',
    '/manage/restaurant/queue',
  ]);
  expect(navigationGroups.find((g) => g.id === 'management')?.paths).toEqual([
    '/manage/products',
    '/manage/sales',
    '/manage/receipts',
    '/manage/sales/refunds',
  ]);
  expect(navigationGroups.find((g) => g.id === 'settings')?.paths).toEqual([
    '/manage/settings',
    '/manage/settings/storefront',
  ]);
});

it('renders all grouped links directly under accessible section headers without accordion buttons', () => {
  renderMenu('/manage/dashboard');
  expect(screen.queryByRole('button')).toBeNull();

  const operationsGroup = screen.getByRole('group', {
    name: 'การขายและหน้าร้าน',
  });
  expect(
    within(operationsGroup).getByRole('link', { name: 'รับออเดอร์หน้าร้าน' }),
  ).toBeVisible();
  expect(
    within(operationsGroup).getByRole('link', { name: 'ออเดอร์และคิว' }),
  ).toBeVisible();
  expect(
    within(operationsGroup).getByRole('link', { name: 'หน้าจอคิวอาหาร' }),
  ).toBeVisible();

  const managementGroup = screen.getByRole('group', { name: 'จัดการร้าน' });
  expect(
    within(managementGroup).getByRole('link', { name: 'เมนูอาหาร' }),
  ).toBeVisible();
  expect(
    within(managementGroup).getByRole('link', { name: 'ยอดขาย' }),
  ).toBeVisible();
  expect(
    within(managementGroup).getByRole('link', { name: 'ใบเสร็จ' }),
  ).toBeVisible();
  expect(
    within(managementGroup).getByRole('link', { name: 'คืนเงิน' }),
  ).toBeVisible();

  const settingsGroup = screen.getByRole('group', { name: 'ตั้งค่าระบบ' });
  expect(
    within(settingsGroup).getByRole('link', { name: 'การตั้งค่า' }),
  ).toBeVisible();
  expect(
    within(settingsGroup).getByRole('link', { name: 'หน้าร้านออนไลน์' }),
  ).toBeVisible();

  expect(screen.getAllByRole('link')).toHaveLength(navigation.length);
  expect(screen.getByRole('link', { name: 'ภาพรวม' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(screen.getByRole('link', { name: 'คู่มือ' })).toBeVisible();
});

it.each([
  ['/manage/sales', '/manage/sales'],
  ['/manage/sales/sale-42', '/manage/sales'],
  ['/manage/receipts', '/manage/receipts'],
  ['/manage/sales/refunds', '/manage/sales/refunds'],
  ['/manage/sales/refunds/REF-01', '/manage/sales/refunds'],
  ['/manage/settings', '/manage/settings'],
  ['/manage/settings/storefront', '/manage/settings/storefront'],
  ['/manage/settings/storefront/payments', '/manage/settings/storefront'],
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

it('highlights the top-level product menu for a nested product route', () => {
  renderMenu('/manage/products/item-1');
  expect(screen.getByRole('link', { name: 'เมนูอาหาร' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

it('filters items by permission and omits empty sections completely', () => {
  renderMenu('/manage/dashboard', {
    authenticated: true,
    role: 'OWNER',
    permissions: ['catalog.read'],
  });

  expect(screen.getByRole('link', { name: 'ภาพรวม' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'เมนูอาหาร' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'คู่มือ' })).toBeVisible();
  expect(
    screen.queryByRole('group', { name: 'การขายและหน้าร้าน' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('group', { name: 'ตั้งค่าระบบ' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'หน้าร้านออนไลน์' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'คืนเงิน' }),
  ).not.toBeInTheDocument();
});

it('does not show owner navigation to legacy staff', () => {
  renderMenu('/manage/products', {
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
  renderMenu('/manage/dashboard', owner, onNavigate);

  fireEvent.click(screen.getByRole('link', { name: 'หน้าร้านออนไลน์' }));
  expect(onNavigate).toHaveBeenCalledTimes(1);
});

it('localizes section headers and storefront link in English', () => {
  renderInEnglish(
    <MemoryRouter initialEntries={['/manage/settings/storefront']}>
      <NavigationMenu
        items={navigation}
        groups={navigationGroups}
        homePath="/manage/dashboard"
        access={owner}
      />
    </MemoryRouter>,
  );

  expect(
    screen.getByRole('group', { name: 'Sales and storefront' }),
  ).toBeVisible();
  expect(screen.getByRole('group', { name: 'Store management' })).toBeVisible();
  expect(screen.getByRole('group', { name: 'System settings' })).toBeVisible();
  expect(
    screen.getByRole('link', { name: 'Online storefront' }),
  ).toHaveAttribute('aria-current', 'page');
});

it('removes preview links while retaining the real POS entry', () => {
  renderMenu('/manage/pos');
  expect(document.querySelectorAll('a[href^="/preview/"]')).toHaveLength(0);
  expect(
    screen.getByRole('link', { name: 'รับออเดอร์หน้าร้าน' }),
  ).toHaveAttribute('href', '/manage/pos');
});

it('does not expose removed shelf, replenishment, or purchasing navigation links in management or staff menus', () => {
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

it('renders /help outside operational groups and excludes /setup and /account from management menu', () => {
  renderMenu('/manage/dashboard');
  expect(
    screen.queryByRole('link', { name: 'ตั้งค่าร้าน' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'บัญชี' })).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'คู่มือ' })).toBeVisible();
});
