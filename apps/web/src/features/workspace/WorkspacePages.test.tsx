import { render } from '../../test/render';
import type { ReactNode } from 'react';
import { screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { navigation } from '../../app/routes';
import { managementRoles, workspaceHome, type Role } from '../../app/access';
import type { OrganizationContext } from '../../lib/organization-api';
import { RequireSession } from '../../app/ProtectedRoute';
import { OrganizationGate } from '../organization/OrganizationGate';
import { LegacyWorkspaceRedirect, WorkspaceAreaGate } from './WorkspaceRouting';
import { RoleWorkspaceLayout } from '../../layouts/RoleWorkspaceLayout';
import { ManagementHomePage, WorkspaceEntryPage } from './WorkspacePages';

const mocks = vi.hoisted(() => ({
  context: null as OrganizationContext | null,
  status: 'authenticated',
  loading: false,
  error: '',
  refresh: vi.fn(),
}));
vi.mock('../../app/AuthProvider', () => ({
  useAuth: () => ({
    state: {
      status: mocks.status,
      session:
        mocks.status === 'authenticated'
          ? { user: { id: 'user', display_name: 'Test user' } }
          : null,
    },
    refresh: mocks.refresh,
  }),
}));
vi.mock('../../app/OrganizationProvider', () => ({
  OrganizationProvider: ({ children }: { children: ReactNode }) => children,
  useOrganization: () => ({
    context: mocks.context,
    organizations: mocks.context ? [mocks.context.organization] : [],
    branchID: 'branch',
    loading: mocks.loading,
    error: mocks.error,
    refresh: mocks.refresh,
    select: vi.fn(),
    can: (permission: string) =>
      mocks.context?.permissions.includes(permission) ?? false,
  }),
}));

function selectRole(role: Role, permissions: string[]) {
  mocks.context = {
    organization: {
      id: 'shop',
      name: 'Test shop',
      code: 'TEST',
      business_type: 'retail',
      contact_email: '',
      contact_phone: '',
      address: '',
      currency: 'THB',
      status: 'ACTIVE',
    },
    membership: {
      id: 'membership',
      user_id: 'user',
      email: 'user@example.test',
      display_name: 'Test user',
      role,
      status: 'ACTIVE',
      branch_ids: ['branch'],
      permissions,
    },
    branches: [
      {
        id: 'branch',
        organization_id: 'shop',
        name: 'Main branch',
        code: 'MAIN',
        address: '',
        phone: '',
        email: '',
        status: 'ACTIVE',
        is_main: true,
      },
    ],
    permissions,
  };
}
function LocationProbe() {
  const location = useLocation();
  return (
    <div aria-label="Location">
      {location.pathname + location.search + location.hash}
    </div>
  );
}
function Harness({ path }: { path: string }) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<WorkspaceAreaGate />}>
          <Route element={<RoleWorkspaceLayout />}>
            <Route element={<RequireSession />}>
              <Route path="/workspace" element={<WorkspaceEntryPage />} />
              <Route
                path="/dashboard"
                element={<LegacyWorkspaceRedirect path="/dashboard" />}
              />
              <Route
                path="/staff"
                element={<LegacyWorkspaceRedirect path="/staff" />}
              />
              <Route path="/account" element={<h1>Account</h1>} />
              <Route element={<OrganizationGate />}>
                <Route
                  path="/manage/dashboard"
                  element={<ManagementHomePage />}
                />
              </Route>
              <Route element={<OrganizationGate permission="pos.access" />}>
                <Route path="/manage/pos" element={<h1>POS</h1>} />
                <Route
                  path="/pos"
                  element={<LegacyWorkspaceRedirect path="/pos" />}
                />
              </Route>
              <Route element={<OrganizationGate permission="catalog.read" />}>
                <Route
                  path="/products/:id"
                  element={<LegacyWorkspaceRedirect path="/products/:id" />}
                />
                <Route
                  path="/work/products/:id"
                  element={<h1>Product details</h1>}
                />
                <Route
                  path="/manage/products/:id"
                  element={<h1>Product details</h1>}
                />
              </Route>
              <Route element={<OrganizationGate roles={managementRoles} />}>
                <Route
                  path="/manage/settings/store"
                  element={<h1>Private store settings</h1>}
                />
              </Route>
            </Route>
          </Route>
        </Route>
        <Route path="/403" element={<h1>Forbidden</h1>} />
        <Route path="/login" element={<h1>Sign in</h1>} />
      </Routes>
      <LocationProbe />
    </MemoryRouter>
  );
}
function renderWorkspace(path = '/workspace') {
  return render(<Harness path={path} />);
}
const allPermissions = [
  ...new Set(
    navigation.flatMap((item) => (item.permission ? [item.permission] : [])),
  ),
];

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
  });
  mocks.status = 'authenticated';
  mocks.loading = false;
  mocks.error = '';
  mocks.context = null;
  localStorage.clear();
  vi.clearAllMocks();
});

