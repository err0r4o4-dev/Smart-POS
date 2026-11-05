import { render } from '../test/render';
import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { beforeEach, expect, it } from 'vitest';
import { navigation, navigationGroups } from '../app/routes';
import type { Session } from '../app/access';
import { NavigationMenu } from './NavigationMenu';

beforeEach(() => {
  localStorage.clear();
});

const owner: Session = {
  authenticated: true,
  role: 'OWNER',
  permissions: navigation.flatMap((item) =>
    item.permission ? [item.permission] : [],
  ),
};

function renderMenu(path: string, access: Session = owner) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <NavigationMenu
        items={navigation}
        groups={navigationGroups}
        homePath="/manage/dashboard"
        access={access}
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
      '/manage/help',
    ].sort(),
  ).toEqual(navigation.map((item) => item.to).sort());
});

it('expands all menu groups by default when no saved state exists', () => {
  renderMenu('/manage/dashboard');
  const buttons = screen.getAllByRole('button');
  expect(buttons).toHaveLength(5);
  for (const button of buttons) {
    expect(button).toHaveAttribute('aria-expanded', 'true');
  }
  expect(screen.getAllByRole('link')).toHaveLength(navigation.length);
  expect(screen.getByRole('link', { name: 'ภาพรวม' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(screen.getByRole('link', { name: 'เมนูอาหาร' })).toBeVisible();
});

it('toggles groups independently and remembers collapsed/expanded state across refresh', () => {
  const firstRender = renderMenu('/manage/dashboard');
  fireEvent.click(screen.getByRole('button', { name: 'การขายและคิว' }));
  fireEvent.click(screen.getByRole('button', { name: 'ตั้งค่าร้าน' }));
  expect(
    screen.queryByRole('link', { name: 'รับออเดอร์หน้าร้าน' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: 'ข้อมูลองค์กร' }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'สูตรอาหาร' })).toBeVisible();

  firstRender.unmount();

  const refreshed = renderMenu('/manage/dashboard');
  expect(screen.getByRole('button', { name: 'การขายและคิว' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  expect(screen.getByRole('button', { name: 'ตั้งค่าร้าน' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
  expect(
    screen.getByRole('button', { name: 'เมนูและสูตรอาหาร' }),
  ).toHaveAttribute('aria-expanded', 'true');

  fireEvent.click(screen.getByRole('button', { name: 'การขายและคิว' }));
  refreshed.unmount();

  renderMenu('/manage/dashboard');
  expect(screen.getByRole('button', { name: 'การขายและคิว' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  expect(screen.getByRole('button', { name: 'ตั้งค่าร้าน' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

it('preserves a manually collapsed active group across refresh on the same route', () => {
  const firstRender = renderMenu('/manage/pos');
  fireEvent.click(screen.getByRole('button', { name: 'การขายและคิว' }));
  expect(screen.getByRole('button', { name: 'การขายและคิว' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );

  firstRender.unmount();

  renderMenu('/manage/pos');
  expect(screen.getByRole('button', { name: 'การขายและคิว' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
});

it.each(['/manage/sales', '/manage/receipts', '/manage/sales/refunds'])(
  'auto-expands a collapsed destination group on deep link %s while keeping other collapsed groups closed',
  (path) => {
    const initial = renderMenu('/manage/dashboard');
    fireEvent.click(screen.getByRole('button', { name: 'รายงาน' }));
    fireEvent.click(screen.getByRole('button', { name: 'การขายและคิว' }));
    initial.unmount();

    renderMenu(path);
    expect(screen.getByRole('button', { name: 'รายงาน' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(
      screen.getByRole('button', { name: 'การขายและคิว' }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(document.querySelectorAll('a[aria-current="page"]')).toHaveLength(1);
    expect(document.querySelector('a[aria-current="page"]')).toHaveAttribute(
      'href',
      path,
    );
  },
);

it('highlights the top-level product menu for a nested product route', () => {
  renderMenu('/manage/products/item-1');
  expect(screen.getByRole('link', { name: 'เมนูอาหาร' })).toHaveAttribute(
    'aria-current',
    'page',
  );
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

it('removes preview links while retaining the real POS entry', () => {
  renderMenu('/manage/pos');
  expect(document.querySelectorAll('a[href^="/preview/"]')).toHaveLength(0);
  expect(
    screen.getByRole('link', { name: 'รับออเดอร์หน้าร้าน' }),
  ).toHaveAttribute('href', '/manage/pos');
});

it('opens a collapsed destination group on in-app navigation while preserving other collapsed groups', () => {
  function Harness() {
    const navigate = useNavigate();
    return (
      <>
        <button onClick={() => void navigate('/manage/restaurant/quick-stock')}>
          Visit inventory
        </button>
        <NavigationMenu items={navigation} access={owner} />
      </>
    );
  }
  render(
    <MemoryRouter initialEntries={['/manage/dashboard']}>
      <Harness />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'วัตถุดิบ' }));
  fireEvent.click(screen.getByRole('button', { name: 'ตั้งค่าร้าน' }));
  expect(screen.getByRole('button', { name: 'วัตถุดิบ' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );

  fireEvent.click(screen.getByRole('button', { name: 'Visit inventory' }));
  expect(screen.getByRole('button', { name: 'วัตถุดิบ' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
  expect(screen.getByRole('button', { name: 'ตั้งค่าร้าน' })).toHaveAttribute(
    'aria-expanded',
    'false',
  );
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

it('opens the current group when permissions finish loading even if previously collapsed elsewhere', () => {
  const prior = renderMenu('/manage/dashboard');
  fireEvent.click(screen.getByRole('button', { name: 'วัตถุดิบ' }));
  prior.unmount();

  const view = render(
    <MemoryRouter initialEntries={['/manage/restaurant/quick-stock']}>
      <NavigationMenu items={navigation} access={{ authenticated: false }} />
    </MemoryRouter>,
  );
  view.rerender(
    <MemoryRouter initialEntries={['/manage/restaurant/quick-stock']}>
      <NavigationMenu items={navigation} access={owner} />
    </MemoryRouter>,
  );
  expect(screen.getByRole('button', { name: 'วัตถุดิบ' })).toHaveAttribute(
    'aria-expanded',
    'true',
  );
});

it('renders /help outside groups and excludes /setup and /account from management menu', () => {
  renderMenu('/manage/dashboard');
  expect(
    screen.queryByRole('link', { name: 'ตั้งค่าร้าน' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'บัญชี' })).not.toBeInTheDocument();

  // Collapse all groups
  const buttons = screen.getAllByRole('button');
  for (const button of buttons) {
    fireEvent.click(button);
  }
  // Help remains visible because it is outside groups
  expect(screen.getByRole('link', { name: 'คู่มือ' })).toBeVisible();
});

