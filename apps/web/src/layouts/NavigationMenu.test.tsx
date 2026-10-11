import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { expect, it } from 'vitest';
import { navigation, navigationGroups } from '../app/routes';
import type { Session } from '../app/access';
import { NavigationMenu } from './NavigationMenu';

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
      <NavigationMenu items={navigation} access={access} />
    </MemoryRouter>,
  );
}

it('assigns every operational module to exactly one group', () => {
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

it('keeps foundation links outside seven initially collapsed groups', () => {
  renderMenu('/dashboard');
  expect(screen.getAllByRole('button')).toHaveLength(7);
  for (const button of screen.getAllByRole('button'))
    expect(button).toHaveAttribute('aria-expanded', 'false');
  expect(screen.getAllByRole('link')).toHaveLength(2);
  expect(screen.getByRole('link', { name: 'Overview' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});

it('expands multiple groups independently and hides collapsed links', () => {
  renderMenu('/dashboard');
  const sales = screen.getByRole('button', { name: 'การขาย' });
  const customers = screen.getByRole('button', { name: 'ลูกค้าและสมาชิก' });
  fireEvent.click(sales);
  fireEvent.click(customers);
  expect(screen.getByRole('link', { name: 'ขายสินค้า / POS' })).toBeVisible();
  expect(
    screen.getByRole('link', { name: 'ลูกค้า / Customers' }),
  ).toBeVisible();
  fireEvent.click(sales);
  expect(
    screen.queryByRole('link', { name: 'ขายสินค้า / POS' }),
  ).not.toBeInTheDocument();
  expect(customers).toHaveAttribute('aria-expanded', 'true');
});

it.each(['/pos/returns', '/sales/voids', '/sales/refunds'])(
  'opens only the correct group for %s',
  (path) => {
    renderMenu(path);
    expect(
      screen.getByRole('button', { name: 'คืนสินค้าและคืนเงิน' }),
    ).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'การขาย' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(document.querySelectorAll('a[aria-current="page"]')).toHaveLength(1);
    expect(document.querySelector('a[aria-current="page"]')).toHaveAttribute(
      'href',
      path,
    );
  },
);

it('opens the correct group for a nested route', () => {
  renderMenu('/products/item-1');
  expect(
    screen.getByRole('button', { name: 'สินค้าและสต็อก' }),
  ).toHaveAttribute('aria-expanded', 'true');
  expect(
    screen.getByRole('link', { name: 'สินค้า / แค็ตตาล็อก' }),
  ).toHaveAttribute('aria-current', 'page');
});

it('filters permissions before showing groups', () => {
  renderMenu('/products', {
    authenticated: true,
    role: 'INVENTORY_STAFF',
    permissions: ['catalog.read'],
  });
  expect(
    screen.queryByRole('button', { name: 'การขาย' }),
  ).not.toBeInTheDocument();
  expect(screen.getAllByRole('button')).toHaveLength(2);
  expect(
    screen.getByRole('link', { name: 'สินค้า / แค็ตตาล็อก' }),
  ).toBeVisible();
  expect(
    screen.queryByRole('link', { name: 'คลังสินค้า / สต็อก', hidden: true }),
  ).not.toBeInTheDocument();
});

it('removes preview links while retaining the real POS entry', () => {
  renderMenu('/pos');
  expect(document.querySelectorAll('a[href^="/preview/"]')).toHaveLength(0);
  expect(screen.getByRole('link', { name: 'ขายสินค้า / POS' })).toHaveAttribute(
    'href',
    '/pos',
  );
});

it('opens the destination group on navigation', () => {
  function Harness() {
    const navigate = useNavigate();
    return (
      <>
        <button onClick={() => navigate('/products/item-1')}>
          Visit product
        </button>
        <NavigationMenu items={navigation} access={owner} />
      </>
    );
  }
  render(
    <MemoryRouter initialEntries={['/dashboard']}>
      <Harness />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Visit product' }));
  expect(
    screen.getByRole('button', { name: 'สินค้าและสต็อก' }),
  ).toHaveAttribute('aria-expanded', 'true');
});

it('opens the current group when permissions finish loading', () => {
  const view = render(
    <MemoryRouter initialEntries={['/products']}>
      <NavigationMenu items={navigation} access={{ authenticated: false }} />
    </MemoryRouter>,
  );
  view.rerender(
    <MemoryRouter initialEntries={['/products']}>
      <NavigationMenu items={navigation} access={owner} />
    </MemoryRouter>,
  );
  expect(
    screen.getByRole('button', { name: 'สินค้าและสต็อก' }),
  ).toHaveAttribute('aria-expanded', 'true');
});
