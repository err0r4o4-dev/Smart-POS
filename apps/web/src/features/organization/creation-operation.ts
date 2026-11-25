export class CreationRecoveryError extends Error {
  constructor(public reason: 'changed' | 'storage') {
    super('Creation recovery requires attention');
  }
}

export async function reserveCreationKey(
  userID: string,
  payload: string,
  createKey: () => string,
): Promise<string> {
  try {
    if (!userID) throw new CreationRecoveryError('storage');
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(payload),
    );
    const fingerprint = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join('');
    const name = `smartpos-creation:${userID}`;
    const raw = sessionStorage.getItem(name);
    if (raw !== null) {
      if (raw.length > 256) throw new CreationRecoveryError('storage');
      const saved: unknown = JSON.parse(raw);
      if (!valid(saved)) throw new CreationRecoveryError('storage');
      if (saved.fingerprint !== fingerprint)
        throw new CreationRecoveryError('changed');
      return saved.key;
    }
    const key = createKey();
    if (!uuid.test(key)) throw new CreationRecoveryError('storage');
    // Retain only operation identity and a digest; never persist the shop payload.
    const record = JSON.stringify({ key, fingerprint });
    sessionStorage.setItem(name, record);
    if (sessionStorage.getItem(name) !== record)
      throw new CreationRecoveryError('storage');
    return key;
  } catch (error) {
    if (error instanceof CreationRecoveryError) throw error;
    throw new CreationRecoveryError('storage');
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function valid(value: unknown): value is { key: string; fingerprint: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'key' in value &&
    typeof value.key === 'string' &&
    uuid.test(value.key) &&
    'fingerprint' in value &&
    typeof value.fingerprint === 'string' &&
    /^[0-9a-f]{64}$/.test(value.fingerprint)
  );
}

export function finishCreation(userID: string, key: string) {
  try {
    const name = `smartpos-creation:${userID}`;
    const saved: unknown = JSON.parse(sessionStorage.getItem(name) ?? 'null');
    if (valid(saved) && saved.key === key) sessionStorage.removeItem(name);
  } catch {
    // Retaining a key is safe: the server will return the committed result.
  }
}