it.each<Role>(['OWNER'])(
  'renders restaurant tasks for %s without fabricated retail metrics or retired links',
  (role) => {
    selectRole(role, allPermissions);
    expect(workspaceHome(role)).toBe('/manage/dashboard');
    renderWorkspace();
    expect(screen.getByRole('heading', { name: 'ภาพรวม' })).toBeVisible();
    expect(
      document.querySelector('[data-workspace="management"]'),
    ).toBeInTheDocument();
    const main = within(screen.getByRole('main'));
    expect(main.getByRole('link', { name: 'ออเดอร์และคิว' })).toHaveAttribute(
      'href',
      '/manage/online-orders',
    );
    expect(main.getByRole('link', { name: 'สูตรอาหาร' })).toHaveAttribute(
      'href',
      '/manage/restaurant/recipes',
    );
    expect(
      main.getByRole('link', { name: 'เพิ่ม / ตรวจนับวัตถุดิบ' }),
    ).toBeVisible();
    expect(screen.getByPlaceholderText('ค้นหาเมนูหรือสินค้า…')).toBeVisible();
    expect(screen.getByRole('button', { name: 'การแจ้งเตือน' })).toBeVisible();
    expect(screen.queryByText('SAL-28a6e1f3')).not.toBeInTheDocument();
    expect(screen.queryByText('น้ำดื่ม VELO')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: 'แนวโน้มยอดขาย' }),
    ).not.toBeInTheDocument();
    for (const path of [
      '/purchasing/orders',
      '/purchasing/receipts',
      '/customers',
      '/inventory/balances',
    ]) {
      expect(
        document.querySelector(`a[href="/manage${path}"]`),
      ).not.toBeInTheDocument();
    }
  },
);

it.each<Role>(['MANAGER', 'CASHIER', 'INVENTORY_STAFF', 'PURCHASING_STAFF'])(
  'keeps %s in account and denies management despite broad permissions',
  (role) => {
    selectRole(role, allPermissions);
    renderWorkspace();
    expect(screen.getByRole('heading', { name: 'Account' })).toBeVisible();
    expect(
      document.querySelector('[data-workspace="management"]'),
    ).not.toBeInTheDocument();
  },
);

it.each<Role>(['MANAGER', 'CASHIER', 'INVENTORY_STAFF', 'PURCHASING_STAFF'])(
  'denies management settings on a direct link for %s',
  (role) => {
    selectRole(role, allPermissions);
    renderWorkspace('/manage/settings/store');
    expect(screen.getByRole('heading', { name: 'Forbidden' })).toBeVisible();
    expect(
      screen.queryByText('Private store settings'),
    ).not.toBeInTheDocument();
  },
);

it('leaves a signed-in user without membership in neutral account onboarding', () => {
  renderWorkspace();
  expect(screen.getByRole('heading', { name: 'Account' })).toBeVisible();
  expect(
    document.querySelector('[data-workspace="account"]'),
  ).toBeInTheDocument();
  expect(
    document.querySelector('a[href="/manage/employees"]'),
  ).not.toBeInTheDocument();
});

it('does not render privileged menus while role context loads', () => {
  selectRole('OWNER', allPermissions);
  mocks.loading = true;
  renderWorkspace();
  expect(screen.getByRole('status')).toHaveTextContent(
    'กำลังเลือกพื้นที่ตามสิทธิ์',
  );
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
});

