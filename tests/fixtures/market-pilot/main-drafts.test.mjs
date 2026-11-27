import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareMainCatalog } from './main-package.mjs';
import * as drafts from './main-rollout.mjs';

const origin = 'http://localhost:8088';
const ownerID = 'f0000000-0000-4000-8000-000000000001';
const { shops } = await prepareMainCatalog();
const directory = '/api/v1/storefronts';

function fixture({ loseReply = false, visible = false, wrongPrice = false } = {}) {
  const release = { id: 'market-pilot-v2', target: 'http://127.0.0.1:8088', shops: structuredClone(shops) };
  const events = [], options = [], saved = new Map();
  let attempts = 0;
  const ids = n => `f0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const staged = shops.map((shop, i) => ({ slug: shop.settings.slug, org: ids(i + 2), branchId: ids(i + 20),
    variants: new Map(shop.items.map((item, j) => [item.sku, ids(100 + i * 15 + j)])) }));
  const input = { page: { url: () => `${origin}/login` }, ownerID, release, journal: async event => events.push(event) };
  const io = {
    fetcher: async (url, request) => {
      assert.equal(url.origin, origin);
      assert.equal(request.method, 'GET');
      assert.equal(request.credentials, 'omit');
      if (url.pathname === '/health/ready') return new Response('ready');
      if (url.pathname === directory) return Response.json({ data: [{ slug: 'retained-shop' }] }, { headers: { 'x-smartpos-store-mode': 'multi' } });
      if (url.pathname === `${directory}/retained-shop/products`) return Response.json({ data: { items: [] } });
      if (url.pathname.startsWith(`${directory}/market-`)) return new Response(null, { status: visible ? 200 : 404 });
      assert.fail(`Unexpected public read: ${url.pathname}`);
    },
    openOwner: async (_page, actual) => {
      options.push(actual);
      return async operation => {
        if (operation.method === 'POST') {
          attempts++;
          assert.equal(events.at(-1).state, 'attempted');
          if (loseReply) throw new Error('Reply lost');
          return { organization: { id: staged[0].org }, branches: [{ id: staged[0].branchId }] };
        }
        const [, org, resource] = /^\/api\/v1\/organizations\/([^/]+)\/(storefront(?:\/products)?|categories|products)(?:\?.*)?$/.exec(operation.path);
        return saved.get(org)?.[resource];
      };
    },
    stage: async request => {
      for (let i = 0; i < 2; i++) await request({ path: '/api/v1/organizations', method: 'POST', body: shops[i].organization });
      return staged;
    },
    saveDraft: async (_request, shop, row, show) => {
      assert.equal(show, false);
      const settings = { ...shop.settings, branch_id: row.branchId, terminal_id: ids(400), stock_location_id: ids(401),
        cover_image_url: shop.cover_image_url, revision: 16 };
      const categories = [...new Set(shop.items.map(item => item.category))].map((name, i) => ({ id: ids(i + 600), name, organization_id: row.org }));
      const items = shop.items.map(item => ({ sku: item.sku, variant_id: row.variants.get(item.sku), product_name: item.name,
        unit: item.unit, unit_price: wrongPrice ? '0.00' : item.price, is_sold_out: item.is_sold_out, published: true }));
      const products = shop.items.map(item => ({ organization_id: row.org, category_id: categories.find(c => c.name === item.category).id,
        name: item.name, variants: [{ id: row.variants.get(item.sku), sku: item.sku, attributes: { storefront_image_url: item.image_url } }] }));
      saved.set(row.org, { storefront: settings, 'storefront/products': { items, total: items.length },
        products: { items: products, total: products.length }, categories: { items: categories, total: categories.length } });
      return settings;
    },
  };
  return { input, io, events, options, attempts: () => attempts };
}

// Access through the module namespace so a missing entrypoint is a test failure, not a module-load error.
function run(input, io) {
  assert.equal(typeof drafts.runMarketDrafts, 'function', 'The draft-only entrypoint is missing');
  return drafts.runMarketDrafts(input, io);
}

test('imports only hidden closed drafts through the verified dedicated owner', async () => {
  const { input, io, options, events } = fixture();
  assert.deepEqual(await run(input, io), { shops: 13, menus: 195, retained: 1 });
  assert.deepEqual(options, [{ origin, ownerID, draftOnly: true }]);
  assert.equal(events.filter(event => event.state === 'draft-verified').length, 13);
});

test('a lost write response remains attempted and stops all later writes', async () => {
  const { input, io, events, attempts } = fixture({ loseReply: true });
  await assert.rejects(() => run(input, io), /Reply lost/);
  assert.equal(attempts(), 1);
  assert.deepEqual(events.map(event => event.state), ['attempted']);
});

test('refuses catalog drift before obtaining an owner writer', async () => {
  const { input, io, options } = fixture();
  input.release.shops[0].items[0].price = '0.01';
  await assert.rejects(() => run(input, io), /catalog/i);
  assert.deepEqual(options, []);
});

test('private verification rejects wrong menu prices', async () => {
  const { input, io } = fixture({ wrongPrice: true });
  await assert.rejects(() => run(input, io), /unit_price/);
});

test('public verification rejects any directly reachable draft', async () => {
  const { input, io } = fixture({ visible: true });
  await assert.rejects(() => run(input, io), /404/);
});
