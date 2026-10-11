import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { navigation, staffNavigation } from '../../app/routes';
import { managementRoles, workspaceHome, type Role } from '../../app/access';
import type { OrganizationContext } from '../../lib/organization-api';
import { RequireSession } from '../../app/ProtectedRoute';
import { OrganizationGate } from '../organization/OrganizationGate';
import { RoleWorkspaceLayout } from '../../layouts/RoleWorkspaceLayout';
import {
  ManagementHomePage,
  StaffHomePage,
  WorkspaceEntryPage,
} from './WorkspacePages';

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
function Harness({ path }: { path: string }) {
  return (
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<RoleWorkspaceLayout />}>
          <Route element={<RequireSession />}>
            <Route path="/workspace" element={<WorkspaceEntryPage />} />
            <Route path="/account" element={<h1>Account</h1>} />
            <Route element={<OrganizationGate />}>
              <Route path="/dashboard" element={<ManagementHomePage />} />
              <Route path="/staff" element={<StaffHomePage />} />
            </Route>
            <Route element={<OrganizationGate roles={managementRoles} />}>
              <Route
                path="/settings/store"
                element={<h1>Private store settings</h1>}
              />
            </Route>
          </Route>
        </Route>
        <Route path="/403" element={<h1>Forbidden</h1>} />
        <Route path="/login" element={<h1>Sign in</h1>} />
      </Routes>
    </MemoryRouter>
  );
}
function renderWorkspace(path = '/workspace') {
  return render(<Harness path={path} />);
}
const allPermissions = [
  ...new Set(
    [...navigation, ...staffNavigation].flatMap((item) =>
      item.permission ? [item.permission] : [],
    ),
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
  vi.clearAllMocks();
});

it.each<Role>(['OWNER', 'MANAGER'])(
  'takes %s to management without fake sales metrics',
  (role) => {
    selectRole(role, allPermissions);
    expect(workspaceHome(role)).toBe('/dashboard');
    renderWorkspace();
    expect(screen.getByRole('heading', { name: 'ภาพรวมร้าน' })).toBeVisible();
    expect(
      document.querySelector('[data-workspace="management"]'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'จัดการสินค้า' })).toBeVisible();
    expect(
      screen.getByText('ยังไม่เปิดรับออเดอร์หรือชำระเงินออนไลน์', {
        exact: false,
      }),
    ).toBeVisible();
  },
);

it.each<Role>(['CASHIER', 'INVENTORY_STAFF', 'PURCHASING_STAFF'])(
  'takes %s to staff and omits owner menus even with broad permissions',
  (role) => {
    selectRole(role, allPermissions);
    expect(workspaceHome(role)).toBe('/staff');
    renderWorkspace();
    expect(screen.getByRole('heading', { name: 'งานของฉัน' })).toBeVisible();
    expect(
      document.querySelector('[data-workspace="staff"]'),
    ).toBeInTheDocument();
    for (const path of [
      '/employees',
      '/roles',
      '/settings/store',
      '/settings/branches',
      '/pricing',
    ])
      expect(
        document.querySelector(`a[href="${path}"]`),
      ).not.toBeInTheDocument();
  },
);

it('does not give inventory staff cashier tools', () => {
  selectRole('INVENTORY_STAFF', ['catalog.read', 'inventory.read']);
  renderWorkspace();
  expect(screen.getByRole('link', { name: 'ข้อมูลสินค้า' })).toBeVisible();
  expect(document.querySelector('a[href="/pos"]')).not.toBeInTheDocument();
  expect(
    document.querySelector('a[href="/purchasing/orders"]'),
  ).not.toBeInTheDocument();
});

it('keeps cashier menus scoped to granted tasks', () => {
  selectRole('CASHIER', [
    'pos.access',
    'pos.register.open',
    'pos.register.close',
    'sales.read',
  ]);
  renderWorkspace();
  expect(screen.getByRole('link', { name: 'ขายหน้าร้าน' })).toBeVisible();
  expect(screen.getByRole('link', { name: 'เปิดกะขาย' })).toBeVisible();
  expect(
    document.querySelector('a[href="/inventory"]'),
  ).not.toBeInTheDocument();
});

it('redirects a staff dashboard bookmark to their own workspace', () => {
  selectRole('CASHIER', ['pos.access']);
  renderWorkspace('/dashboard');
  expect(screen.getByRole('heading', { name: 'งานของฉัน' })).toBeVisible();
  expect(
    screen.queryByRole('heading', { name: 'ภาพรวมร้าน' }),
  ).not.toBeInTheDocument();
});

it('allows an owner to use staff tasks without changing their role', () => {
  selectRole('OWNER', allPermissions);
  renderWorkspace('/staff');
  expect(
    document.querySelector('[data-workspace="staff"]'),
  ).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'จัดการร้าน' })).toHaveAttribute(
    'href',
    '/dashboard',
  );
  expect(mocks.context?.membership.role).toBe('OWNER');
});

it.each<Role>(['CASHIER', 'INVENTORY_STAFF', 'PURCHASING_STAFF'])(
  'denies management settings on a direct link for %s',
  (role) => {
    selectRole(role, allPermissions);
    renderWorkspace('/settings/store');
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
    document.querySelector('a[href="/employees"]'),
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

it('removes owner menus when membership changes to cashier', () => {
  selectRole('OWNER', allPermissions);
  const view = renderWorkspace('/dashboard');
  expect(document.querySelector('a[href="/employees"]')).toBeInTheDocument();
  selectRole('CASHIER', ['pos.access']);
  view.rerender(<Harness path="/dashboard" />);
  expect(screen.getByRole('heading', { name: 'งานของฉัน' })).toBeVisible();
  expect(
    document.querySelector('a[href="/employees"]'),
  ).not.toBeInTheDocument();
});

it('keeps anonymous visitors out of staff routes', () => {
  mocks.status = 'anonymous';
  renderWorkspace('/staff');
  expect(screen.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  expect(
    screen.queryByRole('heading', { name: 'งานของฉัน' }),
  ).not.toBeInTheDocument();
});
