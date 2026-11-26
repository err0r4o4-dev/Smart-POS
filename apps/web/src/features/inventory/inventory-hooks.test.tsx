import { StrictMode, type ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { useInventoryCommand } from './inventory-hooks';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  org: 'org-a',
  branch: 'branch-a',
}));
vi.mock('../../app/AuthProvider', () => ({
  useAuth: () => ({
    state: { session: { user: { id: 'user' }, csrf_token: 'csrf' } },
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
});

function setup() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const hook = renderHook(() => useInventoryCommand(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <StrictMode>
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      </StrictMode>
    ),
  });
  return { ...hook, client };
}

it('retains retry keys for the same ambiguous write and distinguishes payload and method', async () => {
  const hook = setup();
  mocks.request
    .mockRejectedValueOnce(new Error('network'))
    .mockResolvedValue({ id: 'doc' });
  await act(async () => {
    await expect(
      hook.result.current.run('/counts', 'POST', { quantity: '1' }),
    ).rejects.toThrow('network');
  });
  const keys: string[] = [mocks.request.mock.calls[0][1].key];
  for (const [method, quantity] of [
    ['POST', '1'],
    ['POST', '2'],
    ['PATCH', '1'],
  ]) {
    await act(async () => {
      await hook.result.current.run('/counts', method, { quantity });
    });
    keys.push(mocks.request.mock.lastCall![1].key);
  }
  expect(keys[0]).toBe(keys[1]);
  expect(new Set(keys.slice(1)).size).toBe(3);
});

it.each(['unmount', 'organization', 'branch', 'read'] as const)(
  'ignores delayed results after %s changes',
  async (change) => {
    const hook = setup();
    const invalidate = vi.spyOn(hook.client, 'invalidateQueries');
    let resolve!: (value: object) => void;
    mocks.request.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    let pending!: Promise<unknown>;
    act(() => {
      pending =
        change === 'read'
          ? hook.result.current.read('/counts/doc')
          : hook.result.current.run('/counts', 'POST', {});
    });
    if (change === 'organization') {
      mocks.org = 'org-b';
      hook.rerender();
    } else if (change === 'branch') {
      mocks.branch = 'branch-b';
      hook.rerender();
    } else hook.unmount();
    expect(mocks.request.mock.calls[0][1].signal.aborted).toBe(true);
    await act(async () => {
      resolve({ id: 'stale' });
      await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    });
    expect(invalidate).not.toHaveBeenCalled();
  },
);

it('does not yield a successful result when scope changes during cache refresh', async () => {
  const hook = setup();
  mocks.request.mockResolvedValue({ id: 'doc' });
  let finish!: () => void;
  vi.spyOn(hook.client, 'invalidateQueries').mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  let pending!: Promise<unknown>;
  await act(async () => {
    pending = hook.result.current.run('/counts', 'POST', {});
  });
  hook.unmount();
  finish();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
});

it('prevents simultaneous submissions before React updates the button state', async () => {
  const hook = setup();
  let finish!: (value: object) => void;
  mocks.request.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  let first!: Promise<unknown>;
  await act(async () => {
    first = hook.result.current.run('/counts', 'POST', {});
    await expect(
      hook.result.current.run('/counts', 'POST', {}),
    ).rejects.toThrow('กรุณารอ');
  });
  expect(mocks.request).toHaveBeenCalledTimes(1);
  await act(async () => {
    finish({ id: 'doc' });
    await first;
  });
});
