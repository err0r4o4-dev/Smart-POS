type CompletionScope = { organizationID: string; branchID: string };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CompletionRecoveryError extends Error {
  constructor() {
    super('Completion recovery storage is unavailable');
  }
}

function storageName(userID: string, scope: CompletionScope) {
  if (!userID.trim() || !scope.organizationID.trim())
    throw new CompletionRecoveryError();
  return `smartpos-completion:${JSON.stringify([userID, scope.organizationID, scope.branchID])}`;
}

export function reserveCompletionKey(
  userID: string,
  scope: CompletionScope,
  createKey: () => string,
): string {
  try {
    const name = storageName(userID, scope);
    const saved = sessionStorage.getItem(name);
    if (saved !== null) {
      if (!uuid.test(saved)) throw new CompletionRecoveryError();
      return saved;
    }
    const key = createKey();
    if (!uuid.test(key)) throw new CompletionRecoveryError();
    sessionStorage.setItem(name, key);
    if (sessionStorage.getItem(name) !== key)
      throw new CompletionRecoveryError();
    return key;
  } catch {
    throw new CompletionRecoveryError();
  }
}

export function finishCompletion(
  userID: string,
  scope: CompletionScope,
  key: string,
) {
  try {
    const name = storageName(userID, scope);
    if (uuid.test(key) && sessionStorage.getItem(name) === key)
      sessionStorage.removeItem(name);
  } catch {
    // Retaining a confirmed key is safe: the server replays the committed result.
  }
}
