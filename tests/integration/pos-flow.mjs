import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { authSQL } from './auth-fixtures.mjs';
import {
  inventoryAccount,
  inventoryMembership,
} from './inventory-fixtures.mjs';
import { posFixture } from './pos-fixtures.mjs';

let assertions = 0;
const equal = (actual, expected, label) => {
  assert.equal(actual, expected, label);
  assertions++;
};
const fixture = await posFixture();
const {
  call,
  org,
  owner,
  branch,
  secondBranch,
  terminal,
  variant,
  variant2,
  weightVariant,
  shelf,
  warehouse,
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
async function cart(items = [[variant, '1']], user = owner, target = terminal) {
  const value = await ok(
    '/pos/carts',
    'POST',
    { terminal_id: target.id },
    undefined,
    user,
  );
  return ok(
    '/pos/carts/' + value.id,
    'PATCH',
    {
      revision: value.revision,
      items: items.map(([item, quantity]) => ({
        variant_id: item.id,
        quantity,
      })),
    },
    undefined,
    user,
    200,
  );
}
async function prepare(
  value,
  method = 'CASH',
  user = owner,
  key = randomUUID(),
) {
  return ok(
    '/pos/checkout',
    'POST',
    {
      cart_id: value.id,
      revision: value.revision,
      method,
      expected_total: value.total,
      received: value.total,
    },
    key,
    user,
  );
}
async function confirm(
  value,
  user = owner,
  key = randomUUID(),
  reference = value.method === 'CASH' ? '' : 'TEST-REFERENCE',
) {
  return ok(
    `/pos/payments/${value.id}/confirm`,
    'POST',
    { acknowledged: true, reference },
    key,
    user,
    200,
  );
}
async function complete(value, user = owner) {
  return ok(
    `/pos/checkouts/${value.id}/complete`,
    'POST',
    {},
    undefined,
    user,
    200,
  );
}
async function stock(location, item = variant) {
  const result = await ok(
    `/inventory/balances?location_id=${location.id}&variant_id=${item.id}`,
  );
  return result.items[0]?.quantity ?? '0.000';
}
const counts = () =>
  authSQL(
    `SELECT (SELECT count(*) FROM sales WHERE organization_id='${org}')||'|'||(SELECT count(*) FROM stock_movements WHERE organization_id='${org}' AND movement_type='SALE')||'|'||(SELECT count(*) FROM sale_payments WHERE organization_id='${org}')||'|'||(SELECT count(*) FROM receipts WHERE organization_id='${org}')`,
  );

try {
  const openKey = randomUUID();
  const opening = { terminal_id: terminal.id, opening_cash: '100.00' };
  const shift = await ok('/pos/shifts/open', 'POST', opening, openKey);
  equal(
    (await ok('/pos/shifts/open', 'POST', opening, openKey)).id,
    shift.id,
    'open replay',
  );
  equal(
    (
      await call(
        '/pos/shifts/open',
        'POST',
        { ...opening, opening_cash: '101.00' },
        openKey,
      )
    ).status,
    409,
    'open key mismatch',
  );
  equal(
    (await call('/pos/shifts/open', 'POST', opening)).status,
    409,
    'duplicate active terminal',
  );
  equal(
    (await ok(`/pos/barcodes/POS-TEST-001?terminal_id=${terminal.id}`)).items[0]
      .variant_id,
    variant.id,
    'barcode lookup',
  );
  equal(
    (await call(`/pos/barcodes/UNKNOWN?terminal_id=${terminal.id}`)).status,
    404,
    'unknown barcode',
  );
  const created = await cart();
  equal(
    (
      await call('/pos/carts/' + created.id, 'PATCH', {
        revision: created.revision,
        items: [{ variant_id: variant.id, quantity: '0.1' }],
      })
    ).status,
    400,
    'fractional COUNT blocked',
  );
  equal(
    (
      await call('/pos/carts/' + created.id, 'PATCH', {
        revision: created.revision - 1,
        items: [],
      })
    ).status,
    409,
    'stale cart revision',
  );
  const held = await ok(
    `/pos/carts/${created.id}/hold`,
    'POST',
    { revision: created.revision },
    undefined,
    owner,
    200,
  );
  equal(await stock(shelf), '5.000', 'hold no reservation');
  const resumers = await Promise.all([
    call(`/pos/carts/${held.id}/resume`, 'POST', { revision: held.revision }),
    call(`/pos/carts/${held.id}/resume`, 'POST', { revision: held.revision }),
  ]);
  equal(
    resumers.filter((value) => value.status === 200).length,
    1,
    'held cart concurrent claim',
  );
  equal(
    resumers.filter((value) => value.status === 409).length,
    1,
    'held stale claim rejected',
  );
  const resumed = resumers.find((value) => value.status === 200).data;
  equal(
    (
      await call('/pos/checkout', 'POST', {
        cart_id: resumed.id,
        revision: resumed.revision,
        method: 'CASH',
        expected_total: '0.01',
        received: '100.00',
      })
    ).status,
    409,
    'tampered total',
  );
  equal(
    (
      await call('/pos/checkout', 'POST', {
        cart_id: resumed.id,
        revision: resumed.revision,
        method: 'CASH',
        expected_total: resumed.total,
        received: '1.00',
      })
    ).status,
    400,
    'cash underpayment',
  );
  equal(
    (
      await call('/pos/checkout', 'POST', {
        cart_id: resumed.id,
        revision: resumed.revision,
        method: 'QR_MANUAL',
        expected_total: resumed.total,
        received: '100.00',
      })
    ).status,
    400,
    'noncash overpayment',
  );
  const checkoutKey = randomUUID();
  const body = {
    cart_id: resumed.id,
    revision: resumed.revision,
    method: 'CASH',
    expected_total: resumed.total,
    received: '10.00',
  };
  const prepared = await ok('/pos/checkout', 'POST', body, checkoutKey);
  equal(prepared.change, '8.00', 'exact change');
  equal(
    (await ok('/pos/checkout', 'POST', body, checkoutKey)).id,
    prepared.id,
    'prepare replay',
  );
  equal(
    (
      await call(
        '/pos/checkout',
        'POST',
        { ...body, received: '20.00' },
        checkoutKey,
      )
    ).status,
    409,
    'checkout fingerprint mismatch',
  );
  equal(
    (
      await call(`/pos/carts/${resumed.id}`, 'PATCH', {
        revision: resumed.revision,
        items: [],
      })
    ).status,
    409,
    'pending cart frozen',
  );
  equal(
    (await call(`/pos/checkouts/${prepared.id}/complete`, 'POST', {})).status,
    409,
    'unconfirmed not sale',
  );
  const confirmKey = randomUUID();
  const confirmed = await confirm(prepared, owner, confirmKey);
  equal(
    (await confirm(prepared, owner, confirmKey)).status,
    'CONFIRMED',
    'confirmation replay',
  );
  equal(
    (
      await call(
        `/pos/payments/${prepared.id}/confirm`,
        'POST',
        { acknowledged: true, reference: 'different' },
        confirmKey,
      )
    ).status,
    409,
    'confirmation evidence cannot change',
  );
  const duplicate = await Promise.all([
    complete(confirmed),
    complete(confirmed),
  ]);
  equal(duplicate[0].status, 'COMPLETED', 'cash committed');
  equal(
    duplicate[0].sale_id,
    duplicate[1].sale_id,
    'duplicate checkout one sale',
  );
  equal(counts(), '1|1|1|1', 'single sale/movement/payment/receipt');
  equal(await stock(shelf), '4.000', 'configured shelf deducted');
  equal(await stock(warehouse), '100.000', 'parent warehouse untouched');
  const sale = await ok('/sales/' + duplicate[0].sale_id);
  equal(sale.grand_total, '2.00', 'money returned string');
  equal(sale.items[0].unit_price, '2.00', 'snapshot price');
  equal(sale.payment.change, '8.00', 'committed change');
  equal(
    (await ok('/receipts/' + sale.receipt.id)).id,
    sale.id,
    'receipt resolves committed sale',
  );
  equal((await complete(confirmed)).sale_id, sale.id, 'lost response recovery');
  equal(
    (await call('/pos/checkout', 'POST', body)).status,
    409,
    'completed cart cannot checkout again',
  );
  equal(
    (await ok(`/pos/shifts/${shift.id}`)).expected_cash,
    '102.00',
    'cash net received minus change',
  );
  const weightCart = await cart([[weightVariant, '1.125']]);
  equal(weightCart.total, '2.25', 'weighted rounding');
  for (const method of ['QR_MANUAL', 'BANK_TRANSFER_MANUAL']) {
    const current =
      method === 'QR_MANUAL' ? weightCart : await cart([[variant2, '1']]);
    const intent = await prepare(current, method);
    equal(intent.status, 'AWAITING_PAYMENT', 'manual method not confirmation');
    equal(
      (
        await call(`/pos/payments/${intent.id}/confirm`, 'POST', {
          acknowledged: true,
          reference: '',
        })
      ).status,
      400,
      'manual reference required',
    );
    const confirmed = await confirm(intent);
    equal((await complete(confirmed)).status, 'COMPLETED', 'manual sale');
  }
  equal(
    (await ok(`/pos/shifts/${shift.id}`)).expected_cash,
    '102.00',
    'noncash excluded from drawer',
  );
  const cashierA = await inventoryAccount(fixture.clients),
    cashierB = await inventoryAccount(fixture.clients),
    staff = await inventoryAccount(fixture.clients),
    outsider = await inventoryAccount(fixture.clients);
  inventoryMembership(org, cashierA, 'CASHIER', [branch]);
  inventoryMembership(org, cashierB, 'CASHIER', [branch]);
  inventoryMembership(org, staff, 'INVENTORY_STAFF', [branch]);
  const target = async (code) =>
    ok('/pos/terminals', 'POST', {
      branch_id: branch,
      code,
      name: code,
      stock_location_id: shelf.id,
      status: 'ACTIVE',
    });
  const targetA = await target('A'),
    targetB = await target('B');
  const shiftA = await ok(
    '/pos/shifts/open',
    'POST',
    { terminal_id: targetA.id, opening_cash: '0.00' },
    undefined,
    cashierA,
  );
  await ok(
    '/pos/shifts/open',
    'POST',
    { terminal_id: targetB.id, opening_cash: '0.00' },
    undefined,
    cashierB,
  );
  equal(
    (
      await call(
        '/pos/terminals',
        'POST',
        {
          branch_id: branch,
          code: 'BAD',
          name: 'Bad',
          stock_location_id: shelf.id,
        },
        undefined,
        cashierA,
      )
    ).status,
    403,
    'cashier cannot manage terminal',
  );
  equal(
    (await call('/pos/terminals', 'GET', undefined, undefined, staff)).status,
    403,
    'inventory staff no POS',
  );
  equal(
    (await call('/pos/terminals', 'GET', undefined, undefined, outsider))
      .status,
    404,
    'cross tenant hidden',
  );
  equal(
    (
      await call(
        `/pos/terminals?branch_id=${secondBranch}`,
        'GET',
        undefined,
        undefined,
        cashierA,
      )
    ).status,
    403,
    'unauthorized branch',
  );
  equal(
    (await call(`/sales/${sale.id}`, 'GET', undefined, undefined, cashierA))
      .status,
    403,
    'cashier cannot see others sales',
  );
  equal(
    (
      await call(
        `/receipts/${sale.receipt.id}`,
        'GET',
        undefined,
        undefined,
        cashierA,
      )
    ).status,
    403,
    'cashier cannot print others receipt',
  );
  equal(
    (
      await call(
        '/pos/carts/' + resumed.id,
        'GET',
        undefined,
        undefined,
        cashierA,
      )
    ).status,
    403,
    'cart ownership',
  );
  const valueA = await cart([[variant, '3']], cashierA, targetA),
    valueB = await cart([[variant, '2']], cashierB, targetB);
  const intentA = await confirm(
      await prepare(valueA, 'CASH', cashierA),
      cashierA,
    ),
    intentB = await confirm(
      await prepare(valueB, 'QR_MANUAL', cashierB),
      cashierB,
    );
  const race = await Promise.all([
    complete(intentA, cashierA),
    complete(intentB, cashierB),
  ]);
  equal(
    race.filter((value) => value.status === 'COMPLETED').length,
    1,
    'oversell one winner',
  );
  equal(
    race.filter((value) => value.status === 'RECONCILIATION_REQUIRED').length,
    1,
    'loser durable payment evidence',
  );
  const failed = race.find(
      (value) => value.status === 'RECONCILIATION_REQUIRED',
    ),
    failedUser = failed.id === intentA.id ? cashierA : cashierB;
  equal(failed.failure_code, 'INSUFFICIENT_STOCK', 'stock failure recorded');
  equal(
    (
      await call(
        `/pos/checkouts/${failed.id}/cancel`,
        'POST',
        {},
        undefined,
        failedUser,
      )
    ).status,
    409,
    'cannot erase confirmed funds',
  );
  equal(
    (
      await call(
        `/pos/checkouts/${failed.id}/resolve`,
        'POST',
        { acknowledged: true, note: 'cannot do' },
        undefined,
        failedUser,
      )
    ).status,
    403,
    'cashier cannot reconcile funds',
  );
  equal(
    (
      await call(
        `/pos/shifts/${failed.shift_id}/close`,
        'POST',
        { counted_cash: '0.00' },
        undefined,
        failedUser,
      )
    ).status,
    409,
    'pending blocks shift close',
  );
  equal(
    (
      await ok(
        `/pos/checkouts/${failed.id}/resolve`,
        'POST',
        {
          acknowledged: true,
          note: 'Manual funds disposition verified outside this test system',
        },
        undefined,
        owner,
        200,
      )
    ).status,
    'RESOLVED',
    'manager evidence resolution',
  );
  const before = await stock(shelf, variant2);
  const multi = await cart([
    [variant2, '1'],
    [weightVariant, '0.125'],
  ]);
  const multiIntent = await confirm(await prepare(multi));
  authSQL(
    `CREATE FUNCTION pos_test_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.organization_id='${org}'::uuid THEN RAISE EXCEPTION 'isolated payment insertion failure' USING ERRCODE='23514'; END IF; RETURN NEW; END $$; CREATE TRIGGER pos_test_failure BEFORE INSERT ON sale_payments FOR EACH ROW EXECUTE FUNCTION pos_test_failure();`,
  );
  const beforeCounts = counts();
  const rolled = await complete(multiIntent);
  equal(
    rolled.status,
    'RECONCILIATION_REQUIRED',
    'post-ledger failure retained',
  );
  equal(counts(), beforeCounts, 'all local posting rolled back');
  equal(await stock(shelf, variant2), before, 'balance rolled back');
  authSQL(
    'DROP TRIGGER pos_test_failure ON sale_payments; DROP FUNCTION pos_test_failure();',
  );
  equal(
    (await complete(multiIntent)).status,
    'COMPLETED',
    'same confirmed attempt recoverable',
  );
  const noAuth = await call(
    '/pos/carts',
    'POST',
    { terminal_id: terminal.id },
    undefined,
    owner,
    { 'X-CSRF-Token': 'invalid' },
  );
  equal(noAuth.status, 403, 'CSRF');
  equal(
    (
      await call('/pos/carts', 'POST', {
        terminal_id: terminal.id,
        unit_price: '0.01',
      })
    ).status,
    400,
    'unknown price field rejected',
  );
  equal(
    (
      await call(
        '/pos/carts',
        'POST',
        { terminal_id: terminal.id },
        undefined,
        owner,
        { Origin: 'https://attacker.invalid' },
      )
    ).status,
    403,
    'Origin',
  );
  const pendingCart = await cart([[variant2, '1']]);
  const pendingIntent = await prepare(pendingCart, 'QR_MANUAL');
  equal(
    (
      await call(`/pos/shifts/${shift.id}/close`, 'POST', {
        counted_cash: '102.00',
      })
    ).status,
    409,
    'awaiting manual blocks close',
  );
  await ok(
    `/pos/checkouts/${pendingIntent.id}/cancel`,
    'POST',
    {},
    undefined,
    owner,
    200,
  );
  const closeKey = randomUUID();
  equal(
    (await ok(`/pos/shifts/${shift.id}`)).expected_cash,
    '104.25',
    'recovered multi-item cash included',
  );
  const closed = await ok(
    `/pos/shifts/${shift.id}/close`,
    'POST',
    { counted_cash: '100.00' },
    closeKey,
    owner,
    200,
  );
  equal(
    closed.difference,
    '-4.25',
    'close variance includes recovered cash sale',
  );
  equal(
    (
      await ok(
        `/pos/shifts/${shift.id}/close`,
        'POST',
        { counted_cash: '100.00' },
        closeKey,
        owner,
        200,
      )
    ).id,
    closed.id,
    'close replay',
  );
  equal(
    (
      await call(`/pos/shifts/${shift.id}/close`, 'POST', {
        counted_cash: '102.00',
      })
    ).status,
    409,
    'no duplicate close',
  );
  equal(
    (await call('/pos/carts', 'POST', { terminal_id: terminal.id })).status,
    409,
    'closed shift cannot sell',
  );
  equal((await ok('/sales?page_size=1')).items.length, 1, 'server pagination');
  const runtime = authSQL(
    `BEGIN; SET LOCAL ROLE smartpos_runtime; SELECT set_config('app.organization_id','${org}',true),set_config('app.user_id','${owner.id}',true); SELECT count(*) FROM sales; SELECT set_config('app.organization_id','${randomUUID()}',true); SELECT count(*) FROM sales; ROLLBACK;`,
  );
  assert.ok(runtime.includes('\n0\n'), 'runtime RLS wrong tenant returns zero');
  assertions++;
  equal(
    authSQL(
      "SELECT count(*) FROM pg_class WHERE relname IN ('pos_terminals','register_shifts','pos_carts','pos_cart_items','pos_checkouts','sales','sale_items','sale_payments','receipts') AND relrowsecurity AND relforcerowsecurity",
    ),
    '9',
    'FORCE RLS all POS tables',
  );
  equal(
    authSQL(
      "SELECT has_table_privilege('smartpos_runtime','sales','UPDATE') OR has_table_privilege('smartpos_runtime','stock_balances','UPDATE')",
    ),
    'f',
    'runtime immutable sale/balance',
  );
  console.log(
    `PASS: Phase 3 POS integration (${assertions} assertions): cash/manual, snapshots, idempotency, oversell, all-item rollback, durable funds, RBAC, CSRF, RLS and shifts`,
  );
} finally {
  authSQL(
    'DROP TRIGGER IF EXISTS pos_test_failure ON sale_payments; DROP FUNCTION IF EXISTS pos_test_failure();',
  );
  fixture.close();
}
