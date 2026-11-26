import assert from 'node:assert/strict';
import test from 'node:test';

test('main rollout fixture exposes 195 exact menu prices and closed shops without copying reviews', async () => {
  const { prepareMainCatalog } = await import('./main-package.mjs');
  const release = await prepareMainCatalog();
  assert.equal(release.shops.length, 13);
  const menus = release.shops.flatMap(shop => shop.items);
  assert.equal(menus.length, 195);
  assert.equal(new Set(menus.map(item => item.sku)).size, 195);
  assert.ok(release.shops.every(shop => !shop.settings.accepting_orders && !shop.settings.published && !('reviews' in shop)));
  const nit = release.shops.find(shop => shop.settings.slug === 'market-je-nit-tam-sang');
  assert.deepEqual(nit.settings.category_codes, ['made-to-order']);
  assert.equal(nit.cover_image_url, null);
  const seafood = release.shops.find(shop => shop.settings.slug === 'market-talay-yang');
  assert.deepEqual(seafood.settings.category_codes, []);
  assert.ok(seafood.original_category);
  const item = nit.items.find(item => item.sku === 'MKT-NIT-01');
  assert.equal(item.price, '85.00');
  assert.equal(item.image_url, '/images/market-sip-soi/v2/menu/MKT-NIT-01.webp');
});

test('preflight refuses the wrong store mode and every published slug collision', async () => {
  const { validateTargetDirectory } = await import('./main-package.mjs');
  assert.throws(() => validateTargetDirectory('single', [], ['market-one']), /multi/);
  assert.throws(() => validateTargetDirectory('multi', [{ slug: 'market-one' }], ['market-one']), /collision/);
  assert.deepEqual(validateTargetDirectory('multi', [{ slug: 'existing' }], ['market-one']), ['existing']);
});
