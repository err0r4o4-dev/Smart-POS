import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { verifyPublicRelease } from './main-verify.mjs';

const cover = '/images/market-sip-soi/v2/covers/market-test.webp';
const image = '/images/market-sip-soi/v2/menu/MKT-TST-01.webp';
const item = { sku: 'MKT-TST-01', name: 'Noodles', category: 'Lunch', unit: 'Bowl', price: '45.25', is_sold_out: true, image_url: image };
const release = { shops: [{
  settings: { slug: 'market-test', name: 'Lunch stand', category_codes: ['noodles'] },
  cover_image_url: cover, items: [item],
}] };
const bytes = Buffer.from('example asset');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const index = [cover, image].map(url => ({ url, size: bytes.length, sha256 }));

function responseFixture({ itemOverride, missingOriginal = false, open = false, changedImage = false } = {}) {
  const listing = { slug: 'market-test', name: 'Lunch stand', category_codes: ['noodles'], accepting_orders: open, review_count: 0, cover_image_url: cover };
  return async (url, options) => {
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.equal(options.credentials, 'omit');
    assert.equal(url.origin, 'http://127.0.0.1:8088');
    const json = (data, headers) => Response.json({ data }, { headers });
    switch (url.pathname) {
      case '/api/v1/storefronts':
        return json(missingOriginal ? [listing] : [listing, { slug: 'original' }], { 'x-smartpos-store-mode': 'multi' });
      case '/api/v1/storefronts/market-test':
        return json({ ...listing, published: true });
      case '/api/v1/storefronts/market-test/products':
        return json({ page: 1, total: 1, items: [{
          sku: item.sku, product_name: item.name, category_name: item.category, unit: item.unit,
          unit_price: item.price, is_sold_out: true, image_url: image, published: true, ...itemOverride,
        }] });
      case cover:
      case image:
        return new Response(changedImage && url.pathname === image ? Buffer.alloc(bytes.length) : bytes, { headers: { 'content-type': 'image/webp' } });
      default:
        assert.fail('Unexpected verification request');
    }
  };
}

test('verifies the unchanged directory baseline, closed shops, exact menu data and exact images', async () => {
  assert.deepEqual(await verifyPublicRelease(release, index, ['original'], responseFixture()), {
    shops: 1, menus: 1, covers: 1, retained: 1,
  });
});

test('rejects missing original shops, stores taking orders, changed menu fields and replaced images', async () => {
  for (const [options, reason] of [
    [{ missingOriginal: true }, /original/],
    [{ open: true }, /accepting_orders/],
    [{ itemOverride: { unit_price: '45.00' } }, /unit_price/],
    [{ itemOverride: { image_url: 'https://example.test/image.webp' } }, /image_url/],
    [{ changedImage: true }, /sha256/],
  ]) {
    await assert.rejects(verifyPublicRelease(release, index, ['original'], responseFixture(options)), reason);
  }
});

test('rejects unsafe asset paths before issuing any request', async () => {
  const unsafe = '/images/market-sip-soi/v2/menu/../outside.webp';
  const malformed = [{ ...index[0] }, { ...index[1], url: unsafe }];
  await assert.rejects(verifyPublicRelease(release, malformed, ['original'], () => {
    assert.fail('Invalid asset index issued a request');
  }), /asset path/);
});
