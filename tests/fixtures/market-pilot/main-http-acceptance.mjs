import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { text } from 'node:stream/consumers';
import { prepareMainCatalog } from './main-package.mjs';
import { stageMarketCatalogs } from './main-import.mjs';
import { publishMarketShop } from './main-publish.mjs';
import { verifyImage } from './main-verify.mjs';

const { origin, writeOrigin, owner, guest, primary } = JSON.parse(await text(process.stdin));
assert.match(origin, /^http:\/\/127\.0\.0\.1:[0-9]+$/);
assert.notEqual(new URL(origin).port, '8088');
const request = async ({ path, method = 'GET', body, idempotencyKey }, session, expectedStatus) => {
  const url = new URL(path, origin);
  assert.equal(url.origin, origin);
  const headers = {
    Origin: writeOrigin,
    ...(session ? { Cookie: `smartpos_session=${session.token}`, 'X-CSRF-Token': session.csrf } : {}),
    ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
  };
  const response = await fetch(url, { method, headers, body: JSON.stringify(body), redirect: 'error', signal: AbortSignal.timeout(15_000) });
  const result = await response.json();
  if (expectedStatus) {
    assert.equal(response.status, expectedStatus, `${method} ${path}: ${result.error?.code ?? 'unexpected response'}`);
    return result.error?.code;
  }
  assert.ok(response.ok, `${method} ${path}: ${response.status} ${result.error?.code ?? 'unexpected response'}`);
  return result.data;
};
const own = operation => request(operation, owner);
const shops = '/api/v1/storefronts';
const directory = () => request({ path: shops });
const release = await prepareMainCatalog();
const imageIndex = JSON.parse(await readFile(new URL('../../../.local/market-pilot/main-release-v2/asset-index.json', import.meta.url), 'utf8'));
const assets = new Map(imageIndex.map(image => [image.url, image]));
const readImage = async path => {
  const url = new URL(path, origin);
  assert.equal(url.origin, origin);
  assert.ok(url.pathname.startsWith('/images/market-sip-soi/v2/'));
  const response = await fetch(url, { redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(5000) });
  assert.ok(response.ok);
  return response;
};
const { organization } = await own({
  path: '/api/v1/organizations', method: 'POST', idempotencyKey: randomUUID(),
  body: { name: 'Retained test restaurant', code: 'RETAINED-TEST', business_type: 'RESTAURANT', branch: { name: 'Main', code: 'MAIN' } },
});
const retainedPath = `/api/v1/organizations/${organization.id}/context`;
const retainedBefore = await own({ path: retainedPath });
assert.deepEqual(await directory(), []);
const staged = await stageMarketCatalogs(own);
assert.deepEqual(await directory(), []);
for (const [index, shop] of release.shops.entries()) {
  await publishMarketShop(own, shop, staged[index], false);
}
assert.deepEqual(await directory(), []);

let menus = 0;
let covers = 0;
for (const [index, shop] of release.shops.entries()) {
  const shopStage = staged[index];
  const result = await publishMarketShop(own, shop, shopStage, true);
  const endpoint = `${shops}/${shopStage.slug}`;
  const detail = await request({ path: endpoint });
  assert.equal(detail.published, true);
  assert.equal(detail.accepting_orders, false);
  assert.deepEqual(detail.category_codes, shop.settings.category_codes);
  assert.equal(detail.cover_image_url, shop.cover_image_url ?? undefined);
  const page = await request({ path: `${endpoint}/products` });
  assert.equal(page.total, 15);
  const items = new Map(page.items.map(item => [item.sku, item]));
  for (const item of shop.items) {
    const actual = items.get(item.sku);
    assert.ok(actual);
    assert.deepEqual(
      [actual.product_name, actual.category_name, actual.unit, actual.unit_price, actual.image_url, actual.is_sold_out],
      [item.name, item.category, item.unit, item.price, item.image_url, item.is_sold_out],
    );
    await verifyImage(actual.image_url, assets.get(actual.image_url), readImage);
    menus++;
  }
  if (shop.cover_image_url) {
    await verifyImage(detail.cover_image_url, assets.get(detail.cover_image_url), readImage);
    covers++;
  }
  assert.deepEqual(await publishMarketShop(own, shop, shopStage, true), result);
}
assert.deepEqual(await stageMarketCatalogs(own), staged);
assert.deepEqual(await own({ path: retainedPath }), retainedBefore);
const listings = new Map((await directory()).map(shop => [shop.slug, shop]));
assert.equal(listings.size, 13);
for (const shop of release.shops) {
  const listing = listings.get(shop.settings.slug);
  assert.ok(listing);
  assert.equal(listing.cover_image_url, shop.cover_image_url ?? undefined);
  assert.equal(listing.accepting_orders, false);
  assert.equal(listing.review_count, 0);
  assert.equal(listing.average_rating, null);
}
const first = staged[0];
const privateShop = `/api/v1/organizations/${first.org}/storefront`;
for (const method of ['GET', 'PUT']) {
  const operation = { method, path: privateShop, body: method === 'PUT' ? {} : undefined };
  assert.equal(await request(operation, guest, 404), 'NOT_FOUND');
  assert.equal(await request(operation, primary, 403), 'MFA_REQUIRED');
}
const initial = await own({ path: privateShop });
assert.ok(initial.cover_image_url);
const { slug, name, description, pickup_instructions, category_codes, terminal_id,
  accepting_orders, delivery_enabled, shipping_fee, contact_phone, published } = initial;
const update = (revision, cover = {}) => ({
  path: privateShop, method: 'PUT', body: {
    slug, name, description, pickup_instructions, category_codes, terminal_id, accepting_orders,
    delivery_enabled, shipping_fee, contact_phone, published, revision, ...cover,
  },
});
const preserved = await own(update(initial.revision));
assert.equal(preserved.cover_image_url, initial.cover_image_url);
const cleared = await own(update(preserved.revision, { cover_image_url: '' }));
assert.equal(cleared.cover_image_url, undefined);
assert.equal((await request({ path: `${shops}/${first.slug}` })).cover_image_url, undefined);
assert.equal((await directory()).find(shop => shop.slug === first.slug).cover_image_url, undefined);
const restored = await own(update(cleared.revision, { cover_image_url: initial.cover_image_url }));
assert.equal(restored.cover_image_url, initial.cover_image_url);
const quote = { method: 'POST', path: `${shops}/${first.slug}/quote`, body: { items: [{ variant_id: [...first.variants.values()][0], quantity: '1' }] } };
assert.equal(await request(quote, null, 409), 'STORE_CLOSED');
assert.equal(await request({
  method: 'POST', path: `${shops}/${first.slug}/orders`, idempotencyKey: randomUUID(),
  body: {
    ...quote.body, quote_id: randomBytes(32).toString('hex'), access_token: randomBytes(32).toString('hex'),
    customer_name: 'Release check', contact_phone: '020000000',
  },
}, null, 409), 'STORE_CLOSED');
assert.equal(menus, 195);
console.log(`Real owner HTTP and PostgreSQL: 13 closed storefronts, 195 exact menus and ${covers} associated covers. Verified directory/detail, cover preservation and clearing, zero reviews, retry, tenant denial, MFA and rejected quote/order.`);

if (process.env.SMARTPOS_MARKET_RELEASE_BROWSER) {
  const { checkMarketBrowser } = await import('./main-browser-acceptance.mjs');
  await checkMarketBrowser(origin, release.shops);
}
