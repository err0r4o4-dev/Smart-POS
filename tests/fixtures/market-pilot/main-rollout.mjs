import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { prepareMainCatalog, validateTargetDirectory } from './main-package.mjs';
import { createMarketOwnerRequest } from './main-owner-request.mjs';
import { stageMarketCatalogs } from './main-import.mjs';
import { publishMarketShop, restoreMarketDraft } from './main-publish.mjs';
import { validateReleaseAssets, verifyImage, verifyPublicRelease } from './main-verify.mjs';

const directoryPath = '/api/v1/storefronts';
const idPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const slugPattern = /^[a-z0-9][a-z0-9-]{0,63}$/;

// Operator-only, single invocation after the backup and private collision gates.
// Never publish, recover, or automatically retry. Use an exclusive browser context
// and a durable private journal; a final attempted event requires reconciliation.
export async function runMarketDrafts({ page, ownerID, release: supplied, journal }, {
  fetcher = fetch, openOwner = createMarketOwnerRequest,
  stage = stageMarketCatalogs, saveDraft = publishMarketShop,
} = {}) {
  const release = await prepareMainCatalog();
  assert.ok(isDeepStrictEqual(supplied, release), 'Catalog differs from the approved package');
  const origin = new URL(page.url()).origin;
  assert.ok([release.target, 'http://localhost:8088'].includes(origin), 'Unexpected draft gateway origin');
  assert.match(ownerID, idPattern, 'Missing dedicated owner ID');
  assert.equal(typeof journal, 'function', 'A private import journal is required');
  const get = async (path, status = 200) => {
    const url = new URL(path, origin);
    assert.equal(url.origin, origin);
    const result = await fetcher(url, {
      method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(5000),
    });
    if (result.status !== status) {
      await result.body?.cancel();
      throw new Error(`${path}: expected HTTP ${status}, got ${result.status}`);
    }
    return result;
  };
  const slugs = release.shops.map(shop => shop.settings.slug);
  const snapshot = async () => {
    const result = await get(directoryPath);
    const { data } = await result.json();
    const retained = validateTargetDirectory(result.headers.get('x-smartpos-store-mode'), data, slugs);
    assert.ok(retained.length > 0 && retained.every(slug => slugPattern.test(slug)), 'Missing or invalid retained storefront baseline');
    const menus = [];
    for (const slug of [...retained].sort()) {
      menus.push(await (await get(`${directoryPath}/${slug}/products`)).json());
    }
    return { directory: [...data].sort((a, b) => a.slug.localeCompare(b.slug)), menus };
  };
  await (await get('/health/ready')).body?.cancel();
  const before = await snapshot();
  const owner = await openOwner(page, { origin, ownerID, draftOnly: true });
  let sequence = 0;
  const request = async operation => {
    const { method = 'GET', path, body, idempotencyKey } = operation;
    if (method === 'GET') return owner(operation);
    const event = { sequence: ++sequence, method, path, body, idempotencyKey };
    await journal({ ...event, state: 'attempted' });
    const result = await owner(operation);
    await journal({ ...event, state: 'confirmed', id: result?.id ?? result?.organization?.id,
      branchIDs: result?.branches?.map(branch => branch.id), variantIDs: result?.variants?.map(variant => variant.id),
      revision: result?.revision });
    return result;
  };
  const staged = await stage(request);
  assert.deepEqual(staged.map(shop => shop.slug), slugs, 'Incomplete staged catalog');
  let menus = 0;
  for (const [i, shop] of release.shops.entries()) {
    const row = staged[i];
    const draft = await saveDraft(request, shop, row, false);
    const path = `/api/v1/organizations/${row.org}/storefront`;
    const stored = await request({ path });
    assert.ok(isDeepStrictEqual(stored, draft) && stored.published === false && stored.accepting_orders === false &&
      stored.slug === row.slug && stored.branch_id === row.branchId && stored.cover_image_url === shop.cover_image_url &&
      stored.delivery_enabled === false && idPattern.test(stored.terminal_id) && idPattern.test(stored.stock_location_id) &&
      Number.isSafeInteger(stored.revision) && stored.revision > 0, `${row.slug}: unexpected private storefront settings`);
    const listing = await request({ path: `${path}/products` });
    const tenant = `/api/v1/organizations/${row.org}`;
    const readCatalog = async resource => {
      const page = await request({ path: `${tenant}/${resource}?page_size=50&status=` });
      assert.ok(Array.isArray(page.items) && page.items.length === page.total, `${row.slug}: incomplete ${resource}`);
      return page.items;
    };
    const categories = await readCatalog('categories');
    const products = await readCatalog('products');
    assert.equal(listing.total, shop.items.length);
    const bySKU = new Map(listing.items.map(item => [item.sku, item]));
    assert.equal(listing.items.length, listing.total);
    assert.equal(bySKU.size, listing.total);
    assert.equal(products.length, listing.total);
    for (const item of shop.items) {
      const variantID = row.variants.get(item.sku);
      for (const [key, expected] of Object.entries({
        variant_id: variantID, product_name: item.name, unit: item.unit, unit_price: item.price,
        is_sold_out: item.is_sold_out, published: true,
      })) assert.ok(bySKU.get(item.sku)?.[key] === expected, `${row.slug}/${item.sku}: unexpected ${key}`);
      const product = products.find(product => product.variants?.some(variant => variant.id === variantID));
      const category = categories.find(category => category.id === product?.category_id);
      assert.ok(product?.organization_id === row.org && category?.organization_id === row.org &&
        category.name === item.category && product.variants.length === 1 && product.variants[0].sku === item.sku &&
        product.variants[0].attributes?.storefront_image_url === item.image_url, `${row.slug}/${item.sku}: unexpected catalog category or image`);
      menus++;
    }
    await journal({ state: 'draft-verified', slug: row.slug, org: row.org, branchID: row.branchId, revision: stored.revision });
  }
  assert.ok(isDeepStrictEqual(await snapshot(), before), 'Retained storefront directory or menu changed');
  for (const slug of slugs) {
    const path = `${directoryPath}/${slug}`;
    for (const suffix of ['', '/products']) await (await get(path + suffix, 404)).body?.cancel();
  }
  const summary = { shops: staged.length, menus, retained: before.directory.length };
  await journal({ state: 'completed', ...summary });
  return summary;
}

