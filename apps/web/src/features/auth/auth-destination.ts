import { paths } from '../../app/routes';

const publicRoutes =
  /^(?:\/|\/areas(?:\/[a-z0-9-]+)?|\/shop(?:\/[a-z0-9-]+(?:\/(?:cart|checkout))?)?)$/i;
const accountRoutes = new Set<string>([
  paths.setup,
  paths.security,
  paths.workspace,
  paths.account,
]);
const publicParameters = new Set([
  'q',
  'area',
  'category',
  'sort',
  'view',
  'fulfillment',
  'filter',
  'page',
]);

export function safeReturnTo(value: string | null): string {
  if (!value || value.length > 2048) return '/';
  if (accountRoutes.has(value)) return value;
  const [pathname, query] = value.split('#', 1)[0].split('?', 2);
  if (!publicRoutes.test(pathname)) return '/';
  const source = new URLSearchParams(query);
  const destination = new URLSearchParams();
  // Never copy tracking or table-access credentials into an authentication URL.
  for (const [key, value] of source) {
    if (publicParameters.has(key)) destination.append(key, value);
  }
  return destination.size ? `${pathname}?${destination}` : pathname;
}

export function authLink(
  path: string,
  destination: string,
  query = new URLSearchParams(),
) {
  const target = safeReturnTo(destination);
  if (target !== '/') query.set('returnTo', target);
  return query.size ? `${path}?${query}` : path;
}

const googleReturnKey = 'smartpos-google-return';

export function saveGoogleReturn(destination: string) {
  try {
    sessionStorage.setItem(
      googleReturnKey,
      JSON.stringify({
        destination: safeReturnTo(destination),
        expires: Date.now() + 10 * 60 * 1000,
      }),
    );
  } catch {
    /* Storage may be disabled. */
  }
}

export function pendingGoogleReturn(): string | null {
  try {
    const data = JSON.parse(sessionStorage.getItem(googleReturnKey) ?? 'null');
    if (typeof data?.destination === 'string' && data.expires > Date.now())
      return safeReturnTo(data.destination);
  } catch {
    /* Treat unreadable storage as no pending navigation. */
  }
  return null;
}

export function clearGoogleReturn() {
  try {
    sessionStorage.removeItem(googleReturnKey);
  } catch {
    /* Storage may be disabled. */
  }
}

const verificationReturnKey = 'smartpos-verification-return';

export function rememberVerificationReturn(
  userId: string,
  destination: string,
) {
  try {
    sessionStorage.setItem(
      verificationReturnKey,
      JSON.stringify({ userId, destination: safeReturnTo(destination) }),
    );
  } catch {
    /* Storage may be disabled. */
  }
}

export function verificationReturn(userId: string): string {
  try {
    const data = JSON.parse(
      sessionStorage.getItem(verificationReturnKey) ?? 'null',
    );
    if (data?.userId === userId && typeof data.destination === 'string') {
      return safeReturnTo(data.destination);
    }
  } catch {
    /* The public home is the fallback. */
  }
  return '/';
}
