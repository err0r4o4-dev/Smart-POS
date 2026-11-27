import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { prepareMainCatalog } from './main-package.mjs';

const organizations = '/api/v1/organizations';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;

function createKey(release, slug) {
  const hash = createHash('sha256').update(`smartpos\0${release}\0${slug}\0catalog-stage`).digest();
  hash[6] = (hash[6] & 15) | 64;
  hash[8] = (hash[8] & 63) | 128;
  const hex = hash.toString('hex');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join('-');
}

function fields(actual, expected, label) {
  for (const [field, value] of Object.entries(expected)) {
    assert.deepEqual(actual?.[field], value, `${label}: unexpected ${field}`);
  }
}

function scopedId(record, org, label) {
  assert.match(record.id, uuid, `${label}: invalid resource ID`);
  assert.equal(record.organization_id, org, `${label}: unexpected organization`);
  return record.id;
}

async function list(request, path, status) {
  const data = await request({ method: 'GET', path: `${path}?page_size=50&status=${status}` });
  assert.ok(Array.isArray(data.items) && data.items.length === data.total, 'Catalog inventory is incomplete');
  return data.items;
}

function single(records, predicate, label) {
  const found = records.filter(predicate);
  assert.ok(found.length <= 1, `${label}: duplicate records`);
  return found[0];
}

const sameName = (left, right) => left.toLowerCase() === right.toLowerCase();

async function stageShop(request, release, shop) {
  const slug = shop.settings.slug;
  const branchInput = { code: 'MAIN', name: shop.zone, status: 'ACTIVE' };
  const organization = { ...shop.organization, address: shop.zone };
  const context = await request({
    method: 'POST', path: organizations, idempotencyKey: createKey(release.id, slug),
    body: { ...organization, branch: branchInput },
  });
  fields(context.organization, { ...organization, currency: 'THB', status: 'ACTIVE' }, slug);
  fields(context.membership, { role: 'OWNER', status: 'ACTIVE' }, slug);
  const org = context.organization.id;
  assert.match(org, uuid, `${slug}: invalid organization ID`);
  assert.equal(context.branches.length, 1, `${slug}: unexpected branches`);
  const branch = context.branches[0];
  fields(branch, { ...branchInput, is_main: true }, slug);
  const branchId = scopedId(branch, org, slug);
  const tenant = `${organizations}/${org}`;
  const ledgers = new Map();
  for (const resource of ['categories', 'units', 'products']) {
    const path = `${tenant}/${resource}`;
    const records = [...await list(request, path, ''), ...await list(request, path, 'ARCHIVED')];
    for (const record of records) scopedId(record, org, slug);
    ledgers.set(resource, { path, records });
  }

  const categories = new Map();
  const units = new Map();
  const variants = new Map();
  const approvedSKUs = new Set(shop.items.map(item => item.sku));
  assert.ok(ledgers.get('products').records.every(product =>
    product.variants.length === 1 && approvedSKUs.has(product.variants[0].sku)), `${slug}: unexpected existing product`);

  async function taxonomy(resource, name, unitNumber) {
    const { path, records } = ledgers.get(resource);
    const label = `${slug}/${name}`;
    const existing = single(records, row => sameName(row.name, name), label);
    const isUnit = resource === 'units';
    const body = { name, status: 'ACTIVE', ...(isUnit ? {
      code: `MKT-UNIT-${String(unitNumber).padStart(2, '0')}`, unit_type: 'COUNT',
    } : {}) };
    const row = existing ?? await request({ method: 'POST', path, body });
    fields(row, { name, status: 'ACTIVE', ...(isUnit ? { unit_type: 'COUNT' } : {}) }, label);
    if (isUnit) {
      assert.ok(row.base_unit_id == null, `${label}: unexpected base unit`);
    } else {
      assert.ok(row.parent_id == null, `${label}: unexpected parent category`);
    }
    return scopedId(row, org, label);
  }

  for (const item of shop.items) {
    if (!categories.has(item.category)) categories.set(item.category, await taxonomy('categories', item.category));
    if (!units.has(item.unit)) units.set(item.unit, await taxonomy('units', item.unit, units.size + 1));
    const { path, records } = ledgers.get('products');
    const label = `${slug}/${item.sku}`;
    const existing = single(records, row => row.variants.some(variant => variant.sku === item.sku), label);
    const expectedProduct = { name: item.name, description: item.description, category_id: categories.get(item.category), status: 'ACTIVE' };
    const expectedVariant = {
      sku: item.sku, name: item.name, unit_id: units.get(item.unit), status: 'ACTIVE',
      cost_price: '0.00', selling_price: item.price, attributes: { storefront_image_url: item.image_url },
    };
    const row = existing ?? await request({
      method: 'POST', path, body: { ...expectedProduct, variants: [expectedVariant] },
    });
    fields(row, expectedProduct, label);
    const productID = scopedId(row, org, label);
    assert.equal(row.variants.length, 1, `${label}: unexpected variants`);
    const variant = row.variants[0];
    fields(variant, { ...expectedVariant, product_id: productID, currency: 'THB' }, label);
    variants.set(item.sku, scopedId(variant, org, label));
  }
  return { slug, org, branchId, variants };
}

// The request callback is the existing authenticated API client boundary.
// This module has no credentials, target selection, CLI or publication action.
export async function stageMarketCatalogs(request) {
  const release = await prepareMainCatalog();
  const result = [];
  for (const shop of release.shops) result.push(await stageShop(request, release, shop));
  return result;
}
