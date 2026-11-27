import { fireEvent, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { render } from '../../test/render';
import { CustomerHeader } from './CustomerHeader';

const mocks = vi.hoisted(() => ({ status: 'anonymous' }));
vi.mock('../../app/AuthProvider', () => ({
  useOptionalAuth: () =>
    mocks.status === 'none' ? null : { state: { status: mocks.status } },
}));

function header(
  props: Partial<Parameters<typeof CustomerHeader>[0]> = {},
  entry = '/shop',
) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <CustomerHeader tableQuery="" cartCount={0} {...props} />
    </MemoryRouter>,
  );
}

function desktopNavigation() {
  return screen.getAllByRole('navigation', { name: 'เมนูหน้าร้านลูกค้า' })[0];
}

beforeEach(() => {
  mocks.status = 'anonymous';
});

it('offers a route back home without duplicating discovery or merchant actions', () => {
  header();
  const nav = within(desktopNavigation());
  expect(nav.getByRole('link', { name: 'กลับหน้าแรก' })).toHaveAttribute(
    'href',
    '/',
  );
  expect(nav.getByRole('button', { name: 'English' })).toBeVisible();
  expect(nav.getAllByRole('link')).toHaveLength(1);
});

it.each(['anonymous', 'authenticated', 'loading', 'none'])(
  'omits merchant account actions in the %s session state',
  (status) => {
    mocks.status = status;
    header();
    const nav = within(desktopNavigation());
    expect(
      nav.queryByRole('link', { name: /เข้าสู่ระบบ|เข้าพื้นที่ทำงาน/ }),
    ).toBeNull();
    expect(nav.queryByRole('button', { name: 'กำลังตรวจสอบ…' })).toBeNull();
  },
);

it('shows a cart only inside a store and keeps the dine-in table link', () => {
  const { unmount } = header();
  expect(screen.queryByRole('link', { name: /ตะกร้า/ })).toBeNull();
  unmount();

  header({ slug: 'noodle', tableQuery: '?table=T1', cartCount: 2 });
  expect(screen.getByRole('link', { name: 'ตะกร้า (2)' })).toHaveAttribute(
    'href',
    '/shop/noodle/cart?table=T1',
  );
  expect(screen.getByRole('link', { name: 'หน้าร้านออนไลน์' })).toHaveAttribute(
    'href',
    '/shop/noodle?table=T1',
  );
});

it('exposes a labelled mobile menu disclosure', () => {
  header();
  const summary = screen.getByRole('button', { name: 'เมนู' });
  expect(summary).toHaveAttribute('aria-expanded', 'false');
  const details = summary.closest('details')!;
  details.open = true;
  fireEvent(details, new Event('toggle'));
  expect(summary).toHaveAttribute('aria-expanded', 'true');
});
