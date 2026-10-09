import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';

const modules = JSON.parse(
  readFileSync('packages/contracts/routes.json', 'utf8'),
);
const expected = [6, 4, 9, 6, 9, 11, 7, 8, 5, 5, 4, 6, 7, 5, 10, 4];
assert.equal(modules.length, 16);
assert.deepEqual(
  modules.map((item) => item.routes.length),
  expected,
);
const routes = modules.flatMap((item) => item.routes);
assert.equal(routes.length, 106);
assert.equal(new Set(routes).size, 106);
const routeDocs = readFileSync('docs/architecture/routes.md', 'utf8');
const moduleDocs = readFileSync('docs/architecture/modules.md', 'utf8');
for (const item of modules) {
  assert.ok(
    moduleDocs.includes(`## ${item.name} (`),
    `Missing module ${item.name}`,
  );
  for (const route of item.routes)
    assert.ok(routeDocs.includes('`' + route + '`'), `Missing route ${route}`);
}
const api = YAML.parse(readFileSync('packages/contracts/openapi.yaml', 'utf8'));
const catalogPaths = [
  '/products',
  '/products/{productId}',
  '/products/{productId}/variants',
  '/products/{productId}/variants/{variantId}',
  '/products/{productId}/variants/{variantId}/barcodes',
  '/products/{productId}/variants/{variantId}/barcodes/generate',
  '/products/{productId}/variants/{variantId}/barcodes/{barcodeId}',
  '/products/{productId}/labels',
  '/barcodes/lookup',
  '/products/import/preview',
  '/products/import/{jobId}/confirm',
  '/products/import/{jobId}',
  '/categories',
  '/categories/{resourceId}',
  '/brands',
  '/brands/{resourceId}',
  '/units',
  '/units/{resourceId}',
].map((path) => '/api/v1/organizations/{id}' + path);
assert.equal(api.openapi, '3.1.0');
assert.deepEqual(
  Object.keys(api.paths).sort(),
  [
    ...catalogPaths,
    '/api/v1/auth/forgot-password',
    '/api/v1/auth/login',
    '/api/v1/auth/logout',
    '/api/v1/auth/me',
    '/api/v1/auth/register',
    '/api/v1/auth/reset-password',
    '/api/v1/invitations/accept',
    '/api/v1/organizations',
    '/api/v1/organizations/{id}',
    '/api/v1/organizations/{id}/audit',
    '/api/v1/organizations/{id}/branches',
    '/api/v1/organizations/{id}/branches/{branchId}',
    '/api/v1/organizations/{id}/context',
    '/api/v1/organizations/{id}/invitations',
    '/api/v1/organizations/{id}/invitations/{invitationId}',
    '/api/v1/organizations/{id}/members',
    '/api/v1/organizations/{id}/members/{memberId}',
    '/api/v1/organizations/{id}/permissions',
    '/api/v1/organizations/{id}/roles',
    '/api/v1/system',
    '/health/live',
    '/health/ready',
  ].sort(),
);
assert.equal(api.components.schemas.Readiness.properties.status.const, 'ready');
assert.equal(api.components.schemas.Liveness.properties.status.const, 'ok');
assert.ok(api.paths['/health/ready'].get.responses['503']);
const memberSchema = api.components.schemas.Member;
assert.equal(memberSchema.type, 'object');
assert.equal(memberSchema.additionalProperties, false);
assert.equal(memberSchema.allOf, undefined);
assert.deepEqual(Object.keys(memberSchema.properties).sort(), [
  'branch_ids',
  'display_name',
  'email',
  'id',
  'permissions',
  'role',
  'status',
  'user_id',
]);
assert.deepEqual(
  [...memberSchema.required].sort(),
  Object.keys(memberSchema.properties).sort(),
);
for (const [path, item] of Object.entries(api.paths)) {
  if (!path.includes('/organizations') && path !== '/api/v1/invitations/accept')
    continue;
  for (const method of ['get', 'post', 'patch', 'delete']) {
    if (!item[method]) continue;
    assert.deepEqual(item[method].security, [{ sessionCookie: [] }]);
    if (method !== 'get')
      assert.ok(
        item[method].parameters.some(
          (parameter) => parameter.$ref === '#/components/parameters/CSRF',
        ),
      );
  }
}
const compose = YAML.parse(readFileSync('docker-compose.yml', 'utf8'));
const operationIDs = new Set();
for (const path of catalogPaths) {
  for (const method of ['get', 'post', 'patch', 'delete']) {
    const operation = api.paths[path][method];
    if (!operation) continue;
    assert.ok(
      !operationIDs.has(operation.operationId),
      'Duplicate operationId',
    );
    operationIDs.add(operation.operationId);
    assert.ok(
      operation.description.includes('catalog.'),
      'Missing catalog permission',
    );
    assert.ok(operation.responses['401']);
    assert.ok(operation.responses['403']);
    assert.ok(operation.responses['404']);
  }
}
function checkReferences(value) {
  if (!value || typeof value !== 'object') return;
  if (value.$ref) {
    assert.ok(
      value.$ref.startsWith('#/'),
      'Unexpected external contract reference',
    );
    const target = value.$ref
      .slice(2)
      .split('/')
      .reduce((current, key) => current?.[key], api);
    assert.ok(target, 'Missing reference ' + value.$ref);
  }
  for (const child of Object.values(value)) checkReferences(child);
}
checkReferences(api);
assert.equal(
  api.components.schemas.CatalogVariantInput.properties.cost_price.type,
  'string',
);
assert.equal(
  api.components.schemas.CatalogBarcodeInput.properties.code.type,
  'string',
);
assert.equal(
  api.components.schemas.CatalogProductPage.properties.page_size.maximum,
  100,
);
assert.equal(
  api.components.schemas.CatalogProductCreate.properties.variants.minItems,
  1,
);
for (const service of ['web', 'api', 'ai', 'postgres', 'caddy'])
  assert.ok(compose.services[service].healthcheck);
assert.ok(
  !compose.services.ai.ports,
  'Internal AI must not publish a host port',
);
console.log(
  'PASS: 16 modules, 106 unique documented routes, foundation contract and service health wiring',
);
