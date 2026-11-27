import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareMainCatalog } from './main-package.mjs';
import * as metadata from './storefront-metadata.mjs';

const release = await prepareMainCatalog();
const expected = {
  'MKT-KAP': ['made-to-order', '10:00', '20:30', 1],
  'MKT-SEN': ['noodles', '09:30', '17:00', 2],
  'MKT-TAO': ['isan', '16:00', '22:30', 3],
  'MKT-TAI': ['southern-thai', '07:30', '15:00', 0],
  'MKT-TOD': ['fried', '12:00', '20:30', 1],
  'MKT-CAFE': ['drinks', '07:00', '16:30', 3],
  'MKT-WAN': ['desserts', '10:00', '18:30', 2],
  'MKT-BAI': ['healthy', '10:30', '19:30', 4],
  'MKT-NUE': ['northern-thai', '10:30', '19:00', 1],
  'MKT-SEA': ['seafood', '16:00', '22:00', 2],
  'MKT-JOK': ['breakfast', '05:30', '10:30', 3],
  'MKT-ASIA': ['asian', '11:00', '21:00', 1],
  'MKT-NIT': ['made-to-order', '09:30', '19:30', 3],
};

test('maps all 13 approved shops to nonempty categories and exact local hours', async () => {
  const result = await metadata.prepareStorefrontMetadata(release);
  assert.equal(result.length, 13);
  assert.equal(new Set(result.map((row) => row.slug)).size, 13);
  assert.deepEqual(
    Object.fromEntries(
      result.map(({ code, category_codes, opening_hours }) => {
        assert.equal(opening_hours.timezone, 'Asia/Bangkok');
        return [
          code,
          [
            category_codes[0],
            opening_hours.opens,
            opening_hours.closes,
            opening_hours.closed_weekday,
          ],
        ];
      }),
    ),
    expected,
  );
  assert.deepEqual(
    result.find((row) => row.code === 'MKT-TOD').category_codes,
    ['fried', 'snacks'],
  );
  assert.equal(
    release.shops.filter((shop) => shop.settings.category_codes.length === 0)
      .length,
    5,
  );
});

function ownerFixture() {
  const events = [];
  const writes = [];
  const storefronts = new Map();
  const organizations = new Map();
  for (const [i, shop] of release.shops.entries()) {
    const id = `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`;
    organizations.set(id, {
      id,
      code: shop.organization.code,
      name: shop.organization.name,
      business_type: 'RESTAURANT',
      status: 'ACTIVE',
    });
    storefronts.set(id, {
      ...shop.settings,
      published: true,
      contact_phone: '',
      shipping_fee: '0.00',
      cover_image_url: shop.cover_image_url,
      branch_id: '00000000-0000-4000-8000-000000000100',
      terminal_id: '00000000-0000-4000-8000-000000000101',
      stock_location_id: '00000000-0000-4000-8000-000000000102',
      revision: 16,
    });
  }
  const routes = '/api/v1/organizations';
  return {
    writes,
    storefronts,
    events,
    input: {
      release,
      journal: async (event) => events.push(event),
      request: async ({ path, method = 'GET', body }) => {
        if (method === 'GET' && path === routes)
          return [...organizations.values()];
        const [, id] =
          new RegExp(`^${routes}/([^/]+)/storefront$`).exec(path) ?? [];
        assert.ok(storefronts.has(id));
        if (method === 'GET') return structuredClone(storefronts.get(id));
        assert.equal(method, 'PUT');
        writes.push({ id, body });
        assert.equal(events.at(-1).state, 'attempted');
        const saved = {
          ...storefronts.get(id),
          ...body,
          revision: body.revision + 1,
        };
        storefronts.set(id, saved);
        return structuredClone(saved);
      },
    },
  };
}

test('enriches exactly 13 matching stores without changing other settings and skips exact matches on a deliberate later run', async () => {
  const { input, writes, storefronts, events } = ownerFixture();
  const before = structuredClone(storefronts);
  assert.deepEqual(await metadata.enrichPilotStorefronts(input), {
    checked: 13,
    updated: 13,
  });
  assert.equal(events.filter((event) => event.state === 'verified').length, 13);
  for (const [
    id,
    { category_codes, opening_hours, revision, ...rest },
  ] of storefronts) {
    const {
      category_codes: oldCategories,
      revision: oldRevision,
      ...oldRest
    } = before.get(id);
    assert.deepEqual(rest, oldRest);
    assert.ok(category_codes.length >= Math.max(oldCategories.length, 1));
    assert.equal(opening_hours.timezone, 'Asia/Bangkok');
    assert.equal(revision, oldRevision + 1);
  }
  assert.deepEqual(await metadata.enrichPilotStorefronts(input), {
    checked: 13,
    updated: 0,
  });
  assert.equal(writes.length, 13);
});

test('rejects a late storefront mismatch before the first write', async () => {
  const { input, storefronts, writes } = ownerFixture();
  const last = [...storefronts.values()].at(-1);
  last.accepting_orders = true;
  await assert.rejects(
    () => metadata.enrichPilotStorefronts(input),
    /baseline/,
  );
  assert.equal(writes.length, 0);
});

for (const failure of ['response lost', 'revision conflict']) {
  test(`stops with a journaled attempt and no other writes on ${failure}`, async () => {
    const { input, writes, events } = ownerFixture();
    const request = input.request;
    input.request = async (operation) => {
      if (operation.method !== 'PUT') return request(operation);
      if (failure === 'response lost') await request(operation);
      throw new Error(failure);
    };
    await assert.rejects(
      () => metadata.enrichPilotStorefronts(input),
      new RegExp(failure),
    );
    assert.equal(writes.length, failure === 'response lost' ? 1 : 0);
    assert.equal(
      events.filter((event) => event.state === 'attempted').length,
      1,
    );
    assert.ok(!events.some((event) => event.state === 'verified'));
  });
}

test('refuses an otherwise valid but unapproved change to the release', async () => {
  const changed = structuredClone(release);
  changed.shops[0].hours.closes = '21:30';
  await assert.rejects(
    () => metadata.prepareStorefrontMetadata(changed),
    /approved/i,
  );
});
