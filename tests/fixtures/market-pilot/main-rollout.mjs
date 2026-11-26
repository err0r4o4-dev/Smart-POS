import assert from 'node:assert/strict';
import { prepareMainCatalog, validateTargetDirectory } from './main-package.mjs';
import { createMarketOwnerRequest } from './main-owner-request.mjs';
import { stageMarketCatalogs } from './main-import.mjs';
import { publishMarketShop, restoreMarketDraft } from './main-publish.mjs';
import { validateReleaseAssets, verifyImage, verifyPublicRelease } from './main-verify.mjs';

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
