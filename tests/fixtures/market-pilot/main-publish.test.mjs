import assert from 'node:assert/strict';
import test from 'node:test';
import { publishMarketShop } from './main-publish.mjs';

const org = 'f0000000-0000-4000-8000-000000000001';
const branchId = 'f0000000-0000-4000-8000-000000000002';
const location = 'f0000000-0000-4000-8000-000000000003';
const terminal = 'f0000000-0000-4000-8000-000000000004';
const variant = 'f0000000-0000-4000-8000-000000000005';
const item = { sku: 'MKT-TST-01', name: 'Soup', price: '45.25', unit: 'Bowl', is_sold_out: true };
const shop = { settings: { slug: 'market-test', name: 'Soup', description: 'Food', pickup_instructions: 'Pickup', category_codes: ['noodles'] }, items: [item] };
const staged = { slug: shop.settings.slug, org, branchId, variants: new Map([[item.sku, variant]]) };

function fixture() {
  let settings = null;
  let menu = { sku: item.sku, variant_id: variant, product_name: item.name, unit: item.unit, unit_price: item.price, published: false, is_sold_out: false };
  const writes = [];
  let locationRow, terminalRow;
  const request = async ({ method, path, body }) => {
    const resource = path.split('?')[0].replace('/api/v1/organizations/' + org, '');
    if (method !== 'GET') writes.push({ resource, body });
    switch (resource) {
      case '/inventory/locations':
        if (method === 'POST') return locationRow = { ...body, id: location, organization_id: org };
        return { total: Number(!!locationRow), items: locationRow ? [locationRow] : [] };
      case '/pos/terminals':
        if (method === 'POST') return terminalRow = { ...body, id: terminal };
        return { total: Number(!!terminalRow), items: terminalRow ? [terminalRow] : [] };
      case '/storefront':
        if (method === 'GET') return settings;
        assert.equal(body.revision, settings?.revision ?? 0);
        assert.equal(body.accepting_orders, false);
        if (body.published) assert.equal(menu.published, true);
        settings = { ...body, branch_id: branchId, stock_location_id: location, revision: body.revision + 1 };
        return settings;
      case '/storefront/products':
        return { total: 1, items: [menu] };
      case '/storefront/products/' + variant:
        assert.equal(settings.published, false);
        assert.equal(body.revision, settings.revision++);
        menu = { ...menu, published: body.published, is_sold_out: body.is_sold_out };
        return menu;
      default:
        assert.fail('Unexpected route');
    }
  };
  return { request, writes, settings: () => settings, open: () => { settings.accepting_orders = true; } };
}

test('stores the draft, lists all menu items, then publishes closed and is write-free on rerun', async () => {
  const state = fixture();
  const draft = await publishMarketShop(state.request, shop, staged, false);
  assert.equal(draft.published, false);
  assert.equal(state.settings().published, false);
  const shown = await publishMarketShop(state.request, shop, staged, true);
  assert.equal(shown.published, true);
  assert.equal(shown.accepting_orders, false);
  const count = state.writes.length;
  assert.deepEqual(await publishMarketShop(state.request, shop, staged, true), shown);
  assert.equal(state.writes.length, count);
  state.open();
  await assert.rejects(publishMarketShop(state.request, shop, staged, true), /accepting_orders/);
  assert.equal(state.writes.length, count);
});
