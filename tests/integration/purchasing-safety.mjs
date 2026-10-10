import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { authSQL } from './auth-fixtures.mjs';
import { purchasingFixture } from './purchasing-fixtures.mjs';
import {
  inventoryAccount,
  inventoryMembership,
} from './inventory-fixtures.mjs';

let assertions = 0;
const equal = (actual, expected, label) => {
  assert.equal(actual, expected, label);
  assertions++;
};
const fixture = await purchasingFixture();
const {
  call,
  org,
  branch,
  owner,
  variant,
  shelf,
  warehouse,
  supplier,
  countUnit: unit,
  terminal,
  clients,
} = fixture;
async function ok(
  path,
  method = 'GET',
  body,
  key,
  user = owner,
  status = method === 'POST' ? 201 : 200,
) {
  const result = await call(path, method, body, key, user);
  equal(result.status, status, path + ': ' + JSON.stringify(result.error));
  return result.data;
}
async function action(resource, doc, name, body = {}, key, user = owner) {
  return ok(
    `/purchasing/${resource}/${doc.id}/${name}`,
    'POST',
    { revision: doc.revision, ...body },
    key,
    user,
    200,
  );
}
async function approved(resource, doc) {
  doc = await action(resource, doc, 'submit');
  return action(resource, doc, 'approve');
}
async function stock(location) {
  const result = await ok(
    `/inventory/balances?branch_id=${branch}&location_id=${location.id}&variant_id=${variant.id}`,
  );
  return result.items[0]?.quantity ?? '0.000';
}
function blocked(statement, code, label) {
  const result = authSQL(
    `BEGIN; SET LOCAL ROLE smartpos_runtime; SET LOCAL app.organization_id='${org}'; DO $$ BEGIN BEGIN ${statement}; RAISE EXCEPTION 'unexpected success'; EXCEPTION WHEN SQLSTATE '${code}' THEN NULL; END; END $$; ROLLBACK; SELECT 'BLOCKED';`,
  );
  equal(result.split('\n').at(-1), 'BLOCKED', label);
}
try {
  const tables = [
    'suppliers',
    'supplier_products',
    'purchasing_documents',
    'purchasing_items',
    'purchasing_events',
    'shelves',
    'shelf_slots',
    'shelf_assignments',
    'replenishment_tasks',
  ];
  equal(
    authSQL(
      `SELECT count(*) FROM pg_class WHERE relname=ANY(ARRAY[${tables.map((value) => `'${value}'`).join(',')}]) AND relrowsecurity AND relforcerowsecurity`,
    ),
    '9',
    'all nine tables FORCE RLS',
  );
  equal(
    authSQL(
      `SELECT rolbypassrls OR rolsuper FROM pg_roles WHERE rolname='smartpos_runtime'`,
    ),
    'f',
    'runtime cannot bypass RLS',
  );
  equal(
    authSQL(
      `SELECT has_table_privilege('smartpos_runtime','stock_balances','UPDATE') OR has_table_privilege('smartpos_runtime','stock_balances','INSERT') OR has_table_privilege('smartpos_runtime','stock_balances','DELETE')`,
    ),
    'f',
    'runtime projection SELECT only',
  );
  for (const table of tables.filter((value) => value !== 'purchasing_items'))
    equal(
      authSQL(
        `SELECT has_table_privilege('smartpos_runtime','${table}','DELETE')`,
      ),
      'f',
      'no runtime DELETE ' + table,
    );
  equal(
    authSQL(
      `BEGIN; SET LOCAL ROLE smartpos_runtime; SET LOCAL app.organization_id=''; SELECT count(*) FROM suppliers; ROLLBACK;`,
    )
      .split('\n')
      .at(-2),
    '0',
    'unset organization hides suppliers',
  );
  blocked(
    `INSERT INTO suppliers(organization_id,code,name,created_by,updated_by) VALUES('${randomUUID()}','RLS','Denied','${owner.id}','${owner.id}')`,
    '42501',
    'cross-tenant RLS write',
  );
  const other = await purchasingFixture();
  try {
    equal(
      authSQL(
        `BEGIN; SET LOCAL ROLE smartpos_runtime; SET LOCAL app.organization_id='${org}'; SELECT count(*) FROM suppliers WHERE id='${other.supplier.id}'; ROLLBACK;`,
      )
        .split('\n')
        .at(-2),
      '0',
      'foreign rows hidden by RLS',
    );
    blocked(
      `INSERT INTO purchasing_documents(organization_id,branch_id,supplier_id,kind,supplier_snapshot,currency,created_by) VALUES('${org}','${branch}','${other.supplier.id}','ORDER','{}','THB','${owner.id}')`,
      '23503',
      'supplier composite tenant FK',
    );
  } finally {
    other.close();
  }
  const input = {
    branch_id: branch,
    supplier_id: supplier.id,
    expected_delivery_date: '2026-10-15',
    items: [
      {
        variant_id: variant.id,
        purchase_unit_id: unit.id,
        quantity: '20',
        unit_cost: '12.00',
      },
    ],
  };
  const key = randomUUID();
  let order = await ok('/purchasing/orders', 'POST', input, key);
  equal(
    (
      await call(
        '/purchasing/orders',
        'POST',
        { ...input, notes: 'changed' },
        key,
      )
    ).status,
    409,
    'fingerprint rejects different payload',
  );
  equal(
    (await call('/purchasing/orders', 'POST', input, 'invalid')).status,
    400,
    'idempotency UUID mandatory',
  );
  order = await approved('orders', order);
  order = await action('orders', order, 'issue', {
    reason: 'Operator issued locally',
  });
  blocked(
    `UPDATE purchasing_items SET unit_cost=0 WHERE organization_id='${org}' AND document_id='${order.id}'`,
    '42501',
    'issued commercial snapshots immutable',
  );
  const receiptInput = {
    branch_id: branch,
    supplier_id: supplier.id,
    parent_id: order.id,
    location_id: warehouse.id,
    items: [
      {
        variant_id: variant.id,
        parent_item_id: order.items[0].id,
        quantity: '10',
        delivered_quantity: '10',
        rejected_quantity: '0',
        damaged_quantity: '0',
        reason: 'partial shipment',
      },
    ],
  };
  let receipt = await ok('/purchasing/receipts', 'POST', receiptInput);
  receipt = await approved('receipts', receipt);
  const postKey = randomUUID(),
    postBody = { revision: receipt.revision };
  receipt = await action('receipts', receipt, 'post', {}, postKey);
  equal(
    (
      await ok(
        `/purchasing/receipts/${receipt.id}/post`,
        'POST',
        postBody,
        postKey,
        owner,
        200,
      )
    ).id,
    receipt.id,
    'receipt replay',
  );
  blocked(
    `UPDATE purchasing_documents SET notes='tampered' WHERE organization_id='${org}' AND id='${receipt.id}'`,
    '42501',
    'posted document immutable',
  );
  const draft = await ok('/purchasing/receipts', 'POST', {
    ...receiptInput,
    items: [
      { ...receiptInput.items[0], quantity: '1', delivered_quantity: '1' },
    ],
  });
  blocked(
    `UPDATE purchasing_documents SET status='POSTED',inventory_operation_id='${receipt.inventory_operation_id}' WHERE organization_id='${org}' AND id='${draft.id}'; SET CONSTRAINTS ALL IMMEDIATE`,
    '23514',
    'posted document must have matching movements',
  );
  equal(
    (await ok(`/purchasing/receipts/${draft.id}`)).status,
    'DRAFT',
    'consistency failure rolls back',
  );
  let returned = await ok('/purchasing/returns', 'POST', {
    branch_id: branch,
    supplier_id: supplier.id,
    parent_id: receipt.id,
    location_id: warehouse.id,
    items: [
      {
        variant_id: variant.id,
        parent_item_id: receipt.items[0].id,
        quantity: '1',
        reason: 'wrong pack',
      },
    ],
  });
  returned = await approved('returns', returned);
  const returnKey = randomUUID(),
    returnBody = { revision: returned.revision };
  returned = await action('returns', returned, 'dispatch', {}, returnKey);
  equal(
    (
      await ok(
        `/purchasing/returns/${returned.id}/dispatch`,
        'POST',
        returnBody,
        returnKey,
        owner,
        200,
      )
    ).id,
    returned.id,
    'return dispatch replay',
  );
  equal(
    authSQL(
      `SELECT count(*) FROM stock_movements WHERE organization_id='${org}' AND purchasing_document_id='${returned.id}'`,
    ),
    '1',
    'one return movement',
  );
  const manager = await inventoryAccount(clients);
  inventoryMembership(org, manager, 'MANAGER', [branch]);
  let own = await ok('/purchasing/orders', 'POST', input, undefined, manager);
  own = await action('orders', own, 'submit', {}, undefined, manager);
  equal(
    (
      await call(
        `/purchasing/orders/${own.id}/approve`,
        'POST',
        { revision: own.revision },
        undefined,
        manager,
      )
    ).status,
    403,
    'Manager self-approval forbidden',
  );
  let shelved = await ok('/shelves', 'POST', {
    branch_id: branch,
    stock_location_id: shelf.id,
    code: 'SAFE',
    name: 'Safety shelf',
    zone: 'A',
  });
  const slot = await ok(`/shelves/${shelved.id}/slots`, 'POST', {
    code: 'A1',
    position: 0,
  });
  let assignment = await ok(`/shelves/${shelved.id}/assignments`, 'POST', {
    slot_id: slot.id,
    variant_id: variant.id,
    minimum_quantity: '10',
    target_quantity: '20',
    capacity_quantity: '25',
  });
  equal(
    (await ok(`/shelves/${shelved.id}/slots`)).length,
    1,
    'bounded slots read',
  );
  equal(
    (await ok(`/shelves/${shelved.id}/assignments`))[0].recorded_quantity,
    '5.000',
    'assignment recorded stock',
  );
  let task = await ok('/shelves/replenishments', 'POST', {
    assignment_id: assignment.id,
    source_location_id: warehouse.id,
    quantity: '5',
  });
  task = await ok(
    `/shelves/replenishments/${task.id}/start`,
    'POST',
    { revision: task.revision },
    undefined,
    owner,
    200,
  );
  await ok('/pos/shifts/open', 'POST', {
    terminal_id: terminal.id,
    opening_cash: '0.00',
  });
  let cart = await ok('/pos/carts', 'POST', { terminal_id: terminal.id });
  cart = await ok('/pos/carts/' + cart.id, 'PATCH', {
    revision: cart.revision,
    items: [{ variant_id: variant.id, quantity: '1' }],
  });
  let checkout = await ok('/pos/checkout', 'POST', {
    cart_id: cart.id,
    revision: cart.revision,
    method: 'CASH',
    expected_total: cart.total,
    received: cart.total,
  });
  checkout = await ok(
    `/pos/payments/${checkout.id}/confirm`,
    'POST',
    { acknowledged: true },
    undefined,
    owner,
    200,
  );
  const race = await Promise.all([
    call(`/pos/checkouts/${checkout.id}/complete`, 'POST', {}),
    call(`/shelves/replenishments/${task.id}/complete`, 'POST', {
      revision: task.revision,
    }),
  ]);
  for (const result of race)
    equal(result.status, 200, 'POS versus replenishment race');
  equal(await stock(shelf), '9.000', 'POS deducted terminal shelf only');
  equal(await stock(warehouse), '104.000', 'warehouse transfer conservation');
  let count = await ok('/inventory/counts', 'POST', {
    location_id: shelf.id,
    reason_code: 'SHELF_CHECK',
    notes: '',
    items: [{ variant_id: variant.id, quantity: '0' }],
  });
  count = await ok(`/inventory/counts/${count.id}/items`, 'PATCH', {
    revision: count.revision,
    items: [{ variant_id: variant.id, counted_quantity: '8' }],
  });
  for (const name of ['submit', 'approve', 'post'])
    count = await ok(
      `/inventory/counts/${count.id}/${name}`,
      'POST',
      { revision: count.revision },
      undefined,
      owner,
      200,
    );
  equal(await stock(shelf), '8.000', 'count correction via existing Inventory');
  shelved = await ok('/shelves/' + shelved.id);
  equal(
    shelved.assignments[0].last_count.variance,
    '-1.000',
    'count variance snapshot',
  );
  equal(
    shelved.assignments[0].last_count.status,
    'POSTED',
    'posted count status',
  );
  task = await ok('/shelves/replenishments', 'POST', {
    assignment_id: assignment.id,
    source_location_id: warehouse.id,
    quantity: '5',
  });
  task = await ok(
    `/shelves/replenishments/${task.id}/start`,
    'POST',
    { revision: task.revision },
    undefined,
    owner,
    200,
  );
  let adjustment = await ok('/inventory/adjustments', 'POST', {
    location_id: shelf.id,
    adjustment_type: 'INCREASE',
    reason_code: 'EXTERNAL_MOVEMENT',
    notes: 'Other authorized Inventory change',
    items: [{ variant_id: variant.id, quantity: '13' }],
  });
  for (const name of ['submit', 'approve', 'post'])
    adjustment = await ok(
      `/inventory/adjustments/${adjustment.id}/${name}`,
      'POST',
      { revision: adjustment.revision },
      undefined,
      owner,
      200,
    );
  equal(
    (
      await call(`/shelves/replenishments/${task.id}/complete`, 'POST', {
        revision: task.revision,
      })
    ).status,
    409,
    'current target/capacity revalidation',
  );
  equal(
    await stock(warehouse),
    '104.000',
    'capacity failure rolls back warehouse',
  );
  equal(
    (await ok(`/shelves/replenishments/${task.id}`)).status,
    'IN_PROGRESS',
    'failed completion retains task',
  );
  const revoked = await inventoryAccount(clients);
  const emptyShelf = await ok('/shelves', 'POST', {
    branch_id: branch,
    stock_location_id: fixture.shelf2.id,
    code: 'EMPTY',
    name: 'Warehouse revalidation',
  });
  const emptySlot = await ok(`/shelves/${emptyShelf.id}/slots`, 'POST', {
    code: 'E1',
    position: 0,
  });
  const emptyAssignment = await ok(
    `/shelves/${emptyShelf.id}/assignments`,
    'POST',
    {
      slot_id: emptySlot.id,
      variant_id: variant.id,
      minimum_quantity: '2',
      target_quantity: '10',
      capacity_quantity: '10',
    },
  );
  let staleTask = await ok('/shelves/replenishments', 'POST', {
    assignment_id: emptyAssignment.id,
    source_location_id: warehouse.id,
    quantity: '5',
  });
  staleTask = await ok(
    `/shelves/replenishments/${staleTask.id}/start`,
    'POST',
    { revision: staleTask.revision },
    undefined,
    owner,
    200,
  );
  const reserveWarehouse = await ok('/inventory/locations', 'POST', {
    branch_id: branch,
    code: 'WH-RESERVE',
    name: 'Other warehouse',
    type: 'WAREHOUSE',
    status: 'ACTIVE',
  });
  let transfer = await ok('/inventory/transfers', 'POST', {
    location_id: warehouse.id,
    destination_location_id: reserveWarehouse.id,
    reason_code: 'OTHER_WORK',
    notes: '',
    items: [{ variant_id: variant.id, quantity: '101' }],
  });
  for (const name of ['submit', 'approve', 'dispatch'])
    transfer = await ok(
      `/inventory/transfers/${transfer.id}/${name}`,
      'POST',
      { revision: transfer.revision },
      undefined,
      owner,
      200,
    );
  equal(
    (
      await call(`/shelves/replenishments/${staleTask.id}/complete`, 'POST', {
        revision: staleTask.revision,
      })
    ).status,
    409,
    'warehouse stock revalidated at completion',
  );
  equal(
    await stock(warehouse),
    '3.000',
    'insufficient stock completion leaves warehouse unchanged',
  );
  equal(
    await stock(fixture.shelf2),
    '0.000',
    'insufficient stock completion leaves shelf unchanged',
  );
  let emptyReturn = await ok('/purchasing/returns', 'POST', {
    branch_id: branch,
    supplier_id: supplier.id,
    parent_id: receipt.id,
    location_id: fixture.shelf2.id,
    items: [
      {
        variant_id: variant.id,
        parent_item_id: receipt.items[0].id,
        quantity: '2',
        reason: 'Stock revalidation',
      },
    ],
  });
  emptyReturn = await approved('returns', emptyReturn);
  equal(
    (
      await call(`/purchasing/returns/${emptyReturn.id}/dispatch`, 'POST', {
        revision: emptyReturn.revision,
      })
    ).status,
    409,
    'return cannot deduct insufficient current stock',
  );
  let shelfReturn = await ok('/purchasing/returns', 'POST', {
    branch_id: branch,
    supplier_id: supplier.id,
    parent_id: receipt.id,
    location_id: shelf.id,
    items: [
      {
        variant_id: variant.id,
        parent_item_id: receipt.items[0].id,
        quantity: '9',
        reason: 'Concurrent physical return',
      },
    ],
  });
  shelfReturn = await approved('returns', shelfReturn);
  let raceCart = await ok('/pos/carts', 'POST', { terminal_id: terminal.id });
  raceCart = await ok('/pos/carts/' + raceCart.id, 'PATCH', {
    revision: raceCart.revision,
    items: [{ variant_id: variant.id, quantity: '15' }],
  });
  let raceCheckout = await ok('/pos/checkout', 'POST', {
    cart_id: raceCart.id,
    revision: raceCart.revision,
    method: 'CASH',
    expected_total: raceCart.total,
    received: raceCart.total,
  });
  raceCheckout = await ok(
    `/pos/payments/${raceCheckout.id}/confirm`,
    'POST',
    { acknowledged: true },
    undefined,
    owner,
    200,
  );
  const [saleOutcome, returnOutcome] = await Promise.all([
    call(`/pos/checkouts/${raceCheckout.id}/complete`, 'POST', {}),
    call(`/purchasing/returns/${shelfReturn.id}/dispatch`, 'POST', {
      revision: shelfReturn.revision,
    }),
  ]);
  equal(
    saleOutcome.status,
    200,
    'POS return race retains acknowledged funds evidence',
  );
  if (returnOutcome.status === 200) {
    equal(
      saleOutcome.data.status,
      'RECONCILIATION_REQUIRED',
      'return winner denies overselling',
    );
    equal(await stock(shelf), '12.000', 'return winner stock');
  } else {
    equal(returnOutcome.status, 409, 'sale winner blocks insufficient return');
    equal(saleOutcome.data.status, 'COMPLETED', 'sale winner');
    equal(await stock(shelf), '6.000', 'sale winner stock');
  }
  inventoryMembership(org, revoked, 'PURCHASING_STAFF', [branch]);
  const retryKey = randomUUID();
  await ok('/purchasing/orders', 'POST', input, retryKey, revoked);
  authSQL(
    `UPDATE organization_memberships SET status='SUSPENDED' WHERE organization_id='${org}' AND user_id='${revoked.id}'`,
  );
  equal(
    (await call('/purchasing/orders', 'POST', input, retryKey, revoked)).status,
    404,
    'cached replay cannot bypass revocation',
  );
  equal(
    authSQL(
      `SELECT count(*) FROM stock_balances balance WHERE organization_id='${org}' AND quantity<>COALESCE((SELECT sum(quantity_delta) FROM stock_movements movement WHERE movement.organization_id=balance.organization_id AND movement.location_id=balance.location_id AND movement.variant_id=balance.variant_id),0)`,
    ),
    '0',
    'full ledger projection reconciliation',
  );
  console.log(
    `Phase 4 SQL/security/POS/count safety: ${assertions} assertions passed`,
  );
} finally {
  fixture.close();
}
