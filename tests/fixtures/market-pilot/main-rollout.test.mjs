import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { prepareMainCatalog } from './main-package.mjs';
import { runMarketRollout } from './main-rollout.mjs';

async function fixture({ missingAsset = false, failedDraft = false } = {}) {
  const { shops } = await prepareMainCatalog();
  const paths = shops.flatMap(shop => [shop.cover_image_url, ...shop.items.map(item => item.image_url)]);
  const index = paths.map(url => ({ url, size: Buffer.byteLength(url), sha256: createHash('sha256').update(url).digest('hex') }));
  const retainedSlugs = ['existing-shop'];
  const checkedImages = new Set();
  const drafts = new Set();
  const visible = new Set();
  const request = () => assert.fail('Unexpected owner API call');
  let ownerSessions = 0;
  const page = { url: () => 'http://127.0.0.1:8088/shop' };
  const io = {
    fetcher: async (url, options) => {
      assert.equal(url.origin, 'http://127.0.0.1:8088');
      assert.equal(options.method, 'GET');
      assert.equal(options.credentials, 'omit');
      if (url.pathname === '/health/ready') return new Response('ready');
      if (url.pathname === '/api/v1/storefronts') return Response.json({ data: [{ slug: 'existing-shop' }] }, { headers: { 'x-smartpos-store-mode': 'multi' } });
      assert.ok(paths.includes(url.pathname));
      if (missingAsset && url.pathname === paths.at(-1)) return new Response(null, { status: 404 });
      checkedImages.add(url.pathname);
      return new Response(url.pathname, { headers: { 'content-type': 'image/webp' } });
    },
    openOwner: async actual => {
      assert.equal(actual, page);
      assert.equal(checkedImages.size, 208);
      ownerSessions++;
      return request;
    },
    stage: async owner => {
      assert.equal(owner, request);
      return shops.map(shop => ({ slug: shop.settings.slug }));
    },
    publish: async (owner, shop, staged, show) => {
      assert.equal(owner, request);
      assert.equal(shop.settings.slug, staged.slug);
      if (!show) {
        if (failedDraft && staged.slug === shops.at(-1).settings.slug) throw new Error('Draft failed');
        drafts.add(staged.slug);
      } else {
        assert.equal(drafts.size, 13);
        visible.add(staged.slug);
      }
      return { published: show, accepting_orders: false };
    },
    verify: async (_release, actualIndex, retained) => {
      assert.equal(actualIndex, index);
      assert.deepEqual(retained, ['existing-shop']);
      assert.equal(visible.size, 13);
      return { shops: 13, menus: 195, covers: 13, retained: 1 };
    },
  };
  return { input: { page, retainedSlugs, index }, io, visible, ownerSessions: () => ownerSessions };
}

test('checks all assets, stages every draft, publishes closed, and verifies the retained directory', async () => {
  const { input, io } = await fixture();
  assert.deepEqual(await runMarketRollout(input, io), { shops: 13, menus: 195, covers: 13, retained: 1 });
});

test('refuses to open an owner session when the last asset is missing', async () => {
  const { input, io, ownerSessions } = await fixture({ missingAsset: true });
  await assert.rejects(runMarketRollout(input, io), /404/);
  assert.equal(ownerSessions(), 0);
});

test('leaves all shops hidden if any draft fails', async () => {
  const { input, io, visible } = await fixture({ failedDraft: true });
  await assert.rejects(runMarketRollout(input, io), /Draft failed/);
  assert.equal(visible.size, 0);
});
