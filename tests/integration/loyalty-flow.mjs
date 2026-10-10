import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { customersFixture } from './customers-fixtures.mjs';
import { authSQL } from './auth-fixtures.mjs';
if (
  !/^smartpos_phase53_phase54_phase55_[a-z0-9_]+$/.test(
    process.env.AUTH_TEST_DATABASE ?? '',
  )
)
  throw new Error('Loyalty tests require dedicated Phase55 scratch DB');
const fixture = await customersFixture();
const { owner, branch, org, terminal, variant, call } = fixture;
let assertions = 0;
function equal(actual, expected, label) {
  assert.deepEqual(actual, expected, label);
  assertions++;
}
async function ok(path, method = 'GET', body, key, status = 200) {
  const response = await call(path, method, body, key, owner);
  equal(response.status, status, path + ': ' + JSON.stringify(response.error));
  return response.data;
}
async function cart(customer) {
  let value = await ok(
    '/pos/carts',
    'POST',
    { terminal_id: terminal.id },
    undefined,
    201,
  );
  value = await ok(`/pos/carts/${value.id}`, 'PATCH', {
    revision: value.revision,
    items: [{ variant_id: variant.id, quantity: '3' }],
  });
  if (customer)
    value = await ok(`/pos/carts/${value.id}/customer`, 'PATCH', {
      revision: value.revision,
      customer_id: customer.id,
    });
  return value;
}
async function prepare(value, points = 0, key) {
  const quote = await ok(
    `/pos/carts/${value.id}/quote?loyalty_points=${points}`,
  );
  return ok(
    '/pos/checkout',
    'POST',
    {
      cart_id: value.id,
      revision: value.revision,
      method: quote.total === '0.00' ? 'NONE' : 'CASH',
      expected_total: quote.total,
      received: quote.total,
      pricing_revision: quote.revision,
      loyalty_points: points,
    },
    key,
    201,
  );
}
async function complete(value) {
  if (value.status === 'AWAITING_PAYMENT')
    await ok(`/pos/payments/${value.id}/confirm`, 'POST', {
      acknowledged: true,
      reference: '',
    });
  const result = await ok(`/pos/checkouts/${value.id}/complete`, 'POST', {});
  equal(result.status, 'COMPLETED', 'sale posted');
  return ok(`/returns/sales/${result.sale_id}`);
}
async function account(customer) {
  return (await ok(`/loyalty/accounts?customer_id=${customer.id}`)).items[0];
}
async function returned(sale, quantity = '1') {
  let value = await ok(
    '/returns',
    'POST',
    {
      original_sale_id: sale.id,
      reason: 'Inspected synthetic loyalty return',
      items: sale.items.map((item) => ({
        original_sale_item_id: item.id,
        quantity,
        disposition: 'NO_STOCK_RETURN',
        destination_location_id: null,
      })),
    },
    undefined,
    201,
  );
  for (const action of ['submit', 'approve', 'complete'])
    value = await ok(`/returns/${value.id}/${action}`, 'POST', {
      revision: value.revision,
    });
  return value;
}
try {
  const programInput = {
    name: 'Phase55 Member',
    spend: '1.00',
    earn_points: 1,
    point_value: '0.01',
    status: 'ACTIVE',
  };
  let program = await ok('/loyalty/programs', 'POST', programInput);
  const customer = await ok('/customers', 'POST', {
    code: 'LOYAL-1',
    name: 'Synthetic Member',
    phone: '',
    email: '',
    notes: '',
    marketing_consent: false,
  });
  const enrollmentKey = randomUUID();
  const enrolled = await ok(
    '/loyalty/accounts',
    'POST',
    { customer_id: customer.id, program_id: program.id, status: 'ACTIVE' },
    enrollmentKey,
  );
  equal(
    (
      await ok(
        '/loyalty/accounts',
        'POST',
        { customer_id: customer.id, program_id: program.id, status: 'ACTIVE' },
        enrollmentKey,
      )
    ).id,
    enrolled.id,
    'idempotent enrollment',
  );
  equal((await account(customer)).balance, '0', 'no enrollment points');
  const adjustment = {
    points: 40,
    reason: 'Authorized synthetic opening points',
    branch_id: branch,
  };
  const adjustmentKey = randomUUID();
  await ok(
    `/loyalty/accounts/${enrolled.id}/adjust`,
    'POST',
    adjustment,
    adjustmentKey,
  );
  await ok(
    `/loyalty/accounts/${enrolled.id}/adjust`,
    'POST',
    adjustment,
    adjustmentKey,
  );
  equal((await account(customer)).balance, '40', 'adjustment exactly once');
  await ok(
    `/loyalty/accounts/${enrolled.id}/adjust`,
    'POST',
    { ...adjustment, points: -41 },
    undefined,
    409,
  );
  const basket = await cart(customer);
  const checkoutKey = randomUUID();
  const checkout = await prepare(basket, 10, checkoutKey);
  equal(checkout.pricing.loyalty.points, 10, 'snapshot exact integer points');
  equal((await account(customer)).balance, '40', 'prepare does not spend');
  equal((await account(customer)).available, '30', 'prepare reserves points');
  equal(
    (await prepare(basket, 10, checkoutKey)).id,
    checkout.id,
    'prepare replay',
  );
  const sale = await complete(checkout);
  const earned = BigInt(sale.grand_total.split('.')[0]);
  equal(
    (await account(customer)).balance,
    String(30n + earned),
    'committed earning and redemption',
  );
  await ok(`/pos/checkouts/${checkout.id}/complete`, 'POST', {});
  equal(
    (await account(customer)).balance,
    String(30n + earned),
    'complete replay no extra points',
  );
  for (let count = 0; count < 3; count++) await returned(sale);
  equal(
    (await account(customer)).balance,
    '40',
    'full cumulative reversal restores starting points',
  );
  const history = await ok(`/loyalty/history?customer_id=${customer.id}`);
  equal(
    history.items.filter((item) => item.kind === 'EARN_REVERSAL').length,
    3,
    'three immutable earning reversals',
  );
  equal(
    history.items
      .filter((item) => item.kind === 'REDEEM_REVERSAL')
      .reduce((sum, item) => sum + BigInt(item.points), 0n),
    10n,
    'all redeemed points restored',
  );
  const walkin = await complete(await prepare(await cart()));
  equal(
    authSQL(`SELECT count(*) FROM loyalty_ledger WHERE sale_id='${walkin.id}'`),
    '0',
    'walk-in no loyalty account',
  );
  const canceled = await prepare(await cart(customer), 10);
  await ok(`/pos/checkouts/${canceled.id}/cancel`, 'POST', {});
  equal(
    (await account(customer)).available,
    '40',
    'cancel releases reservation',
  );
  const firstCart = await cart(customer),
    secondCart = await cart(customer);
  const quote1 = await ok(`/pos/carts/${firstCart.id}/quote?loyalty_points=30`),
    quote2 = await ok(`/pos/carts/${secondCart.id}/quote?loyalty_points=30`);
  const concurrent = await Promise.all(
    [firstCart, secondCart].map((value, index) =>
      call(
        '/pos/checkout',
        'POST',
        {
          cart_id: value.id,
          revision: value.revision,
          method: 'CASH',
          expected_total: [quote1, quote2][index].total,
          received: [quote1, quote2][index].total,
          pricing_revision: [quote1, quote2][index].revision,
          loyalty_points: 30,
        },
        randomUUID(),
      ),
    ),
  );
  equal(
    concurrent.map((result) => result.status).sort(),
    [201, 409],
    'concurrent double reservation blocked',
  );
  const winner = concurrent.find((result) => result.status === 201).data;
  await ok(`/pos/checkouts/${winner.id}/cancel`, 'POST', {});
  program = await ok(`/loyalty/programs/${program.id}`, 'PUT', {
    ...programInput,
    status: 'SUSPENDED',
    revision: program.revision,
  });
  await ok(
    `/pos/carts/${(await cart(customer)).id}/quote?loyalty_points=1`,
    'GET',
    undefined,
    undefined,
    404,
  );
  equal((await account(customer)).balance, '40', 'suspension preserves ledger');
  equal(
    authSQL(
      `SELECT count(*) FROM loyalty_ledger WHERE organization_id='${org}' AND kind='ADJUST'`,
    ),
    '1',
    'adjustments idempotent persisted',
  );
  console.log(
    JSON.stringify({ suite: 'loyalty-flow', assertions, status: 'PASSED' }),
  );
} finally {
  fixture.close();
}
