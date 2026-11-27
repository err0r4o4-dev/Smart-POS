import { beforeEach, describe, expect, it } from 'vitest';
import {
  createGuestDraftStore,
  GUEST_DRAFT_TTL_MS,
  type DraftLine,
  type DraftLockManager,
} from './guest-draft';

const ITEM = '11111111-1111-4111-8111-111111111111';
const GROUP = '22222222-2222-4222-8222-222222222222';
const OPTION_A = '33333333-3333-4333-8333-333333333333';
const OPTION_B = '44444444-4444-4444-8444-444444444444';
const T0 = Date.UTC(2026, 10, 26, 3, 0, 0);

const line = (quantity = '1.000', option = OPTION_A): DraftLine => ({
  variant_id: ITEM,
  quantity,
  choices: [{ group_id: GROUP, option_ids: [option] }],
});

// Serializes callbacks per lock name, like the Web Locks API.
function fakeLocks(): DraftLockManager {
  const tails = new Map<string, Promise<unknown>>();
  return {
    request(name, _options, callback) {
      const previous = tails.get(name) ?? Promise.resolve();
      const run = previous.then(() => callback());
      tails.set(
        name,
        run.catch(() => undefined),
      );
      return run;
    },
  };
}

function setup(start = T0) {
  let now = start;
  let ids = 0;
  const locks = fakeLocks();
  const make = () =>
    createGuestDraftStore({
      storage: localStorage,
      locks,
      now: () => now,
      newId: () => `draft-${++ids}`,
    });
  return {
    store: make(),
    other: make(),
    advance: (ms: number) => {
      now += ms;
    },
  };
}

beforeEach(() => localStorage.clear());