// Call after the retained database, backup, private collision and release review gates pass.
// No CLI entry point: the operator supplies the authenticated owner page.
export async function runMarketRollout({ page, retainedSlugs, index }, {
  fetcher = fetch,
  openOwner = createMarketOwnerRequest,
  stage = stageMarketCatalogs,
  publish = publishMarketShop,
  restore = restoreMarketDraft,
  verify = verifyPublicRelease,
} = {}) {
  const release = await prepareMainCatalog();
  assert.equal(new URL(page.url()).origin, release.target, 'Unexpected owner page origin');
  assert.ok(Array.isArray(retainedSlugs) && retainedSlugs.length > 0 &&
    retainedSlugs.every(slug => typeof slug === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)),
  'Invalid or missing retained directory baseline');
  const baseline = [...retainedSlugs].sort();
  const assets = validateReleaseAssets(release, index);
  const get = async path => {
    const url = new URL(path, release.target);
    assert.equal(url.origin, release.target);
    const response = await fetcher(url, {
      method: 'GET', redirect: 'error', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(5000),
    });
    assert.ok(response.ok, `${path}: HTTP ${response.status}`);
    return response;
  };

  await (await get('/health/ready')).body?.cancel();
  const directory = await get('/api/v1/storefronts');
  const current = validateTargetDirectory(directory.headers.get('x-smartpos-store-mode'),
    (await directory.json()).data, release.shops.map(shop => shop.settings.slug));
  assert.deepEqual(current.sort(), baseline, 'Retained directory changed');
  for (const [path, entry] of assets) await verifyImage(path, entry, get);

  const request = await openOwner(page);
  const staged = await stage(request);
  assert.deepEqual(staged.map(shop => shop.slug), release.shops.map(shop => shop.settings.slug),
    'Incomplete staged market catalog');
  const drafts = [];
  for (const [i, shop] of release.shops.entries()) {
    const draft = await publish(request, shop, staged[i], false);
    assert.equal(draft.published, false, `${shop.settings.slug}: storefront already visible`);
    assert.equal(draft.accepting_orders, false, `${shop.settings.slug}: draft accepting orders`);
    assert.ok(Number.isSafeInteger(draft.revision) && draft.revision > 0 && draft.revision <= Number.MAX_SAFE_INTEGER - 2,
      `${shop.settings.slug}: invalid draft revision`);
    drafts.push(structuredClone(draft));
  }
  const attempted = [];
  try {
    for (const [i, shop] of release.shops.entries()) {
      const draft = drafts[i];
      const attempt = { shop, staged: staged[i], draft, confirmed: false };
      attempted.push(attempt);
      const result = await publish(request, shop, staged[i], true, draft.revision);
      assert.equal(result.published, true, `${shop.settings.slug}: storefront still hidden`);
      assert.equal(result.accepting_orders, false, `${shop.settings.slug}: storefront accepting orders`);
      assert.equal(result.revision, draft.revision + 1, `${shop.settings.slug}: unexpected publication revision`);
      attempt.confirmed = true;
    }
    return await verify(release, index, baseline, fetcher);
  } catch (cause) {
    const pending = [];
    for (const { shop, staged: record, draft, confirmed } of attempted.reverse()) {
      try {
        await restore(request, shop, record, draft, confirmed);
      } catch (error) {
        pending.push(new Error(shop.settings.slug, { cause: error }));
      }
    }
    if (pending.length) {
      throw new AggregateError(pending, `Manual storefront recovery required: ${pending.map(error => error.message).join(', ')}`, { cause });
    }
    throw cause;
  }
}
