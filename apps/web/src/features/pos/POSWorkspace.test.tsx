import { render } from '../../test/render';
import { StrictMode, useEffect } from 'react';
import { act, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { POSWorkspace } from './POSWorkspace';
import { usePOS } from './POSContext';

const mocks = vi.hoisted(() => ({ request: vi.fn(), branch: 'branch-a' }));
vi.mock('../../app/AuthProvider', () => ({
  useAuth: () => ({
    state: { session: { user: { id: 'user' }, csrf_token: 'csrf' } },
  }),
}));
vi.mock('../../app/OrganizationProvider', () => ({
  useOrganization: () => ({
    organizations: [{ id: 'org', name: 'yam' }],
    context: {
      organization: { id: 'org', name: 'yam' },
      membership: { role: 'OWNER' },
      branches: [{ id: mocks.branch, name: 'สาขาหลัก' }],
    },
    branchID: mocks.branch,
    loading: false,
    select: vi.fn(),
    can: () => true,
  }),
}));
vi.mock('../../lib/pos-api', async (original) => ({
  ...(await original<typeof import('../../lib/pos-api')>()),
  posRequest: mocks.request,
}));
let workspace: ReturnType<typeof usePOS>;
function Probe() {
  const current = usePOS();
  useEffect(() => {
    workspace = current;
  }, [current]);
  return <p>{current.branch}</p>;
}
beforeEach(() => {
  mocks.request.mockReset();
  mocks.branch = 'branch-a';
});
function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const tree = () => (
    <StrictMode>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/pos']}>
          <Routes>
            <Route path="/pos" element={<POSWorkspace />}>
              <Route index element={<Probe />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>
  );
  const view = render(tree());
  return { ...view, client, refresh: () => view.rerender(tree()) };
}

it('reuses a retry key after ambiguous failure while preserving CSRF and a live StrictMode signal', async () => {
  let fail = true;
  const writes: { key: string; csrf: string; signal: AbortSignal }[] = [];
  mocks.request.mockImplementation(async (_org, _path, options) => {
    if (options?.method) {
      writes.push(options);
      if (fail) {
        fail = false;
        throw new Error('network');
      }
      return { id: 'saved' };
    }
    return { items: [], total: 0 };
  });
  setup();
  await screen.findByText('branch-a');
  await act(async () => {
    await workspace.mutate('/pos/shifts/open', { opening_cash: '0.00' });
  });
  await act(async () => {
    await workspace.mutate('/pos/shifts/open', { opening_cash: '0.00' });
  });
  expect(writes).toHaveLength(2);
  expect(writes[0].key).toBe(writes[1].key);
  expect(writes[1].csrf).toBe('csrf');
  expect(writes[1].signal.aborted).toBe(false);
});

it('does not yield a delayed mutation result to the next branch', async () => {
  let resolve!: (value: object) => void;
  let signal!: AbortSignal;
  mocks.request.mockImplementation(async (_org, _path, options) => {
    if (options?.method) {
      signal = options.signal;
      return new Promise((done) => {
        resolve = done;
      });
    }
    return { items: [], total: 0 };
  });
  const view = setup();
  await screen.findByText('branch-a');
  let pending!: Promise<unknown>;
  act(() => {
    pending = workspace.mutate('/pos/carts', { terminal_id: 'terminal' });
  });
  mocks.branch = 'branch-b';
  view.refresh();
  await screen.findByText('branch-b');
  expect(signal.aborted).toBe(true);
  await act(async () => {
    resolve({ id: 'old-cart' });
    await expect(pending).resolves.toBeUndefined();
  });
  await waitFor(() => expect(workspace.busy).toBe(false));
});

it('does not render the tenant-switchers bar in the POS workspace header', async () => {
  mocks.request.mockResolvedValue({ items: [], total: 0 });
  setup();
  await screen.findByText('branch-a');
  expect(document.querySelector('.tenant-switchers')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('combobox', { name: 'องค์กรที่ใช้งาน' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('combobox', { name: 'สาขาที่ใช้งาน' }),
  ).not.toBeInTheDocument();
});
