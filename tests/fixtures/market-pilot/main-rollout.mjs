import assert from 'node:assert/strict';
import { prepareMainCatalog, validateTargetDirectory } from './main-package.mjs';
import { createMarketOwnerRequest } from './main-owner-request.mjs';
import { stageMarketCatalogs } from './main-import.mjs';
import { publishMarketShop } from './main-publish.mjs';
import { validateReleaseAssets, verifyImage, verifyPublicRelease } from './main-verify.mjs';

// Call after the retained database, backup, private collision and release review gates pass.
// No CLI entry point: the operator supplies the authenticated owner page.
export async function runMarketRollout({ page, retainedSlugs, index }, {
  fetcher = fetch,
  openOwner = createMarketOwnerRequest,
  stage = stageMarketCatalogs,
  publish = publishMarketShop,
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
  for (const [i, shop] of release.shops.entries()) {
    const draft = await publish(request, shop, staged[i], false);
    assert.equal(draft.published, false, `${shop.settings.slug}: storefront already visible`);
    assert.equal(draft.accepting_orders, false, `${shop.settings.slug}: draft accepting orders`);
  }
  for (const [i, shop] of release.shops.entries()) {
    const result = await publish(request, shop, staged[i], true);
    assert.equal(result.published, true, `${shop.settings.slug}: storefront still hidden`);
    assert.equal(result.accepting_orders, false, `${shop.settings.slug}: storefront accepting orders`);
  }
  return verify(release, index, baseline, fetcher);
}
