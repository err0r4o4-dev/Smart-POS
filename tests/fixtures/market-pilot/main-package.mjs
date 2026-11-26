import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { money, validateCatalog } from './catalog.mjs';

const fixture = name => readFile(new URL(name, import.meta.url), 'utf8');
const local = new URL('../../../.local/market-pilot/', import.meta.url);
const target = 'http://127.0.0.1:8088';
const assetRoot = '/images/market-sip-soi/v2/';
const categoryCodes = {
  KAP: ['made-to-order'], SEN: ['noodles'], TAO: ['isan'], TAI: [],
  TOD: ['fried', 'snacks'], CAFE: ['drinks'], WAN: ['desserts'], BAI: ['healthy'],
  NUE: [], SEA: [], JOK: [], ASIA: [], NIT: ['made-to-order'],
};

export async function prepareMainCatalog() {
  const base = validateCatalog(await fixture('shops.json'), await fixture('menu.tsv'));
  const { menuGroups, ...extra } = JSON.parse(await fixture('tam-sang-extension.json'));
  let index = 0;
  extra.items = menuGroups.flatMap(group => group.items.map(item => ({
    sku: `MKT-${extra.code}-${String(++index).padStart(2, '0')}`,
    category: group.name, name: item.name, priceMinor: item.baht * 100,
    unit: item.unit ?? group.unit, status: 'available', description: item.description, groups: [],
  })));
  const seenShops = new Set(), seenCodes = new Set(), seenItems = new Set();
  const shops = [...base.shops, extra].map(shop => {
    const { slug, code, name } = shop;
    assert.match(slug, /^market-[a-z0-9-]{1,42}$/);
    assert.ok(Object.hasOwn(categoryCodes, code) && !seenShops.has(slug) && !seenCodes.has(code));
    seenShops.add(slug);
    seenCodes.add(code);
    assert.equal(shop.items.length, 15);
    const items = shop.items.map(item => {
      assert.match(item.sku, new RegExp(`^MKT-${code}-\\d{2}$`));
      assert.ok(!seenItems.has(item.sku) && Number.isSafeInteger(item.priceMinor) && item.priceMinor > 0 && item.priceMinor <= 999999);
      assert.ok(item.status === 'available' || item.status === 'sold-out');
      assert.ok([item.name, item.category, item.description, item.unit].every(value => typeof value === 'string' && value.trim()));
      seenItems.add(item.sku);
      return { sku: item.sku, category: item.category, name: item.name, price: money(item.priceMinor),
        unit: item.unit, description: item.description, is_sold_out: item.status === 'sold-out',
        image_url: `${assetRoot}menu/${item.sku}.webp`, modifiers: item.groups };
    });
    return {
      organization: { code: `MKT-${code}`, name, business_type: 'RESTAURANT' },
      settings: { slug, name, description: shop.description, pickup_instructions: shop.pickup,
        accepting_orders: false, published: false, delivery_enabled: false, category_codes: categoryCodes[code] },
      original_category: shop.category, zone: shop.zone,
      hours: { opens: shop.opens, closes: shop.closes, closed_day: shop.closedDay, timezone: base.timezone },
      cover_image_url: shop === extra ? null : `${assetRoot}covers/${slug}.webp`, items,
    };
  });
  assert.equal(shops.length, 13);
  assert.equal(seenItems.size, 195);
  return { id: 'market-pilot-v2', target, shops };
}

export function validateTargetDirectory(mode, directory, incoming) {
  assert.equal(mode, 'multi', 'Target must run in multi-store mode');
  assert.ok(Array.isArray(directory), 'Target did not return a storefront directory');
  const slugs = directory.map(entry => entry.slug);
  assert.ok(slugs.every(value => typeof value === 'string' && value.length > 0));
  assert.equal(new Set(slugs).size, slugs.length);
  const existing = new Set(slugs);
  assert.ok(!incoming.some(slug => existing.has(slug)), 'Published slug collision on target');
  return slugs;
}

async function run() {
  assert.deepEqual(process.argv.slice(2), ['--preflight'], 'This command only supports --preflight');
  const release = await prepareMainCatalog();
  const response = await fetch(`${target}/api/v1/storefronts`, {
    redirect: 'error', signal: AbortSignal.timeout(5000),
  });
  assert.ok(response.ok, `Directory returned HTTP ${response.status}`);
  const { data } = await response.json();
  const baseline = validateTargetDirectory(response.headers.get('x-smartpos-store-mode'), data,
    release.shops.map(shop => shop.settings.slug));

  const assets = new Map();
  const hashes = new Set();
  async function add(url, filename) {
    const bytes = await readFile(new URL(filename, local));
    assert.ok(bytes.length >= 20 && bytes.toString('ascii', 0, 4) === 'RIFF' &&
      bytes.toString('ascii', 8, 12) === 'WEBP' && bytes.readUInt32LE(4) + 8 === bytes.length, `Invalid WebP: ${filename}`);
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    assert.ok(!assets.has(url) && !hashes.has(sha256), `Duplicate asset: ${filename}`);
    hashes.add(sha256);
    assets.set(url, { bytes, sha256 });
  }
  for (const shop of release.shops) {
    if (shop.cover_image_url) await add(shop.cover_image_url, `web-ready/${shop.settings.slug}.webp`);
    for (const item of shop.items) await add(item.image_url, `menu-gallery/menu-photos/${item.sku}.webp`);
  }

  const out = new URL('main-release-v2/', local);
  const assetIndex = [];
  for (const [url, { bytes, sha256 }] of assets) {
    const destination = new URL(`public${url}`, out);
    await mkdir(new URL('.', destination), { recursive: true });
    await writeFile(destination, bytes);
    assetIndex.push({ url, size: bytes.length, sha256 });
  }
  await writeFile(new URL('catalog.json', out), JSON.stringify(release, null, 2) + '\n');
  await writeFile(new URL('asset-index.json', out), JSON.stringify(assetIndex, null, 2) + '\n');
  console.log(`Prepared 13 shops, 195 menu images and ${assets.size - 195} covers; ${baseline.length} live storefront(s), no published slug collisions.`);
  console.log('Only HTTP GET was issued. Private slug/code collision checks, backup, isolation acceptance and publication are outside this preflight.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await run();
