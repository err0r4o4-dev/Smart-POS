import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { router } from './router';
import { navigation } from './routes';

const mocks = vi.hoisted(() => ({
  auth: { status: 'anonymous', session: null },
  tenant: {
    loading: false,
    error: '',
    context: null,
    organizations: [],
    branchID: '',
    can: (permission: string) => permission === 'catalog.read',
  },
}));
vi.mock('./AuthProvider', () => ({ useAuth: () => ({ state: mocks.auth }) }));
vi.mock('./OrganizationProvider', () => ({
  useOrganization: () => mocks.tenant,
}));

beforeEach(() => {
  HTMLDialogElement.prototype.close = vi.fn();
  HTMLDialogElement.prototype.showModal = vi.fn();
  Object.assign(mocks.auth, { status: 'anonymous', session: null });
  Object.assign(mocks.tenant, { loading: false, error: '', context: null });
});

function visit(path: string) {
  const memory = createMemoryRouter(router.routes, { initialEntries: [path] });
  render(<RouterProvider router={memory} />);
  return memory;
}

it.each(['/', '/dashboard', '/setup', '/products?search=coffee'])(
  '%s requires a real session',
  async (path) => {
    const memory = visit(path);
    expect(
      await screen.findByRole('heading', { name: 'Welcome back.' }),
    ).toBeVisible();
    expect(memory.state.location.pathname).toBe('/login');
    expect(
      new URLSearchParams(memory.state.location.search).get('returnTo'),
    ).toBe(path === '/' ? '/dashboard' : path);
  },
);

it('sends a signed-in account without an organization to setup', async () => {
  Object.assign(mocks.auth, {
    status: 'authenticated',
    session: { user: { id: 'test', display_name: 'Test' } },
  });
  visit('/dashboard');
  expect(
    await screen.findByRole('heading', { name: 'ตั้งค่าร้าน' }),
  ).toBeVisible();
});

it('waits for tenant context instead of redirecting prematurely', async () => {
  Object.assign(mocks.auth, {
    status: 'authenticated',
    session: { user: { id: 'test', display_name: 'Test' } },
  });
  mocks.tenant.loading = true;
  visit('/dashboard');
  expect(await screen.findByRole('status')).toHaveTextContent(
    'กำลังตรวจสอบสิทธิ์องค์กร',
  );
  expect(
    screen.queryByRole('heading', { name: 'ตั้งค่าร้าน' }),
  ).not.toBeInTheDocument();
});

it('keeps operational navigation separate from development previews', () => {
  expect(navigation.find((item) => item.to === '/dashboard')).toBeDefined();
  expect(navigation.some((item) => item.to.startsWith('/preview/'))).toBe(
    false,
  );
});

it('shows real tenant context and only permission-allowed operational links', async () => {
  Object.assign(mocks.auth, {
    status: 'authenticated',
    session: { user: { id: 'test', display_name: 'Test' } },
  });
  Object.assign(mocks.tenant, {
    branchID: 'main',
    context: {
      organization: { id: 'shop', name: 'Test store' },
      branches: [{ id: 'main', name: 'Main branch' }],
      membership: { role: 'INVENTORY_STAFF' },
      permissions: ['catalog.read'],
    },
  });
  visit('/dashboard');
  expect(
    await screen.findByRole('heading', { name: 'พื้นที่ปฏิบัติงาน' }),
  ).toBeVisible();
  expect(screen.getByText('Test store · Main branch')).toBeVisible();
  expect(
    screen
      .getByRole('region', { name: 'Operational modules' })
      .querySelector('a')
      ?.getAttribute('href'),
  ).toBe('/products');
  expect(
    screen.queryByRole('link', { name: 'ขายสินค้า / POS' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText('A smarter start.')).not.toBeInTheDocument();
});
