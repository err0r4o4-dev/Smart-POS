import assert from 'node:assert/strict';
import test from 'node:test';
import { stageMarketCatalogs } from './main-import.mjs';

const id = index => `f0000000-0000-4000-8000-${String(index).padStart(12, '0')}`;

function ownerFixture({ collision = false, wrongOwner = false } = {}) {
  let ids = 0;
  const stores = new Map();
  const keys = new Map();
  const writes = [];
  const request = async ({ path, method, body, idempotencyKey }) => {
    if (method === 'POST') writes.push(path);
    if (path === '/api/v1/organizations') {
      assert.equal(method, 'POST');
      assert.match(idempotencyKey, /^[a-f0-9-]{36}$/);
      if (collision) throw new Error('Organization code conflict');
      if (!keys.has(idempotencyKey)) {
        const org = id(++ids);
        const record = {
          organization: { ...body, id: org, status: 'ACTIVE', currency: 'THB' },
          membership: { role: wrongOwner ? 'MANAGER' : 'OWNER', status: 'ACTIVE' },
          branches: [{ ...body.branch, id: id(++ids), organization_id: org, is_main: true }],
        };
        keys.set(idempotencyKey, record);
        stores.set(org, { categories: [], units: [], products: [] });
      }
      return keys.get(idempotencyKey);
    }
    const [, org, resource] = /^\/api\/v1\/organizations\/([^/]+)\/([^?]+)(?:\?.*)?$/.exec(path) ?? [];
    const store = stores.get(org);
    assert.ok(store && ['categories', 'units', 'products'].includes(resource), 'unexpected organization, resource or public mutation');
    if (method === 'GET') {
      const items = new URL(path, 'http://example.test').searchParams.get('status') === 'ARCHIVED' ? [] : store[resource];
      return { total: items.length, items: structuredClone(items) };
    }
    assert.equal(method, 'POST');
    const record = { ...body, id: id(++ids), organization_id: org };
    if (resource === 'products') record.variants = body.variants.map(variant => ({
      ...variant, id: id(++ids), product_id: record.id, organization_id: org, currency: 'THB',
    }));
    store[resource].push(record);
    return structuredClone(record);
  };
  return { request, stores, writes };
}

test('stages 195 shop-scoped catalog items with exact images and retries without inserting duplicates', async () => {
  const fixture = ownerFixture();
  const first = await stageMarketCatalogs(fixture.request);
  assert.equal(first.length, 13);
  assert.equal(first.reduce((count, shop) => count + shop.variants.size, 0), 195);
  const dishes = [...fixture.stores.values()].flatMap(store => store.products);
  assert.equal(dishes.length, 195);
  const noodles = dishes.find(item => item.variants[0].sku === 'MKT-NIT-01');
  assert.equal(noodles.variants[0].selling_price, '85.00');
  assert.equal(noodles.variants[0].attributes.storefront_image_url, '/images/market-sip-soi/v2/menu/MKT-NIT-01.webp');
  const writes = fixture.writes.length;
  assert.deepEqual(await stageMarketCatalogs(fixture.request), first);
  assert.equal(fixture.writes.length - writes, 13, 'only organization idempotency replays are allowed');
});

test('halts on organization collisions, missing owner authority or changed persisted data', async () => {
  for (const [options, pattern] of [[{ collision: true }, /code conflict/], [{ wrongOwner: true }, /OWNER/]]) {
    const fixture = ownerFixture(options);
    await assert.rejects(stageMarketCatalogs(fixture.request), pattern);
    assert.deepEqual(fixture.writes, ['/api/v1/organizations']);
  }
  const fixture = ownerFixture();
  await stageMarketCatalogs(fixture.request);
  fixture.stores.values().next().value.products[0].variants[0].selling_price = '1.00';
  const writes = fixture.writes.length;
  await assert.rejects(stageMarketCatalogs(fixture.request), /selling_price/);
  assert.deepEqual(fixture.writes.slice(writes), ['/api/v1/organizations']);
});

test('reuses a product when the server committed creation but the response was lost', async () => {
  const fixture = ownerFixture();
  let attempted = false;
  await assert.rejects(stageMarketCatalogs(async operation => {
    const result = await fixture.request(operation);
    if (!attempted && operation.method === 'POST' && operation.path.endsWith('/products')) {
      attempted = true;
      throw new Error('Response lost after commit');
    }
    return result;
  }), /Response lost/);
  const first = fixture.stores.values().next().value.products[0];
  await stageMarketCatalogs(fixture.request);
  const products = [...fixture.stores.values()].flatMap(shop => shop.products);
  assert.equal(products.find(product => product.id === first.id).variants[0].id, first.variants[0].id);
  assert.equal(new Set(products.map(product => product.variants[0].sku)).size, 195);
  assert.equal(products.length, 195);
});

test('does not write catalog data if the tenant inventory contains foreign records', async () => {
  const fixture = ownerFixture();
  await assert.rejects(stageMarketCatalogs(async operation => {
    const result = await fixture.request(operation);
    if (operation.method === 'GET' && operation.path.includes('/categories?')) {
      return { total: 1, items: [{ id: id(999), organization_id: id(998) }] };
    }
    return result;
  }), /unexpected organization/);
  assert.deepEqual(fixture.writes, ['/api/v1/organizations']);
});
