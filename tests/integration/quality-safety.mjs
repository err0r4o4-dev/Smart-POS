import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { purchasingFixture } from './purchasing-fixtures.mjs';
import { authSQL } from './auth-fixtures.mjs';
import {
  inventoryAccount,
  inventoryMembership,
} from './inventory-fixtures.mjs';

assert.match(
  process.env.AUTH_TEST_DATABASE ?? '',
  /^smartpos_phase53_phase54_phase55_phase56_[a-z0-9_]+$/,
);
const fixture = await purchasingFixture();
const {
  call,
  org,
  branch,
  owner,
  variant,
  variant2,
  warehouse,
  shelf,
  terminal,
  supplier,
} = fixture;
let assertions = 0;
function equal(actual, expected, label) {
  assert.deepEqual(actual, expected, label);
  assertions++;
}
async function ok(path, method = 'GET', body, status = 200, key, user = owner) {
  const result = await call(path, method, body, key, user);
  equal(result.status, status, path + ': ' + JSON.stringify(result.error));
  return result.data;
}
async function lot(
  name,
  product = variant,
  expires = '2099-01-01',
  status = 'ACTIVE',
) {
  return ok(
    '/quality/batches',
    'POST',
    {
      variant_id: product.id,
      lot_number: name,
      expires_on: expires,
      manufactured_on: null,
      status,
      reason: 'Synthetic physically observed lot',
    },
    201,
  );
}
async function stock(batch, quantity = '1', location = shelf) {
  let doc = await ok(
    '/inventory/adjustments',
    'POST',
    {
      location_id: location.id,
      adjustment_type: 'INCREASE',
      reason_code: 'OBSERVED_STOCK',
      notes: '',
      items: [
        {
          variant_id: batch.variant_id,
          quantity,
          batch_id: batch.id,
          batch_verified: true,
        },
      ],
    },
    201,
  );
  for (const action of ['submit', 'approve', 'post'])
    doc = await ok(`/inventory/adjustments/${doc.id}/${action}`, 'POST', {
      revision: doc.revision,
    });
}
async function cart(batch) {
  const value = await ok(
    '/pos/carts',
    'POST',
    { terminal_id: terminal.id },
    201,
  );
  return ok(`/pos/carts/${value.id}`, 'PATCH', {
    revision: value.revision,
    items: [
      {
        variant_id: variant.id,
        quantity: '1',
        batch_id: batch.id,
        batch_verified: true,
      },
    ],
  });
}
async function confirmed(batch) {
  const value = await cart(batch);
  const checkout = await ok(
    '/pos/checkout',
    'POST',
    {
      cart_id: value.id,
      revision: value.revision,
      method: 'CASH',
      expected_total: value.total,
      received: value.total,
    },
    201,
  );
  return ok(`/pos/payments/${checkout.id}/confirm`, 'POST', {
    acknowledged: true,
    reference: '',
  });
}
async function off(batch) {
  const doc = await ok(
    '/quality/write-offs',
    'POST',
    {
      location_id: shelf.id,
      variant_id: batch.variant_id,
      batch_id: batch.id,
      quantity: '1',
      reason: 'Synthetic physically verified loss',
    },
    201,
  );
  return ok(`/quality/write-offs/${doc.id}/approve`, 'POST', {
    revision: doc.revision,
  });
}
async function purchase(resource, doc, action) {
  return ok(`/purchasing/${resource}/${doc.id}/${action}`, 'POST', {
    revision: doc.revision,
    reason: 'Observed fixture',
  });
}
try {
  await ok(
    '/pos/shifts/open',
    'POST',
    { terminal_id: terminal.id, opening_cash: '100.00' },
    201,
  );
  for (let iteration = 0; iteration < 3; iteration++) {
    const batch = await lot('SALE-WRITEOFF-' + iteration);
    await stock(batch);
    const checkout = await confirmed(batch),
      writeoff = await off(batch);
    const [sale, loss] = await Promise.all([
      call(`/pos/checkouts/${checkout.id}/complete`, 'POST', {}),
      call(`/quality/write-offs/${writeoff.id}/post`, 'POST', {
        revision: writeoff.revision,
      }),
    ]);
    equal(sale.status, 200, 'racing checkout has explicit outcome');
    const sold = sale.data.status === 'COMPLETED';
    equal(
      loss.status,
      sold ? 409 : 200,
      'exactly one concurrent depletion succeeds',
    );
    equal(
      sale.data.status,
      sold ? 'COMPLETED' : 'RECONCILIATION_REQUIRED',
      'loser never fabricates sale/payment reversal',
    );
    equal(
      authSQL(
        `SELECT quantity::text FROM quality_stock_balances WHERE organization_id='${org}' AND location_id='${shelf.id}' AND batch_id='${batch.id}'`,
      ),
      '0.000',
      'no negative/double allocation',
    );
    equal(
      authSQL(
        `SELECT count(*) FROM stock_movements WHERE organization_id='${org}' AND batch_id='${batch.id}' AND quantity_delta<0`,
      ),
      '1',
      'one authoritative stock depletion',
    );
  }
  for (let iteration = 0; iteration < 3; iteration++) {
    const batch = await lot('SALE-RECALL-' + iteration);
    await stock(batch);
    const checkout = await confirmed(batch);
    const [sale, recall] = await Promise.all([
      call(`/pos/checkouts/${checkout.id}/complete`, 'POST', {}),
      call('/quality/recalls', 'POST', {
        variant_id: variant.id,
        batch_id: batch.id,
        reason: 'Concurrent safety activation',
      }),
    ]);
    equal(sale.status, 200, 'recall race returns durable checkout outcome');
    equal(recall.status, 201, 'recall activation commits');
    equal(
      ['COMPLETED', 'RECONCILIATION_REQUIRED'].includes(sale.data.status),
      true,
      'serialized pre-recall sale or safe blocked settlement',
    );
    const next = await cart(batch);
    equal(next.review_required, true, 'post-activation cart blocked');
    await ok(
      '/pos/checkout',
      'POST',
      {
        cart_id: next.id,
        revision: next.revision,
        method: 'CASH',
        expected_total: next.total,
        received: next.total,
      },
      409,
    );
    equal(
      authSQL(
        `SELECT count(*) FROM stock_movements movement JOIN quality_recalls recall ON recall.organization_id=movement.organization_id AND recall.batch_id=movement.batch_id WHERE movement.organization_id='${org}' AND movement.batch_id='${batch.id}' AND movement.movement_type='SALE' AND movement.created_at>recall.created_at`,
      ),
      '0',
      'no stock sale after committed recall',
    );
  }
  const statusBatch = await lot('QUALITY-STATUS');
  await stock(statusBatch);
  const quarantinedStatus = await ok(
    `/quality/batches/${statusBatch.id}`,
    'PUT',
    {
      ...statusBatch,
      id: undefined,
      organization_id: undefined,
      created_by: undefined,
      updated_by: undefined,
      created_at: undefined,
      updated_at: undefined,
      status: 'QUARANTINED',
      reason: 'Physically inspected quality hold',
    },
  );
  equal(
    quarantinedStatus.revision,
    statusBatch.revision + 1,
    'revisioned quality status update',
  );
  equal(
    (await cart(statusBatch)).review_required,
    true,
    'current quarantine overrides previously active stock',
  );
  equal(
    (await ok(`/quality/lots?branch_id=${branch}&variant_id=${variant.id}`))
      .find((batch) => batch.id === statusBatch.id)
      .history.map((entry) => entry.status),
    ['ACTIVE', 'QUARANTINED'],
    'immutable operation snapshots retain full quality status history',
  );
  const today = authSQL(
    "SELECT (statement_timestamp() AT TIME ZONE 'Asia/Bangkok')::date::text",
  );
  const expiresToday = await lot('EXPIRES-TODAY', variant, today);
  await stock(expiresToday);
  equal(
    (await cart(expiresToday)).review_required,
    true,
    'expiry date is inclusive Bangkok boundary',
  );
  const wrongVariant = await lot('OTHER-VARIANT', variant2);
  const badCart = await ok(
    '/pos/carts',
    'POST',
    { terminal_id: terminal.id },
    201,
  );
  await ok(
    `/pos/carts/${badCart.id}`,
    'PATCH',
    {
      revision: badCart.revision,
      items: [
        {
          variant_id: variant.id,
          quantity: '1',
          batch_id: wrongVariant.id,
          batch_verified: true,
        },
      ],
    },
    400,
  );

  const foreign = await purchasingFixture();
  try {
    const foreignResult = await foreign.call('/quality/batches', 'POST', {
      variant_id: foreign.variant.id,
      lot_number: 'FOREIGN-LOT',
      manufactured_on: null,
      expires_on: null,
      reason: 'Isolated foreign tenant fixture',
    });
    equal(
      foreignResult.status,
      201,
      'foreign tenant batch created in its own scope',
    );
    await ok(
      `/pos/carts/${badCart.id}`,
      'PATCH',
      {
        revision: badCart.revision,
        items: [
          {
            variant_id: variant.id,
            quantity: '1',
            batch_id: foreignResult.data.id,
            batch_verified: true,
          },
        ],
      },
      400,
    );
    await ok(
      '/quality/recalls',
      'POST',
      {
        variant_id: variant.id,
        batch_id: foreignResult.data.id,
        reason: 'Foreign reference denied',
      },
      404,
    );
    equal(
      authSQL(
        `BEGIN; SET LOCAL ROLE smartpos_runtime; SELECT set_config('app.organization_id','${org}',true); SELECT count(*) FROM product_batches WHERE id='${foreignResult.data.id}'; ROLLBACK;`,
      )
        .split('\n')
        .at(-2),
      '0',
      'FORCE RLS hides foreign lot',
    );
  } finally {
    foreign.close();
  }
  const manager = await inventoryAccount(fixture.clients);
  inventoryMembership(org, manager, 'MANAGER', [branch]);
  const replayBatch = await lot('REPLAY-LOSS');
  await stock(replayBatch);
  const writeoff = await off(replayBatch),
    replayKey = randomUUID(),
    replayBody = { revision: writeoff.revision };
  await ok(
    `/quality/write-offs/${writeoff.id}/post`,
    'POST',
    replayBody,
    200,
    replayKey,
    manager,
  );
  authSQL(
    `UPDATE organization_memberships SET role='CASHIER' WHERE organization_id='${org}' AND user_id='${manager.id}'`,
  );
  await ok(
    `/quality/write-offs/${writeoff.id}/post`,
    'POST',
    replayBody,
    403,
    replayKey,
    manager,
  );
  await ok(
    `/quality/batches?branch_id=${fixture.secondBranch}`,
    'GET',
    undefined,
    403,
    undefined,
    manager,
  );

  const receiptBatch = await lot('RECEIPT-IDENTITY');
  let order = await ok(
    '/purchasing/orders',
    'POST',
    {
      branch_id: branch,
      supplier_id: supplier.id,
      notes: '',
      items: [
        {
          variant_id: variant.id,
          purchase_unit_id: variant.unit_id,
          quantity: '3',
          unit_cost: '12.00',
        },
      ],
    },
    201,
  );
  for (const action of ['submit', 'approve', 'issue'])
    order = await purchase('orders', order, action);
  let receipt = await ok(
    '/purchasing/receipts',
    'POST',
    {
      branch_id: branch,
      supplier_id: supplier.id,
      parent_id: order.id,
      location_id: warehouse.id,
      notes: '',
      items: [
        {
          variant_id: variant.id,
          parent_item_id: order.items[0].id,
          quantity: '3',
          delivered_quantity: '3',
          rejected_quantity: '0',
          damaged_quantity: '0',
          reason: '',
          batch_id: receiptBatch.id,
          batch_verified: true,
        },
      ],
    },
    201,
  );
  for (const action of ['submit', 'approve', 'post'])
    receipt = await purchase('receipts', receipt, action);
  const supplierInput = {
    branch_id: branch,
    supplier_id: supplier.id,
    parent_id: receipt.id,
    location_id: warehouse.id,
    notes: '',
    items: [
      {
        variant_id: variant.id,
        parent_item_id: receipt.items[0].id,
        quantity: '1',
        reason: 'Observed return',
        batch_id: replayBatch.id,
        batch_verified: true,
      },
    ],
  };
  await ok('/purchasing/returns', 'POST', supplierInput, 400);
  supplierInput.items[0].batch_id = receiptBatch.id;
  let supplierReturn = await ok(
    '/purchasing/returns',
    'POST',
    supplierInput,
    201,
  );
  for (const action of ['submit', 'approve', 'dispatch'])
    supplierReturn = await purchase('returns', supplierReturn, action);
  equal(
    supplierReturn.items[0].batch_id,
    receiptBatch.id,
    'supplier return preserves observed receiving provenance',
  );

  const managed = await ok(
    '/shelves',
    'POST',
    {
      branch_id: branch,
      stock_location_id: shelf.id,
      code: 'QUALITY-SHELF',
      name: 'Quality managed shelf',
      zone: '',
      description: '',
      status: 'ACTIVE',
    },
    201,
  );
  const slot = await ok(
    `/shelves/${managed.id}/slots`,
    'POST',
    { code: 'LOT', position: 1 },
    201,
  );
  const assignment = await ok(
    `/shelves/${managed.id}/assignments`,
    'POST',
    {
      slot_id: slot.id,
      variant_id: variant.id,
      minimum_quantity: '0',
      target_quantity: '100',
      capacity_quantity: '100',
      status: 'ACTIVE',
    },
    201,
  );
  await ok(
    '/shelves/replenishments',
    'POST',
    {
      assignment_id: assignment.id,
      source_location_id: warehouse.id,
      quantity: '1',
      batch_id: wrongVariant.id,
      batch_verified: true,
    },
    404,
  );
  let task = await ok(
    '/shelves/replenishments',
    'POST',
    {
      assignment_id: assignment.id,
      source_location_id: warehouse.id,
      quantity: '1',
      batch_id: receiptBatch.id,
      batch_verified: true,
    },
    201,
  );
  task = await ok(`/shelves/replenishments/${task.id}/assign`, 'POST', {
    revision: task.revision,
    assigned_to: owner.id,
  });
  for (const action of ['start', 'complete'])
    task = await ok(`/shelves/replenishments/${task.id}/${action}`, 'POST', {
      revision: task.revision,
    });
  equal(task.status, 'COMPLETED', 'batch-aware shelf task completes');
  equal(
    authSQL(
      `SELECT count(*) FROM stock_movements WHERE organization_id='${org}' AND document_id='${task.transfer_id}' AND batch_id='${receiptBatch.id}'`,
    ),
    '2',
    'shelf transfer retains same lot on both sides',
  );
  const held = await lot('QUARANTINED-REPLENISH', variant, null, 'QUARANTINED');
  await stock(held, '1', warehouse);
  await ok(
    '/shelves/replenishments',
    'POST',
    {
      assignment_id: assignment.id,
      source_location_id: warehouse.id,
      quantity: '1',
      batch_id: held.id,
      batch_verified: true,
    },
    409,
  );
  const quarantine = await ok(
    '/inventory/locations',
    'POST',
    {
      branch_id: branch,
      code: 'Q',
      name: 'Quarantine',
      type: 'QUARANTINE',
      status: 'ACTIVE',
      description: '',
      parent_location_id: null,
    },
    201,
  );
  await ok(
    '/inventory/opening-balances',
    'POST',
    {
      location_id: quarantine.id,
      reason_code: 'UNKNOWN_RETURN',
      notes: '',
      items: [{ variant_id: variant.id, quantity: '1' }],
    },
    201,
  );
  let transfer = await ok(
    '/inventory/transfers',
    'POST',
    {
      location_id: quarantine.id,
      destination_location_id: warehouse.id,
      reason_code: 'NO_RELEASE',
      notes: '',
      items: [{ variant_id: variant.id, quantity: '1' }],
    },
    201,
  );
  for (const action of ['submit', 'approve'])
    transfer = await ok(
      `/inventory/transfers/${transfer.id}/${action}`,
      'POST',
      { revision: transfer.revision },
    );
  await ok(
    `/inventory/transfers/${transfer.id}/dispatch`,
    'POST',
    { revision: transfer.revision },
    409,
  );
  equal(
    authSQL(
      `SELECT count(*) FROM stock_balances balance WHERE organization_id='${org}' AND balance.quantity IS DISTINCT FROM (SELECT sum(quantity) FROM quality_stock_balances split WHERE split.organization_id=balance.organization_id AND split.location_id=balance.location_id AND split.variant_id=balance.variant_id)`,
    ),
    '0',
    'quality conservation after all safety boundaries',
  );
  console.log(
    JSON.stringify({ suite: 'quality-safety', assertions, status: 'PASSED' }),
  );
} finally {
  fixture.close();
}
