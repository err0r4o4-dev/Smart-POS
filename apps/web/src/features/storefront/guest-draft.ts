import { exactDecimal, MAX_LINE_QUANTITY } from '../../lib/pos-api';

// Native guest saved draft (B14, T3.2). It stores selections and quantities
// only: never prices, quotes, table/session/order proof or payment state.
// The current checkout must revalidate menu, choices and prices.

export const GUEST_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_LINES = 100;
const MAX_CHOICES = 50;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const restaurantPattern = /^[a-z][a-z0-9-]{2,49}$/;

export interface DraftChoice {
  group_id: string;
  option_ids: string[];
}
export interface DraftLine {
  variant_id: string;
  quantity: string;
  choices: DraftChoice[];
}
export interface GuestDraft {
  version: 1;
  restaurant: string;
  id: string;
  revision: number;
  lines: DraftLine[];
  updated_at: number;
  expires_at: number;
}
export interface DraftIdentity {
  id: string;
  revision: number;
}
export type DraftResult =
  | { status: 'ok'; draft: GuestDraft }
  | { status: 'conflict'; current: GuestDraft | null }
  | { status: 'invalid' }
  | { status: 'unavailable' };

export interface DraftStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}
// Subset of the Web Locks API; exclusive locks serialize same-origin tabs.
export interface DraftLockManager {
  request<T>(
    name: string,
    options: { mode: 'exclusive' },
    callback: () => Promise<T> | T,
  ): Promise<T>;
}
export interface GuestDraftDeps {
  storage: DraftStorage | undefined;
  locks: DraftLockManager | undefined;
  now: () => number;
  newId: () => string;
}

const keyFor = (restaurant: string) => `guest-draft:v1:${restaurant}`;

function validLines(lines: unknown): lines is DraftLine[] {
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > MAX_LINES)
    return false;
  return lines.every((line) => {
    if (typeof line !== 'object' || line === null) return false;
    const { variant_id, quantity, choices } = line as DraftLine;
    if (typeof variant_id !== 'string' || !uuid.test(variant_id)) return false;
    const units =
      typeof quantity === 'string' ? exactDecimal(quantity, 3) : null;
    if (units === null || units <= 0n || units > MAX_LINE_QUANTITY)
      return false;
    if (!Array.isArray(choices) || choices.length > MAX_CHOICES) return false;
    const groups = new Set<string>();
    return choices.every((choice: DraftChoice) => {
      if (typeof choice !== 'object' || choice === null) return false;
      const { group_id, option_ids } = choice;
      if (typeof group_id !== 'string' || !uuid.test(group_id)) return false;
      if (groups.has(group_id)) return false;
      groups.add(group_id);
      if (!Array.isArray(option_ids) || option_ids.length > MAX_CHOICES)
        return false;
      const options = new Set<string>();
      return option_ids.every((option) => {
        if (typeof option !== 'string' || !uuid.test(option)) return false;
        if (options.has(option)) return false;
        options.add(option);
        return true;
      });
    });
  });
}

function parse(raw: string | null, restaurant: string): GuestDraft | null {
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as GuestDraft;
    if (
      value?.version !== 1 ||
      value.restaurant !== restaurant ||
      typeof value.id !== 'string' ||
      value.id === '' ||
      !Number.isSafeInteger(value.revision) ||
      value.revision < 1 ||
      !Number.isSafeInteger(value.updated_at) ||
      value.expires_at !== value.updated_at + GUEST_DRAFT_TTL_MS ||
      !validLines(value.lines)
    )
      return null;
    return value;
  } catch {
    return null;
  }
}

export function createGuestDraftStore(deps: GuestDraftDeps) {
  const live = (restaurant: string): GuestDraft | null => {
    let raw: string | null;
    try {
      raw = deps.storage?.getItem(keyFor(restaurant)) ?? null;
    } catch {
      return null;
    }
    const draft = parse(raw, restaurant);
    return draft && deps.now() < draft.expires_at ? draft : null;
  };

  // Re-reads and writes inside one exclusive lock so that a decision is
  // never based on a snapshot another tab has since replaced.
  const write = async (
    restaurant: string,
    lines: DraftLine[],
    decide: (current: GuestDraft | null) => DraftResult | DraftIdentity | null,
  ): Promise<DraftResult> => {
    if (!restaurantPattern.test(restaurant) || !validLines(lines))
      return { status: 'invalid' };
    const { storage, locks } = deps;
    if (!storage || !locks) return { status: 'unavailable' };
    try {
      return await locks.request(
        keyFor(restaurant),
        { mode: 'exclusive' },
        (): DraftResult => {
          const current = live(restaurant);
          const outcome = decide(current);
          if (outcome && 'status' in outcome) return outcome;
          const at = deps.now();
          const draft: GuestDraft = {
            version: 1,
            restaurant,
            id: outcome ? outcome.id : deps.newId(),
            revision: outcome ? outcome.revision + 1 : 1,
            lines: structuredClone(lines),
            updated_at: at,
            expires_at: at + GUEST_DRAFT_TTL_MS,
          };
          try {
            storage.setItem(keyFor(restaurant), JSON.stringify(draft));
          } catch {
            return { status: 'unavailable' };
          }
          return { status: 'ok', draft };
        },
      );
    } catch {
      return { status: 'unavailable' };
    }
  };

  return {
    // Reading never writes or extends expiry.
    async read(restaurant: string): Promise<GuestDraft | null> {
      return live(restaurant);
    },
    // Creation expects no live draft; it never edits an existing one.
    create(restaurant: string, lines: DraftLine[]) {
      return write(restaurant, lines, (current) =>
        current ? { status: 'conflict', current } : null,
      );
    },
    // An edit must name the live draft's identity and observed revision. An
    // expired or replaced identity cannot recreate or overwrite the draft.
    edit(restaurant: string, expected: DraftIdentity, lines: DraftLine[]) {
      return write(restaurant, lines, (current) => {
        if (!current) return { status: 'unavailable' };
        if (
          current.id !== expected.id ||
          current.revision !== expected.revision
        )
          return { status: 'conflict', current };
        return current;
      });
    },
  };
}

function browserLocks(): DraftLockManager | undefined {
  if (typeof navigator === 'undefined' || !('locks' in navigator))
    return undefined;
  return navigator.locks as unknown as DraftLockManager;
}
function browserStorage(): DraftStorage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function browserGuestDraftStore() {
  return createGuestDraftStore({
    storage: browserStorage(),
    locks: browserLocks(),
    now: () => Date.now(),
    newId: () => crypto.randomUUID(),
  });
}
