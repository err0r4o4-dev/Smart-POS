import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { prepareMainCatalog } from './main-package.mjs';

const target = 'http://127.0.0.1:8088';
const directoryPath = '/api/v1/storefronts';
const slugPattern = /^[a-z0-9][a-z0-9-]{0,63}$/;
const assetPattern = /^\/images\/market-sip-soi\/v2\/(?:covers\/market-[a-z0-9-]+|menu\/MKT-[A-Z]+-[0-9]{2})\.webp$/;
const sizeLimit = 5 * 1024 * 1024;

export function validateReleaseAssets(release, index) {
  const assets = new Map();
  for (const entry of index) {
    assert.match(entry.url, assetPattern, 'Invalid asset path');
    assert.ok(Number.isSafeInteger(entry.size) && entry.size > 0 && entry.size <= sizeLimit, 'Invalid asset size');
    assert.match(entry.sha256, /^[a-f0-9]{64}$/, 'Invalid asset SHA-256');
    assert.ok(!assets.has(entry.url), 'Duplicated asset path');
    assets.set(entry.url, entry);
  }
  const expected = release.shops.flatMap(shop => [
    ...(shop.cover_image_url ? [shop.cover_image_url] : []), ...shop.items.map(item => item.image_url),
  ]);
  assert.equal(new Set(expected).size, expected.length, 'Duplicated release asset paths');
  assert.ok(expected.length === assets.size && expected.every(url => assets.has(url)), 'Asset index does not match release');
  return assets;
}

export async function verifyImage(url, entry, get) {
  const response = await get(url);
  assert.match(response.headers.get('content-type') ?? '', /^image\/webp(?:;|$)/i, `${url}: content-type`);
  assert.ok(response.body, `${url}: no image body`);
  const hash = createHash('sha256');
  const reader = response.body.getReader();
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      assert.ok(size <= entry.size, `${url}: image too large`);
      hash.update(value);
    }
  } finally {
    await reader.cancel();
  }
  assert.equal(size, entry.size, `${url}: image size`);
  assert.equal(hash.digest('hex'), entry.sha256, `${url}: sha256`);
}

export async function verifyPublicRelease(release, index, retainedSlugs, fetcher = fetch) {
  const assets = validateReleaseAssets(release, index);
  const expectedSlugs = release.shops.map(shop => shop.settings.slug);
  const allSlugs = [...expectedSlugs, ...retainedSlugs];
  assert.ok(retainedSlugs.length && allSlugs.every(slug => slugPattern.test(slug)), 'Invalid or missing directory baseline');
  assert.equal(new Set(allSlugs).size, allSlugs.length, 'Duplicated directory baseline');
  const get = async path => {
    const url = new URL(path, target);
    assert.equal(url.origin, target);
    const response = await fetcher(url, {
      method: 'GET', redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(5000),
    });
    assert.ok(response.ok, `${path}: expected successful GET, got HTTP ${response.status}`);
    return response;
  };
  const data = async response => (await response.json()).data;
  const response = await get(directoryPath);
  assert.equal(response.headers.get('x-smartpos-store-mode'), 'multi', 'Target must run in multi-store mode');
  const rows = await data(response);
  assert.ok(Array.isArray(rows), 'Invalid directory');
  const directory = new Map(rows.map(row => [row.slug, row]));
  assert.equal(directory.size, rows.length, 'Duplicated directory entry');
  for (const slug of allSlugs) assert.ok(directory.has(slug), `${slug}: missing directory entry`);
  assert.equal(directory.size, allSlugs.length, 'Unexpected directory entries');

  const result = { shops: 0, menus: 0, covers: 0, retained: retainedSlugs.length };
  for (const shop of release.shops) {
    const { slug, name, category_codes } = shop.settings;
    const path = `${directoryPath}/${slug}`;
    const listing = directory.get(slug);
    const detail = await data(await get(path));
    for (const value of [listing, detail]) {
      assert.equal(value.slug, slug, `${slug}: slug`);
      assert.equal(value.name, name, `${slug}: name`);
      assert.equal(value.accepting_orders, false, `${slug}: accepting_orders`);
      assert.ok(Array.isArray(value.category_codes), `${slug}: category_codes`);
      assert.deepEqual([...value.category_codes].sort(), [...category_codes].sort(), `${slug}: category_codes`);
      if (shop.cover_image_url) assert.equal(value.cover_image_url, shop.cover_image_url, `${slug}: cover_image_url`);
    }
    assert.equal(listing.review_count, 0, `${slug}: unexpected reviews`);
    assert.equal(detail.published, true, `${slug}: published`);

    const page = await data(await get(`${path}/products?page=1`));
    assert.equal(page.page, 1, `${slug}: menu page`);
    assert.equal(page.total, shop.items.length, `${slug}: menu total`);
    assert.equal(page.items.length, shop.items.length, `${slug}: menu page count`);
    const bySKU = new Map(page.items.map(item => [item.sku, item]));
    assert.equal(bySKU.size, shop.items.length, `${slug}: duplicate SKU`);
    for (const item of shop.items) {
      const actual = bySKU.get(item.sku);
      assert.ok(actual, `${slug}: missing ${item.sku}`);
      for (const [key, expected] of Object.entries({
        product_name: item.name, category_name: item.category, unit: item.unit, unit_price: item.price,
        is_sold_out: item.is_sold_out, image_url: item.image_url, published: true,
      })) assert.equal(actual[key], expected, `${slug}/${item.sku}: ${key}`);
      await verifyImage(item.image_url, assets.get(item.image_url), get);
      result.menus++;
    }
    if (shop.cover_image_url) {
      await verifyImage(shop.cover_image_url, assets.get(shop.cover_image_url), get);
      result.covers++;
    }
    result.shops++;
  }
  return result;
}

async function main() {
  const [flag, ...retainedSlugs] = process.argv.slice(2);
  assert.equal(flag, '--retain', 'Usage: node main-verify.mjs --retain <original-slug> [more-original-slugs...]');
  const release = await prepareMainCatalog();
  const index = JSON.parse(await readFile(new URL('../../../.local/market-pilot/main-release-v2/asset-index.json', import.meta.url), 'utf8'));
  const result = await verifyPublicRelease(release, index, retainedSlugs);
  console.log(`Verified ${result.shops} closed storefronts, ${result.menus} photographed items, ${result.covers} covers and ${result.retained} retained directory entries using public GETs.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
