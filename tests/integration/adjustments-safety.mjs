import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { authSQL } from './auth-fixtures.mjs';
import {
  inventoryAccount,
  inventoryMembership,
} from './inventory-fixtures.mjs';
import { adjustmentsFixture } from './adjustments-fixtures.mjs';

const fixture = await adjustmentsFixture();
const {
  call,
  owner,
  org,
  branch,
  secondBranch,
  shelf,
  warehouse,
  destination,
  variant,
  variant2,
  shift,
  sale,
  input,
  clients,
} = fixture;
let assertions = 0;
function equal(actual, expected, label) {
  assert.equal(actual, expected, label);
  assertions++;
}
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
async function action(doc, name, extra = {}, key, user = owner, status = 200) {
  return ok(
    `${doc.kind === 'REVERSAL' ? '/sales/voids' : '/exchanges'}/${doc.id}/${name}`,
    'POST',
    { revision: doc.revision, ...extra },
    key,
    user,
    status,
  );
}
async function approve(doc, user = owner) {
  return action(
    await action(doc, 'submit', {}, undefined, user),
    'approve',
    {},
    undefined,
    user,
  );
}
async function ready(
  doc,
  method = 'NONE',
  user = owner,
  selectedShift = shift.id,
) {
  return action(
    await approve(doc, user),
    'confirm-settlement',
    {
      method,
      reference: method.includes('MANUAL') ? 'SAFETY-REFERENCE' : '',
      note: 'Operator evidence',
      acknowledged: true,
      shift_id: ['CASH', 'CASH_REFUND'].includes(method) ? selectedShift : null,
    },
    undefined,
    user,
  );
}
const count = (table) =>
  authSQL(`SELECT count(*) FROM ${table} WHERE organization_id='${org}'`);
const balance = (item = variant2, location = shelf) =>
  authSQL(
    `SELECT quantity::text FROM stock_balances WHERE organization_id='${org}' AND location_id='${location.id}' AND variant_id='${item.id}'`,
  );
const state = () =>
  authSQL(
    `SELECT COALESCE(jsonb_agg(jsonb_build_array(location_id,variant_id,quantity,version) ORDER BY location_id,variant_id),'[]')::text FROM stock_balances WHERE organization_id='${org}'`,
  );
