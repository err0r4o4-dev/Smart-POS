import { StrictMode, type ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { useReturnsCommand, useReturnsQuery } from './returns-hooks';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  org: 'org-a',
  branch: 'branch-a',
  user: 'user-a',
}));
vi.mock('../../app/AuthProvider', () => ({
  useAuth: () => ({
    state: { session: { user: { id: mocks.user }, csrf_token: 'test-csrf' } },
  }),
}));
vi.mock('../../app/OrganizationProvider', () => ({
  useOrganization: () => ({
    context: { organization: { id: mocks.org } },
    branchID: mocks.branch,
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
it('keeps StrictMode signal live and sends CSRF with scoped invalidation', async () => {
  const { client, Wrapper } = wrapper(),
    invalidate = vi.spyOn(client, 'invalidateQueries');
  mocks.request.mockResolvedValue({ id: 'return' });
  const hook = renderHook(() => useReturnsCommand(), { wrapper: Wrapper });
  await act(async () => {
    await hook.result.current.run('/returns', { quantity: '1' });
  });
  expect(mocks.request).toHaveBeenCalledWith(
    '/organizations/org-a/returns',
    expect.objectContaining({ csrf: 'test-csrf', method: 'POST' }),
  );
  expect(mocks.request.mock.calls[0][1].signal.aborted).toBe(false);
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: ['tenant', 'user-a', 'org-a'],
  });
});
it('reuses the same request key after ambiguous failure, never for changed payload', async () => {
  const { Wrapper } = wrapper(),
    hook = renderHook(() => useReturnsCommand(), { wrapper: Wrapper });
  mocks.request
    .mockRejectedValueOnce(new Error('network'))
    .mockResolvedValue({ id: 'return' });
  await act(async () => {
    await hook.result.current.run('/returns', { quantity: '1' });
  });
  await act(async () => {
    await hook.result.current.run('/returns', { quantity: '1' });
  });
  await act(async () => {
    await hook.result.current.run('/returns', { quantity: '2' });
  });
  expect(mocks.request.mock.calls[0][1].key).toBe(
    mocks.request.mock.calls[1][1].key,
  );
  expect(mocks.request.mock.calls[2][1].key).not.toBe(
    mocks.request.mock.calls[1][1].key,
  );
});
it('aborts an unmounted tenant command and does not yield stale data', async () => {
  const { Wrapper } = wrapper(),
    hook = renderHook(() => useReturnsCommand(), { wrapper: Wrapper });
  let resolve!: (value: object) => void;
  mocks.request.mockImplementation(
    () =>
      new Promise((done) => {
        resolve = done;
      }),
  );
  let pending!: ReturnType<typeof hook.result.current.run>;
  act(() => {
    pending = hook.result.current.run('/returns', { quantity: '1' });
  });
  hook.unmount();
  expect(mocks.request.mock.calls[0][1].signal.aborted).toBe(true);
  resolve({ id: 'old-tenant-data' });
  await expect(pending).resolves.toBeUndefined();
});
it('separates adjustment POST and PATCH retry fingerprints', async () => {
  const { Wrapper } = wrapper(),
    hook = renderHook(() => useReturnsCommand(), { wrapper: Wrapper });
  mocks.request.mockResolvedValue({ id: 'adjustment' });
  await act(async () => {
    await hook.result.current.run('/exchanges/id', { revision: 1 });
  });
  await act(async () => {
    await hook.result.current.run('/exchanges/id', { revision: 1 }, 'PATCH');
  });
  expect(mocks.request.mock.calls[1][1].method).toBe('PATCH');
  expect(mocks.request.mock.calls[0][1].key).not.toBe(
    mocks.request.mock.calls[1][1].key,
  );
});
it('isolates queries by user, organization, branch and resource', async () => {
  const { client, Wrapper } = wrapper();
  mocks.request.mockResolvedValue({ items: [] });
  const hook = renderHook(() => useReturnsQuery('/returns?page=1'), {
    wrapper: Wrapper,
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  mocks.branch = 'branch-b';
  hook.rerender();
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  expect(
    client
      .getQueryCache()
      .getAll()
      .map((query) => query.queryKey),
  ).toEqual(
    expect.arrayContaining([
      ['tenant', 'user-a', 'org-a', 'branch-a', 'returns', '/returns?page=1'],
      ['tenant', 'user-a', 'org-a', 'branch-b', 'returns', '/returns?page=1'],
    ]),
  );
});
