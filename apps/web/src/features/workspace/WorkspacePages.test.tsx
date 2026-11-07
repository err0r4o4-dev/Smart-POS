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
import { WorkspaceAreaGate } from './WorkspaceRouting';
import { RoleWorkspaceLayout } from '../../layouts/RoleWorkspaceLayout';
import { ManagementHomePage, WorkspaceEntryPage } from './WorkspacePages';

const mocks = vi.hoisted(() => ({
  context: null as OrganizationContext | null,
  storeMode: null as string | null,
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
    storeMode: mocks.storeMode,
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
            <Route path="/setup" element={<h1>Setup</h1>} />
            <Route element={<RequireSession />}>
              <Route path="/workspace" element={<WorkspaceEntryPage />} />
              <Route element={<OrganizationGate />}>
                <Route path="/dashboard" element={<ManagementHomePage />} />
              </Route>
              <Route element={<OrganizationGate permission="pos.access" />}>
                <Route path="/pos" element={<h1>POS</h1>} />
              </Route>
              <Route element={<OrganizationGate permission="catalog.read" />}>
                <Route path="/menu/:id" element={<h1>Product details</h1>} />
              </Route>
              <Route element={<OrganizationGate roles={managementRoles} />}>
                <Route
                  path="/settings"
                  element={<h1>Private store settings</h1>}
                />
              </Route>
            </Route>
          </Route>
        </Route>
        <Route path="/403" element={<h1>Forbidden</h1>} />
        <Route path="/login" element={<h1>Sign in</h1>} />
        <Route path="*" element={<h1>Not found</h1>} />
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
  mocks.storeMode = 'multi';
  localStorage.clear();
  vi.clearAllMocks();
});

it.each<Role>(['OWNER'])(
  'renders restaurant tasks for %s without fabricated retail metrics or retired links',
  (role) => {
    selectRole(role, allPermissions);
    expect(workspaceHome(role)).toBe('/dashboard');
    renderWorkspace();
    expect(screen.getByRole('heading', { name: 'ภาพรวม' })).toBeVisible();
    expect(
      document.querySelector('[data-workspace="management"]'),
    ).toBeInTheDocument();
    const main = within(screen.getByRole('main'));
    expect(main.getByRole('link', { name: 'ออเดอร์และคิว' })).toHaveAttribute(
      'href',
      '/orders',
    );
    expect(main.queryByRole('link', { name: 'สูตรอาหาร' })).not.toBeInTheDocument();
    expect(main.queryByRole('link', { name: 'เพิ่ม / ตรวจนับวัตถุดิบ' })).not.toBeInTheDocument();
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
        document.querySelector(`a[href="${path}"]`),
      ).not.toBeInTheDocument();
    }
  },
);

it.each<Role>(['MANAGER', 'CASHIER', 'INVENTORY_STAFF', 'PURCHASING_STAFF'])(
  'denies %s management despite broad permissions',
  (role) => {
    selectRole(role, allPermissions);
    renderWorkspace();
    expect(screen.getByRole('heading', { name: 'Forbidden' })).toBeVisible();
    expect(
      document.querySelector('[data-workspace="management"]'),
    ).not.toBeInTheDocument();
  },
);

it.each<Role>(['MANAGER', 'CASHIER', 'INVENTORY_STAFF', 'PURCHASING_STAFF'])(
  'denies management settings on a direct link for %s',
  (role) => {
    selectRole(role, allPermissions);
    renderWorkspace('/settings');
    expect(screen.getByRole('heading', { name: 'Forbidden' })).toBeVisible();
    expect(
      screen.queryByText('Private store settings'),
    ).not.toBeInTheDocument();
  },
);

it('redirects a signed-in user without a store to setup in multi-store mode', () => {
  renderWorkspace();
  expect(screen.getByRole('heading', { name: 'Setup' })).toBeVisible();
  expect(screen.getByLabelText('Location')).toHaveTextContent('/setup');
});

