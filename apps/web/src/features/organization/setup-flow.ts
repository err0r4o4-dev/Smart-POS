export type SetupSaveCache = Record<
  string,
  { payload: string; key: string; saved: boolean }
>;

export function seedSavedSetupSection(
  cache: SetupSaveCache,
  section: string,
  payload: unknown,
) {
  cache[section] = { payload: JSON.stringify(payload), key: '', saved: true };
}

export function setupScreenForStep(step: string): 0 | 1 | 2 {
  if (['profile', 'services', 'tables', 'orders', 'location'].includes(step))
    return 0;
  return step === 'review' ? 2 : 1;
}

export async function saveSetupSections<
  Entry extends { key: string; payload: unknown },
>(
  entries: Entry[],
  cache: SetupSaveCache,
  createKey: () => string,
  write: (entry: Entry, key: string) => Promise<unknown>,
) {
  for (const entry of entries) {
    const payload = JSON.stringify(entry.payload);
    if (cache[entry.key]?.payload !== payload)
      cache[entry.key] = { payload, key: createKey(), saved: false };
    const request = cache[entry.key];
    if (request.saved) continue;
    await write(entry, request.key);
    request.saved = true;
  }
}
