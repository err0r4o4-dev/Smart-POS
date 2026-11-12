import {
  QueryClient,
  QueryClientProvider,
  notifyManager,
} from '@tanstack/react-query';
import { act, fireEvent, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { render } from '../../test/render';
import { WorkspaceAreaGate } from './WorkspaceRouting';

const mocks = vi.hoisted(() => ({
  getSetup: vi.fn(),
  org: 'org-1',
  branch: 'branch-1',
  user: 'owner-1',
  role: 'OWNER',
}));
vi.mock('../../app/AuthProvider', () => ({
  useAuth: () => ({
    state: {
      status: 'authenticated',
      session: {
        user: { id: mocks.user, email_verified: true },
      },
    },
  }),
}));
vi.mock('../../app/OrganizationProvider', () => ({
  useOrganization: () => ({
    context: {
      organization: { id: mocks.org },
      membership: { role: mocks.role },
    },
    branchID: mocks.branch,
    loading: false,
    error: '',
    storeMode: 'multi',
  }),
}));
vi.mock('../organization/setup-api', () => ({ getSetup: mocks.getSetup }));

beforeEach(() => {
  notifyManager.setScheduler(queueMicrotask);
  vi.clearAllMocks();
  mocks.org = 'org-1';
  mocks.branch = 'branch-1';
  mocks.user = 'owner-1';
  mocks.role = 'OWNER';
  mocks.getSetup.mockResolvedValue({
    complete: false,
    readiness: { ready: true },
  });
});
afterEach(() =>
  notifyManager.setScheduler((callback) => setTimeout(callback, 0)),
);

function mount(
  path = '/dashboard',
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }),
) {
  const tree = () => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<WorkspaceAreaGate />}>
            <Route
              path="/dashboard"
              element={
                <>
                  <h1>Working page</h1>
                  <input aria-label="Draft" />
                </>
              }
            />
            <Route path="/pos/checkout" element={<h1>Working page</h1>} />
            <Route
              path="/settings/storefront"
              element={<h1>Working page</h1>}
            />
            <Route path="/setup" element={<h1>Setup</h1>} />
            <Route path="/help" element={<h1>Help</h1>} />
          </Route>
          <Route path="/403" element={<h1>Forbidden</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  const view = render(tree());
  return { ...view, client, redraw: () => view.rerender(tree()) };
}

it.each(['/dashboard', '/pos/checkout', '/settings/storefront'])(
  'blocks incomplete setup through direct link %s even when ready',
  async (path) => {
    mount(path);
    expect(
      screen.queryByRole('heading', { name: 'Working page' }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Setup' }),
    ).toBeInTheDocument();
    expect(mocks.getSetup).toHaveBeenCalledWith(
      { organizationID: 'org-1', branchID: 'branch-1' },
      expect.any(AbortSignal),
    );
  },
);

it('allows work only when the server reports completed setup', async () => {
  mocks.getSetup.mockResolvedValue({
    complete: true,
    readiness: { ready: false },
  });
  mount();
  expect(
    await screen.findByRole('heading', { name: 'Working page' }),
  ).toBeInTheDocument();
});

it('does not mount work while completion is unknown', async () => {
  let resolve!: (value: { complete: boolean }) => void;
  mocks.getSetup.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  mount();
  expect(
    screen.queryByRole('heading', { name: 'Working page' }),
  ).not.toBeInTheDocument();
  await act(async () => resolve({ complete: false }));
  expect(
    await screen.findByRole('heading', { name: 'Setup' }),
  ).toBeInTheDocument();
});

it('fails closed on lookup error and recovers on retry', async () => {
  mocks.getSetup.mockRejectedValueOnce(new Error('Setup unavailable'));
  mocks.getSetup.mockResolvedValue({ complete: true });
  mount();
  expect(await screen.findByText('Setup unavailable')).toBeInTheDocument();
  expect(
    screen.queryByRole('heading', { name: 'Working page' }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button'));
  expect(
    await screen.findByRole('heading', { name: 'Working page' }),
  ).toBeInTheDocument();
});

it.each(['org', 'branch', 'user'] as const)(
  'does not reuse another %s completion',
  async (key) => {
    mocks.getSetup.mockResolvedValue({ complete: true });
    const view = mount();
    await screen.findByRole('heading', { name: 'Working page' });
    mocks.getSetup.mockImplementation(() => new Promise(() => {}));
    mocks[key] = 'other';
    view.redraw();
    expect(
      screen.queryByRole('heading', { name: 'Working page' }),
    ).not.toBeInTheDocument();
  },
);

it.each(['/setup', '/help'])(
  'keeps recovery route %s reachable without lookup',
  async (path) => {
    mount(path);
    expect(await screen.findByRole('heading')).toHaveTextContent(
      path === '/help' ? 'Help' : 'Setup',
    );
    expect(mocks.getSetup).not.toHaveBeenCalled();
  },
);

it('denies non-owners without requesting setup', async () => {
  mocks.role = 'CASHIER';
  mount();
  expect(
    await screen.findByRole('heading', { name: 'Forbidden' }),
  ).toBeInTheDocument();
  expect(mocks.getSetup).not.toHaveBeenCalled();
});

it('keeps unsaved work mounted during a background completion check', async () => {
  mocks.getSetup.mockResolvedValue({ complete: true });
  const view = mount();
  fireEvent.change(await screen.findByLabelText('Draft'), {
    target: { value: 'Unsaved work' },
  });
  mocks.getSetup.mockImplementation(() => new Promise(() => {}));
  await act(async () => {
    void view.client.invalidateQueries({ queryKey: ['restaurant-setup'] });
  });
  expect(screen.getByLabelText('Draft')).toHaveValue('Unsaved work');
});

it('revalidates cached completion before mounting a new workspace', async () => {
  const client = new QueryClient();
  client.setQueryData(['restaurant-setup', 'owner-1', 'org-1', 'branch-1'], {
    complete: true,
  });
  mocks.getSetup.mockImplementation(() => new Promise(() => {}));
  mount('/dashboard', client);
  expect(
    screen.queryByRole('heading', { name: 'Working page' }),
  ).not.toBeInTheDocument();
});
