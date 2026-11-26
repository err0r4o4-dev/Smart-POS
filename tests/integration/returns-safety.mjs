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
  owner,
  clients,
  warehouse,
  variant,
  variant2,
  weightVariant,
  terminal,
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
async function action(doc, name, key, user = owner, status = 200) {
  return ok(
    `/returns/${doc.id}/${name}`,
    'POST',
    { revision: doc.revision },
    key,
    user,
    status,
  );
}
async function approve(doc) {
  return action(await action(doc, 'submit'), 'approve');
}
function body(
  original,
  quantities = original.items.map((item) => item.quantity),
) {
  return {
    original_sale_id: original.id,
    reason: 'Safety acceptance inspection',
    items: original.items.map((item, index) => ({
      original_sale_item_id: item.id,
      quantity: quantities[index],
      disposition: 'RESTOCK_SELLABLE',
      destination_location_id: item.stock_location_id,
    })),
  };
}
async function create(original, quantities) {
  return ok('/returns', 'POST', body(original, quantities));
}
const count = (table) =>
  authSQL(`SELECT count(*) FROM ${table} WHERE organization_id='${org}'`);
const ledger = () =>
  authSQL(
    `SELECT COALESCE(jsonb_agg(jsonb_build_array(id,location_id,variant_id,quantity_delta) ORDER BY id),'[]')::text FROM stock_movements WHERE organization_id='${org}'`,
  );
const balances = () =>
  authSQL(
    `SELECT COALESCE(jsonb_agg(jsonb_build_array(location_id,variant_id,quantity,version) ORDER BY location_id,variant_id),'[]')::text FROM stock_balances WHERE organization_id='${org}'`,
  );

