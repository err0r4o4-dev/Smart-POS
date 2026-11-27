import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { prepareMainCatalog } from './main-package.mjs';

const newCategories = new Map([
  ['MKT-TAI', 'southern-thai'],
  ['MKT-NUE', 'northern-thai'],
  ['MKT-SEA', 'seafood'],
  ['MKT-JOK', 'breakfast'],
  ['MKT-ASIA', 'asian'],
]);
const weekdays = [
  'อาทิตย์',
  'จันทร์',
  'อังคาร',
  'พุธ',
  'พฤหัสบดี',
  'ศุกร์',
  'เสาร์',
];
const clock = /^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/;

export async function prepareStorefrontMetadata(release) {
  const approved = await prepareMainCatalog();
  assert.ok(
    isDeepStrictEqual(release, approved),
    'Release differs from the approved Market Pilot package',
  );
  return approved.shops.map(({ organization: { code }, settings, hours }) => {
    const category_codes = newCategories.has(code)
      ? [newCategories.get(code)]
      : [...settings.category_codes];
    const closed_weekday = weekdays.indexOf(hours.closed_day);
    const { opens, closes, timezone } = hours;
    assert.ok(
      category_codes.length &&
        closed_weekday >= 0 &&
        timezone === 'Asia/Bangkok' &&
        clock.test(opens) &&
        clock.test(closes) &&
        opens < closes,
      `${code}: invalid storefront metadata`,
    );
    return {
      code,
      slug: settings.slug,
      category_codes,
      opening_hours: { opens, closes, closed_weekday, timezone },
    };
  });
}

const organizations = '/api/v1/organizations';
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const unchangedFields = [
  'slug',
  'name',
  'description',
  'contact_phone',
  'pickup_instructions',
  'delivery_enabled',
  'shipping_fee',
  'terminal_id',
  'online_terminal_id',
  'branch_id',
  'stock_location_id',
  'published',
  'accepting_orders',
  'cover_image_url',
];

// The operator supplies the authenticated, pinned owner transport and durable journal.
// This fixture has no executable entrypoint, credentials, or retry/rollback behavior.
export async function enrichPilotStorefronts({ release, request, journal }) {
  assert.equal(typeof request, 'function');
  assert.equal(typeof journal, 'function');
  const expected = await prepareStorefrontMetadata(release);
  const approved = await prepareMainCatalog();
  const directory = await request({ path: organizations });
  assert.ok(Array.isArray(directory), 'Unexpected owner organization listing');
  const planned = [];
  const ids = new Set();
  for (const [index, metadata] of expected.entries()) {
    const shop = approved.shops[index];
    const matches = directory.filter((org) => org.code === metadata.code);
    const org = matches[0];
    assert.ok(
      matches.length === 1 &&
        uuid.test(org.id) &&
        !ids.has(org.id) &&
        org.name === shop.organization.name &&
        org.status === 'ACTIVE' &&
        org.business_type === 'RESTAURANT',
      `${metadata.code}: organization baseline mismatch`,
    );
    ids.add(org.id);
    const path = `${organizations}/${org.id}/storefront`;
    const before = await request({ path });
    const profileMatches = [
      'slug',
      'name',
      'description',
      'pickup_instructions',
      'delivery_enabled',
    ].every((key) => before?.[key] === shop.settings[key]);
    assert.ok(
      profileMatches &&
        before.published === true &&
        before.accepting_orders === false &&
        before.cover_image_url === shop.cover_image_url &&
        uuid.test(before.terminal_id) &&
        uuid.test(before.branch_id) &&
        uuid.test(before.stock_location_id) &&
        Number.isSafeInteger(before.revision) &&
        before.revision >= 1 &&
        before.revision < Number.MAX_SAFE_INTEGER &&
        (isDeepStrictEqual(
          before.category_codes,
          shop.settings.category_codes,
        ) ||
          isDeepStrictEqual(before.category_codes, metadata.category_codes)) &&
        (before.opening_hours == null ||
          isDeepStrictEqual(before.opening_hours, metadata.opening_hours)),
      `${metadata.slug}: storefront baseline mismatch`,
    );
    planned.push({ path, before, metadata });
  }
  let updated = 0;
  for (const { path, before, metadata } of planned) {
    const { slug, category_codes, opening_hours } = metadata;
    if (
      isDeepStrictEqual(before.category_codes, category_codes) &&
      isDeepStrictEqual(before.opening_hours, opening_hours)
    )
      continue;
    const body = { category_codes, opening_hours, revision: before.revision };
    for (const key of unchangedFields) {
      if (
        key !== 'branch_id' &&
        key !== 'stock_location_id' &&
        before[key] !== undefined
      )
        body[key] = before[key];
    }
    await journal({
      state: 'attempted',
      slug,
      path,
      revision: before.revision,
    });
    const saved = await request({ method: 'PUT', path, body });
    const readback = await request({ path });
    assert.ok(
      isDeepStrictEqual(saved, readback) &&
        readback.revision === before.revision + 1 &&
        unchangedFields.every((key) =>
          isDeepStrictEqual(before[key], readback[key]),
        ) &&
        isDeepStrictEqual(readback.category_codes, category_codes) &&
        isDeepStrictEqual(readback.opening_hours, opening_hours),
      `${slug}: updated storefront did not match expected metadata`,
    );
    await journal({
      state: 'verified',
      slug,
      path,
      revision: readback.revision,
    });
    updated++;
  }
  return { checked: planned.length, updated };
}
