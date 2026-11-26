import assert from 'node:assert/strict';

const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

function match(actual, expected) {
  for (const [field, value] of Object.entries(expected)) {
    assert.deepEqual(actual?.[field], value, `Unexpected storefront value: ${field}`);
  }
}

function pageItems(data) {
  assert.ok(Array.isArray(data.items) && data.items.length === data.total, 'Incomplete inventory');
  return data.items;
}

function nextRevision(data, previous) {
  assert.equal(data.revision, previous + 1, 'Unexpected storefront revision');
  return data.revision;
}

function closedSettings(shop) {
  return {
    slug: shop.settings.slug, name: shop.settings.name, description: shop.settings.description,
    pickup_instructions: shop.settings.pickup_instructions, category_codes: shop.settings.category_codes,
    accepting_orders: false, delivery_enabled: false, shipping_fee: '0.00', contact_phone: '',
    ...(shop.cover_image_url ? { cover_image_url: shop.cover_image_url } : {}),
  };
}

function validDraftRevision(revision) {
  assert.ok(Number.isSafeInteger(revision) && revision > 0 && revision <= Number.MAX_SAFE_INTEGER - 2,
    'Invalid draft revision');
}

export async function publishMarketShop(request, shop, staged, show, draftRevision) {
  const { org, branchId, variants } = staged;
  assert.equal(staged.slug, shop.settings.slug);
  assert.match(org, uuid);
  assert.match(branchId, uuid);
  assert.equal(typeof show, 'boolean');
  assert.equal(variants.size, shop.items.length);
  for (const item of shop.items) assert.match(variants.get(item.sku), uuid);
  assert.equal(new Set(variants.values()).size, variants.size);
  const call = (method, path, body) => request({ method, path: `/api/v1/organizations/${org}${path}`, body });

  let settings = await call('GET', '/storefront');
  const fixed = closedSettings(shop);
  if (draftRevision !== undefined) {
    validDraftRevision(draftRevision);
    assert.equal(show, true);
    match(settings, { published: false, revision: draftRevision });
  }
  if (settings !== null) {
    match(settings, fixed);
    assert.equal(settings.branch_id, branchId);
    assert.ok(!settings.online_terminal_id, 'Unexpected online terminal');
  }

  async function ensure(path, fields, extra = {}) {
    const rows = pageItems(await call('GET', `${path}?branch_id=${branchId}`));
    const matches = rows.filter(row => row.code === fields.code);
    assert.ok(matches.length <= 1, 'Duplicate market resource');
    assert.ok(!settings || matches.length === 1, 'An existing storefront must have its original market resources');
    const record = matches[0] ?? await call('POST', path, fields);
    match(record, { ...fields, ...extra });
    assert.match(record.id, uuid);
    return record.id;
  }

  const location = await ensure('/inventory/locations', {
    branch_id: branchId, code: 'MARKET-PICKUP', name: 'Market pickup', type: 'SALES_FLOOR', status: 'ACTIVE',
  }, { organization_id: org });
  const terminal = await ensure('/pos/terminals', {
    branch_id: branchId, stock_location_id: location, code: 'MARKET-POS', name: 'Market POS', status: 'ACTIVE',
  });
  const input = { ...fixed, terminal_id: terminal };
  const expectedSettings = { ...input, branch_id: branchId, stock_location_id: location };
  if (settings === null) {
    settings = await call('PUT', '/storefront', { ...input, published: false, revision: 0 });
    nextRevision(settings, 0);
  }
  match(settings, expectedSettings);
  assert.ok(Number.isSafeInteger(settings.revision) && settings.revision > 0);

  const items = pageItems(await call('GET', '/storefront/products'));
  assert.equal(items.length, shop.items.length, 'Unexpected menu size');
  const bySKU = new Map(items.map(item => [item.sku, item]));
  assert.equal(bySKU.size, items.length, 'Duplicate menu SKU');
  let revision = settings.revision;
  for (const item of shop.items) {
    const variantId = variants.get(item.sku);
    const row = bySKU.get(item.sku);
    match(row, { variant_id: variantId, product_name: item.name, unit: item.unit, unit_price: item.price });
    if (row.published === true && row.is_sold_out === item.is_sold_out) continue;
    assert.equal(draftRevision, undefined, 'Draft menu changed before publication');
    assert.equal(settings.published, false, 'Refusing to modify a visible menu');
    assert.equal(row.published, false, 'Refusing to change an existing listing');
    const listed = await call('PUT', `/storefront/products/${variantId}`, {
      published: true, is_sold_out: item.is_sold_out, revision,
    });
    match(listed, { variant_id: variantId, published: true, is_sold_out: item.is_sold_out });
    revision++;
  }
  const current = await call('GET', '/storefront');
  match(current, { ...expectedSettings, published: settings.published, revision });
  if (!show || current.published) return current;
  const visible = await call('PUT', '/storefront', { ...input, published: true, revision });
  match(visible, { ...expectedSettings, published: true });
  nextRevision(visible, revision);
  return visible;
}

export async function restoreMarketDraft(request, shop, { org, slug, branchId }, draft, confirmed) {
  assert.match(org, uuid);
  assert.match(branchId, uuid);
  assert.equal(slug, shop.settings.slug);
  assert.equal(typeof confirmed, 'boolean');
  validDraftRevision(draft.revision);
  assert.match(draft.terminal_id, uuid);
  assert.match(draft.stock_location_id, uuid);
  assert.ok(!draft.online_terminal_id);
  const input = { ...closedSettings(shop), terminal_id: draft.terminal_id };
  const expected = { ...input, branch_id: branchId, stock_location_id: draft.stock_location_id };
  match(draft, { ...expected, published: false });

  const path = `/api/v1/organizations/${org}/storefront`;
  const current = await request({ method: 'GET', path });
  match(current, expected);
  assert.ok(!current.online_terminal_id);
  if (!confirmed) {
    // With a lost response, a visible draft may belong to another writer.
    assert.ok(current.published === false && current.revision === draft.revision,
      'Publication could not be attributed; inspect storefront before applying recovery');
    return;
  }
  const revision = draft.revision + 1;
  match(current, { published: true, revision });
  const restored = await request({ method: 'PUT', path, body: { ...input, published: false, revision } });
  match(restored, { ...expected, published: false });
  nextRevision(restored, revision);
}