async function adjust(item, amount, type) {
  let doc = await ok('/inventory/adjustments', 'POST', {
    location_id: shelf.id,
    adjustment_type: type,
    reason_code: 'SAFETY_STOCK',
    notes: 'Synthetic controlled availability',
    items: [{ variant_id: item.id, quantity: amount }],
  });
  for (const name of ['submit', 'approve', 'post'])
    doc = await ok(
      `/inventory/adjustments/${doc.id}/${name}`,
      'POST',
      { revision: doc.revision },
      undefined,
      owner,
      200,
    );
}
async function returnApproved(original) {
  let doc = await ok('/returns', 'POST', {
    original_sale_id: original.id,
    reason: 'Concurrent remaining return',
    items: input(original).items,
  });
  for (const name of ['submit', 'approve'])
    doc = await ok(
      `/returns/${doc.id}/${name}`,
      'POST',
      { revision: doc.revision },
      undefined,
      owner,
      200,
    );
  return doc;
}
try {
  const original = await sale([[variant, '1']]);
  const request = input(original);
  let first = await ready(await ok('/exchanges', 'POST', request));
  let second = await ready(await ok('/exchanges', 'POST', request));
  const beforeMovements = Number(count('stock_movements')),
    beforeSales = Number(count('sales'));
  const concurrent = await Promise.all(
    [first, second].map((doc) =>
      call(`/exchanges/${doc.id}/complete`, 'POST', { revision: doc.revision }),
    ),
  );
  equal(
    concurrent.filter((value) => value.status === 200).length,
    1,
    'double exchange one success',
  );
  equal(concurrent.filter((value) => value.status === 409).length, 1);
  equal(Number(count('stock_movements')), beforeMovements + 2);
  equal(Number(count('sales')), beforeSales + 1);
  const winner = concurrent.find((value) => value.status === 200).data;
  const otherOriginal = await sale([[variant, '1']]);
  const exchange = await ready(
    await ok('/exchanges', 'POST', input(otherOriginal)),
  );
  const returned = await returnApproved(otherOriginal);
  const contested = await Promise.all([
    call(`/exchanges/${exchange.id}/complete`, 'POST', {
      revision: exchange.revision,
    }),
    call(`/returns/${returned.id}/complete`, 'POST', {
      revision: returned.revision,
    }),
  ]);
  equal(
    contested.filter((value) => value.status === 200).length,
    1,
    'exchange versus refund allocation',
  );
  equal(contested.filter((value) => value.status === 409).length, 1);
  const duplicate = await ready(
    await ok('/exchanges', 'POST', input(await sale([[variant, '1']]))),
  );
  const duplicateKey = randomUUID();
  const duplicateBefore = Number(count('stock_movements'));
  const duplicateRequests = await Promise.all(
    [1, 2].map(() =>
      call(
        `/exchanges/${duplicate.id}/complete`,
        'POST',
        { revision: duplicate.revision },
        duplicateKey,
      ),
    ),
  );
  for (const response of duplicateRequests) equal(response.status, 200);
  equal(
    duplicateRequests[0].data.replacement_sale_id,
    duplicateRequests[1].data.replacement_sale_id,
  );
  equal(Number(count('stock_movements')), duplicateBefore + 2);
  const rollbackOriginal = await sale([[variant, '1']]);
  let rollback = await ready(
    await ok('/exchanges', 'POST', input(rollbackOriginal, [[variant2, '2']])),
    'CASH',
  );
  const available = balance();
  await adjust(variant2, available, 'DECREASE');
  const beforeState = state(),
    beforeRefunds = count('customer_refunds'),
    beforeReplacement = count('sales'),
    beforeLedger = count('stock_movements');
  const failureKey = randomUUID();
  const failed = await action(rollback, 'complete', {}, failureKey);
  equal(failed.status, 'RECONCILIATION_REQUIRED');
  equal(!!failed.reported_at, true);
  equal(failed.method, 'CASH');
  equal(state(), beforeState);
  equal(count('stock_movements'), beforeLedger);
  equal(count('sales'), beforeReplacement);
  equal(count('customer_refunds'), beforeRefunds);
  equal(
    (await ok(`/returns/sales/${rollbackOriginal.id}`)).items[0]
      .returnable_quantity,
    '1.000',
  );
  equal(
    (await action(rollback, 'complete', {}, failureKey)).status,
    'RECONCILIATION_REQUIRED',
    'failure replay does not charge',
  );
  await ok(
    `/pos/shifts/${shift.id}/close`,
    'POST',
    { counted_cash: '0.00' },
    undefined,
    owner,
    409,
  );
  await adjust(variant2, '100', 'INCREASE');
  rollback = await action(failed, 'complete');
  equal(rollback.status, 'COMPLETED');
  equal(
    Number(count('stock_movements')),
    Number(beforeLedger) + 3,
    'stock restoration + exactly two posting effects',
  );
  const negativeOriginal = await sale([[variant, '2']]);
  await ok(
    '/exchanges',
    'POST',
    input(negativeOriginal, [[variant2, '1']], '2', destination.id),
    undefined,
    owner,
    409,
  );
  const locationBody = {
    branch_id: branch,
    code: 'ROLLBACK',
    name: 'Rollback destination',
    type: 'WAREHOUSE',
    parent_location_id: null,
    description: '',
    status: 'ACTIVE',
  };
  let location = await ok('/inventory/locations', 'POST', locationBody);
  let negative = await ready(
    await ok(
      '/exchanges',
      'POST',
      input(negativeOriginal, [[variant2, '1']], '2', location.id),
    ),
    'CASH_REFUND',
  );
  location = await ok(
    `/inventory/locations/${location.id}`,
    'PATCH',
    { ...locationBody, revision: location.revision, status: 'INACTIVE' },
    undefined,
    owner,
    200,
  );
  const negativeRefundCount = count('customer_refunds'),
    cashSnapshot = await ok(`/pos/shifts/${shift.id}`);
  const failedNegative = await action(negative, 'complete');
  equal(failedNegative.status, 'RECONCILIATION_REQUIRED');
  equal(count('customer_refunds'), negativeRefundCount);
  equal(
    (await ok(`/pos/shifts/${shift.id}`)).cash_refunds,
    cashSnapshot.cash_refunds,
  );
  await ok(
    `/inventory/locations/${location.id}`,
    'PATCH',
    { ...locationBody, revision: location.revision },
    undefined,
    owner,
    200,
  );
  negative = await action(failedNegative, 'complete');
  equal(negative.status, 'COMPLETED');
  equal(
    (await ok(`/refunds/${negative.return_document.refund_id}`)).amount,
    '2.00',
  );
  const partialOriginal = await sale([[variant, '2']]);
  let reversal = await ready(
    await ok('/sales/voids', 'POST', input(partialOriginal, [], '2')),
    'MANUAL_BANK_REFUND',
  );
  const partial = await returnApproved(partialOriginal);
  const reversalRace = await Promise.all([
    call(`/sales/voids/${reversal.id}/complete`, 'POST', {
      revision: reversal.revision,
    }),
    call(`/returns/${partial.id}/complete`, 'POST', {
      revision: partial.revision,
    }),
  ]);
  equal(
    reversalRace.filter(
      (value) => value.status === 200 && value.data.status === 'COMPLETED',
    ).length,
    1,
    'reversal versus partial return only one effect',
  );
  equal(
    authSQL(
      `SELECT count(*) FROM (SELECT original_sale_item_id FROM customer_return_items item JOIN customer_returns doc ON doc.organization_id=item.organization_id AND doc.id=item.return_id WHERE item.organization_id='${org}' AND item.original_sale_id='${partialOriginal.id}' AND doc.status='COMPLETED' GROUP BY original_sale_item_id HAVING sum(quantity)>2) overreturned`,
    ),
    '0',
  );
  const reversible = await sale([[variant, '1']]);
  let doubleReversal = await ready(
    await ok('/sales/voids', 'POST', input(reversible, [], '1')),
    'MANUAL_BANK_REFUND',
  );
  const reversed = await Promise.all(
    [1, 2].map(() =>
      call(`/sales/voids/${doubleReversal.id}/complete`, 'POST', {
        revision: doubleReversal.revision,
      }),
    ),
  );
  equal(reversed.filter((value) => value.status === 200).length, 1);
  equal(reversed.filter((value) => value.status === 409).length, 1);
  const finalUnitOriginal = await sale([[variant, '1']]);
  const finalExchange = await ready(
    await ok('/exchanges', 'POST', input(finalUnitOriginal)),
  );
  const current = balance();
  await adjust(variant2, String(Number(current) - 1), 'DECREASE');
  let cart = await ok('/pos/carts', 'POST', {
    terminal_id: fixture.terminal.id,
  });
  cart = await ok(
    `/pos/carts/${cart.id}`,
    'PATCH',
    {
      revision: cart.revision,
      items: [{ variant_id: variant2.id, quantity: '1' }],
    },
    undefined,
    owner,
    200,
  );
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
    { acknowledged: true, reference: '' },
    undefined,
    owner,
    200,
  );
  const stockRace = await Promise.all([
    call(`/exchanges/${finalExchange.id}/complete`, 'POST', {
      revision: finalExchange.revision,
    }),
    call(`/pos/checkouts/${checkout.id}/complete`, 'POST', {}),
  ]);
  equal(
    stockRace.filter(
      (value) => value.status === 200 && value.data.status === 'COMPLETED',
    ).length,
    1,
    'exchange versus POS last unit',
  );
  equal(balance(), '0.000');
  await adjust(variant2, '100', 'INCREASE');
  const manager = await inventoryAccount(clients);
  inventoryMembership(org, manager, 'MANAGER', [branch]);
  const cashier = await inventoryAccount(clients);
  inventoryMembership(org, cashier, 'CASHIER', [branch]);
  const inventory = await inventoryAccount(clients);
  inventoryMembership(org, inventory, 'INVENTORY_STAFF', [branch]);
  await ok('/exchanges', 'GET', undefined, undefined, inventory, 403);
  await ok('/sales/voids', 'GET', undefined, undefined, inventory, 403);
  await ok(
    `/exchanges/${winner.id}`,
    'GET',
    undefined,
    undefined,
    cashier,
    403,
  );
  await ok(
    '/exchanges',
    'POST',
    input(await sale([[variant, '1']])),
    undefined,
    cashier,
    403,
  );
  const pendingApproval = await ok(
    '/exchanges',
    'POST',
    input(await sale([[variant, '1']])),
  );
  const submitted = await action(pendingApproval, 'submit');
  await action(submitted, 'approve', {}, undefined, cashier, 403);
  const approvalKey = randomUUID();
  await action(submitted, 'approve', {}, approvalKey, manager);
  const memberID = authSQL(
    `SELECT id::text FROM organization_memberships WHERE organization_id='${org}' AND user_id='${manager.id}'`,
  );
  await ok(
    `/members/${memberID}`,
    'PATCH',
    { role: 'CASHIER', status: 'ACTIVE', branch_ids: [branch] },
    undefined,
    owner,
    200,
  );
  await action(submitted, 'approve', {}, approvalKey, manager, 403);
  await ok(
    `/members/${memberID}`,
    'PATCH',
    { role: 'MANAGER', status: 'SUSPENDED', branch_ids: [branch] },
    undefined,
    owner,
    200,
  );
  await ok(
    `/exchanges/${submitted.id}`,
    'GET',
    undefined,
    undefined,
    manager,
    404,
  );
  const csrf = await call('/exchanges', 'POST', request, undefined, owner, {
    'X-CSRF-Token': 'forged',
  });
  equal(csrf.status, 403);
  equal(
    (
      await call('/exchanges', 'POST', request, undefined, owner, {
        Origin: 'https://evil.example.test',
      })
    ).status,
    403,
  );
  const foreign = await adjustmentsFixture();
  try {
    const foreignSale = await foreign.sale([[foreign.variant, '1']]);
    await ok(
      `/returns/sales/${foreignSale.id}`,
      'GET',
      undefined,
      undefined,
      owner,
      404,
    );
    await ok('/exchanges', 'POST', input(foreignSale), undefined, owner, 404);
    await ok(
      `/exchanges/${winner.id}`,
      'GET',
      undefined,
      undefined,
      foreign.owner,
      404,
    );
    await action(winner, 'complete', {}, undefined, foreign.owner, 404);
    await ok(
      '/sales/voids',
      'POST',
      input(foreignSale, [], '1'),
      undefined,
      owner,
      404,
    );
    await ok(
      '/exchanges',
      'POST',
      input(await sale([[variant, '1']]), [[foreign.variant, '1']]),
      undefined,
      owner,
      404,
    );
    for (const table of ['sale_adjustments', 'adjustment_settlement_events']) {
      const rows = authSQL(
        `BEGIN; SET LOCAL ROLE smartpos_runtime; SELECT set_config('app.organization_id','${foreign.org}',true); SELECT count(*) FROM ${table} WHERE organization_id='${org}'; ROLLBACK;`,
      );
      equal(rows.split('\n').at(-2), '0', 'runtime RLS ' + table);
    }
  } finally {
    foreign.close();
  }
  authSQL(`BEGIN; SET LOCAL ROLE smartpos_runtime; SELECT set_config('app.organization_id','${org}',true); SELECT set_config('app.user_id','${owner.id}',true); DO $$ BEGIN
   BEGIN UPDATE sales SET grand_total=grand_total WHERE id='${original.id}'; RAISE EXCEPTION 'mutable sale'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
   BEGIN UPDATE sale_adjustments SET reason='forged',revision=revision+1 WHERE id='${winner.id}'; RAISE EXCEPTION 'mutable completed adjustment'; EXCEPTION WHEN check_violation THEN NULL; END;
   BEGIN DELETE FROM adjustment_settlement_events WHERE adjustment_id='${winner.id}'; RAISE EXCEPTION 'deleted evidence'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
   BEGIN UPDATE stock_balances SET quantity=quantity WHERE organization_id='${org}'; RAISE EXCEPTION 'mutable balances'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END $$; ROLLBACK;`);
  assertions += 4;
  equal(
    authSQL(
      `SELECT count(*) FROM stock_balances balance FULL JOIN (SELECT organization_id,location_id,variant_id,sum(quantity_delta) quantity FROM stock_movements GROUP BY 1,2,3) ledger USING(organization_id,location_id,variant_id) WHERE COALESCE(balance.quantity,0)<>COALESCE(ledger.quantity,0)`,
    ),
    '0',
    'global ledger conservation',
  );
  console.log(`PASS: Phase 5.2 concurrency/security ${assertions} assertions`);
} finally {
  fixture.close();
}
