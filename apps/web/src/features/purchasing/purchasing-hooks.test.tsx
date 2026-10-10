import { StrictMode, type ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { useSupplyScope, useSupplyQuery } from './purchasing-hooks';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  org: 'org-a',
  branch: 'branch-a',
  user: 'user-a',
}));
vi.mock('../../app/AuthProvider', () => ({
  useAuth: () => ({
    state: { session: { user: { id: mocks.user }, csrf_token: 'csrf' } },
  }),
}));
vi.mock('../../app/OrganizationProvider', () => ({
  useOrganization: () => ({
    context: { organization: { id: mocks.org } },
    branchID: mocks.branch,
    can: () => true,
  }),
}));
vi.mock('../../lib/organization-api', () => ({
  organizationRequest: mocks.request,
}));
beforeEach(() => {
  mocks.request.mockReset();
  mocks.org = 'org-a';
  mocks.branch = 'branch-a';
  mocks.user = 'user-a';
});
function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    client,
    Wrapper: ({ children }: { children: ReactNode }) => (
      <StrictMode>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </StrictMode>
    ),
  };
}
it('keeps a live signal under StrictMode and sends CSRF/scoped invalidation', async () => {
  const { client, Wrapper } = wrapper(),
    invalidate = vi.spyOn(client, 'invalidateQueries');
  mocks.request.mockResolvedValue({ id: 'doc' });
  const hook = renderHook(() => useSupplyScope(), { wrapper: Wrapper });
  await act(async () => {
    await hook.result.current.run('/purchasing/orders', {
      branch_id: 'branch-a',
    });
  });
  expect(mocks.request).toHaveBeenCalledWith(
    '/organizations/org-a/purchasing/orders',
    expect.objectContaining({ csrf: 'csrf', method: 'POST' }),
  );
  expect(mocks.request.mock.calls[0][1].signal.aborted).toBe(false);
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: ['tenant', 'user-a', 'org-a'],
  });
});
it('reuses key after ambiguous failure; changed payload uses a new key', async () => {
  const { Wrapper } = wrapper(),
    hook = renderHook(() => useSupplyScope(), { wrapper: Wrapper });
  mocks.request
    .mockRejectedValueOnce(new Error('network'))
    .mockResolvedValue({ id: 'doc' });
  await act(async () => {
    await expect(
      hook.result.current.run('/purchasing/orders', { quantity: '1' }),
    ).rejects.toThrow('network');
  });
  await act(async () => {
    await hook.result.current.run('/purchasing/orders', { quantity: '1' });
  });
  await act(async () => {
    await hook.result.current.run('/purchasing/orders', { quantity: '2' });
  });
  expect(mocks.request.mock.calls[0][1].key).toBe(
    mocks.request.mock.calls[1][1].key,
  );
  expect(mocks.request.mock.calls[2][1].key).not.toBe(
    mocks.request.mock.calls[1][1].key,
  );
});
it('aborts stale mutation on unmount and never yields data to navigation', async () => {
  const { Wrapper } = wrapper(),
    hook = renderHook(() => useSupplyScope(), { wrapper: Wrapper });
  let finish: (value: object) => void = () => undefined;
  mocks.request.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  let pending: Promise<unknown>;
  await act(async () => {
    pending = hook.result.current.run('/shelves/replenishments', {});
  });
  hook.unmount();
  finish({ id: 'stale' });
  await expect(pending!).rejects.toMatchObject({ name: 'AbortError' });
  expect(mocks.request.mock.calls[0][1].signal.aborted).toBe(true);
});
it('isolates cache keys by user, organization and branch', () => {
  const { client, Wrapper } = wrapper(),
    hook = renderHook(() => useSupplyQuery('/shelves', false), {
      wrapper: Wrapper,
    });
  mocks.org = 'org-b';
  mocks.branch = 'branch-b';
  mocks.user = 'user-b';
  hook.rerender();
  expect(
    client
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey),
  ).toEqual([
    ['tenant', 'user-a', 'org-a', 'branch-a', 'supply', '/shelves'],
    ['tenant', 'user-b', 'org-b', 'branch-b', 'supply', '/shelves'],
  ]);
  expect(mocks.request).not.toHaveBeenCalled();
});
