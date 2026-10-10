import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { authSQL } from './auth-fixtures.mjs';
import { adjustmentsFixture } from './adjustments-fixtures.mjs';
import {
  inventoryAccount,
  inventoryMembership,
} from './inventory-fixtures.mjs';

const fixture = await adjustmentsFixture();
const {
  call,
  owner,
  org,
  branch,
  shelf,
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
  status = method === 'POST' ? 201 : 200,
  key = randomUUID(),
  user = owner,
) {
  const response = await call(path, method, body, key, user);
  equal(response.status, status, path + ': ' + JSON.stringify(response.error));
  return response.data;
}
async function action(doc, name, extra = {}, status = 200, key, user) {
  return ok(
    `/exchanges/${doc.id}/${name}`,
    'POST',
    { revision: doc.revision, ...extra },
    status,
    key,
    user,
  );
}
async function approved(
  original,
  replacements = [[variant2, '1']],
  destination = shelf.id,
) {
  let doc = await ok(
    '/exchanges',
    'POST',
    input(original, replacements, '1', destination),
  );
  doc = await action(doc, 'submit');
  return action(doc, 'approve');
}
async function ready(original, replacements, destination) {
  return action(
    await approved(original, replacements, destination),
    'confirm-settlement',
    { method: 'NONE', acknowledged: true, note: 'Exact zero difference' },
  );
}
const stock = (item) =>
  authSQL(
    `SELECT quantity::text FROM stock_balances WHERE organization_id='${org}' AND location_id='${shelf.id}' AND variant_id='${item.id}'`,
  );
const count = (table) =>
  Number(
    authSQL(`SELECT count(*) FROM ${table} WHERE organization_id='${org}'`),
  );
