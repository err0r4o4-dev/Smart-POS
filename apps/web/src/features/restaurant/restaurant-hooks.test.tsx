import type { PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import { useRestaurantCommand } from './restaurant-hooks';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  user: 'owner',
  org: 'restaurant',
  branch: 'branch',
  csrf: 'csrf',
}));
vi.mock('../../app/AuthProvider', () => ({
  useAuth: () => ({
    state: {
      session: { user: { id: mocks.user }, csrf_token: mocks.csrf },
    },
  }),
}));
vi.mock('../../app/OrganizationProvider', () => ({
  useOrganization: () => ({
    context: { organization: { id: mocks.org } },
    branchID: mocks.branch,
    can: () => true,
  }),
}));
vi.mock('../../lib/pos-api', () => ({ posRequest: mocks.request }));

beforeEach(() => {
  mocks.request.mockReset();
  mocks.user = 'owner';
  mocks.org = 'restaurant';
  mocks.branch = 'branch';
  mocks.csrf = 'csrf';
});

function command(saved?: (result: unknown) => void) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const hook = renderHook(
    ({ path, method }) => useRestaurantCommand(path, method, saved),
    {
      initialProps: { path: '/restaurant/tables', method: 'POST' },
      wrapper: ({ children }: PropsWithChildren) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
  return { ...hook, client };
}

it('retains the original request after a network response is lost', async () => {
  mocks.request.mockRejectedValue(new ApiError(0, 'Connection lost'));
  const hook = command();
  act(() => hook.result.current.run({ code: 'T01', branch_id: 'branch' }));
  await waitFor(() => expect(hook.result.current.isError).toBe(true));
  expect(hook.result.current.uncertain).toBe(true);
  const first = mocks.request.mock.calls[0];
  act(() => hook.result.current.run({ code: 'T02', branch_id: 'branch' }));
  await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2));
  expect(mocks.request.mock.calls[1]).toEqual(first);
});

it.each([0, 200, 401, 403, 408, 500, 503])(
  'retains an uncertain first response with status %i',
  async (status) => {
    mocks.request.mockRejectedValue(
      new ApiError(status, 'No confirmed result'),
    );
    const hook = command();
    act(() => hook.result.current.run({ code: 'T01' }));
    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    expect(hook.result.current.locked).toBe(true);
    expect(hook.result.current.uncertain).toBe(true);
    expect(mocks.request).toHaveBeenCalledTimes(1);
  },
);

it.each([400, 409])(
  'cannot clear earlier uncertainty with a later %i',
  async (status) => {
    mocks.request
      .mockRejectedValueOnce(new ApiError(503, 'Unknown'))
      .mockRejectedValueOnce(new ApiError(status, 'Rejected'))
      .mockResolvedValueOnce({ id: 'table' });
    const hook = command();
    act(() => hook.result.current.run({ code: 'T01' }));
    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    const first = mocks.request.mock.calls[0];
    act(() => hook.result.current.run({ code: 'T02' }));
    await waitFor(() =>
      expect(hook.result.current.error).toMatchObject({ status }),
    );
    expect(hook.result.current.uncertain).toBe(true);
    act(() => hook.result.current.run({ code: 'T03' }));
    await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
    expect(mocks.request.mock.calls[1]).toEqual(first);
    expect(mocks.request.mock.calls[2]).toEqual(first);
    expect(hook.result.current.locked).toBe(false);
  },
);

it('snapshots nested payloads before dispatch and refreshes only CSRF on retry', async () => {
  mocks.request.mockRejectedValue(new ApiError(503, 'Unknown'));
  const hook = command();
  const body = { lines: [{ quantity: '1.125', amount: '20.00' }] };
  act(() => {
    hook.result.current.run(body);
    body.lines[0].quantity = '99.000';
  });
  await waitFor(() => expect(hook.result.current.isError).toBe(true));
  expect(mocks.request.mock.calls[0][2].body).toEqual({
    lines: [{ quantity: '1.125', amount: '20.00' }],
  });
  mocks.request.mock.calls[0][2].body.lines[0].amount = '0.00';
  const key = mocks.request.mock.calls[0][2].key;
  mocks.csrf = 'refreshed-csrf';
  hook.rerender({ path: '/restaurant/tables', method: 'POST' });
  act(() => hook.result.current.run({ lines: [] }));
  await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2));
  expect(mocks.request.mock.calls[1]).toEqual([
    'restaurant',
    '/restaurant/tables',
    {
      method: 'POST',
      csrf: 'refreshed-csrf',
      key,
      body: { lines: [{ quantity: '1.125', amount: '20.00' }] },
    },
  ]);
});

it.each(['user', 'org', 'branch', 'path', 'method'] as const)(
  'refuses retained retries after changing %s',
  async (field) => {
    mocks.request.mockRejectedValue(new ApiError(503, 'Unknown'));
    const hook = command();
    act(() => hook.result.current.run({ code: 'T01' }));
    await waitFor(() => expect(hook.result.current.isError).toBe(true));
    const props = { path: '/restaurant/tables', method: 'POST' };
    if (field === 'path' || field === 'method') props[field] = 'other';
    else mocks[field] = 'other';
    hook.rerender(props);
    await act(async () => hook.result.current.run({ code: 'T02' }));
    expect(mocks.request).toHaveBeenCalledTimes(1);
    expect(hook.result.current.data).toBeUndefined();
    expect(hook.result.current.error).toBeNull();
  },
);

