import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { authSQL } from './auth-fixtures.mjs';
import {
  inventoryAccount,
  inventoryMembership,
} from './inventory-fixtures.mjs';
import { returnsFixture } from './returns-fixtures.mjs';

let assertions = 0;
function equal(actual, expected, label) {
  assert.equal(actual, expected, label);
  assertions++;
}
const fixture = await returnsFixture();
const {
  call,
  org,
  branch,
  secondBranch,
  shelf,
  warehouse,
  variant,
  variant2,
  owner,
  clients,
  shift,
  sale,
} = fixture;
async function ok(
  path,
  method = 'GET',
  body,
  key,
  user = owner,
  status = method === 'POST' ? 201 : 200,
) {
  const response = await call(path, method, body, key, user);
  equal(response.status, status, path + ': ' + JSON.stringify(response.error));
  return response.data;
}
const count = (table, where = '') =>
  authSQL(
    `SELECT count(*) FROM ${table} WHERE organization_id='${org}' ${where}`,
  );
async function create(
  original,
  quantity = '1',
  disposition = 'RESTOCK_SELLABLE',
  destination = shelf.id,
  key = randomUUID(),
) {
  const body = {
    original_sale_id: original.id,
    reason: 'Inspected customer return',
    items: [
      {
        original_sale_item_id: original.items[0].id,
        quantity,
        disposition,
        destination_location_id: destination,
      },
    ],
  };
  return { doc: await ok('/returns', 'POST', body, key), body, key };
}
async function action(doc, name, key = randomUUID(), status = 200) {
  return ok(
    `/returns/${doc.id}/${name}`,
    'POST',
    { revision: doc.revision },
    key,
    owner,
    status,
  );
}
async function approve(doc) {
  return action(await action(doc, 'submit'), 'approve');
}
async function complete(doc) {
  return action(await approve(doc), 'complete');
}
async function stock() {
  return (
    await ok(
      `/inventory/balances?location_id=${shelf.id}&variant_id=${variant.id}`,
    )
  ).items[0].quantity;
}
try {
  const original = await sale();
  equal(
    original.items[0].line_total,
    '6.00',
    'fixture historical consideration',
  );
  const first = await create(original);
  equal(first.doc.amount, '2.00', 'historical partial allocation');
  equal(
    (await ok('/returns', 'POST', first.body, first.key)).id,
    first.doc.id,
    'create retry',
  );
  await ok(
    '/returns',
    'POST',
    { ...first.body, reason: 'changed payload' },
    first.key,
    owner,
    409,
  );
  await ok(
    `/returns/${first.doc.id}/complete`,
    'POST',
    { revision: first.doc.revision },
    undefined,
    owner,
    409,
  );
  const approved = await approve(first.doc);
  await ok(
    `/returns/${approved.id}/complete`,
    'POST',
    { revision: 1 },
    undefined,
    owner,
    409,
  );
  const completeKey = randomUUID();
  const completed = await action(approved, 'complete', completeKey);
  equal(completed.status, 'COMPLETED', 'return completed');
  equal(
    (await action(approved, 'complete', completeKey)).id,
    completed.id,
    'complete retry',
  );
  equal(
    count('stock_movements', "AND movement_type='SALE_RETURN'"),
    '1',
    'one stock return',
  );
  equal(await stock(), '3.000', 'sellable stock restored once');
  equal(
    (await ok(`/returns/sales/${original.id}`)).items[0].returnable_quantity,
    '2.000',
    'remaining eligible quantity',
  );
  let refund = await ok(`/refunds/${completed.refund_id}`);
  equal(refund.status, 'PENDING_SETTLEMENT', 'return is not settlement');
  const reportKey = randomUUID();
  const report = {
    revision: refund.revision,
    method: 'CASH_REFUND',
    shift_id: shift.id,
    reference: '',
    note: 'Cash payout reported; verify before confirmation',
    acknowledged: true,
  };
  refund = await ok(
    `/refunds/${refund.id}/report-settlement`,
    'POST',
    report,
    reportKey,
    owner,
    200,
  );
  equal(refund.status, 'SETTLEMENT_REPORTED', 'durable payout evidence');
  equal(
    (
      await ok(
        `/refunds/${refund.id}/report-settlement`,
        'POST',
        report,
        reportKey,
        owner,
        200,
      )
    ).id,
    refund.id,
    'report replay',
  );
  await ok(
    `/pos/shifts/${shift.id}/close`,
    'POST',
    { counted_cash: '104.00' },
    undefined,
    owner,
    409,
  );
  refund = await ok(
    `/refunds/${refund.id}/reconcile`,
    'POST',
    {
      revision: refund.revision,
      note: 'Physical payout review required',
      acknowledged: true,
    },
    undefined,
    owner,
    200,
  );
  equal(refund.status, 'RECONCILIATION_REQUIRED', 'recoverable manual state');
  const confirmKey = randomUUID(),
    confirmBody = {
      revision: refund.revision,
      acknowledged: true,
      note: 'Cash verified paid once',
    };
  const confirmations = await Promise.all([
    call(
      `/refunds/${refund.id}/confirm-settlement`,
      'POST',
      confirmBody,
      confirmKey,
    ),
    call(
      `/refunds/${refund.id}/confirm-settlement`,
      'POST',
      confirmBody,
      confirmKey,
    ),
  ]);
  for (const response of confirmations)
    equal(response.status, 200, 'concurrent identical confirmation');
  equal(count('register_cash_disbursements'), '1', 'single cash effect');
  equal(
    count('stock_movements', "AND movement_type='SALE_RETURN'"),
    '1',
    'settlement does not repost stock',
  );
  equal(
    (await ok(`/pos/shifts/${shift.id}`)).cash_refunds,
    '2.00',
    'cash refund accounting',
  );
  equal(
    (await ok(`/pos/shifts/${shift.id}`)).expected_cash,
    '104.00',
    'opening + cash sales - cash refunds',
  );
  await ok(
    `/refunds/${refund.id}/confirm-settlement`,
    'POST',
    { ...confirmBody, note: 'different fingerprint' },
    confirmKey,
    owner,
    409,
  );
  const second = await complete(
    (await create(original, '1', 'NO_STOCK_RETURN', null)).doc,
  );
  equal(await stock(), '3.000', 'no-stock refund never increases stock');
  let manual = await ok(`/refunds/${second.refund_id}`);
  await ok(
    `/refunds/${manual.id}/report-settlement`,
    'POST',
    {
      revision: manual.revision,
      method: 'MANUAL_BANK_REFUND',
      reference: '',
      note: 'Test',
      acknowledged: true,
    },
    undefined,
    owner,
    400,
  );
  manual = await ok(
    `/refunds/${manual.id}/report-settlement`,
    'POST',
    {
      revision: manual.revision,
      method: 'MANUAL_BANK_REFUND',
      reference: 'TEST-OPERATOR-REFERENCE',
      note: 'Operator report, not bank verification',
      acknowledged: true,
    },
    undefined,
    owner,
    200,
  );
  equal(
    manual.status,
    'SETTLEMENT_REPORTED',
    'manual bank not automatically settled',
  );
  manual = await ok(
    `/refunds/${manual.id}/confirm-settlement`,
    'POST',
    {
      revision: manual.revision,
      note: 'Manager manually reconciled evidence',
      acknowledged: true,
    },
    undefined,
    owner,
    200,
  );
  equal(manual.status, 'CONFIRMED', 'explicit manual acknowledgement');
  equal(count('register_cash_disbursements'), '1', 'bank refund is not cash');
  const rivalA = await approve((await create(original)).doc),
    rivalB = await approve((await create(original)).doc);
  const rivals = await Promise.all([
    call(`/returns/${rivalA.id}/complete`, 'POST', {
      revision: rivalA.revision,
    }),
    call(`/returns/${rivalB.id}/complete`, 'POST', {
      revision: rivalB.revision,
    }),
  ]);
  equal(
    rivals.filter((result) => result.status === 200).length,
    1,
    'only one last unit return',
  );
  equal(
    rivals.filter((result) => result.status === 409).length,
    1,
    'overreturn competitor rejected',
  );
  await ok('/returns', 'POST', first.body, undefined, owner, 409);
  equal(
    (await ok(`/returns/sales/${original.id}`)).items[0].returnable_quantity,
    '0.000',
    'no remaining unit',
  );
  equal(
    count('customer_refunds'),
    '3',
    'only committed returns create refunds',
  );
  equal(
    authSQL(
      `SELECT sum(amount)::text FROM customer_refunds WHERE organization_id='${org}'`,
    ),
    '6.00',
    'refund ceiling',
  );
  const current = await ok(`/products/${variant.product_id}`);
  const priceInput = (({
    sku,
    name,
    attributes,
    unit_id,
    cost_price,
    status,
    revision,
  }) => ({
    sku,
    name,
    attributes,
    unit_id,
    cost_price,
    status,
    revision,
    selling_price: '99.00',
  }))(current.variants[0]);
  await ok(
    `/products/${variant.product_id}/variants/${variant.id}`,
    'PATCH',
    priceInput,
    undefined,
    owner,
    200,
  );
  equal(
    (await ok(`/returns/${completed.id}`)).amount,
    '2.00',
    'price changes preserve historical refund',
  );
  const bad = {
    ...first.body,
    items: [{ ...first.body.items[0], quantity: '0.5' }],
  };
  await ok('/returns', 'POST', bad, undefined, owner, 400);
  const another = await sale([[variant2, '2']]);
  const damaged = await ok('/inventory/locations', 'POST', {
    branch_id: branch,
    code: 'RET-DAMAGED',
    name: 'Damaged returns',
    type: 'DAMAGED',
    status: 'ACTIVE',
    description: '',
    parent_location_id: null,
  });
  const quarantine = await ok('/inventory/locations', 'POST', {
    branch_id: branch,
    code: 'RET-QUARANTINE',
    name: 'Quarantined returns',
    type: 'QUARANTINE',
    status: 'ACTIVE',
    description: '',
    parent_location_id: null,
  });
  const wrong = {
    original_sale_id: another.id,
    reason: 'Wrong disposition',
    items: [
      {
        original_sale_item_id: another.items[0].id,
        quantity: '1',
        disposition: 'DAMAGED',
        destination_location_id: warehouse.id,
      },
    ],
  };
  await ok('/returns', 'POST', wrong, undefined, owner, 409);
  await complete((await create(another, '1', 'DAMAGED', damaged.id)).doc);
  await complete((await create(another, '1', 'QUARANTINE', quarantine.id)).doc);
  equal(
    (await ok(`/inventory/balances?location_id=${damaged.id}`)).items[0]
      .quantity,
    '1.000',
    'damaged segregated',
  );
  equal(
    (await ok(`/inventory/balances?location_id=${quarantine.id}`)).items[0]
      .quantity,
    '1.000',
    'quarantine segregated',
  );
  const cashier = await inventoryAccount(clients),
    manager = await inventoryAccount(clients),
    outsider = await inventoryAccount(clients);
  inventoryMembership(org, cashier, 'CASHIER', [branch]);
  inventoryMembership(org, manager, 'MANAGER', [secondBranch]);
  await ok(
    `/returns/sales/${original.id}`,
    'GET',
    undefined,
    undefined,
    cashier,
    403,
  );
  await ok(
    `/returns/${completed.id}`,
    'GET',
    undefined,
    undefined,
    manager,
    403,
  );
  await ok(
    `/returns/${completed.id}`,
    'GET',
    undefined,
    undefined,
    outsider,
    404,
  );
  await ok(`/refunds/${refund.id}`, 'GET', undefined, undefined, outsider, 404);
  await ok(
    `/refunds/${refund.id}/confirm-settlement`,
    'POST',
    confirmBody,
    undefined,
    cashier,
    403,
  );
  equal(
    (await ok('/returns', 'GET', undefined, undefined, cashier)).total,
    0,
    'cashier minimized history',
  );
  equal(
    (
      await call('/returns', 'POST', first.body, undefined, owner, {
        'X-CSRF-Token': '',
      })
    ).status,
    403,
    'CSRF',
  );
  equal(
    (
      await call('/returns', 'POST', first.body, undefined, owner, {
        Origin: 'https://attacker.invalid',
      })
    ).status,
    403,
    'Origin',
  );
  const rollbackSale = await sale([[variant2, '1']]);
  const itemCount = count('customer_returns');
  await ok(
    '/returns',
    'POST',
    {
      original_sale_id: rollbackSale.id,
      reason: 'Atomic rollback',
      items: [
        {
          original_sale_item_id: rollbackSale.items[0].id,
          quantity: '1',
          disposition: 'NO_STOCK_RETURN',
          destination_location_id: null,
        },
        {
          original_sale_item_id: randomUUID(),
          quantity: '1',
          disposition: 'NO_STOCK_RETURN',
          destination_location_id: null,
        },
      ],
    },
    undefined,
    owner,
    404,
  );
  equal(
    count('customer_returns'),
    itemCount,
    'invalid multi-item request leaves no header',
  );
  for (const table of [
    'customer_returns',
    'customer_return_items',
    'customer_refunds',
    'refund_settlement_events',
    'register_cash_disbursements',
  ]) {
    equal(
      authSQL(
        `BEGIN; SET LOCAL ROLE smartpos_runtime; SELECT count(*) FROM ${table}; ROLLBACK;`,
      )
        .split('\n')
        .at(-2),
      '0',
      table + ' missing-context RLS',
    );
    equal(
      authSQL(
        `SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE relname='${table}'`,
      ),
      't',
      table + ' FORCE RLS',
    );
  }
  equal(
    authSQL(
      `SELECT has_table_privilege('smartpos_runtime','stock_balances','UPDATE')`,
    ),
    'f',
    'no direct balance writes',
  );
  equal(
    authSQL(
      `SELECT has_table_privilege('smartpos_runtime','customer_return_items','UPDATE')`,
    ),
    'f',
    'immutable return items grant',
  );
  equal(
    authSQL(
      `SELECT count(*) FROM stock_balances balance FULL JOIN (SELECT organization_id,location_id,variant_id,sum(quantity_delta) quantity FROM stock_movements GROUP BY 1,2,3) ledger USING(organization_id,location_id,variant_id) WHERE COALESCE(balance.quantity,0)<>COALESCE(ledger.quantity,0)`,
    ),
    '0',
    'global stock ledger reconciliation',
  );
  const finalShift = await ok(`/pos/shifts/${shift.id}`);
  await ok(
    `/pos/shifts/${shift.id}/close`,
    'POST',
    { counted_cash: finalShift.expected_cash },
    undefined,
    owner,
    200,
  );
  equal(
    (await ok(`/pos/shifts/${shift.id}`)).status,
    'CLOSED',
    'closed shift history',
  );
  console.log(`Returns/refunds integration passed: ${assertions} assertions`);
} finally {
  fixture.close();
}
