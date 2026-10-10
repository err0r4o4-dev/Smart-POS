import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { customersFixture } from './customers-fixtures.mjs';
import { authSQL } from './auth-fixtures.mjs';
import {
  inventoryAccount,
  inventoryMembership,
  inventoryCall,
} from './inventory-fixtures.mjs';

if (
  !/^smartpos_phase53_phase54_phase55_[a-z0-9_]+$/.test(
    process.env.AUTH_TEST_DATABASE ?? '',
  )
)
  throw new Error('Loyalty safety requires explicit Phase55 scratch DB');
const fixture = await customersFixture();
const { owner, org, branch, terminal, variant, call } = fixture;
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
async function cart(customer, quantity = '1') {
  let value = await ok('/pos/carts', 'POST', { terminal_id: terminal.id }, 201);
  value = await ok(`/pos/carts/${value.id}`, 'PATCH', {
    revision: value.revision,
    items: [{ variant_id: variant.id, quantity }],
  });
  return ok(`/pos/carts/${value.id}/customer`, 'PATCH', {
    revision: value.revision,
    customer_id: customer.id,
  });
}
async function prepare(value, points = 0) {
  const quote = await ok(
    `/pos/carts/${value.id}/quote?loyalty_points=${points}`,
  );
  const body = {
    cart_id: value.id,
    revision: value.revision,
    method: quote.total === '0.00' ? 'NONE' : 'CASH',
    expected_total: quote.total,
    received: quote.total,
    pricing_revision: quote.revision,
    loyalty_points: points,
  };
  return { checkout: await ok('/pos/checkout', 'POST', body, 201), body };
}
async function complete(checkout) {
  if (checkout.method !== 'NONE')
    await ok(`/pos/payments/${checkout.id}/confirm`, 'POST', {
      acknowledged: true,
      reference: '',
    });
  const completed = await ok(
    `/pos/checkouts/${checkout.id}/complete`,
    'POST',
    {},
  );
  equal(completed.status, 'COMPLETED');
  return ok(`/returns/sales/${completed.sale_id}`);
}
async function account(customer) {
  return (await ok(`/loyalty/accounts?customer_id=${customer.id}`)).items[0];
}
async function enroll(code, program) {
  const customer = await ok('/customers', 'POST', {
    code,
    name: 'Synthetic loyalty safety',
  });
  await ok('/loyalty/accounts', 'POST', {
    customer_id: customer.id,
    program_id: program.id,
    status: 'ACTIVE',
  });
  return customer;
}
async function adjust(customer, points, key, user = owner) {
  const enrolled = await account(customer);
  return ok(
    `/loyalty/accounts/${enrolled.id}/adjust`,
    'POST',
    {
      points,
      reason: 'Synthetic authorized safety adjustment',
      branch_id: branch,
    },
    200,
    key,
    user,
  );
}
async function returned(sale) {
  let document = await ok(
    '/returns',
    'POST',
    {
      original_sale_id: sale.id,
      reason: 'Synthetic safety return',
      items: sale.items.map((item) => ({
        original_sale_item_id: item.id,
        quantity: item.quantity,
        disposition: 'NO_STOCK_RETURN',
        destination_location_id: null,
      })),
    },
    201,
  );
  for (const action of ['submit', 'approve', 'complete'])
    document = await ok(`/returns/${document.id}/${action}`, 'POST', {
      revision: document.revision,
    });
  return document;
}
function rejectedSQL(statement) {
  equal(
    authSQL(
      `BEGIN; SET LOCAL ROLE smartpos_runtime; SELECT set_config('app.organization_id','${org}',true); DO $$ BEGIN BEGIN ${statement}; RAISE EXCEPTION 'unexpected accepted mutation'; EXCEPTION WHEN check_violation OR foreign_key_violation OR insufficient_privilege THEN NULL; END; END $$; ROLLBACK; SELECT 'rejected';`,
    )
      .split('\n')
      .at(-1),
    'rejected',
    'runtime mutation rejected',
  );
}
try {
  const rules = {
    name: 'Loyalty safety',
    spend: '1.00',
    earn_points: 1,
    point_value: '0.01',
    status: 'ACTIVE',
  };
  let program = await ok('/loyalty/programs', 'POST', rules);
  const customer = await enroll('SAFETY-DEBT', program);
  const original = await complete(
    (await prepare(await cart(customer, '3'))).checkout,
  );
  equal((await account(customer)).balance, '6', 'earn committed net total');
  await complete((await prepare(await cart(customer), 6)).checkout);
  equal(
    (await account(customer)).balance,
    '1',
    'spent earnings with later net earning',
  );
  const reversal = await returned(original);
  equal(
    (await account(customer)).balance,
    '-5',
    'spent earned points become explicit debt',
  );
  equal(
    (await account(customer)).available,
    '0',
    'negative ledger balance is not spendable',
  );
  const debtCart = await cart(customer);
  await ok(
    `/pos/carts/${debtCart.id}/quote?loyalty_points=1`,
    'GET',
    undefined,
    409,
  );
  const reversalCount = authSQL(
    `SELECT count(*) FROM loyalty_ledger WHERE return_id='${reversal.id}'`,
  );
  await ok(
    `/returns/${reversal.id}/complete`,
    'POST',
    {
      revision: reversal.revision,
    },
    409,
  );
  equal(
    authSQL(
      `SELECT count(*) FROM loyalty_ledger WHERE return_id='${reversal.id}'`,
    ),
    reversalCount,
    'duplicate return does not double reverse',
  );
  await complete((await prepare(await cart(customer, '3'))).checkout);
  equal((await account(customer)).balance, '1', 'future earnings offset debt');
  const zero = await enroll('SAFETY-ZERO', program);
  await adjust(zero, 200);
  const freeSale = await complete(
    (await prepare(await cart(zero), 200)).checkout,
  );
  equal(freeSale.grand_total, '0.00', 'exact full reward discount');
  equal(
    authSQL(
      `SELECT method||':'||amount FROM sale_payments WHERE sale_id='${freeSale.id}'`,
    ),
    'NONE:0.00',
    'no fake payment for rewards',
  );
  equal((await account(zero)).balance, '0', 'zero-total sale earns zero');
  program = await ok(`/loyalty/programs/${program.id}`, 'PUT', {
    ...rules,
    earn_points: 2,
    point_value: '0.02',
    revision: program.revision,
  });
  await returned(freeSale);
  equal(
    (await account(zero)).balance,
    '200',
    'zero-total return restores redeemed points',
  );
  program = await ok(`/loyalty/programs/${program.id}`, 'PUT', {
    ...rules,
    revision: program.revision,
  });
  const zeroAccount = await account(zero);
  const held = await prepare(await cart(zero), 10);
  await ok(
    `/loyalty/accounts/${zeroAccount.id}/adjust`,
    'POST',
    { points: -195, reason: 'Cannot spend reserved points', branch_id: branch },
    409,
  );
  const suspended = await ok(`/loyalty/accounts/${zeroAccount.id}`, 'PUT', {
    customer_id: zero.id,
    program_id: program.id,
    status: 'SUSPENDED',
    revision: zeroAccount.revision,
  });
  await ok(
    `/pos/payments/${held.checkout.id}/confirm`,
    'POST',
    {
      acknowledged: true,
      reference: '',
    },
    409,
  );
  await ok(`/pos/checkouts/${held.checkout.id}/complete`, 'POST', {}, 409);
  equal(
    (await account(zero)).balance,
    '200',
    'failed completion neither earns nor consumes',
  );
  equal(
    authSQL(
      `SELECT count(*) FROM sales WHERE checkout_id='${held.checkout.id}'`,
    ),
    '0',
    'failed sale rolls back',
  );
  await ok(`/loyalty/accounts/${zeroAccount.id}`, 'PUT', {
    customer_id: zero.id,
    program_id: program.id,
    status: 'ACTIVE',
    revision: suspended.revision,
  });
  await complete(held.checkout);
  const manager = await inventoryAccount(fixture.clients);
  inventoryMembership(org, manager, 'MANAGER', [branch]);
  const key = randomUUID();
  const replayBody = {
    points: 1,
    reason: 'Replay demotion guard',
    branch_id: branch,
  };
  await ok(
    `/loyalty/accounts/${zeroAccount.id}/adjust`,
    'POST',
    replayBody,
    200,
    key,
    manager,
  );
  authSQL(
    `UPDATE organization_memberships SET role='CASHIER' WHERE organization_id='${org}' AND user_id='${manager.id}'`,
  );
  await ok(
    `/loyalty/accounts/${zeroAccount.id}/adjust`,
    'POST',
    replayBody,
    403,
    key,
    manager,
  );
  await ok(
    `/loyalty/history?branch_id=${fixture.secondBranch}`,
    'GET',
    undefined,
    403,
    undefined,
    manager,
  );
  await ok(
    '/loyalty/programs',
    'POST',
    { ...rules, name: 'Unauthorized' },
    403,
    undefined,
    manager,
  );
  const scoped = await ok(
    '/loyalty/history',
    'GET',
    undefined,
    200,
    undefined,
    manager,
  );
  equal(
    scoped.items.every((item) => item.branch_id === branch),
    true,
    'cashier history only allowed branches',
  );
  const cashierTerminal = await ok(
    '/pos/terminals',
    'POST',
    {
      branch_id: branch,
      code: 'LOY-CASHIER',
      name: 'Synthetic cashier terminal',
      stock_location_id: fixture.shelf.id,
      status: 'ACTIVE',
    },
    201,
  );
  await ok(
    '/pos/shifts/open',
    'POST',
    {
      terminal_id: cashierTerminal.id,
      opening_cash: '0.00',
    },
    201,
    undefined,
    manager,
  );
  let cashierCart = await ok(
    '/pos/carts',
    'POST',
    { terminal_id: cashierTerminal.id },
    201,
    undefined,
    manager,
  );
  cashierCart = await ok(
    `/pos/carts/${cashierCart.id}`,
    'PATCH',
    {
      revision: cashierCart.revision,
      items: [{ variant_id: variant.id, quantity: '1' }],
    },
    200,
    undefined,
    manager,
  );
  cashierCart = await ok(
    `/pos/carts/${cashierCart.id}/customer`,
    'PATCH',
    {
      revision: cashierCart.revision,
      customer_id: zero.id,
    },
    200,
    undefined,
    manager,
  );
  const cashierQuote = await ok(
    `/pos/carts/${cashierCart.id}/quote?loyalty_points=1`,
    'GET',
    undefined,
    200,
    undefined,
    manager,
  );
  const cashierKey = randomUUID();
  const cashierInput = {
    cart_id: cashierCart.id,
    revision: cashierCart.revision,
    method: 'CASH',
    expected_total: cashierQuote.total,
    received: cashierQuote.total,
    pricing_revision: cashierQuote.revision,
    loyalty_points: 1,
  };
  const cashierCheckout = await ok(
    '/pos/checkout',
    'POST',
    cashierInput,
    201,
    cashierKey,
    manager,
  );
  authSQL(
    `UPDATE organization_memberships SET role='INVENTORY_STAFF' WHERE organization_id='${org}' AND user_id='${manager.id}'`,
  );
  await ok('/pos/checkout', 'POST', cashierInput, 403, cashierKey, manager);
  authSQL(
    `UPDATE organization_memberships SET role='CASHIER' WHERE organization_id='${org}' AND user_id='${manager.id}'`,
  );
  await ok(
    `/pos/checkouts/${cashierCheckout.id}/cancel`,
    'POST',
    {},
    200,
    undefined,
    manager,
  );
  const beforeRace = BigInt((await account(zero)).balance);
  const raceKey = randomUUID();
  const race = await Promise.all(
    [1, 2].map(() =>
      call(
        `/loyalty/accounts/${zeroAccount.id}/adjust`,
        'POST',
        { points: 5, reason: 'Same-key concurrency', branch_id: branch },
        raceKey,
      ),
    ),
  );
  equal(
    race.map((result) => result.status),
    [200, 200],
    'concurrent same-key adjustment replay',
  );
  equal(
    (await account(zero)).balance,
    String(beforeRace + 5n),
    'same-key adjustment posted once',
  );
  const foreign = await inventoryCall(owner, '/organizations', 'POST', {
    name: 'Loyalty foreign tenant',
    code: 'LOY-' + randomUUID().slice(0, 8),
    business_type: 'RETAIL',
    contact_email: '',
    contact_phone: '',
    address: '',
    branch: {
      name: 'Foreign',
      code: 'MAIN',
      address: '',
      phone: '',
      email: '',
      status: 'ACTIVE',
    },
  });
  equal(foreign.status, 201);
  const foreignOrg = foreign.data.organization.id;
  const foreignProgram = await inventoryCall(
    owner,
    `/organizations/${foreignOrg}/loyalty/programs`,
    'POST',
    rules,
  );
  equal(foreignProgram.status, 200);
  const foreignCustomer = await inventoryCall(
    owner,
    `/organizations/${foreignOrg}/customers`,
    'POST',
    { code: 'FOREIGN' },
  );
  equal(foreignCustomer.status, 200);
  const foreignEnrollment = await inventoryCall(
    owner,
    `/organizations/${foreignOrg}/loyalty/accounts`,
    'POST',
    {
      customer_id: customer.id,
      program_id: foreignProgram.data.id,
      status: 'ACTIVE',
    },
  );
  equal(foreignEnrollment.status, 404, 'cross-tenant enrollment denied');
  rejectedSQL(
    `INSERT INTO loyalty_accounts(organization_id,customer_id,program_id,created_by) VALUES('${org}','${foreignCustomer.data.id}','${program.id}','${owner.id}')`,
  );
  rejectedSQL(
    `UPDATE loyalty_ledger SET points=999 WHERE account_id='${zeroAccount.id}'`,
  );
  rejectedSQL(
    `DELETE FROM loyalty_ledger WHERE account_id='${zeroAccount.id}'`,
  );
  rejectedSQL('TRUNCATE loyalty_ledger');
  equal(
    authSQL(
      `BEGIN; SET LOCAL ROLE smartpos_runtime; SELECT set_config('app.organization_id','${foreignOrg}',true); SELECT count(*) FROM loyalty_ledger WHERE account_id='${zeroAccount.id}'; ROLLBACK;`,
    )
      .split('\n')
      .at(-2),
    '0',
    'runtime cross-tenant ledger hidden',
  );
  const exchangedSale = await complete(
    (await prepare(await cart(zero, '3'), 10)).checkout,
  );
  let exchange = await ok(
    '/exchanges',
    'POST',
    fixture.input(
      exchangedSale,
      [[fixture.variant2, '3']],
      '3',
      null,
      'NO_STOCK_RETURN',
    ),
    201,
  );
  for (const action of ['submit', 'approve'])
    exchange = await ok(`/exchanges/${exchange.id}/${action}`, 'POST', {
      revision: exchange.revision,
    });
  equal(
    exchange.net_difference,
    '0.10',
    'exchange consideration includes reward discount',
  );
  exchange = await ok(`/exchanges/${exchange.id}/confirm-settlement`, 'POST', {
    revision: exchange.revision,
    method: 'CASH',
    acknowledged: true,
    shift_id: fixture.shift.id,
    reference: '',
    note: 'Synthetic loyalty exchange',
  });
  exchange = await ok(`/exchanges/${exchange.id}/complete`, 'POST', {
    revision: exchange.revision,
  });
  equal(
    exchange.status,
    'COMPLETED',
    'exchange uses existing financial engine',
  );
  equal(
    authSQL(
      `SELECT COALESCE(sum(points),0) FROM loyalty_ledger WHERE sale_id='${exchangedSale.id}'`,
    ),
    '0',
    'exchange reverses original earning/redemption',
  );
  const voidSale = await complete(
    (await prepare(await cart(zero, '3'), 10)).checkout,
  );
  let reversalDocument = await ok(
    '/sales/voids',
    'POST',
    fixture.input(voidSale, [], '3', null, 'NO_STOCK_RETURN'),
    201,
  );
  for (const action of ['submit', 'approve'])
    reversalDocument = await ok(
      `/sales/voids/${reversalDocument.id}/${action}`,
      'POST',
      { revision: reversalDocument.revision },
    );
  reversalDocument = await ok(
    `/sales/voids/${reversalDocument.id}/confirm-settlement`,
    'POST',
    {
      revision: reversalDocument.revision,
      method: 'CASH_REFUND',
      acknowledged: true,
      shift_id: fixture.shift.id,
      reference: '',
      note: 'Synthetic full loyalty reversal',
    },
  );
  reversalDocument = await ok(
    `/sales/voids/${reversalDocument.id}/complete`,
    'POST',
    { revision: reversalDocument.revision },
  );
  equal(
    reversalDocument.status,
    'COMPLETED',
    'sale reversal completes through existing engine',
  );
  equal(
    authSQL(
      `SELECT COALESCE(sum(points),0) FROM loyalty_ledger WHERE sale_id='${voidSale.id}'`,
    ),
    '0',
    'full sale reversal restores both point postings',
  );
  let promotion = await ok('/promotions', 'POST', {
    name: 'No stacking',
    branch_id: branch,
    priority: 0,
    starts_at: null,
    ends_at: null,
    rule: {
      type: 'PERCENTAGE',
      policy: 'EXCLUSIVE',
      amount: '0.00',
      minimum_spend: '0.00',
      basis_points: 1000,
      buy: 0,
      get: 0,
      variant_ids: [variant.id],
      category_ids: [],
      usage_limit: 0,
    },
  });
  for (const action of ['submit', 'approve', 'activate'])
    promotion = await ok(`/promotions/${promotion.id}/${action}`, 'POST', {
      revision: promotion.revision,
    });
  const promotionalCart = await cart(zero);
  await ok(
    `/pos/carts/${promotionalCart.id}/quote?loyalty_points=1`,
    'GET',
    undefined,
    409,
  );
  equal(
    authSQL(
      `SELECT count(*) FROM stock_balances balance WHERE organization_id='${org}' AND quantity<>(SELECT COALESCE(sum(quantity_delta),0) FROM stock_movements WHERE organization_id=balance.organization_id AND variant_id=balance.variant_id AND location_id=balance.location_id)`,
    ),
    '0',
    'inventory reconciliation',
  );
  equal(
    authSQL(
      `SELECT count(*) FROM sale_payments payment JOIN sales sale ON sale.organization_id=payment.organization_id AND sale.id=payment.sale_id WHERE sale.organization_id='${org}' AND sale.grand_total<>payment.amount+payment.credit_amount`,
    ),
    '0',
    'financial reconciliation',
  );
  console.log(
    JSON.stringify({ suite: 'loyalty-safety', assertions, status: 'PASSED' }),
  );
} finally {
  fixture.close();
}