try {
  const firstOriginal = await sale([[variant, '1']]),
    secondOriginal = await sale([[variant, '1']]);
  const managed = await ok('/shelves', 'POST', {
    branch_id: branch,
    stock_location_id: shelf.id,
    code: 'EXCHANGE',
    name: 'Exchange capacity',
    status: 'ACTIVE',
  });
  const slot = await ok(`/shelves/${managed.id}/slots`, 'POST', {
    code: 'ONE',
    position: 1,
  });
  const capacity = String(Number(stock(variant)) + 1);
  await ok(`/shelves/${managed.id}/assignments`, 'POST', {
    slot_id: slot.id,
    variant_id: variant.id,
    minimum_quantity: '0',
    target_quantity: capacity,
    capacity_quantity: capacity,
    status: 'ACTIVE',
  });
  const first = await ready(firstOriginal),
    second = await ready(secondOriginal);
  const beforeSales = count('sales'),
    beforeMovements = count('stock_movements'),
    beforeRefunds = count('customer_refunds');
  const race = await Promise.all(
    [first, second].map((doc) =>
      call(`/exchanges/${doc.id}/complete`, 'POST', { revision: doc.revision }),
    ),
  );
  equal(
    race.filter((response) => response.status === 200).length,
    1,
    'only one returned item fits managed shelf',
  );
  equal(race.filter((response) => response.status === 409).length, 1);
  equal(stock(variant), capacity + '.000');
  equal(count('sales'), beforeSales + 1);
  equal(count('stock_movements'), beforeMovements + 2);
  equal(count('customer_refunds'), beforeRefunds);
  const failed = [first, second][
    race.findIndex((response) => response.status === 409)
  ];
  equal((await ok(`/exchanges/${failed.id}`)).status, 'AWAITING_SETTLEMENT');
  equal(
    (await ok(`/returns/sales/${failed.original_sale_id}`)).items[0]
      .returnable_quantity,
    '1.000',
  );
  const forbiddenKey = randomUUID();
  await action(failed, 'complete', {}, 409, forbiddenKey);
  equal(
    authSQL(
      `SELECT count(*) FROM inventory_operations WHERE organization_id='${org}' AND idempotency_key='${forbiddenKey}'`,
    ),
    '0',
  );
  const unassignedSale = await sale([[variant2, '1']]);
  const unassigned = await ready(unassignedSale, [[variant, '1']]);
  const snapshot = stock(variant2);
  await action(unassigned, 'complete', {}, 409);
  equal(
    stock(variant2),
    snapshot,
    'unassigned return cannot bypass managed shelf policy',
  );
  const another = await sale([[variant, '1']]);
  const exchange = await approved(
    another,
    [[variant2, '2']],
    fixture.warehouse.id,
  );
  await action(
    exchange,
    'confirm-settlement',
    {
      method: 'CASH_REFUND',
      acknowledged: true,
      note: 'Wrong direction',
      shift_id: shift.id,
    },
    400,
  );
  await action(
    exchange,
    'confirm-settlement',
    {
      method: 'CASH',
      acknowledged: false,
      note: 'Not acknowledged',
      shift_id: shift.id,
    },
    400,
  );
  await action(
    exchange,
    'confirm-settlement',
    { method: 'QR_MANUAL', acknowledged: true, note: 'Missing reference' },
    400,
  );
  const acknowledged = await action(exchange, 'confirm-settlement', {
    method: 'CASH',
    acknowledged: true,
    note: 'Cash +2',
    shift_id: shift.id,
  });
  await action(
    acknowledged,
    'confirm-settlement',
    {
      method: 'CASH',
      acknowledged: true,
      note: 'No second collection',
      shift_id: shift.id,
    },
    409,
  );
  await action(
    acknowledged,
    'complete',
    { method: 'CASH', acknowledged: true },
    400,
  );
  await action(exchange, 'complete', {}, 409);
  const manager = await inventoryAccount(clients);
  inventoryMembership(org, manager, 'MANAGER', [branch]);
  const memberID = authSQL(
    `SELECT id::text FROM organization_memberships WHERE organization_id='${org}' AND user_id='${manager.id}'`,
  );
  await ok(
    `/members/${memberID}`,
    'PATCH',
    { role: 'INVENTORY_STAFF', status: 'ACTIVE', branch_ids: [branch] },
    200,
  );
  await action(acknowledged, 'complete', {}, 403, undefined, manager);
  const reversible = await sale([[variant, '1']]);
  const reversalBody = input(reversible, [], '1', fixture.warehouse.id);
  const reversalRace = await Promise.all(
    [1, 2].map(() => call('/sales/voids', 'POST', reversalBody)),
  );
  equal(reversalRace.filter((response) => response.status === 201).length, 1);
  equal(
    reversalRace.filter((response) => response.status === 409).length,
    1,
    'unique active reversal under race',
  );
  const cashBefore = await ok(`/pos/shifts/${shift.id}`);
  const closeRace = await Promise.all([
    call(`/exchanges/${acknowledged.id}/complete`, 'POST', {
      revision: acknowledged.revision,
    }),
    call(`/pos/shifts/${shift.id}/close`, 'POST', {
      counted_cash: cashBefore.expected_cash,
    }),
  ]);
  equal(closeRace[0].status, 200);
  equal(closeRace[0].data.status, 'COMPLETED');
  assert.ok([200, 409].includes(closeRace[1].status));
  assertions++;
  const cashAfter = await ok(`/pos/shifts/${shift.id}`);
  equal(
    (
      BigInt(cashAfter.cash_sales.replace('.', '')) -
      BigInt(cashBefore.cash_sales.replace('.', ''))
    ).toString(),
    '200',
    'only difference enters register',
  );
  equal(
    authSQL(
      `SELECT count(*) FROM stock_balances balance WHERE organization_id='${org}' AND quantity<>(SELECT COALESCE(sum(quantity_delta),0) FROM stock_movements WHERE organization_id=balance.organization_id AND location_id=balance.location_id AND variant_id=balance.variant_id)`,
    ),
    '0',
  );
  const cashier = await inventoryAccount(clients);
  inventoryMembership(org, cashier, 'CASHIER', [branch]);
  const terminal = await ok('/pos/terminals', 'POST', {
    branch_id: branch,
    code: 'CASHIER',
    name: 'Cashier acceptance',
    stock_location_id: shelf.id,
    status: 'ACTIVE',
  });
  const ownShift = await ok(
    '/pos/shifts/open',
    'POST',
    { terminal_id: terminal.id, opening_cash: '100.00' },
    201,
    undefined,
    cashier,
  );
  async function cashierSale(quantity) {
    let cart = await ok(
      '/pos/carts',
      'POST',
      { terminal_id: terminal.id },
      201,
      undefined,
      cashier,
    );
    cart = await ok(
      `/pos/carts/${cart.id}`,
      'PATCH',
      {
        revision: cart.revision,
        items: [{ variant_id: variant.id, quantity }],
      },
      200,
      undefined,
      cashier,
    );
    let checkout = await ok(
      '/pos/checkout',
      'POST',
      {
        cart_id: cart.id,
        revision: cart.revision,
        method: 'CASH',
        expected_total: cart.total,
        received: cart.total,
      },
      201,
      undefined,
      cashier,
    );
    checkout = await ok(
      `/pos/payments/${checkout.id}/confirm`,
      'POST',
      { acknowledged: true, reference: '' },
      200,
      undefined,
      cashier,
    );
    checkout = await ok(
      `/pos/checkouts/${checkout.id}/complete`,
      'POST',
      {},
      200,
      undefined,
      cashier,
    );
    return ok(
      `/returns/sales/${checkout.sale_id}`,
      'GET',
      undefined,
      200,
      undefined,
      cashier,
    );
  }
  const cashierOriginal = await cashierSale('1');
  let cashierExchange = await ok(
    '/exchanges',
    'POST',
    {
      ...input(cashierOriginal, [[variant2, '2']], '1', fixture.warehouse.id),
      terminal_id: terminal.id,
    },
    201,
    undefined,
    cashier,
  );
  cashierExchange = await action(
    cashierExchange,
    'submit',
    {},
    200,
    undefined,
    cashier,
  );
  cashierExchange = await action(cashierExchange, 'approve');
  await action(
    cashierExchange,
    'confirm-settlement',
    {
      method: 'CASH',
      shift_id: shift.id,
      note: 'Not own shift',
      acknowledged: true,
    },
    409,
    undefined,
    cashier,
  );
  cashierExchange = await action(
    cashierExchange,
    'confirm-settlement',
    {
      method: 'CASH',
      shift_id: ownShift.id,
      note: 'Cashier collects exact positive net',
      acknowledged: true,
    },
    200,
    undefined,
    cashier,
  );
  cashierExchange = await action(
    cashierExchange,
    'complete',
    {},
    200,
    undefined,
    cashier,
  );
  equal(cashierExchange.status, 'COMPLETED');
  equal(
    (
      await ok(
        `/pos/shifts/${ownShift.id}`,
        'GET',
        undefined,
        200,
        undefined,
        cashier,
      )
    ).cash_sales,
    '4.00',
  );
  const refundOriginal = await cashierSale('2');
  let cashierNegative = await ok(
    '/exchanges',
    'POST',
    {
      ...input(refundOriginal, [[variant2, '1']], '2', fixture.warehouse.id),
      terminal_id: terminal.id,
    },
    201,
    undefined,
    cashier,
  );
  cashierNegative = await action(
    cashierNegative,
    'submit',
    {},
    200,
    undefined,
    cashier,
  );
  cashierNegative = await action(cashierNegative, 'approve');
  await action(
    cashierNegative,
    'confirm-settlement',
    {
      method: 'CASH_REFUND',
      shift_id: ownShift.id,
      note: 'Cashier cannot pay refund',
      acknowledged: true,
    },
    403,
    undefined,
    cashier,
  );
  cashierNegative = await action(cashierNegative, 'confirm-settlement', {
    method: 'MANUAL_BANK_REFUND',
    reference: 'manager-reviewed-refund',
    note: 'Manager reviewed the negative difference',
    acknowledged: true,
  });
  await action(cashierNegative, 'complete', {}, 403, undefined, cashier);
  equal(
    (await ok(`/exchanges/${cashierNegative.id}`)).status,
    'AWAITING_SETTLEMENT',
    'Cashier cannot finalize an already acknowledged negative refund',
  );
  const cashierMemberID = authSQL(
    `SELECT id::text FROM organization_memberships WHERE organization_id='${org}' AND user_id='${cashier.id}'`,
  );
  await ok(`/members/${cashierMemberID}`, 'PATCH', {
    role: 'MANAGER',
    status: 'ACTIVE',
    branch_ids: [branch],
  });
  const negativeCompleteKey = randomUUID();
  const negativeCompleteRevision = cashierNegative.revision;
  cashierNegative = await action(
    cashierNegative,
    'complete',
    {},
    200,
    negativeCompleteKey,
    cashier,
  );
  equal(cashierNegative.status, 'COMPLETED');
  await ok(`/members/${cashierMemberID}`, 'PATCH', {
    role: 'CASHIER',
    status: 'ACTIVE',
    branch_ids: [branch],
  });
  await action(
    { ...cashierNegative, revision: negativeCompleteRevision },
    'complete',
    {},
    403,
    negativeCompleteKey,
    cashier,
  );
  console.log(
    `PASS: Phase 5.2 shelf/shift boundaries ${assertions} assertions`,
  );
} finally {
  fixture.close();
}
