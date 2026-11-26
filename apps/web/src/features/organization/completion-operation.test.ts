import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  CompletionRecoveryError,
  finishCompletion,
  reserveCompletionKey,
} from './completion-operation';

const first = 'a2000000-0000-4000-8000-000000000001';
const second = 'a2000000-0000-4000-8000-000000000002';
const scope = { organizationID: 'shop', branchID: '' };
beforeEach(() => sessionStorage.clear());
afterEach(() => vi.restoreAllMocks());

it('retains only the UUID and reuses it after a new page instance', () => {
  expect(reserveCompletionKey('owner', scope, () => first)).toBe(first);
  expect(reserveCompletionKey('owner', scope, () => second)).toBe(first);
  expect(sessionStorage.length).toBe(1);
  expect(sessionStorage.getItem(sessionStorage.key(0)!)).toBe(first);
});

it.each([
  ['other', scope],
  ['owner', { ...scope, organizationID: 'other' }],
  ['owner', { ...scope, branchID: 'branch' }],
])(
  'isolates completion from another user, organization or branch: %s %j',
  (user, other) => {
    reserveCompletionKey('owner', scope, () => first);
    expect(reserveCompletionKey(user, other, () => second)).toBe(second);
    expect(reserveCompletionKey('owner', scope, () => second)).toBe(first);
  },
);

it('does not confuse scope values containing delimiters', () => {
  reserveCompletionKey('owner:a', scope, () => first);
  expect(
    reserveCompletionKey(
      'owner',
      { organizationID: 'a:shop', branchID: '' },
      () => second,
    ),
  ).toBe(second);
});

it('clears only the matching confirmed operation', () => {
  reserveCompletionKey('owner', scope, () => first);
  finishCompletion('owner', scope, second);
  expect(reserveCompletionKey('owner', scope, () => second)).toBe(first);
  finishCompletion('other', scope, first);
  expect(reserveCompletionKey('owner', scope, () => second)).toBe(first);
  finishCompletion('owner', scope, first);
  expect(reserveCompletionKey('owner', scope, () => second)).toBe(second);
});

it('retains a safe replay key if cleanup fails', () => {
  reserveCompletionKey('owner', scope, () => first);
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementationOnce(() => {
    throw new Error('denied');
  });
  expect(() => finishCompletion('owner', scope, first)).not.toThrow();
  expect(reserveCompletionKey('owner', scope, () => second)).toBe(first);
});

it.each(['getItem', 'setItem'] as const)(
  'blocks submission when storage %s fails',
  (method) => {
    vi.spyOn(Storage.prototype, method).mockImplementationOnce(() => {
      throw new Error('denied');
    });
    expect(() => reserveCompletionKey('owner', scope, () => first)).toThrow(
      CompletionRecoveryError,
    );
  },
);

it('blocks when storage silently discards the key', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(
    () => undefined,
  );
  expect(() => reserveCompletionKey('owner', scope, () => first)).toThrow(
    CompletionRecoveryError,
  );
});

it('does not replace a corrupted stored operation', () => {
  reserveCompletionKey('owner', scope, () => first);
  const name = sessionStorage.key(0)!;
  sessionStorage.setItem(name, 'corrupt');
  const create = vi.fn(() => second);
  expect(() => reserveCompletionKey('owner', scope, create)).toThrow(
    CompletionRecoveryError,
  );
  expect(create).not.toHaveBeenCalled();
  expect(sessionStorage.getItem(name)).toBe('corrupt');
});

it.each([
  ['', scope, first],
  ['owner', { ...scope, organizationID: '' }, first],
  ['owner', scope, 'invalid'],
])(
  'blocks missing identity or an invalid generated key',
  (user, context, key) => {
    expect(() => reserveCompletionKey(user, context, () => key)).toThrow(
      CompletionRecoveryError,
    );
    expect(sessionStorage.length).toBe(0);
  },
);