it.each(['single', null, 'unknown'])(
  'denies workspace entry for a signed-in user without membership when store mode is %s',
  (storeMode) => {
    mocks.storeMode = storeMode;
    renderWorkspace();
    expect(screen.getByRole('heading', { name: 'Forbidden' })).toBeVisible();
    expect(screen.getByLabelText('Location')).toHaveTextContent('/403');
  },
);

it('routes /account to 404 Not found', () => {
  renderWorkspace('/account');
  expect(screen.getByRole('heading', { name: 'Not found' })).toBeVisible();
  expect(screen.getByLabelText('Location')).toHaveTextContent('/account');
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

it('stays on workspace while a multi-store account without context loads', () => {
  mocks.loading = true;
  renderWorkspace();
  expect(screen.getByRole('status')).toHaveTextContent(
    'กำลังเลือกพื้นที่ตามสิทธิ์',
  );
  expect(screen.getByLabelText('Location')).toHaveTextContent('/workspace');
});

it('shows a context failure instead of pretending a role is available', () => {
  mocks.error = 'Context unavailable';
  renderWorkspace();
  expect(screen.getByRole('alert')).toHaveTextContent('Context unavailable');
  expect(screen.getByLabelText('Location')).toHaveTextContent('/workspace');
  expect(
    document.querySelector('[data-workspace="management"]'),
  ).not.toBeInTheDocument();
});

it('denies access when owner membership changes to cashier', () => {
  selectRole('OWNER', allPermissions);
  const view = renderWorkspace('/dashboard');
  expect(screen.getByRole('heading', { name: 'ภาพรวม' })).toBeVisible();
  selectRole('CASHIER', allPermissions);
  view.rerender(<Harness path="/dashboard" />);
  expect(screen.getByRole('heading', { name: 'Forbidden' })).toBeVisible();
});

it('renders an owner menu path with query and hash intact', () => {
  selectRole('OWNER', ['catalog.read']);
  renderWorkspace('/menu/item-1?search=abc#details');
  expect(screen.getByRole('heading', { name: 'Product details' })).toBeVisible();
  expect(screen.getByLabelText('Location')).toHaveTextContent(
    '/menu/item-1?search=abc#details',
  );
});

it.each<Role>(['MANAGER', 'CASHIER', 'INVENTORY_STAFF', 'PURCHASING_STAFF'])(
  'denies %s menu paths even with permission',
  (role) => {
    selectRole(role, allPermissions);
    renderWorkspace('/menu/item-1');
    expect(screen.getByRole('heading', { name: 'Forbidden' })).toBeVisible();
  },
);

it('denies menu paths to a cashier even with catalog permission', () => {
  selectRole('CASHIER', allPermissions);
  renderWorkspace('/menu/item-1');
  expect(screen.getByRole('heading', { name: 'Forbidden' })).toBeVisible();
  expect(
    screen.queryByRole('heading', { name: 'Product details' }),
  ).not.toBeInTheDocument();
});

it('keeps operational permission checks authoritative in management', () => {
  selectRole('OWNER', []);
  renderWorkspace('/menu/item-1');
  expect(screen.getByRole('heading', { name: 'Forbidden' })).toBeVisible();
});

it('filters restaurant dashboard shortcuts by permission without fabricating reports', () => {
  selectRole('OWNER', ['catalog.read']);
  renderWorkspace('/dashboard');
  const main = within(screen.getByRole('main'));
  expect(main.getByRole('link', { name: 'เมนูอาหาร' })).toBeVisible();
  expect(main.queryByRole('link', { name: 'สูตรอาหาร' })).not.toBeInTheDocument();
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
  '/dashboard',
  '/menu/item-1',
  '/settings',
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
  renderWorkspace('/pos');
  expect(screen.getByRole('heading', { name: 'POS' })).toBeVisible();
});

it.each<Role>(['MANAGER', 'CASHIER', 'INVENTORY_STAFF', 'PURCHASING_STAFF'])(
  'denies %s direct POS access',
  (role) => {
    selectRole(role, ['pos.access']);
    renderWorkspace('/pos');
    expect(screen.getByRole('heading', { name: 'Forbidden' })).toBeVisible();
  },
);
