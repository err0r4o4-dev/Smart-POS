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

it('links every customer section from the shared navigation', () => {
  header();
  const nav = within(desktopNavigation());
  expect(nav.getByRole('link', { name: 'หน้าหลัก' })).toHaveAttribute(
    'href',
    '/',
  );
  expect(nav.getByRole('link', { name: 'สำรวจร้าน' })).toHaveAttribute(
    'href',
    '/shop',
  );
  expect(nav.getByRole('link', { name: 'พื้นที่และชุมชน' })).toHaveAttribute(
    'href',
    '/areas',
  );
  expect(nav.getByRole('link', { name: 'หมวดหมู่อาหาร' })).toHaveAttribute(
    'href',
    '/#landing-categories',
  );
  expect(nav.getByRole('link', { name: 'สำหรับร้านค้า' })).toHaveAttribute(
    'href',
    '/#for-merchants',
  );
});

it('marks the current section for assistive technology', () => {
  header({}, '/areas/campus');
  const nav = within(desktopNavigation());
  expect(nav.getByRole('link', { name: 'พื้นที่และชุมชน' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(nav.getByRole('link', { name: 'สำรวจร้าน' })).not.toHaveAttribute(
    'aria-current',
  );
});

it('offers sign-in, workspace or a pending state based on the session', () => {
  const { unmount } = header();
  expect(
    within(desktopNavigation()).getByRole('link', { name: 'เข้าสู่ระบบ' }),
  ).toHaveAttribute('href', '/login');
  unmount();

  mocks.status = 'authenticated';
  const second = header();
  expect(
    within(desktopNavigation()).getByRole('link', { name: 'เข้าพื้นที่ทำงาน' }),
  ).toHaveAttribute('href', '/workspace');
  second.unmount();

  mocks.status = 'loading';
  const third = header();
  expect(
    within(desktopNavigation()).getByRole('button', { name: 'กำลังตรวจสอบ…' }),
  ).toBeDisabled();
  third.unmount();

  // Public customer pages render without an auth provider.
  mocks.status = 'none';
  header();
  expect(
    within(desktopNavigation()).getByRole('link', { name: 'เข้าสู่ระบบ' }),
  ).toHaveAttribute('href', '/login');
});

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
