import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { OrganizationProvider, useOrganization } from './OrganizationProvider';
import type { OrganizationContext } from '../lib/organization-api';
const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  auth: { status: 'authenticated', session: { user: { id: 'user' } } } as {
    status: string;
    session: { user: { id: string } } | null;
  },
}));
vi.mock('./AuthProvider', () => ({ useAuth: () => ({ state: mocks.auth }) }));
vi.mock('../lib/organization-api', () => ({
  organizationRequest: mocks.request,
}));
const organizations = [
  { id: 'a', name: 'Organization A' },
  { id: 'b', name: 'Organization B' },
];
const context = (id: string): OrganizationContext => ({
  organization: {
    id,
    name: `Organization ${id}`,
    code: id,
    business_type: 'RETAIL',
    contact_email: '',
    contact_phone: '',
    address: '',
    currency: 'THB',
    status: 'ACTIVE',
  },
  membership: {
    id: `${id}-member`,
    user_id: 'user',
    email: '',
    display_name: '',
    role: id === 'a' ? 'OWNER' : 'CASHIER',
    status: 'ACTIVE',
    branch_ids: [`${id}-main`],
    permissions: [],
  },
  branches: [
    {
      id: `${id}-main`,
      organization_id: id,
      name: 'Main',
      code: 'MAIN',
      address: '',
      phone: '',
      email: '',
      status: 'ACTIVE',
      is_main: true,
    },
    {
      id: `${id}-other`,
      organization_id: id,
      name: 'Other',
      code: 'OTHER',
      address: '',
      phone: '',
      email: '',
      status: 'ACTIVE',
      is_main: false,
    },
  ],
  permissions: id === 'a' ? ['employee.read'] : ['branch.read'],
});
function Probe() {
  const tenant = useOrganization();
  return (
    <>
      <output>{tenant.context?.organization.id ?? 'none'}</output>
      <span>{tenant.branchID}</span>
      <span>
        {tenant.can('employee.read') ? 'employees-visible' : 'employees-denied'}
      </span>
      <button onClick={() => tenant.select('b')}>Switch B</button>
      <button onClick={() => tenant.select('a', 'a-other')}>
        Other branch
      </button>
      <button onClick={() => tenant.select('not-a-member')}>
        Unauthorized
      </button>
    </>
  );
}
function mount() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const tree = () => (
    <QueryClientProvider client={client}>
      <OrganizationProvider>
        <Probe />
      </OrganizationProvider>
    </QueryClientProvider>
  );
  return { ...render(tree()), tree, client };
}
beforeEach(() => {
  mocks.request.mockReset();
  mocks.auth = { status: 'authenticated', session: { user: { id: 'user' } } };
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
  mocks.request.mockImplementation((path: string) =>
    Promise.resolve(
      path === '/organizations'
        ? organizations
        : context(path.includes('/b/') ? 'b' : 'a'),
    ),
  );
});
it('switches organizations and permissions without rendering old tenant data', async () => {
  mount();
  expect(await screen.findByText('employees-visible')).toBeVisible();
  fireEvent.click(screen.getByText('Switch B'));
  expect(screen.getByText('none')).toBeVisible();
  expect(await screen.findByText('b')).toBeVisible();
  expect(screen.getByText('employees-denied')).toBeVisible();
});
it('validates branches and restores only authorized preferences', async () => {
  sessionStorage.setItem(
    'smartpos-context:user',
    JSON.stringify({ orgID: 'a', branchID: 'a-other' }),
  );
  mount();
  expect(await screen.findByText('a-other')).toBeVisible();
  fireEvent.click(screen.getByText('Unauthorized'));
  expect(screen.getByText('a')).toBeVisible();
});
it('ignores an old in-flight context after organization switch', async () => {
  let complete!: (value: OrganizationContext) => void;
  mocks.request.mockImplementation((path: string) =>
    path === '/organizations'
      ? Promise.resolve(organizations)
      : path.includes('/a/')
        ? new Promise<OrganizationContext>((resolve) => {
            complete = resolve;
          })
        : Promise.resolve(context('b')),
  );
  mount();
  await waitFor(() =>
    expect(mocks.request).toHaveBeenCalledWith(
      '/organizations/a/context',
      expect.anything(),
    ),
  );
  fireEvent.click(screen.getByText('Switch B'));
  expect(await screen.findByText('b')).toBeVisible();
  await act(async () => complete(context('a')));
  expect(screen.getByText('b')).toBeVisible();
  expect(screen.queryByText('employees-visible')).not.toBeInTheDocument();
});
it('clears tenant caches on logout and strips invitation tokens from URL', async () => {
  window.history.replaceState(null, '', '/setup#invitation=secret-invite');
  const view = mount();
  expect(window.location.hash).toBe('');
  expect(await screen.findByText('a')).toBeVisible();
  mocks.auth = { status: 'anonymous', session: null };
  view.rerender(view.tree());
  await waitFor(() =>
    expect(
      view.client.getQueryCache().findAll({ queryKey: ['tenant', 'user'] }),
    ).toHaveLength(0),
  );
  expect(
    view.client
      .getQueryCache()
      .findAll({ queryKey: ['tenant'] })
      .every((query) => query.state.data === undefined),
  ).toBe(true);
  expect(screen.getByText('none')).toBeVisible();
});
