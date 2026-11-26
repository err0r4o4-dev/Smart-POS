import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareMainCatalog } from './main-package.mjs';
import { createMarketOwnerRequest } from './main-owner-request.mjs';

const origin = 'http://127.0.0.1:8088';
const organizations = '/api/v1/organizations';
const org = '053a2d0d-89be-4bfa-8954-a20da0f60e03';
const foreign = '053a2d0d-89be-4bfa-8954-a20da0f60e04';
const { shops: [shop] } = await prepareMainCatalog();
const idempotencyKey = 'dac691b0-6f7c-4f29-8712-f6c796c4994e';
const create = {
  method: 'POST', path: organizations, idempotencyKey,
  body: { ...shop.organization, address: shop.zone, branch: { code: 'MAIN', name: shop.zone, status: 'ACTIVE' } },
};

function pageFor({ url = origin, mfa = true, status = 201, verifiedOwner = true } = {}) {
  const operations = [];
  return {
    url: () => url,
    operations,
    evaluate: async (_, operation) => {
      operations.push(operation);
      if (!operation.method) return mfa ? { ok: true } : { ok: false, status: 403 };
      if (operation.path === organizations) {
        return status === 201 ? {
          ok: true, data: {
            organization: { ...shop.organization, id: org },
            membership: { role: verifiedOwner ? 'OWNER' : 'STAFF', status: 'ACTIVE' },
          },
        } : { ok: false, status };
      }
      return { ok: true, data: [] };
    },
  };
}

test('checks the main origin and MFA before allowing owner requests', async () => {
  const other = pageFor({ url: 'http://127.0.0.1:15644/shop' });
  await assert.rejects(createMarketOwnerRequest(other), /8088/);
  assert.equal(other.operations.length, 0);
  const unverified = pageFor({ mfa: false });
  await assert.rejects(createMarketOwnerRequest(unverified), /MFA/);
  assert.equal(unverified.operations.length, 1);
});

test('allows only approved organization creation and returned owner tenant routes', async () => {
  const page = pageFor();
  const request = await createMarketOwnerRequest(page);
  await assert.rejects(request({ path: `${organizations}/${org}/categories` }), /scope/);
  await assert.rejects(request({ ...create, body: { ...create.body, name: 'Unapproved' } }), /scope/);
  await request(create);
  const items = `${organizations}/${org}/categories?page_size=50&status=`;
  assert.deepEqual(await request({ path: items }), []);
  await assert.rejects(request({ path: `${organizations}/${foreign}/categories` }), /scope/);
  await assert.rejects(request({ path: `//example.com${items}` }), /scope/);
  await assert.rejects(request({ path: `${organizations}/${org}/staff` }), /scope/);
  await assert.rejects(request({ path: items, method: 'DELETE' }), /scope/);
  await assert.rejects(request({ method: 'PUT', path: `${organizations}/${org}/storefront`, body: {
    slug: shop.settings.slug, accepting_orders: true,
  } }), /scope/);
  assert.equal(page.operations.length, 3);
});

test('does not trust tenant IDs from denied or non-owner responses', async () => {
  for (const page of [pageFor({ status: 403 }), pageFor({ verifiedOwner: false })]) {
    const request = await createMarketOwnerRequest(page);
    await assert.rejects(request(create), /403|owner/);
    await assert.rejects(request({ path: `${organizations}/${org}/storefront` }), /scope/);
  }
});
