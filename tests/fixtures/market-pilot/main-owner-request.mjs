import { isDeepStrictEqual } from 'node:util';
import { prepareMainCatalog } from './main-package.mjs';

const defaultOrigin = 'http://127.0.0.1:8088';
const organizations = '/api/v1/organizations';
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const resources = new Set(['categories', 'units', 'products', 'inventory/locations', 'pos/terminals']);

// Evaluate on an owner page after interactive sign-in. Both the HttpOnly cookie
// and CSRF value stay in the page; this module does not start an import or log in.
export async function createMarketOwnerRequest(page, { origin = defaultOrigin, draftOnly = false, ownerID } = {}) {
  if (origin !== defaultOrigin && origin !== 'http://localhost:8088') throw new Error('Invalid SmartPOS gateway on port 8088');
  if (ownerID !== undefined && !uuid.test(ownerID)) throw new Error('Invalid market owner ID');
  const binding = ownerID === undefined ? undefined : crypto.randomUUID();
  function checkPage() {
    if (new URL(page.url()).origin !== origin) throw new Error(`Open SmartPOS on ${origin}`);
  }

  async function exchange(operation) {
    checkPage();
    return page.evaluate(async ({ origin: target, path, method, body, idempotencyKey, ownerID, binding }) => {
      if (location.origin !== target) return { ok: false, status: 0 };
      const send = (url, options = {}) => fetch(url, {
        ...options, credentials: 'same-origin', redirect: 'error', cache: 'no-store',
        signal: AbortSignal.timeout(15000),
      });
      if (!method || ownerID) {
        const response = await send('/api/v1/auth/mfa');
        if (!response.ok) return { ok: false, status: response.status, session: true };
        const { data } = await response.json();
        if (data?.enabled !== true || data.session_verified !== true) return { ok: false, session: true };
        if (!ownerID) return { ok: true };
      }
      const headers = {};
      if (ownerID || method !== 'GET') {
        const current = await send('/api/v1/auth/me');
        if (!current.ok) return { ok: false, status: current.status, session: true };
        const { data } = await current.json();
        if (typeof data?.csrf_token !== 'string' || !data.csrf_token || (ownerID && data.user?.id !== ownerID)) {
          return { ok: false, session: true };
        }
        if (ownerID) {
          // Bind to the original session without moving its CSRF value out of the page.
          const key = Symbol.for(`smartpos-market-owner:${binding}`);
          if (!method) {
            Object.defineProperty(globalThis, key, { value: data.csrf_token, configurable: true });
            return { ok: true };
          }
          if (globalThis[key] !== data.csrf_token) return { ok: false, session: true };
        }
        if (method !== 'GET') {
          headers['X-CSRF-Token'] = data.csrf_token;
          headers['Content-Type'] = 'application/json';
        }
      }
      if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;
      const response = await send(path, { method, headers, body: JSON.stringify(body) });
      if (!response.ok) return { ok: false, status: response.status };
      return { ok: true, data: (await response.json()).data };
    }, { origin, ownerID, binding, ...operation });
  }

  const proof = await exchange({});
  if (!proof.ok) throw new Error('Owner sign-in with MFA is required');
  const { shops } = await prepareMainCatalog();
  const approved = new Map(shops.map(shop => [shop.organization.code, shop]));
  const scope = new Map();
  function deny() { throw new Error('Operation outside market release scope'); }

  return async ({ path, method = 'GET', body, idempotencyKey }) => {
    if (typeof path !== 'string' || !path.startsWith(`${organizations}/`) && path !== organizations) deny();
    const url = new URL(path, origin);
    if (url.origin !== origin || url.hash || url.pathname + url.search !== path) deny();
    let shop;
    if (path === organizations) {
      shop = approved.get(body?.code);
      if (method !== 'POST' || !shop || !uuid.test(idempotencyKey) ||
        !isDeepStrictEqual(body, {
          ...shop.organization, address: shop.zone,
          branch: { code: 'MAIN', name: shop.zone, status: 'ACTIVE' },
        })) deny();
    } else {
      const [id, ...segments] = url.pathname.slice(organizations.length + 1).split('/');
      const shopScope = scope.get(id);
      if (!shopScope || idempotencyKey !== undefined) deny();
      const resource = segments.join('/');
      if (resources.has(resource)) {
        if (method !== 'GET' && method !== 'POST') deny();
      } else if (resource === 'storefront') {
        if (method !== 'GET' && (method !== 'PUT' ||
          body?.slug !== shopScope.settings.slug || body.accepting_orders !== false ||
          (draftOnly && body.published !== false))) deny();
      } else if (resource === 'storefront/products') {
        if (method !== 'GET') deny();
      } else if (segments.length !== 3 || segments[0] !== 'storefront' ||
        segments[1] !== 'products' || !uuid.test(segments[2]) || method !== 'PUT') deny();
    }
    const reply = await exchange({ path, method, body, idempotencyKey });
    if (!reply.ok) {
      if (reply.session) throw new Error('Market owner session or MFA assurance changed');
      throw new Error(`Market owner API returned HTTP ${reply.status}`);
    }
    if (shop) {
      const { organization, membership } = reply.data ?? {};
      if (!uuid.test(organization?.id) || organization.code !== shop.organization.code ||
        membership?.role !== 'OWNER' || membership.status !== 'ACTIVE' || (ownerID && membership.user_id !== ownerID) ||
        (scope.has(organization.id) && scope.get(organization.id) !== shop)) {
        throw new Error('Could not confirm owner access to the approved market organization');
      }
      scope.set(organization.id, shop);
    }
    return reply.data;
  };
}
