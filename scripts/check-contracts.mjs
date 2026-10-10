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
const inventoryPaths = [
  '/overview',
  '/locations',
  '/locations/{resourceId}',
  '/balances',
  '/balances/{resourceId}',
  '/movements',
  '/movements/{resourceId}',
  '/opening-balances',
  '/reorder-points',
  '/counts/{resourceId}/items',
  ...['adjustments', 'counts', 'transfers'].flatMap((resource) => [
    '/' + resource,
    '/' + resource + '/{resourceId}',
    ...(resource === 'adjustments'
      ? ['submit', 'approve', 'post', 'reject', 'cancel']
      : resource === 'counts'
        ? ['submit', 'approve', 'post', 'cancel']
        : ['submit', 'approve', 'dispatch', 'receive', 'cancel']
    ).map((action) => '/' + resource + '/{resourceId}/' + action),
  ]),
].map((path) => '/api/v1/organizations/{id}/inventory' + path);
const supplyPaths = [
  '/suppliers',
  '/suppliers/{resourceId}',
  '/suppliers/{resourceId}/products',
  '/suppliers/{resourceId}/products/{productId}',
  ...[
    ['orders', ['submit', 'approve', 'reject', 'issue', 'cancel', 'close']],
    ['receipts', ['submit', 'approve', 'reject', 'correct', 'cancel', 'post']],
    ['returns', ['submit', 'approve', 'reject', 'cancel', 'dispatch']],
  ].flatMap(([resource, actions]) => [
    '/purchasing/' + resource,
    '/purchasing/' + resource + '/{resourceId}',
    ...actions.map(
      (action) => '/purchasing/' + resource + '/{resourceId}/' + action,
    ),
  ]),
  '/purchasing/discrepancies',
  '/purchasing/discrepancies/{resourceId}',
  '/purchasing/suggestions',
  '/purchasing/suggestions/create-draft',
  '/shelves',
  '/shelves/{resourceId}',
  '/shelves/{resourceId}/slots',
  '/shelves/{resourceId}/assignments',
  '/shelves/{resourceId}/assignments/{assignmentId}',
  '/shelves/replenishments',
  '/shelves/replenishments/{resourceId}',
  '/shelves/replenishments/suggestions',
  ...['assign', 'start', 'complete', 'cancel'].map(
    (action) => '/shelves/replenishments/{resourceId}/' + action,
  ),
].map((path) => '/api/v1/organizations/{id}' + path);
const posPaths = [
  '/pos/terminals',
  '/pos/terminals/{resourceId}',
  '/pos/products',
  '/pos/barcodes/{code}',
  '/pos/payment-methods',
  '/pos/shifts',
  '/pos/shifts/open',
  '/pos/shifts/{resourceId}',
  '/pos/shifts/{resourceId}/close',
  '/pos/carts',
  '/pos/carts/{resourceId}',
  ...['hold', 'resume', 'cancel'].map(
    (action) => '/pos/carts/{resourceId}/' + action,
  ),
  '/pos/checkout',
  '/pos/checkouts',
  '/pos/checkouts/{resourceId}',
  ...['complete', 'cancel', 'resolve'].map(
    (action) => '/pos/checkouts/{resourceId}/' + action,
  ),
  '/pos/payments/{resourceId}/confirm',
  '/sales',
  '/sales/{resourceId}',
  '/receipts',
  '/receipts/{resourceId}',
].map((path) => '/api/v1/organizations/{id}' + path);
const returnPaths = [
  '/returns',
  '/returns/{resourceId}',
  '/returns/sales/{saleId}',
  ...['submit', 'approve', 'reject', 'cancel', 'complete'].map(
    (action) => '/returns/{resourceId}/' + action,
  ),
  '/refunds',
  '/refunds/{resourceId}',
  ...['report-settlement', 'confirm-settlement', 'reconcile'].map(
    (action) => '/refunds/{resourceId}/' + action,
  ),
].map((path) => '/api/v1/organizations/{id}' + path);
assert.deepEqual(
  Object.keys(api.paths).sort(),
  [
    ...posPaths,
    ...catalogPaths,
    ...inventoryPaths,
    ...supplyPaths,
    ...returnPaths,
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
  for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
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
for (const path of supplyPaths) {
  for (const method of ['get', 'post', 'patch']) {
    const operation = api.paths[path][method];
    if (!operation) continue;
    assert.ok(
      !operationIDs.has(operation.operationId),
      'Duplicate Phase 4 operationId',
    );
    operationIDs.add(operation.operationId);
    assert.match(
      operation.description,
      /Permission: (supplier|purchasing|shelf)\./,
    );
    for (const status of ['400', '401', '403', '404', '409', '503'])
      assert.ok(operation.responses[status]);
    if (
      method !== 'get' &&
      (path.includes('/purchasing/') || path.includes('/replenishments'))
    )
      assert.ok(
        operation.parameters.some(
          (parameter) =>
            parameter.name === 'Idempotency-Key' &&
            parameter.required &&
            parameter.schema.format === 'uuid',
        ),
      );
    if (
      method === 'get' &&
      !path.includes('{resourceId}') &&
      !path.endsWith('/products')
    )
      assert.ok(
        operation.parameters.some(
          (parameter) =>
            parameter.name === 'page_size' && parameter.schema.maximum === 100,
        ),
      );
  }
}
for (const [schema, valid, invalid] of [
  ['SupplyMoney', '9999999999999999.99', '1.001'],
  ['SupplyQuantity', '999999999999999.999', '1e3'],
  ['SupplyFactor', '24.000000', '0.0000001'],
]) {
  const pattern = new RegExp(api.components.schemas[schema].pattern);
  assert.ok(pattern.test(valid));
  assert.ok(!pattern.test(invalid));
  assert.equal(api.components.schemas[schema].type, 'string');
}
assert.equal(
  api.components.schemas.PurchaseDocumentInput.properties.items.maxItems,
  100,
);
assert.equal(api.components.schemas.Shelf.properties.assignments.maxItems, 100);
assert.equal(
  api.components.schemas.PurchaseLine.properties.conversion_factor.$ref,
  '#/components/schemas/SupplyFactor',
);
for (const movement of ['PURCHASE_RECEIVE', 'SUPPLIER_RETURN'])
  assert.ok(
    api.components.schemas.InventoryMovement.properties.movement_type.enum.includes(
      movement,
    ),
  );
for (const path of inventoryPaths) {
  for (const method of ['get', 'post', 'put', 'patch']) {
    const operation = api.paths[path][method];
    if (!operation) continue;
    assert.ok(!operationIDs.has(operation.operationId));
    operationIDs.add(operation.operationId);
    assert.ok(operation.description.includes('inventory.'));
    for (const status of ['400', '401', '403', '404', '409', '503'])
      assert.ok(operation.responses[status]);
    if (method !== 'get' && !path.includes('/locations')) {
      assert.ok(
        operation.parameters.some(
          (parameter) =>
            parameter.name === 'Idempotency-Key' && parameter.required,
        ),
      );
    }
  }
}
const inventoryQuantity = new RegExp(
  api.components.schemas.InventoryQuantity.pattern,
);
assert.ok(inventoryQuantity.test('999999999999999.999'));
assert.ok(!inventoryQuantity.test('1.0001'));
assert.ok(
  api.components.schemas.InventoryMovement.properties.movement_type.enum.includes(
    'COUNT_CORRECTION',
  ),
);
assert.equal(
  api.components.schemas.InventoryBalance.properties.quantity.$ref,
  '#/components/schemas/InventoryQuantity',
);
assert.equal(
  api.components.schemas.InventoryLocationPage.properties.page_size.maximum,
  100,
);
assert.equal(
  api.components.schemas.InventoryOpeningInput.properties.items.maxItems,
  100,
);
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
for (const path of posPaths) {
  for (const method of ['get', 'post', 'patch']) {
    const operation = api.paths[path][method];
    if (!operation) continue;
    assert.ok(
      !operationIDs.has(operation.operationId),
      'Duplicate POS operation',
    );
    operationIDs.add(operation.operationId);
    assert.ok(/pos\.|sales\.|receipts\./.test(operation.description));
    for (const status of ['400', '401', '403', '404', '409', '503'])
      assert.ok(operation.responses[status]);
  }
}
assert.equal(api.components.schemas.POSMoney.type, 'string');
assert.ok(new RegExp(api.components.schemas.POSMoney.pattern).test('2.25'));
assert.ok(!new RegExp(api.components.schemas.POSMoney.pattern).test('2.251'));
assert.equal(
  api.components.schemas.POSProductPage.properties.page_size.maximum,
  100,
);
assert.equal(
  api.components.schemas.POSCartInput.properties.items.maxItems,
  100,
);
assert.equal(
  api.components.schemas.POSSaleItem.properties.quantity.$ref,
  '#/components/schemas/InventoryQuantity',
);
assert.equal(
  api.components.schemas.POSSale.properties.grand_total.$ref,
  '#/components/schemas/POSMoney',
);
checkReferences(api);
for (const path of returnPaths) {
  for (const method of ['get', 'post']) {
    const operation = api.paths[path][method];
    if (!operation) continue;
    assert.ok(
      !operationIDs.has(operation.operationId),
      'Duplicate return operation',
    );
    operationIDs.add(operation.operationId);
    for (const status of ['400', '401', '403', '404', '409', '503'])
      assert.ok(operation.responses[status]);
    if (method === 'post')
      assert.ok(
        operation.parameters.some(
          (parameter) =>
            parameter.name === 'Idempotency-Key' && parameter.required === true,
        ),
      );
  }
}
assert.equal(
  api.components.schemas.POSShift.properties.cash_refunds.$ref,
  '#/components/schemas/POSMoney',
);
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