it('shows a context failure instead of pretending a role is available', () => {
  mocks.error = 'Context unavailable';
  renderWorkspace();
  expect(screen.getByRole('alert')).toHaveTextContent('Context unavailable');
  expect(
    document.querySelector('[data-workspace="management"]'),
  ).not.toBeInTheDocument();
});

it('denies access when owner membership changes to cashier', () => {
  selectRole('OWNER', allPermissions);
  const view = renderWorkspace('/manage/dashboard');
  expect(screen.getByRole('heading', { name: 'ภาพรวม' })).toBeVisible();
  selectRole('CASHIER', allPermissions);
  view.rerender(<Harness path="/manage/dashboard" />);
  expect(screen.getByRole('heading', { name: 'Forbidden' })).toBeVisible();
});

it('redirects an owner legacy product path with query and hash', () => {
  selectRole('OWNER', ['catalog.read']);
  renderWorkspace('/products/item-1?search=abc#details');
  expect(screen.getByLabelText('Location')).toHaveTextContent(
    '/manage/products/item-1?search=abc#details',
  );
});

it.each<Role>(['MANAGER', 'CASHIER', 'INVENTORY_STAFF', 'PURCHASING_STAFF'])(
  'denies %s legacy product paths even with permission',
  (role) => {
    selectRole(role, allPermissions);
    renderWorkspace('/products/item-1');
    expect(screen.getByRole('heading', { name: 'Forbidden' })).toBeVisible();
  },
);

it('denies management product paths to a cashier even with catalog permission', () => {
  selectRole('CASHIER', allPermissions);
  renderWorkspace('/manage/products/item-1');
  expect(screen.getByRole('heading', { name: 'Forbidden' })).toBeVisible();
  expect(
    screen.queryByRole('heading', { name: 'Product details' }),
  ).not.toBeInTheDocument();
});

it('keeps operational permission checks authoritative in management', () => {
  selectRole('OWNER', []);
  renderWorkspace('/manage/products/item-1');
  expect(screen.getByRole('heading', { name: 'Forbidden' })).toBeVisible();
});

it('filters restaurant dashboard shortcuts by permission without fabricating reports', () => {
  selectRole('OWNER', ['catalog.read']);
  renderWorkspace('/manage/dashboard');
  const main = within(screen.getByRole('main'));
  expect(main.getByRole('link', { name: 'เมนูอาหาร' })).toBeVisible();
  expect(main.getByRole('link', { name: 'สูตรอาหาร' })).toBeVisible();
  expect(
    main.queryByRole('link', { name: 'ออเดอร์และคิว' }),
  ).not.toBeInTheDocument();
  expect(
    main.queryByRole('link', { name: 'เพิ่ม / ตรวจนับวัตถุดิบ' }),
  ).not.toBeInTheDocument();
  expect(
    main.queryByRole('combobox', { name: 'เลือกช่วงเวลา' }),
  ).not.toBeInTheDocument();
});

it.each([
  '/manage/dashboard',
  '/manage/products/item-1',
  '/manage/settings/store',
  '/work',
  '/work/products/item-1',
  '/account',
])('does not render the tenant-switchers bar on %s', (path) => {
  selectRole('OWNER', allPermissions);
  renderWorkspace(path);
  expect(document.querySelector('.tenant-switchers')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('combobox', { name: 'องค์กรที่ใช้งาน' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('combobox', { name: 'สาขาที่ใช้งาน' }),
  ).not.toBeInTheDocument();
});

it('allows an owner with POS permission to access POS', () => {
  selectRole('OWNER', ['pos.access']);
  renderWorkspace('/manage/pos');
  expect(screen.getByRole('heading', { name: 'POS' })).toBeVisible();
});

it.each<Role>(['MANAGER', 'CASHIER', 'INVENTORY_STAFF', 'PURCHASING_STAFF'])(
  'denies %s direct and unprefixed POS access',
  (role) => {
    selectRole(role, ['pos.access']);
    const view = renderWorkspace('/manage/pos');
    expect(screen.getByRole('heading', { name: 'Forbidden' })).toBeVisible();
    view.unmount();
    renderWorkspace('/pos');
    expect(screen.getByRole('heading', { name: 'Forbidden' })).toBeVisible();
  },
);
