import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { purchasingFixture } from './purchasing-fixtures.mjs';
import { authSQL } from './auth-fixtures.mjs';
import {
  inventoryAccount,
  inventoryMembership,
} from './inventory-fixtures.mjs';

if (
  !/^smartpos_phase53_phase54_phase55_phase56_[a-z0-9_]+$/.test(
    process.env.AUTH_TEST_DATABASE ?? '',
  )
)
  throw new Error('Quality tests require dedicated Phase56 scratch DB');
const fixture = await purchasingFixture();
const {
  call,
  owner,
  org,
  branch,
  variant,
  supplier,
  warehouse,
  shelf,
  terminal,
} = fixture;
let assertions = 0;
function equal(actual, expected, label) {
  assert.deepEqual(actual, expected, label);
  assertions++;
}
async function ok(path, method = 'GET', body, status = 200, key, user = owner) {
  const response = await call(path, method, body, key, user);
  equal(response.status, status, path + ': ' + JSON.stringify(response.error));
  return response.data;
}
async function act(resource, doc, action) {
  return ok(`/purchasing/${resource}/${doc.id}/${action}`, 'POST', {
    revision: doc.revision,
    reason: 'Physical fixture inspection',
  });
}
async function lot(number, expiry, status = 'ACTIVE') {
  return ok(
    '/quality/batches',
    'POST',
    {
      variant_id: variant.id,
      lot_number: number,
      manufactured_on: null,
      expires_on: expiry,
      status,
      reason: 'Observed synthetic receiving label',
    },
    201,
  );
}
async function receive(batch) {
  let order = await ok(
    '/purchasing/orders',
    'POST',
    {
      branch_id: branch,
      supplier_id: supplier.id,
      notes: 'Batch fixture',
      items: [
        {
          variant_id: variant.id,
          purchase_unit_id: variant.unit_id,
          quantity: '4',
          unit_cost: '12.00',
        },
      ],
    },
    201,
  );
  for (const action of ['submit', 'approve', 'issue'])
    order = await act('orders', order, action);
  let receipt = await ok(
    '/purchasing/receipts',
    'POST',
    {
      branch_id: branch,
      supplier_id: supplier.id,
      parent_id: order.id,
      location_id: warehouse.id,
      notes: 'Physically inspected lot',
      items: [
        {
          variant_id: variant.id,
          parent_item_id: order.items[0].id,
          quantity: '4',
          delivered_quantity: '4',
          rejected_quantity: '0',
          damaged_quantity: '0',
          reason: 'Observed lot',
          batch_id: batch.id,
          batch_verified: true,
        },
      ],
    },
    201,
  );
  for (const action of ['submit', 'approve', 'post'])
    receipt = await act('receipts', receipt, action);
  equal(receipt.items[0].batch_id, batch.id, 'receipt persists lot identity');
  let transfer = await ok(
    '/inventory/transfers',
    'POST',
    {
      location_id: warehouse.id,
      destination_location_id: shelf.id,
      reason_code: 'PHYSICAL_BATCH_MOVE',
      notes: 'Observed physical selection',
      items: [
        {
          variant_id: variant.id,
          quantity: '4',
          batch_id: batch.id,
          batch_verified: true,
        },
      ],
    },
    201,
  );
  for (const action of ['submit', 'approve', 'dispatch'])
    transfer = await ok(
      `/inventory/transfers/${transfer.id}/${action}`,
      'POST',
      { revision: transfer.revision },
    );
  equal(transfer.status, 'RECEIVED', 'tracked warehouse-to-shelf transfer');
}
async function cart(batch, quantity = '1', verified = true) {
  let value = await ok('/pos/carts', 'POST', { terminal_id: terminal.id }, 201);
  return ok(`/pos/carts/${value.id}`, 'PATCH', {
    revision: value.revision,
    items: [
      {
        variant_id: variant.id,
        quantity,
        ...(batch ? { batch_id: batch.id, batch_verified: verified } : {}),
      },
    ],
  });
}
async function prepare(value) {
  return ok(
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
}
async function complete(value) {
  await ok(`/pos/payments/${value.id}/confirm`, 'POST', {
    acknowledged: true,
    reference: '',
  });
  const posted = await ok(`/pos/checkouts/${value.id}/complete`, 'POST', {});
  equal(posted.status, 'COMPLETED', 'quality-aware sale posts');
  return ok(`/returns/sales/${posted.sale_id}`);
}
async function returned(sale, batch, destination, disposition) {
  let value = await ok(
    '/returns',
    'POST',
    {
      original_sale_id: sale.id,
      reason: 'Physical returned lot inspected',
      items: [
        {
          original_sale_item_id: sale.items[0].id,
          quantity: '1',
          disposition,
          destination_location_id: destination,
          batch_id: batch?.id ?? null,
          batch_verified: !!batch,
        },
      ],
    },
    201,
  );
  for (const action of ['submit', 'approve', 'complete'])
    value = await ok(`/returns/${value.id}/${action}`, 'POST', {
      revision: value.revision,
    });
  return value;
}
async function off(batch, quantity = '1') {
  let value = await ok(
    '/quality/write-offs',
    'POST',
    {
      location_id: shelf.id,
      variant_id: variant.id,
      batch_id: batch?.id ?? null,
      quantity,
      reason: 'Physically verified quality loss',
    },
    201,
  );
  value = await ok(`/quality/write-offs/${value.id}/approve`, 'POST', {
    revision: value.revision,
  });
  return value;
}
async function balances() {
  return ok(
    `/quality/batches?branch_id=${branch}&variant_id=${variant.id}&location_id=${shelf.id}`,
  );
}
try {
  await ok(
    '/pos/shifts/open',
    'POST',
    { terminal_id: terminal.id, opening_cash: '100.00' },
    201,
  );
  const active = await lot('ACTIVE-LOT', '2099-01-01'),
    expired = await lot('EXPIRED-LOT', '2001-01-01'),
    quarantined = await lot('QUARANTINED-LOT', null, 'QUARANTINED');
  equal(
    active.manufactured_on,
    null,
    'unknown manufactured date stays unknown',
  );
  const lots = await ok(
    `/quality/lots?branch_id=${branch}&variant_id=${variant.id}`,
  );
  equal(
    lots[0].id,
    expired.id,
    'deterministic expiry-first suggestions, not automatic physical allocation',
  );
  for (const batch of [active, expired, quarantined]) await receive(batch);
  let split = await balances();
  equal(
    split.find((value) => value.batch_id === null).quantity,
    '5.000',
    'legacy opening remains explicit untracked',
  );
  equal(
    split.find((value) => value.batch_id === active.id).quantity,
    '4.000',
    'tracked receipt and transfer conserve',
  );
  const invalidCart = await ok(
    '/pos/carts',
    'POST',
    { terminal_id: terminal.id },
    201,
  );
  await ok(
    `/pos/carts/${invalidCart.id}`,
    'PATCH',
    {
      revision: invalidCart.revision,
      items: [{ variant_id: variant.id, quantity: '1', batch_id: active.id }],
    },
    400,
  );
  for (const batch of [expired, quarantined]) {
    const value = await cart(batch);
    equal(
      value.review_required,
      true,
      'non sellable selected lot requires review',
    );
    await ok(
      '/pos/checkout',
      'POST',
      {
        cart_id: value.id,
        revision: value.revision,
        method: 'CASH',
        expected_total: value.total,
        received: value.total,
      },
      409,
    );
  }
  const sold = await complete(await prepare(await cart(active)));
  equal(
    sold.items[0].batch_id,
    active.id,
    'immutable sale retains physical batch',
  );
  await returned(sold, active, warehouse.id, 'RESTOCK_SELLABLE');
  let writeoff = await off(active);
  const key = randomUUID();
  const posted = await ok(
    `/quality/write-offs/${writeoff.id}/post`,
    'POST',
    { revision: writeoff.revision },
    200,
    key,
  );
  equal(posted.status, 'POSTED', 'approved write off posted');
  equal(
    (
      await ok(
        `/quality/write-offs/${writeoff.id}/post`,
        'POST',
        { revision: writeoff.revision },
        200,
        key,
      )
    ).id,
    posted.id,
    'same-key posting replay',
  );
  await ok(
    `/quality/write-offs/${writeoff.id}/post`,
    'POST',
    { revision: posted.revision },
    409,
  );
  equal(
    authSQL(
      `SELECT count(*) FROM stock_movements WHERE organization_id='${org}' AND quality_write_off_id='${writeoff.id}'`,
    ),
    '1',
    'writeoff has exactly one authoritative movement',
  );
  const abandoned = await prepare(await cart(active));
  const recall = await ok(
    '/quality/recalls',
    'POST',
    {
      variant_id: variant.id,
      batch_id: active.id,
      reason: 'Verified synthetic batch recall',
    },
    201,
  );
  equal(
    (await ok(`/quality/recalls?branch_id=${branch}`)).find(
      (value) => value.id === recall.id,
    ).affected_locations.length,
    2,
    'recall reports all affected branch locations',
  );
  await ok(`/pos/payments/${abandoned.id}/confirm`, 'POST', {
    acknowledged: true,
    reference: '',
  });
  const denied = await ok(
    `/pos/checkouts/${abandoned.id}/complete`,
    'POST',
    {},
  );
  equal(
    denied.status,
    'RECONCILIATION_REQUIRED',
    'late recall blocks posting while preserving manual funds evidence',
  );
  equal(denied.sale_id ?? '', '', 'late recall does not create sale');
  const legacy = await complete(await prepare(await cart(null)));
  equal(
    legacy.items[0].batch_id,
    null,
    'walk-in legacy sale does not invent batch',
  );
  await ok(
    '/quality/recalls',
    'POST',
    {
      variant_id: variant.id,
      batch_id: null,
      reason: 'Product-level unknown-lot safety hold',
    },
    201,
  );
  const blocked = await cart(null);
  equal(
    blocked.review_required,
    true,
    'product recall blocks unknown provenance stock',
  );
  const cashier = await inventoryAccount(fixture.clients);
  inventoryMembership(org, cashier, 'CASHIER', [branch]);
  await ok(
    '/quality/write-offs',
    'POST',
    {
      location_id: shelf.id,
      variant_id: variant.id,
      batch_id: expired.id,
      quantity: '1',
      reason: 'denied',
    },
    403,
    undefined,
    cashier,
  );
  await ok(
    `/quality/batches?branch_id=${fixture.secondBranch}`,
    'GET',
    undefined,
    403,
    undefined,
    cashier,
  );
  const ownerOff = await off(expired);
  const race = await Promise.all([
    call(
      `/quality/write-offs/${ownerOff.id}/post`,
      'POST',
      { revision: ownerOff.revision },
      randomUUID(),
    ),
    call(
      `/quality/write-offs/${ownerOff.id}/post`,
      'POST',
      { revision: ownerOff.revision },
      randomUUID(),
    ),
  ]);
  equal(
    race.map((value) => value.status).sort(),
    [200, 409],
    'concurrent posting is once-only',
  );
  const mismatch = authSQL(
    `SELECT count(*) FROM stock_balances balance WHERE organization_id='${org}' AND quantity<>(SELECT sum(quantity) FROM quality_stock_balances split WHERE split.organization_id=balance.organization_id AND split.location_id=balance.location_id AND split.variant_id=balance.variant_id)`,
  );
  equal(
    mismatch,
    '0',
    'aggregate=tracked+untracked after receipt/transfer/sale/return/writeoff/recall',
  );
  console.log(
    JSON.stringify({ suite: 'quality-flow', assertions, status: 'PASSED' }),
  );
} finally {
  fixture.close();
}