try {
  const original = await sale([
    [variant, '1'],
    [variant2, '1'],
  ]);
  const immutableSale = ({ returns, adjustments, ...snapshot }) =>
    JSON.stringify(snapshot);
  const historicalSale = immutableSale(await ok(`/sales/${original.id}`));
  const full = await action(await approve(await create(original)), 'complete');
  equal(
    immutableSale(await ok(`/sales/${original.id}`)),
    historicalSale,
    'sale, payment, receipt and original movements stay immutable',
  );
  equal(
    (await ok(`/sales/${original.id}`)).returns[0].id,
    full.id,
    'new navigation projection links the compensating return',
  );
  equal(
    full.amount,
    original.grand_total,
    'full return refunds original paid total',
  );
  equal(full.items.length, 2, 'multi-line full return');
  equal(
    (await ok(`/returns/sales/${original.id}`)).items.every(
      (item) => item.returnable_quantity === '0.000',
    ),
    true,
    'full return consumes every line',
  );
  await ok('/returns', 'POST', body(original), undefined, owner, 409);

  const lateSale = await sale([[variant, '1']]);
  const oldShift = await ok(`/pos/shifts/${shift.id}`);
  await ok(
    `/pos/shifts/${shift.id}/close`,
    'POST',
    { counted_cash: oldShift.expected_cash },
    undefined,
    owner,
    200,
  );
  const closedBefore = await ok(`/pos/shifts/${shift.id}`);
  const currentShift = await ok('/pos/shifts/open', 'POST', {
    terminal_id: terminal.id,
    opening_cash: '100.00',
  });
  const lateReturn = await action(
    await approve(await create(lateSale)),
    'complete',
  );
  let refund = await ok(`/refunds/${lateReturn.refund_id}`);
  await ok(
    `/refunds/${refund.id}/report-settlement`,
    'POST',
    {
      revision: refund.revision,
      method: 'CASH_REFUND',
      shift_id: shift.id,
      reference: '',
      note: 'Closed historical shift must stay closed',
      acknowledged: true,
    },
    undefined,
    owner,
    409,
  );
  refund = await ok(
    `/refunds/${refund.id}/report-settlement`,
    'POST',
    {
      revision: refund.revision,
      method: 'CASH_REFUND',
      shift_id: currentShift.id,
      reference: '',
      note: 'Disbursed in current authorized shift',
      acknowledged: true,
    },
    undefined,
    owner,
    200,
  );
  refund = await ok(
    `/refunds/${refund.id}/reconcile`,
    'POST',
    {
      revision: refund.revision,
      note: 'Operator requests evidence review',
      acknowledged: true,
    },
    undefined,
    owner,
    200,
  );
  equal(
    refund.status,
    'RECONCILIATION_REQUIRED',
    'explicit recoverable reconciliation state',
  );
  await ok(
    `/pos/shifts/${currentShift.id}/close`,
    'POST',
    { counted_cash: '100.00' },
    undefined,
    owner,
    409,
  );
  const settlementKey = randomUUID(),
    settlementBody = {
      revision: refund.revision,
      note: 'Evidence reviewed; cash effect posted once',
      acknowledged: true,
    };
  refund = await ok(
    `/refunds/${refund.id}/confirm-settlement`,
    'POST',
    settlementBody,
    settlementKey,
    owner,
    200,
  );
  equal(
    (
      await ok(
        `/refunds/${refund.id}/confirm-settlement`,
        'POST',
        settlementBody,
        settlementKey,
        owner,
        200,
      )
    ).id,
    refund.id,
    'settlement retry keeps one refund',
  );
  equal(
    JSON.stringify(await ok(`/pos/shifts/${shift.id}`)),
    JSON.stringify(closedBefore),
    'old closed shift remains unchanged',
  );
  equal(
    (await ok(`/pos/shifts/${currentShift.id}`)).cash_refunds,
    '2.00',
    'cash effect belongs to new shift',
  );
  equal(
    (await ok(`/pos/shifts/${currentShift.id}`)).expected_cash,
    '98.00',
    'new shift net cash',
  );
  equal(
    count('register_cash_disbursements'),
    '1',
    'one cash effect after replay',
  );

  const shiftList = await ok('/pos/shifts?status=OPEN');
  equal(
    shiftList.items.find((item) => item.id === currentShift.id).cash_refunds,
    '2.00',
    'list money is an exact decimal string',
  );
  const locationBody = {
    branch_id: branch,
    code: 'RETURN-ROLLBACK',
    name: 'Rollback destination',
    type: 'WAREHOUSE',
    parent_location_id: null,
    status: 'ACTIVE',
    description: '',
  };
  let destination = await ok('/inventory/locations', 'POST', locationBody);
  const rollbackSale = await sale([
    [variant, '1'],
    [variant2, '1'],
  ]);
  const postingOrder = [...rollbackSale.items].sort((left, right) =>
    left.variant_id.localeCompare(right.variant_id),
  );
  let rollback = await ok('/returns', 'POST', {
    original_sale_id: rollbackSale.id,
    reason: 'Posting rollback after first line',
    items: postingOrder.map((item, index) => ({
      original_sale_item_id: item.id,
      quantity: '1',
      disposition: 'RESTOCK_SELLABLE',
      destination_location_id: index === 1 ? destination.id : warehouse.id,
    })),
  });
  rollback = await approve(rollback);
  destination = await ok(`/inventory/locations/${destination.id}`, 'GET');
  await ok(
    `/inventory/locations/${destination.id}`,
    'PATCH',
    { ...locationBody, revision: destination.revision, status: 'INACTIVE' },
    undefined,
    owner,
    200,
  );
  const ledgerBefore = ledger(),
    balancesBefore = balances(),
    refundsBefore = count('customer_refunds'),
    operationsBefore = count('inventory_operations');
  await action(rollback, 'complete', undefined, owner, 409);
  equal(ledger(), ledgerBefore, 'failed posting has no ledger effects');
  equal(
    balances(),
    balancesBefore,
    'failed posting has no balance/version effects',
  );
  equal(
    count('customer_refunds'),
    refundsBefore,
    'failed posting creates no refund',
  );
  equal(
    count('inventory_operations'),
    operationsBefore,
    'failed posting retains no idempotency operation',
  );
  equal(
    (await ok(`/returns/${rollback.id}`)).status,
    'APPROVED',
    'failed document remains retryable',
  );
  const restored = await ok(`/inventory/locations/${destination.id}`, 'GET');
  await ok(
    `/inventory/locations/${destination.id}`,
    'PATCH',
    { ...locationBody, revision: restored.revision },
    undefined,
    owner,
    200,
  );
  const completed = await action(rollback, 'complete');
  equal(
    completed.items.filter((item) => item.movement_id).length,
    2,
    'retry posts exactly two lines',
  );
  await action(rollback, 'complete', undefined, owner, 409);

  const currentProduct = await ok(`/products/${weightVariant.product_id}`);
  const { sku, name, attributes, unit_id, cost_price, status, revision } =
    currentProduct.variants[0];
  await ok(
    `/products/${weightVariant.product_id}/variants/${weightVariant.id}`,
    'PATCH',
    {
      sku,
      name,
      attributes,
      unit_id,
      cost_price,
      status,
      revision,
      selling_price: '0.01',
    },
    undefined,
    owner,
    200,
  );
  const fractional = await sale([[weightVariant, '1.5']]);
  equal(fractional.grand_total, '0.02', 'original POS line rounding');
  const allocated = [];
  for (let index = 0; index < 3; index++)
    allocated.push(
      (
        await action(
          await approve(await create(fractional, ['0.5'])),
          'complete',
        )
      ).amount,
    );
  equal(
    JSON.stringify(allocated),
    JSON.stringify(['0.00', '0.01', '0.01']),
    'partial refunds conserve final rounding cent',
  );
  equal(
    authSQL(
      `SELECT sum(refund.amount)::text FROM customer_refunds refund JOIN customer_returns doc ON doc.organization_id=refund.organization_id AND doc.id=refund.return_id WHERE doc.organization_id='${org}' AND doc.original_sale_id='${fractional.id}'`,
    ),
    '0.02',
    'partial refund sum equals original consideration',
  );

  const manager = await inventoryAccount(clients);
  inventoryMembership(org, manager, 'MANAGER', [branch]);
  const pending = await action(
    await create(await sale([[variant2, '1']])),
    'submit',
  );
  const approvalKey = randomUUID();
  await action(pending, 'approve', approvalKey, manager);
  const membershipID = authSQL(
    `SELECT id::text FROM organization_memberships WHERE organization_id='${org}' AND user_id='${manager.id}'`,
  );
  await ok(
    `/members/${membershipID}`,
    'PATCH',
    { role: 'CASHIER', status: 'ACTIVE', branch_ids: [branch] },
    undefined,
    owner,
    200,
  );
  await action(pending, 'approve', approvalKey, manager, 403);
  await ok(
    `/members/${membershipID}`,
    'PATCH',
    { role: 'MANAGER', status: 'SUSPENDED', branch_ids: [branch] },
    undefined,
    owner,
    200,
  );
  await ok('/returns', 'GET', undefined, undefined, manager, 404);

  const tenantB = randomUUID();
  for (const table of [
    'customer_returns',
    'customer_return_items',
    'customer_refunds',
    'refund_settlement_events',
    'register_cash_disbursements',
  ]) {
    const result = authSQL(
      `BEGIN; SET LOCAL ROLE smartpos_runtime; SELECT set_config('app.organization_id','${tenantB}',true); SELECT count(*) FROM ${table} WHERE organization_id='${org}'; ROLLBACK;`,
    );
    equal(result.split('\n').at(-2), '0', table + ' scoped cross-tenant RLS');
  }
  authSQL(`BEGIN; SET LOCAL ROLE smartpos_runtime; SELECT set_config('app.organization_id','${org}',true); SELECT set_config('app.user_id','${owner.id}',true); DO $verify$ BEGIN
    BEGIN UPDATE customer_return_items SET quantity=quantity WHERE return_id='${full.id}'; RAISE EXCEPTION 'mutable return lines'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN UPDATE customer_refunds SET amount=amount+1 WHERE id='${refund.id}'; RAISE EXCEPTION 'mutable refund amount'; EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN UPDATE customer_returns SET reason='forged' WHERE id='${full.id}'; RAISE EXCEPTION 'mutable completed return'; EXCEPTION WHEN check_violation THEN NULL; END;
    BEGIN UPDATE register_cash_disbursements SET amount=amount WHERE refund_id='${refund.id}'; RAISE EXCEPTION 'mutable cash ledger'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN DELETE FROM refund_settlement_events WHERE refund_id='${refund.id}'; RAISE EXCEPTION 'deletable settlement evidence'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN UPDATE sales SET grand_total=grand_total WHERE id='${original.id}'; RAISE EXCEPTION 'mutable original sale'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END $verify$; ROLLBACK;`);
  assertions += 6;
  equal(
    authSQL(
      `SELECT count(*) FROM stock_balances balance FULL JOIN (SELECT organization_id,location_id,variant_id,sum(quantity_delta) quantity FROM stock_movements GROUP BY 1,2,3) ledger USING(organization_id,location_id,variant_id) WHERE COALESCE(balance.quantity,0)<>COALESCE(ledger.quantity,0)`,
    ),
    '0',
    'global stock conservation after failure/retry',
  );
  equal(
    (await ok(`/returns/${full.id}`)).status,
    'COMPLETED',
    'runtime SQL checks roll back',
  );
  console.log(`Returns/refunds safety passed: ${assertions} assertions`);
} finally {
  fixture.close();
}
