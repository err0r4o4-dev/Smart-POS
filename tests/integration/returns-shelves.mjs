import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { authSQL } from './auth-fixtures.mjs';
import { returnsFixture } from './returns-fixtures.mjs';

const fixture = await returnsFixture();
const { call, owner, org, branch, shelf, variant, variant2, sale } = fixture;
let assertions = 0;
function equal(actual, expected, label) {
  assert.equal(actual, expected, label);
  assertions++;
}
async function ok(
  path,
  method = 'GET',
  body,
  status = method === 'POST' ? 201 : 200,
) {
  const response = await call(path, method, body);
  equal(response.status, status, path + ': ' + JSON.stringify(response.error));
  return response.data;
}
async function action(doc, name, status = 200, key = randomUUID()) {
  const response = await call(
    `/returns/${doc.id}/${name}`,
    'POST',
    { revision: doc.revision },
    key,
  );
  equal(response.status, status, name + ': ' + JSON.stringify(response.error));
  return response.data;
}
async function approved(original, destination = shelf.id) {
  const doc = await ok('/returns', 'POST', {
    original_sale_id: original.id,
    reason: 'Managed shelf capacity acceptance',
    items: original.items.map((item) => ({
      original_sale_item_id: item.id,
      quantity: item.quantity,
      disposition: 'RESTOCK_SELLABLE',
      destination_location_id: destination,
    })),
  });
  return action(await action(doc, 'submit'), 'approve');
}
const stock = () =>
  authSQL(
    `SELECT quantity::text FROM stock_balances WHERE organization_id='${org}' AND location_id='${shelf.id}' AND variant_id='${variant.id}'`,
  );
const movements = () =>
  authSQL(
    `SELECT count(*) FROM stock_movements WHERE organization_id='${org}'`,
  );
try {
  const firstSale = await sale([[variant, '1']]);
  const secondSale = await sale([[variant, '1']]);
  const otherSale = await sale([[variant2, '1']]);
  let managed = await ok('/shelves', 'POST', {
    branch_id: branch,
    stock_location_id: shelf.id,
    code: 'RETURNS',
    name: 'Return capacity fixture',
    status: 'ACTIVE',
  });
  const slot = await ok(`/shelves/${managed.id}/slots`, 'POST', {
    code: 'ONE',
    position: 1,
  });
  let assignment = await ok(`/shelves/${managed.id}/assignments`, 'POST', {
    slot_id: slot.id,
    variant_id: variant.id,
    minimum_quantity: '0',
    target_quantity: '4',
    capacity_quantity: '4',
    status: 'ACTIVE',
  });
  const first = await approved(firstSale);
  const second = await approved(secondSale);
  const before = Number(movements());
  const attempts = await Promise.all(
    [first, second].map((doc) =>
      call(`/returns/${doc.id}/complete`, 'POST', { revision: doc.revision }),
    ),
  );
  equal(
    attempts.filter((response) => response.status === 200).length,
    1,
    'only one concurrent return fits capacity',
  );
  equal(
    attempts.filter((response) => response.status === 409).length,
    1,
    'over-capacity concurrent return conflicts',
  );
  equal(stock(), '4.000', 'recorded stock reaches but never exceeds capacity');
  equal(Number(movements()), before + 1, 'rejected return adds no movement');
  const rejectedIndex = attempts.findIndex(
    (response) => response.status === 409,
  );
  const pending = [first, second][rejectedIndex];
  equal(
    (await ok(`/returns/${pending.id}`)).status,
    'APPROVED',
    'failed posting stays recoverable',
  );
  equal(
    authSQL(
      `SELECT count(*) FROM customer_refunds WHERE organization_id='${org}' AND return_id='${pending.id}'`,
    ),
    '0',
    'failed posting creates no orphan refund',
  );
  const returned = await ok(`/returns/sales/${pending.original_sale_id}`);
  equal(
    returned.items[0].returnable_quantity,
    '1.000',
    'failed posting consumes no returnable quantity',
  );
  const retryKey = randomUUID();
  await action(pending, 'complete', 409, retryKey);
  equal(
    authSQL(
      `SELECT count(*) FROM inventory_operations WHERE organization_id='${org}' AND idempotency_key='${retryKey}'`,
    ),
    '0',
    'failed posting rolls back idempotency record',
  );
  assignment = await ok(
    `/shelves/${managed.id}/assignments/${assignment.id}`,
    'PATCH',
    {
      revision: assignment.revision,
      slot_id: slot.id,
      variant_id: variant.id,
      minimum_quantity: '0',
      target_quantity: '5',
      capacity_quantity: '5',
      status: 'INACTIVE',
    },
  );
  await action(pending, 'complete', 409, retryKey);
  assignment = await ok(
    `/shelves/${managed.id}/assignments/${assignment.id}`,
    'PATCH',
    {
      revision: assignment.revision,
      slot_id: slot.id,
      variant_id: variant.id,
      minimum_quantity: '0',
      target_quantity: '5',
      capacity_quantity: '5',
      status: 'ACTIVE',
    },
  );
  managed = await ok(`/shelves/${managed.id}`, 'PATCH', {
    revision: managed.revision,
    branch_id: branch,
    stock_location_id: shelf.id,
    code: 'RETURNS',
    name: 'Return capacity fixture',
    status: 'INACTIVE',
  });
  await action(pending, 'complete', 409, retryKey);
  managed = await ok(`/shelves/${managed.id}`, 'PATCH', {
    revision: managed.revision,
    branch_id: branch,
    stock_location_id: shelf.id,
    code: 'RETURNS',
    name: 'Return capacity fixture',
    status: 'ACTIVE',
  });
  const recovered = await action(pending, 'complete', 200, retryKey);
  equal(
    recovered.status,
    'COMPLETED',
    'same key can recover after failed posting and authorized capacity change',
  );
  await action(pending, 'complete', 200, retryKey);
  equal(stock(), '5.000', 'successful retry/replay posts exactly once');
  const unassigned = await approved(otherSale);
  await action(unassigned, 'complete', 409);
  equal(
    (await ok(`/returns/${unassigned.id}`)).status,
    'APPROVED',
    'unassigned variant cannot enter managed shelf',
  );
  await action(unassigned, 'cancel');
  const warehouseReturn = await approved(otherSale, fixture.warehouse.id);
  await action(warehouseReturn, 'complete');
  equal(
    authSQL(
      `SELECT count(*) FROM stock_balances balance FULL JOIN (SELECT organization_id,location_id,variant_id,sum(quantity_delta) quantity FROM stock_movements GROUP BY 1,2,3) ledger USING(organization_id,location_id,variant_id) WHERE COALESCE(balance.quantity,0)<>COALESCE(ledger.quantity,0)`,
    ),
    '0',
    'ledger reconciles after managed shelf denial and recovery',
  );
  console.log(`Returns/shelves integration passed: ${assertions} assertions`);
} finally {
  fixture.close();
}