describe('guest draft', () => {
  it('creates a draft that expires 24 hours after the accepted edit', async () => {
    const { store } = setup();
    const result = await store.create('noodle-house', [line()]);
    expect(result).toEqual({
      status: 'ok',
      draft: {
        version: 1,
        restaurant: 'noodle-house',
        id: 'draft-1',
        revision: 1,
        lines: [line()],
        updated_at: T0,
        expires_at: T0 + 24 * 60 * 60 * 1000,
      },
    });
    expect(GUEST_DRAFT_TTL_MS).toBe(24 * 60 * 60 * 1000);
  });

  it('keeps two lines for the same item with different choices distinct', async () => {
    const { store } = setup();
    const lines = [line('1.000', OPTION_A), line('2.000', OPTION_B)];
    await store.create('noodle-house', lines);
    expect((await store.read('noodle-house'))?.lines).toEqual(lines);
  });

  it('treats the exact expiry instant as expired and reading never extends expiry', async () => {
    const { store, advance } = setup();
    await store.create('noodle-house', [line()]);
    advance(GUEST_DRAFT_TTL_MS - 1);
    expect((await store.read('noodle-house'))?.expires_at).toBe(
      T0 + GUEST_DRAFT_TTL_MS,
    );
    advance(1);
    expect(await store.read('noodle-house')).toBeNull();
  });

  it('advances revision and expiry together on a current edit', async () => {
    const { store, advance } = setup();
    await store.create('noodle-house', [line()]);
    advance(60_000);
    const result = await store.edit(
      'noodle-house',
      { id: 'draft-1', revision: 1 },
      [line('3.000')],
    );
    expect(result).toMatchObject({
      status: 'ok',
      draft: {
        id: 'draft-1',
        revision: 2,
        lines: [line('3.000')],
        updated_at: T0 + 60_000,
        expires_at: T0 + 60_000 + GUEST_DRAFT_TTL_MS,
      },
    });
  });

  it('rejects a stale revision and a retried edit without writing', async () => {
    const { store, other, advance } = setup();
    await store.create('noodle-house', [line()]);
    await other.edit('noodle-house', { id: 'draft-1', revision: 1 }, [
      line('2.000'),
    ]);
    const before = localStorage.getItem('guest-draft:v1:noodle-house');
    advance(60_000);
    const stale = await store.edit(
      'noodle-house',
      { id: 'draft-1', revision: 1 },
      [line('5.000')],
    );
    expect(stale).toMatchObject({
      status: 'conflict',
      current: {
        revision: 2,
        lines: [line('2.000')],
        expires_at: T0 + GUEST_DRAFT_TTL_MS,
      },
    });
    expect(localStorage.getItem('guest-draft:v1:noodle-house')).toBe(before);
  });

  it('lets only one of two concurrent edits at the same revision succeed', async () => {
    const { store, other } = setup();
    await store.create('noodle-house', [line()]);
    const results = await Promise.all([
      store.edit('noodle-house', { id: 'draft-1', revision: 1 }, [
        line('2.000'),
      ]),
      other.edit('noodle-house', { id: 'draft-1', revision: 1 }, [
        line('4.000'),
      ]),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([
      'conflict',
      'ok',
    ]);
    expect((await store.read('noodle-house'))?.revision).toBe(2);
  });

  it('waits for another tab holding the lock and re-reads before writing', async () => {
    const locks = fakeLocks();
    const store = createGuestDraftStore({
      storage: localStorage,
      locks,
      now: () => T0,
      newId: () => 'draft-mine',
    });
    let release!: () => void;
    const otherTabHolds = locks.request(
      'guest-draft:v1:noodle-house',
      { mode: 'exclusive' },
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    const mine = store.create('noodle-house', [line('1.000')]);
    await Promise.resolve();
    expect(localStorage.length).toBe(0);
    // The other tab commits its own draft while it still holds the lock.
    localStorage.setItem(
      'guest-draft:v1:noodle-house',
      JSON.stringify({
        version: 1,
        restaurant: 'noodle-house',
        id: 'draft-other',
        revision: 1,
        lines: [line('2.000')],
        updated_at: T0,
        expires_at: T0 + GUEST_DRAFT_TTL_MS,
      }),
    );
    release();
    await otherTabHolds;
    expect(await mine).toMatchObject({
      status: 'conflict',
      current: { id: 'draft-other', lines: [line('2.000')] },
    });
  });

  it('lets only one of two concurrent creates succeed', async () => {
    const { store, other } = setup();
    const results = await Promise.all([
      store.create('noodle-house', [line('1.000')]),
      other.create('noodle-house', [line('2.000')]),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([
      'conflict',
      'ok',
    ]);
  });

  it('does not resurrect or overwrite through an expired or replaced identity', async () => {
    const { store, advance } = setup();
    await store.create('noodle-house', [line()]);
    advance(GUEST_DRAFT_TTL_MS);
    const expiredEdit = await store.edit(
      'noodle-house',
      { id: 'draft-1', revision: 1 },
      [line('2.000')],
    );
    expect(expiredEdit).toEqual({ status: 'unavailable' });
    expect(await store.read('noodle-house')).toBeNull();

    const recreated = await store.create('noodle-house', [line('7.000')]);
    expect(recreated).toMatchObject({
      status: 'ok',
      draft: { id: 'draft-2', revision: 1 },
    });
    const oldIdentity = await store.edit(
      'noodle-house',
      { id: 'draft-1', revision: 1 },
      [line('9.000')],
    );
    expect(oldIdentity).toMatchObject({
      status: 'conflict',
      current: { id: 'draft-2', lines: [line('7.000')] },
    });
  });

  it('keeps each restaurant draft separate', async () => {
    const { store } = setup();
    await store.create('noodle-house', [line()]);
    expect(await store.read('rice-house')).toBeNull();
    localStorage.setItem(
      'guest-draft:v1:rice-house',
      localStorage.getItem('guest-draft:v1:noodle-house')!,
    );
    expect(await store.read('rice-house')).toBeNull();
  });

  it.each([
    ['empty', []],
    ['zero quantity', [line('0.000')]],
    ['inexact quantity', [line('1.0001')]],
    ['excess quantity', [line('1000000.001')]],
    ['malformed item', [{ ...line(), variant_id: 'not-a-uuid' }]],
    [
      'duplicate group',
      [
        {
          ...line(),
          choices: [
            { group_id: GROUP, option_ids: [OPTION_A] },
            { group_id: GROUP, option_ids: [OPTION_B] },
          ],
        },
      ],
    ],
    [
      'duplicate option',
      [
        {
          ...line(),
          choices: [{ group_id: GROUP, option_ids: [OPTION_A, OPTION_A] }],
        },
      ],
    ],
    ['too many lines', Array.from({ length: 101 }, () => line())],
  ])('rejects %s input without writing', async (_name, lines) => {
    const { store } = setup();
    expect(await store.create('noodle-house', lines as DraftLine[])).toEqual({
      status: 'invalid',
    });
    expect(localStorage.length).toBe(0);
  });

  it('ignores malformed stored data rather than trusting it', async () => {
    const { store } = setup();
    localStorage.setItem(
      'guest-draft:v1:noodle-house',
      '{"version":1,"lines":"x"}',
    );
    expect(await store.read('noodle-house')).toBeNull();
    expect(await store.create('noodle-house', [line()])).toMatchObject({
      status: 'ok',
    });
  });

  it('refuses to write when cross-tab serialization is unavailable', async () => {
    const store = createGuestDraftStore({
      storage: localStorage,
      locks: undefined,
      now: () => T0,
      newId: () => 'draft-1',
    });
    expect(await store.create('noodle-house', [line()])).toEqual({
      status: 'unavailable',
    });
    expect(localStorage.length).toBe(0);
  });

  it('reports unavailable when storage rejects the write', async () => {
    const storage = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('quota exceeded');
      },
    };
    const store = createGuestDraftStore({
      storage,
      locks: fakeLocks(),
      now: () => T0,
      newId: () => 'draft-1',
    });
    expect(await store.create('noodle-house', [line()])).toEqual({
      status: 'unavailable',
    });
  });
});
