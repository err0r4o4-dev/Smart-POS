import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { authSQL } from './auth-fixtures.mjs';
import { inventoryAccount } from './inventory-fixtures.mjs';
import { adjustmentsFixture } from './adjustments-fixtures.mjs';

if (!/^smartpos_phase53_[a-z0-9_]+$/.test(process.env.AUTH_TEST_DATABASE ?? ''))
  throw new Error('Pricing acceptance requires isolated Phase53 scratch DB');
const fixture = await adjustmentsFixture();
const { call, owner, org, branch, variant, variant2, terminal, shift } =
  fixture;
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
  status = 200,
  user = owner,
  headers = {},
) {
  const response = await call(path, method, body, key, user, headers);
  equal(response.status, status, path + ': ' + JSON.stringify(response.error));
  return response.data;
}
async function create(path, body) {
  return ok(path, 'POST', body, undefined, 200);
}
async function activate(path, body) {
  let item = await create(path, body);
  for (const action of ['submit', 'approve', 'activate'])
    item = await ok(`${path}/${item.id}/${action}`, 'POST', {
      revision: item.revision,
    });
  return item;
}
async function pause(item, path = '/promotions') {
  return ok(`${path}/${item.id}/pause`, 'POST', { revision: item.revision });
}
async function cart(
  items = [[variant, '1']],
  user = owner,
  terminalID = terminal.id,
) {
  let value = await ok(
    '/pos/carts',
    'POST',
    { terminal_id: terminalID },
    undefined,
    201,
    user,
  );
  return ok(
    `/pos/carts/${value.id}`,
    'PATCH',
    {
      revision: value.revision,
      items: items.map(([item, quantity]) => ({
        variant_id: item.id,
        quantity,
      })),
    },
    undefined,
    200,
    user,
  );
}
async function prepare(value, extra = {}, key = randomUUID(), user = owner) {
  return ok(
    '/pos/checkout',
    'POST',
    {
      cart_id: value.id,
      revision: value.revision,
      method: value.total === '0.00' ? 'NONE' : 'CASH',
      expected_total: value.total,
      received: value.total,
      pricing_revision: value.pricing.revision,
      ...extra,
    },
    key,
    201,
    user,
  );
}
async function confirm(checkout, user = owner) {
  if (checkout.method === 'NONE') return checkout;
  return ok(
    `/pos/payments/${checkout.id}/confirm`,
    'POST',
    { acknowledged: true, reference: '' },
    randomUUID(),
    200,
    user,
  );
}
async function complete(checkout, user = owner) {
  return ok(
    `/pos/checkouts/${checkout.id}/complete`,
    'POST',
    {},
    randomUUID(),
    200,
    user,
  );
}
async function sale(value) {
  const checkout = await prepare(value);
  await confirm(checkout);
  const result = await complete(checkout);
  equal(result.status, 'COMPLETED');
  return ok(`/sales/${result.sale_id}`);
}
const priceBody = (name, price, branchID = '', priority = 0, extra = {}) => ({
  name,
  branch_id: branchID,
  priority,
  starts_at: null,
  ends_at: null,
  items: [
    { variant_id: variant.id, unit_price: price },
    { variant_id: variant2.id, unit_price: '50.00' },
  ],
  ...extra,
});
const rule = (type, extra = {}) => ({
  type,
  policy: 'EXCLUSIVE',
  amount: type === 'FIXED' || type === 'MINIMUM_SPEND' ? '10.00' : '0.00',
  minimum_spend: '0.00',
  basis_points: type === 'PERCENTAGE' ? 2500 : 0,
  buy: type === 'BOGO' ? 1 : 0,
  get: type === 'BOGO' ? 1 : 0,
  variant_ids: [variant.id],
  category_ids: [],
  usage_limit: 0,
  ...extra,
});
const promoBody = (name, value, extra = {}) => ({
  name,
  branch_id: branch,
  priority: 0,
  starts_at: null,
  ends_at: null,
  rule: value,
  ...extra,
});
async function adjustment(quantity, type = 'DECREASE') {
  let doc = await ok(
    '/inventory/adjustments',
    'POST',
    {
      location_id: fixture.shelf.id,
      adjustment_type: type,
      reason_code: 'PRICING_ACCEPTANCE',
      notes: 'Isolated pricing rollback test',
      items: [{ variant_id: variant.id, quantity }],
    },
    undefined,
    201,
  );
  for (const action of ['submit', 'approve', 'post'])
    doc = await ok(`/inventory/adjustments/${doc.id}/${action}`, 'POST', {
      revision: doc.revision,
    });
  return doc;
}
try {
  equal((await cart()).total, '2.00', 'catalog fallback');
  const organizationList = await activate(
    '/pricing/lists',
    priceBody('Organization price', '100.00'),
  );
  equal((await cart()).total, '100.00', 'organization effective price');
  let branchList = await activate(
    '/pricing/lists',
    priceBody('Branch price', '80.00', branch, -999),
  );
  equal(
    (await cart()).total,
    '80.00',
    'branch precedes higher-priority organization',
  );
  let high = await activate(
    '/pricing/lists',
    priceBody('Branch higher', '70.00', branch, 1),
  );
  equal((await cart()).total, '70.00', 'descending priority');
  const expired = await activate(
    '/pricing/lists',
    priceBody('Expired', '1.00', branch, 100, {
      starts_at: '2020-01-01T00:00:00Z',
      ends_at: '2021-01-01T00:00:00Z',
    }),
  );
  equal((await cart()).total, '70.00', 'expired price excluded');
  const future = await activate(
    '/pricing/lists',
    priceBody('Future', '1.00', branch, 200, {
      starts_at: '2099-01-01T00:00:00Z',
    }),
  );
  equal((await cart()).total, '70.00', 'future price excluded');
  await ok(
    `/pricing/lists/${high.id}/pause`,
    'POST',
    { revision: 1 },
    undefined,
    409,
  );
  await pause(high, '/pricing/lists');
  branchList = await pause(branchList, '/pricing/lists');
  equal((await cart()).total, '100.00', 'paused lists excluded');
  let draft = await create(
    '/pricing/lists',
    priceBody('Editable', '90.00', branch),
  );
  draft = await ok(`/pricing/lists/${draft.id}`, 'PUT', {
    ...priceBody('Edited', '91.00', branch),
    revision: draft.revision,
  });
  equal(draft.revision, 2, 'draft edit revision');
  await ok(
    `/pricing/lists/${draft.id}`,
    'PUT',
    { ...priceBody('Stale', '99.00', branch), revision: 1 },
    undefined,
    409,
  );
  await ok(
    '/promotions',
    'POST',
    promoBody('Invalid expression', {
      ...rule('PERCENTAGE'),
      expression: 'eval()',
    }),
    undefined,
    400,
  );
  for (const [type, quantity, total] of [
    ['PERCENTAGE', '2', '200.00'],
    ['FIXED', '2', '240.00'],
    ['BOGO', '3', '250.00'],
    ['MINIMUM_SPEND', '2', '240.00'],
  ]) {
    const promotion = await activate(
      '/promotions',
      promoBody(
        type,
        rule(type, type === 'MINIMUM_SPEND' ? { minimum_spend: '200.00' } : {}),
      ),
    );
    const value = await cart([
      [variant, quantity],
      [variant2, '1'],
    ]);
    equal(value.total, total, type + ' eligibility');
    equal(value.pricing.promotions.length, 1, type + ' selected');
    await pause(promotion);
  }
  const stackA = await activate(
    '/promotions',
    promoBody(
      'Stack percentage',
      rule('PERCENTAGE', { policy: 'STACKABLE', basis_points: 1000 }),
      { priority: 10 },
    ),
  );
  const stackB = await activate(
    '/promotions',
    promoBody('Stack fixed', rule('FIXED', { policy: 'STACKABLE' })),
  );
  const best = await activate(
    '/promotions',
    promoBody(
      'Best alternative',
      rule('FIXED', { policy: 'BEST_DISCOUNT_ONLY', amount: '15.00' }),
    ),
  );
  equal((await cart()).total, '80.00', 'stack bundle beats single');
  await pause(stackA);
  await pause(stackB);
  equal((await cart()).total, '85.00', 'best-only alternative');
  await pause(best);
  const bogo = await activate(
    '/promotions',
    promoBody('BOGO committed', rule('BOGO')),
  );
  const bogoSale = await sale(await cart([[variant, '2']]));
  equal(bogoSale.subtotal, '200.00');
  equal(bogoSale.discount_total, '100.00');
  equal(bogoSale.grand_total, '100.00');
  equal(
    bogoSale.movements[0].quantity_delta,
    '-2.000',
    'free unit stock deducted',
  );
  equal(authSQL(`SELECT used FROM promotions WHERE id='${bogo.id}'`), '1');
  await pause(bogo);
  const free = await activate(
    '/promotions',
    promoBody('Free checkout', rule('PERCENTAGE', { basis_points: 10000 })),
  );
  const zeroCart = await cart();
  equal(zeroCart.total, '0.00');
  const zeroPrepared = await prepare(zeroCart);
  equal(zeroPrepared.status, 'CONFIRMED', 'no fake payment acknowledgement');
  const zeroCompleted = await complete(zeroPrepared);
  equal(zeroCompleted.status, 'COMPLETED');
  const zeroSale = await ok(`/sales/${zeroCompleted.sale_id}`);
  equal(zeroSale.payment.method, 'NONE');
  equal(zeroSale.payment.amount, '0.00');
  equal(zeroSale.movements[0].quantity_delta, '-1.000');
  await pause(free);
  const partial = await activate(
    '/promotions',
    promoBody('Historical 25 percent', rule('PERCENTAGE')),
  );
  const historical = await sale(await cart([[variant, '3']]));
  equal(historical.grand_total, '225.00');
  await pause(partial);
  let returned = await ok(
    '/returns',
    'POST',
    {
      original_sale_id: historical.id,
      reason: 'Historical discounted partial return',
      items: [
        {
          original_sale_item_id: historical.items[0].id,
          quantity: '1',
          disposition: 'RESTOCK_SELLABLE',
          destination_location_id: fixture.warehouse.id,
        },
      ],
    },
    undefined,
    201,
  );
  equal(returned.amount, '75.00', 'historical net allocation');
  for (const action of ['submit', 'approve', 'complete'])
    returned = await ok(`/returns/${returned.id}/${action}`, 'POST', {
      revision: returned.revision,
    });
  const exchangeInput = {
    original_sale_id: historical.id,
    reason: 'Discounted exchange credit',
    terminal_id: terminal.id,
    items: [
      {
        original_sale_item_id: historical.items[0].id,
        quantity: '1',
        disposition: 'RESTOCK_SELLABLE',
        destination_location_id: fixture.warehouse.id,
      },
    ],
    replacements: [{ variant_id: variant2.id, quantity: '2' }],
  };
  const exchange = await ok('/exchanges/quote', 'POST', exchangeInput);
  equal(exchange.return_credit, '75.00');
  equal(exchange.replacement_total, '100.00');
  equal(exchange.net_difference, '25.00');
  const replacementPromotion = await activate(
    '/promotions',
    promoBody(
      'Current replacement discount',
      rule('FIXED', { variant_ids: [variant2.id] }),
    ),
  );
  const originalSnapshot = authSQL(
    `SELECT to_jsonb(sale)::text FROM sales sale WHERE id='${historical.id}'`,
  );
  let exchanged = await ok('/exchanges', 'POST', exchangeInput, undefined, 201);
  equal(exchanged.return_credit, '75.00');
  equal(exchanged.replacement_total, '90.00');
  equal(exchanged.net_difference, '15.00');
  for (const action of ['submit', 'approve'])
    exchanged = await ok(`/exchanges/${exchanged.id}/${action}`, 'POST', {
      revision: exchanged.revision,
    });
  exchanged = await ok(
    `/exchanges/${exchanged.id}/confirm-settlement`,
    'POST',
    {
      revision: exchanged.revision,
      method: 'CASH',
      shift_id: shift.id,
      reference: '',
      note: 'Discounted replacement net difference only',
      acknowledged: true,
    },
  );
  const beforeExchange = await ok(`/pos/shifts/${shift.id}`);
  const exchangeCompletion = { revision: exchanged.revision };
  const exchangeKey = randomUUID();
  exchanged = await ok(
    `/exchanges/${exchanged.id}/complete`,
    'POST',
    exchangeCompletion,
    exchangeKey,
  );
  equal(exchanged.status, 'COMPLETED');
  equal(exchanged.return_document.status, 'COMPLETED');
  equal(
    (
      await ok(
        `/exchanges/${exchanged.id}/complete`,
        'POST',
        exchangeCompletion,
        exchangeKey,
      )
    ).replacement_sale_id,
    exchanged.replacement_sale_id,
    'discounted exchange retry',
  );
  const replacementSale = await ok(`/sales/${exchanged.replacement_sale_id}`);
  equal(replacementSale.subtotal, '100.00');
  equal(replacementSale.discount_total, '10.00');
  equal(replacementSale.grand_total, '90.00');
  equal(replacementSale.payment.credit_amount, '75.00');
  equal(replacementSale.payment.amount, '15.00');
  equal(replacementSale.payment.received, '15.00');
  const afterExchange = await ok(`/pos/shifts/${shift.id}`);
  equal(
    BigInt(afterExchange.cash_sales.replace('.', '')) -
      BigInt(beforeExchange.cash_sales.replace('.', '')),
    1500n,
    'only net difference added to cash',
  );
  equal(
    authSQL(
      `SELECT to_jsonb(sale)::text FROM sales sale WHERE id='${historical.id}'`,
    ),
    originalSnapshot,
    'historical discounted Sale unchanged',
  );
  equal(
    authSQL(
      `SELECT count(*) FROM promotion_redemptions WHERE sale_id='${replacementSale.id}' AND promotion_id='${replacementPromotion.id}'`,
    ),
    '1',
    'replacement consumes promotion once',
  );
  equal(
    authSQL(
      `SELECT sum(quantity_delta)::text FROM stock_movements WHERE sale_id='${replacementSale.id}' AND movement_type='SALE'`,
    ),
    '-2.000',
    'every replacement item deducted once',
  );
  await pause(replacementPromotion);
  let held = await cart();
  held = await ok(`/pos/carts/${held.id}/hold`, 'POST', {
    revision: held.revision,
  });
  const heldPromo = await activate(
    '/promotions',
    promoBody('Held changed', rule('FIXED')),
  );
  held = await ok(`/pos/carts/${held.id}/resume`, 'POST', {
    revision: held.revision,
  });
  equal(held.review_required, true, 'held pricing change');
  await ok(
    '/pos/checkout',
    'POST',
    {
      cart_id: held.id,
      revision: held.revision,
      method: 'CASH',
      expected_total: held.total,
      received: held.total,
    },
    undefined,
    409,
  );
  await pause(heldPromo);
  const racePromo = await activate(
    '/promotions',
    promoBody('Final redemption', rule('FIXED', { usage_limit: 1 })),
  );
  const first = await prepare(await cart()),
    second = await prepare(await cart());
  await confirm(first);
  await confirm(second);
  const race = await Promise.all([complete(first), complete(second)]);
  equal(
    race.filter((item) => item.status === 'COMPLETED').length,
    1,
    'single last redemption',
  );
  equal(
    race.filter((item) => item.status === 'RECONCILIATION_REQUIRED').length,
    1,
    'loser keeps funds evidence',
  );
  equal(authSQL(`SELECT used FROM promotions WHERE id='${racePromo.id}'`), '1');
  equal(
    authSQL(
      `SELECT count(*) FROM promotion_redemptions WHERE promotion_id='${racePromo.id}'`,
    ),
    '1',
  );
  const winner = race.find((item) => item.status === 'COMPLETED');
  equal((await complete(winner)).sale_id, winner.sale_id, 'duplicate checkout');
  equal(
    authSQL(
      `SELECT count(*) FROM promotion_redemptions WHERE promotion_id='${racePromo.id}'`,
    ),
    '1',
  );
  await pause(racePromo);
  const rollbackPromo = await activate(
    '/promotions',
    promoBody('Stock rollback', rule('FIXED')),
  );
  const beforeFailure = await cart();
  const failure = await prepare(beforeFailure);
  await confirm(failure);
  const available = authSQL(
    `SELECT quantity FROM stock_balances WHERE organization_id='${org}' AND location_id='${fixture.shelf.id}' AND variant_id='${variant.id}'`,
  );
  await adjustment(available);
  equal((await complete(failure)).status, 'RECONCILIATION_REQUIRED');
  equal(
    authSQL(`SELECT used FROM promotions WHERE id='${rollbackPromo.id}'`),
    '0',
    'failed checkout no redemption',
  );
  await adjustment(available, 'INCREASE');
  equal(
    (await complete(failure)).status,
    'COMPLETED',
    'reconciliation retry same funds',
  );
  equal(
    authSQL(`SELECT used FROM promotions WHERE id='${rollbackPromo.id}'`),
    '1',
  );
  await pause(rollbackPromo);
  const manager = await inventoryAccount(fixture.clients),
    cashier = await inventoryAccount(fixture.clients),
    outsider = await inventoryAccount(fixture.clients);
  for (const [account, role] of [
    [manager, 'MANAGER'],
    [cashier, 'CASHIER'],
  ])
    authSQL(
      `WITH member AS (INSERT INTO organization_memberships(organization_id,user_id,role,status) VALUES('${org}','${account.id}','${role}','ACTIVE') RETURNING id) INSERT INTO branch_memberships(organization_id,membership_id,branch_id) SELECT '${org}',id,'${branch}' FROM member`,
    );
  const cashierTerminal = await ok(
    '/pos/terminals',
    'POST',
    {
      branch_id: branch,
      code: 'CASHIER-PRICING',
      name: 'Cashier pricing',
      stock_location_id: fixture.shelf.id,
      status: 'ACTIVE',
    },
    undefined,
    201,
  );
  await ok(
    '/pos/shifts/open',
    'POST',
    { terminal_id: cashierTerminal.id, opening_cash: '0.00' },
    undefined,
    201,
    cashier,
  );
  const cashierCart = await cart([[variant, '1']], cashier, cashierTerminal.id);
  const requestBody = {
    cart_id: cashierCart.id,
    revision: cashierCart.revision,
    pricing_revision: cashierCart.pricing.revision,
    amount: '10.00',
    reason: 'Cashier manual request',
  };
  const requestKey = randomUUID();
  let approval = await ok(
    '/discount-approvals',
    'POST',
    requestBody,
    requestKey,
    200,
    cashier,
  );
  await ok(
    `/discount-approvals/${approval.id}/approve`,
    'POST',
    { revision: approval.revision },
    undefined,
    403,
    cashier,
  );
  approval = await ok(
    `/discount-approvals/${approval.id}/approve`,
    'POST',
    { revision: approval.revision },
    undefined,
    200,
    manager,
  );
  const approvedQuote = await ok(
    `/pos/carts/${cashierCart.id}/quote?approval_id=${approval.id}`,
    'GET',
    undefined,
    undefined,
    200,
    cashier,
  );
  equal(approvedQuote.total, '90.00');
  authSQL(
    `UPDATE organization_memberships SET role='CASHIER' WHERE organization_id='${org}' AND user_id='${manager.id}'`,
  );
  await ok(
    '/discount-approvals',
    'POST',
    requestBody,
    requestKey,
    403,
    cashier,
  );
  await ok(
    `/pos/carts/${cashierCart.id}/quote?approval_id=${approval.id}`,
    'GET',
    undefined,
    undefined,
    403,
    cashier,
  );
  authSQL(
    `UPDATE organization_memberships SET role='MANAGER' WHERE organization_id='${org}' AND user_id='${manager.id}'`,
  );
  const staleCart = await ok(
    `/pos/carts/${cashierCart.id}`,
    'PATCH',
    {
      revision: cashierCart.revision,
      items: [{ variant_id: variant.id, quantity: '2' }],
    },
    undefined,
    200,
    cashier,
  );
  await ok(
    `/pos/carts/${staleCart.id}/quote?approval_id=${approval.id}`,
    'GET',
    undefined,
    undefined,
    409,
    cashier,
  );
  await ok(
    `/pos/carts/${staleCart.id}/quote?approval_id=${randomUUID()}`,
    'GET',
    undefined,
    undefined,
    403,
    cashier,
  );
  await ok(
    '/promotions',
    'POST',
    promoBody('Cashier denied', rule('FIXED')),
    undefined,
    403,
    cashier,
  );
  await ok('/pricing/lists', 'GET', undefined, undefined, 404, outsider);
  await ok(
    '/pricing/lists',
    'POST',
    priceBody('Manager global denied', '1'),
    undefined,
    403,
    manager,
  );
  await ok(
    '/pricing/lists',
    'POST',
    priceBody('Wrong branch', '1', fixture.secondBranch),
    undefined,
    403,
    manager,
  );
  await ok(
    '/promotions',
    'POST',
    promoBody('No CSRF', rule('FIXED')),
    undefined,
    403,
    owner,
    { 'X-CSRF-Token': '' },
  );
  await ok(
    '/promotions',
    'POST',
    promoBody('Bad origin', rule('FIXED')),
    undefined,
    403,
    owner,
    { Origin: 'https://attacker.invalid' },
  );
  const changedCart = await cart();
  const changing = await prepare(changedCart);
  const changePromo = await activate(
    '/promotions',
    promoBody('After prepare', rule('FIXED')),
  );
  equal(
    (await confirm(changing)).status,
    'RECONCILIATION_REQUIRED',
    'funds acknowledgement retained with changed quote',
  );
  equal(
    (await complete(changing)).status,
    'RECONCILIATION_REQUIRED',
    'no silently repriced sale',
  );
  await pause(changePromo);
  equal(
    authSQL(
      `SELECT count(*) FROM sales sale WHERE organization_id='${org}' AND (discount_total<>(SELECT sum(discount_total) FROM sale_items WHERE sale_id=sale.id) OR grand_total<>(SELECT sum(line_total) FROM sale_items WHERE sale_id=sale.id))`,
    ),
    '0',
    'all net allocations reconcile',
  );
  console.log(
    `PASS: Phase 5.3 pricing integration (${assertions} assertions): precedence/windows/revisions, four types, policies, BOGO stock, zero-payable, historical refunds/completed discounted exchanges, held carts, concurrent final redemption, rollback/retry, stale/forged/revoked approvals, RBAC/tenant/branch/CSRF/Origin, reconciliation`,
  );
} finally {
  fixture.close();
}