it('allows corrected input and a new key after a definitive first rejection', async () => {
  mocks.request
    .mockRejectedValueOnce(new ApiError(400, 'Invalid'))
    .mockResolvedValue({ id: 'table' });
  const hook = command();
  act(() => hook.result.current.run({ code: '' }));
  await waitFor(() => expect(hook.result.current.isError).toBe(true));
  expect(hook.result.current.locked).toBe(false);
  const firstKey = mocks.request.mock.calls[0][2].key;
  act(() => hook.result.current.run({ code: 'T01' }));
  await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
  expect(mocks.request.mock.calls[1][2].body).toEqual({ code: 'T01' });
  expect(mocks.request.mock.calls[1][2].key).not.toBe(firstKey);
});

it('suppresses rapid duplicate submissions and releases the guard after a saved callback throws', async () => {
  mocks.request.mockResolvedValue({ id: 'table' });
  const hook = command(() => {
    throw new Error('Consumer failed');
  });
  act(() => {
    hook.result.current.run({ code: 'T01' });
    hook.result.current.run({ code: 'T02' });
  });
  await waitFor(() => expect(hook.result.current.isError).toBe(true));
  expect(mocks.request).toHaveBeenCalledTimes(1);
  expect(hook.result.current.uncertain).toBe(false);
  act(() => hook.result.current.run({ code: 'T03' }));
  await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2));
  expect(mocks.request.mock.calls[1][2].key).not.toBe(
    mocks.request.mock.calls[0][2].key,
  );
});

it('hides a late private result and invalidates only its original tenant', async () => {
  let resolve!: (value: object) => void;
  mocks.request.mockReturnValue(
    new Promise<object>((done) => {
      resolve = done;
    }),
  );
  const saved = vi.fn();
  const hook = command(saved);
  const original = ['tenant', 'owner', 'restaurant', 'branch', 'tables'];
  const other = ['tenant', 'other', 'other', 'branch', 'tables'];
  hook.client.setQueryData(original, []);
  hook.client.setQueryData(other, []);
  act(() => hook.result.current.run({ code: 'T01' }));
  await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1));
  mocks.user = 'other';
  mocks.org = 'other';
  hook.rerender({ path: '/restaurant/tables', method: 'POST' });
  await act(async () => {
    resolve({ qr_token: 'private' });
  });
  await waitFor(() => expect(hook.result.current.isPending).toBe(false));
  expect(saved).not.toHaveBeenCalled();
  expect(hook.result.current.data).toBeUndefined();
  expect(hook.result.current.isSuccess).toBe(false);
  expect(hook.client.getQueryState(original)?.isInvalidated).toBe(true);
  expect(hook.client.getQueryState(other)?.isInvalidated).toBe(false);
});

it('allows a new operation with a new key after matching success', async () => {
  mocks.request.mockResolvedValue({ id: 'table' });
  const hook = command();
  act(() => hook.result.current.run({ code: 'T01' }));
  await waitFor(() => expect(hook.result.current.isSuccess).toBe(true));
  const key = mocks.request.mock.calls[0][2].key;
  act(() => hook.result.current.run({ code: 'T02' }));
  await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2));
  expect(mocks.request.mock.calls[1][2].body).toEqual({ code: 'T02' });
  expect(mocks.request.mock.calls[1][2].key).not.toBe(key);
});

it('retains the original attempt through rapid explicit retries', async () => {
  mocks.request.mockRejectedValue(new Error('No response'));
  const hook = command();
  act(() => hook.result.current.run({ code: 'T01' }));
  await waitFor(() => expect(hook.result.current.isError).toBe(true));
  act(() => {
    hook.result.current.run({ code: 'T02' });
    hook.result.current.run({ code: 'T03' });
  });
  await waitFor(() => expect(hook.result.current.isError).toBe(true));
  expect(mocks.request).toHaveBeenCalledTimes(2);
  expect(mocks.request.mock.calls[1]).toEqual(mocks.request.mock.calls[0]);
});

it.each(['user', 'org', 'branch'] as const)(
  'does not dispatch with a missing %s',
  async (field) => {
    mocks[field] = '';
    const hook = command();
    await act(async () => hook.result.current.run({ code: 'T01' }));
    expect(mocks.request).not.toHaveBeenCalled();
  },
);

it('refuses stale run callbacks after an operation change', async () => {
  const hook = command();
  const staleRun = hook.result.current.run;
  hook.rerender({ path: '/restaurant/settings', method: 'PATCH' });
  await act(async () => staleRun({ code: 'T01' }));
  expect(mocks.request).not.toHaveBeenCalled();
});

it('checks context again before an asynchronously scheduled dispatch', async () => {
  const hook = command();
  act(() => {
    hook.result.current.run({ code: 'T01' });
    mocks.user = 'other';
    hook.rerender({ path: '/restaurant/tables', method: 'POST' });
  });
  await waitFor(() => expect(hook.result.current.isPending).toBe(false));
  expect(mocks.request).not.toHaveBeenCalled();
});

it('does not call an unmounted consumer after success', async () => {
  let resolve!: (value: object) => void;
  mocks.request.mockReturnValue(
    new Promise<object>((done) => {
      resolve = done;
    }),
  );
  const saved = vi.fn();
  const hook = command(saved);
  const original = ['tenant', 'owner', 'restaurant', 'tables'];
  hook.client.setQueryData(original, []);
  act(() => hook.result.current.run({ code: 'T01' }));
  await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1));
  hook.unmount();
  await act(async () => {
    resolve({ qr_token: 'private' });
  });
  expect(saved).not.toHaveBeenCalled();
  expect(hook.client.getQueryState(original)?.isInvalidated).toBe(true);
});
