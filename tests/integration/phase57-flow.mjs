import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { purchasingFixture } from './purchasing-fixtures.mjs';
import { authSQL } from './auth-fixtures.mjs';

if (
  !/^smartpos_phase53_phase54_phase55_phase56_[a-z0-9_]+$/.test(
    process.env.AUTH_TEST_DATABASE ?? '',
  )
)
  throw new Error('Final lifecycle requires isolated schema13 acceptance DB');
const fixture = await purchasingFixture();
const {
  call,
  org,
  owner,
  branch,
  variant,
  variant2,
  warehouse,
  shelf,
  terminal,
} = fixture;
let assertions = 0;
function equal(actual, expected, label) {
  assert.deepEqual(actual, expected, label);
  assertions++;
}
async function ok(path, method = 'GET', body, status = 200, key) {
  const response = await call(path, method, body, key);
  equal(response.status, status, path + ': ' + JSON.stringify(response.error));
  return response.data;
}
async function transition(path, value, actions) {
  for (const action of actions)
    value = await ok(`${path}/${value.id}/${action}`, 'POST', {
      revision: value.revision,
      ...(path.startsWith('/purchasing/')
        ? { reason: 'Synthetic physical inspection' }
        : {}),
    });
  return value;
}
async function basket(customer, batch, quantity = '1') {
  let value = await ok('/pos/carts', 'POST', { terminal_id: terminal.id }, 201);
  value = await ok(`/pos/carts/${value.id}`, 'PATCH', {
    revision: value.revision,
    items: [
      {
        variant_id: variant.id,
        quantity,
        batch_id: batch?.id ?? null,
        batch_verified: !!batch,
      },
    ],
  });
  if (customer)
    value = await ok(`/pos/carts/${value.id}/customer`, 'PATCH', {
      revision: value.revision,
      customer_id: customer.id,
    });
  return value;
}
async function checkout(value, points = 0) {
  const quote = await ok(
    `/pos/carts/${value.id}/quote?loyalty_points=${points}`,
  );
  const prepared = await ok(
    '/pos/checkout',
    'POST',
    {
      cart_id: value.id,
      revision: value.revision,
      method: 'CASH',
      expected_total: quote.total,
      received: quote.total,
      pricing_revision: quote.revision,
      loyalty_points: points,
    },
    201,
  );
  await ok(`/pos/payments/${prepared.id}/confirm`, 'POST', {
    acknowledged: true,
    reference: '',
  });
  const key = randomUUID();
  const completed = await ok(
    `/pos/checkouts/${prepared.id}/complete`,
    'POST',
    {},
    200,
    key,
  );
  equal(
    (await ok(`/pos/checkouts/${prepared.id}/complete`, 'POST', {}, 200, key))
      .sale_id,
    completed.sale_id,
    'lost-response retry returns same sale',
  );
  return ok(`/returns/sales/${completed.sale_id}`);
}
async function returned(sale, lot) {
  const created = await ok(
    '/returns',
    'POST',
    {
      original_sale_id: sale.id,
      reason: 'Inspected original lot return',
      items: [
        {
          original_sale_item_id: sale.items[0].id,
          quantity: '1',
          disposition: 'RESTOCK_SELLABLE',
          destination_location_id: warehouse.id,
          batch_id: lot.id,
          batch_verified: true,
        },
      ],
    },
    201,
  );
  return transition('/returns', created, ['submit', 'approve', 'complete']);
}
async function settle(refund, shift) {
  equal(
    refund.status,
    'PENDING_SETTLEMENT',
    'inventory return is not financial settlement',
  );
  refund = await ok(`/refunds/${refund.id}/report-settlement`, 'POST', {
    revision: refund.revision,
    method: 'CASH_REFUND',
    shift_id: shift.id,
    reference: '',
    note: 'Synthetic operator payout report, not provider evidence',
    acknowledged: true,
  });
  await ok(
    `/pos/shifts/${shift.id}/close`,
    'POST',
    { counted_cash: '0.00' },
    409,
  );
  refund = await ok(`/refunds/${refund.id}/reconcile`, 'POST', {
    revision: refund.revision,
    note: 'Manual review required',
    acknowledged: true,
  });
  equal(refund.status, 'RECONCILIATION_REQUIRED', 'manual boundary retained');
  const body = {
    revision: refund.revision,
    note: 'Synthetic physical payout verified',
    acknowledged: true,
  };
  const key = randomUUID();
  refund = await ok(
    `/refunds/${refund.id}/confirm-settlement`,
    'POST',
    body,
    200,
    key,
  );
  equal(
    (
      await ok(
        `/refunds/${refund.id}/confirm-settlement`,
        'POST',
        body,
        200,
        key,
      )
    ).id,
    refund.id,
    'refund confirm retry is exactly once',
  );
  equal(
    refund.status,
    'CONFIRMED',
    'refund settled after explicit acknowledgment',
  );
}
try {
  const shift = await ok(
    '/pos/shifts/open',
    'POST',
    { terminal_id: terminal.id, opening_cash: '100.00' },
    201,
  );
  const lot = await ok(
    '/quality/batches',
    'POST',
    {
      variant_id: variant.id,
      lot_number: 'FINAL-LIFECYCLE',
      manufactured_on: null,
      expires_on: '2099-01-01',
      status: 'ACTIVE',
      reason: 'Observed synthetic supplier label',
    },
    201,
  );
  let order = await ok(
    '/purchasing/orders',
    'POST',
    {
      branch_id: branch,
      supplier_id: fixture.supplier.id,
      notes: 'Final purchase-to-recall lifecycle',
      items: [
        {
          variant_id: variant.id,
          purchase_unit_id: variant.unit_id,
          quantity: '8',
          unit_cost: '1.00',
        },
      ],
    },
    201,
  );
  order = await transition('/purchasing/orders', order, [
    'submit',
    'approve',
    'issue',
  ]);
  let receipt = await ok(
    '/purchasing/receipts',
    'POST',
    {
      branch_id: branch,
      supplier_id: fixture.supplier.id,
      parent_id: order.id,
      location_id: warehouse.id,
      notes: 'Verified label and received stock',
      items: [
        {
          variant_id: variant.id,
          parent_item_id: order.items[0].id,
          quantity: '8',
          delivered_quantity: '8',
          rejected_quantity: '0',
          damaged_quantity: '0',
          reason: 'Observed lot',
          batch_id: lot.id,
          batch_verified: true,
        },
      ],
    },
    201,
  );
  receipt = await transition('/purchasing/receipts', receipt, [
    'submit',
    'approve',
    'post',
  ]);
  equal(
    receipt.items[0].batch_id,
    lot.id,
    'supplier receipt records actual lot',
  );
  const managed = await ok(
    '/shelves',
    'POST',
    {
      branch_id: branch,
      stock_location_id: shelf.id,
      code: 'FINAL',
      name: 'Final lifecycle shelf',
      zone: '',
      description: '',
      status: 'ACTIVE',
    },
    201,
  );
  const slot = await ok(
    `/shelves/${managed.id}/slots`,
    'POST',
    { code: 'LOT', position: 1 },
    201,
  );
  const assignment = await ok(
    `/shelves/${managed.id}/assignments`,
    'POST',
    {
      slot_id: slot.id,
      variant_id: variant.id,
      minimum_quantity: '0',
      target_quantity: '20',
      capacity_quantity: '20',
      status: 'ACTIVE',
    },
    201,
  );
  let task = await ok(
    '/shelves/replenishments',
    'POST',
    {
      assignment_id: assignment.id,
      source_location_id: warehouse.id,
      quantity: '6',
      batch_id: lot.id,
      batch_verified: true,
    },
    201,
  );
  task = await ok(`/shelves/replenishments/${task.id}/assign`, 'POST', {
    revision: task.revision,
    assigned_to: owner.id,
  });
  task = await transition('/shelves/replenishments', task, [
    'start',
    'complete',
  ]);
  equal(task.status, 'COMPLETED', 'receiving lot replenished to managed shelf');
  const promotion = await transition(
    '/promotions',
    await ok('/promotions', 'POST', {
      name: 'Final lifecycle ten percent',
      branch_id: branch,
      priority: 0,
      starts_at: null,
      ends_at: null,
      rule: {
        type: 'PERCENTAGE',
        policy: 'STACKABLE',
        amount: '0.00',
        minimum_spend: '0.00',
        basis_points: 1000,
        buy: 0,
        get: 0,
        variant_ids: [variant.id],
        category_ids: [],
        usage_limit: 10,
      },
    }),
    ['submit', 'approve', 'activate'],
  );
  const program = await ok('/loyalty/programs', 'POST', {
    name: 'Final member',
    spend: '1.00',
    earn_points: 1,
    point_value: '0.01',
    status: 'ACTIVE',
  });
  const customer = await ok('/customers', 'POST', {
    code: 'FINAL-1',
    name: 'Synthetic final member',
    phone: '',
    email: '',
    notes: '',
    marketing_consent: false,
  });
  const account = await ok('/loyalty/accounts', 'POST', {
    customer_id: customer.id,
    program_id: program.id,
    status: 'ACTIVE',
  });
  await ok(`/loyalty/accounts/${account.id}/adjust`, 'POST', {
    branch_id: branch,
    points: 40,
    reason: 'Authorized synthetic opening points',
  });
  const promotionalCart = await basket(customer, lot, '3');
  await ok(
    `/pos/carts/${promotionalCart.id}/quote?loyalty_points=40`,
    'GET',
    undefined,
    409,
  );
  const original = await checkout(promotionalCart);
  equal(
    original.grand_total,
    '5.40',
    '6.00 gross less 0.60 promotion; rewards cannot stack with any discount',
  );
  equal(
    authSQL(
      `SELECT batch_id::text FROM sale_items WHERE sale_id='${original.id}'`,
    ),
    lot.id,
    'sale preserves selected receiving lot',
  );
  equal(
    authSQL(`SELECT used FROM promotions WHERE id='${promotion.id}'`),
    '1',
    'one committed promotion redemption',
  );
  await transition('/promotions', promotion, ['pause']);
  const rewarded = await checkout(await basket(customer, lot), 40);
  equal(
    rewarded.grand_total,
    '1.60',
    'explicit reward-only sale has exact discount without fake payment',
  );
  const rewardReturn = await returned(rewarded, lot);
  await settle(await ok(`/refunds/${rewardReturn.refund_id}`), shift);
  equal(
    authSQL(
      `SELECT COALESCE(sum(points),0)::text FROM loyalty_ledger WHERE organization_id='${org}' AND sale_id='${rewarded.id}'`,
    ),
    '0',
    'reward return restores original redemption and reverses earning',
  );
  const originalSnapshot = authSQL(
    `SELECT to_jsonb(sale)::text FROM sales sale WHERE id='${original.id}'`,
  );
  const firstReturn = await returned(original, lot);
  await settle(await ok(`/refunds/${firstReturn.refund_id}`), shift);
  let exchange = await ok(
    '/exchanges',
    'POST',
    {
      original_sale_id: original.id,
      terminal_id: terminal.id,
      reason: 'Original tracked return with replacement',
      items: [
        {
          original_sale_item_id: original.items[0].id,
          quantity: '1',
          disposition: 'RESTOCK_SELLABLE',
          destination_location_id: warehouse.id,
          batch_id: lot.id,
          batch_verified: true,
        },
      ],
      replacements: [{ variant_id: variant2.id, quantity: '1' }],
    },
    201,
  );
  exchange = await transition('/exchanges', exchange, ['submit', 'approve']);
  exchange = await ok(`/exchanges/${exchange.id}/confirm-settlement`, 'POST', {
    revision: exchange.revision,
    method: 'CASH',
    shift_id: shift.id,
    reference: '',
    note: 'Only net replacement consideration acknowledged',
    acknowledged: true,
  });
  exchange = await transition('/exchanges', exchange, ['complete']);
  equal(
    exchange.status,
    'COMPLETED',
    'exchange integrates historical reward credit and replacement',
  );
  const replacement = await ok(`/sales/${exchange.replacement_sale_id}`);
  equal(
    replacement.customer_id,
    customer.id,
    'exchange inherits customer linkage',
  );
  const lastReturn = await returned(original, lot);
  await settle(await ok(`/refunds/${lastReturn.refund_id}`), shift);
  equal(
    authSQL(
      `SELECT to_jsonb(sale)::text FROM sales sale WHERE id='${original.id}'`,
    ),
    originalSnapshot,
    'historical Sale remains immutable after partial return/exchange/full compensation',
  );
  equal(
    authSQL(
      `SELECT COALESCE(sum(points),0)::text FROM loyalty_ledger WHERE organization_id='${org}' AND sale_id='${original.id}'`,
    ),
    '0',
    'full cumulative return/exchange reverses original earn and redemption exactly',
  );
  equal(
    authSQL(
      `SELECT count(*) FROM loyalty_ledger WHERE organization_id='${org}' AND sale_id='${replacement.id}' AND kind='EARN'`,
    ),
    '1',
    'replacement earning posted once',
  );
  const walkin = await checkout(await basket(null, lot));
  equal(
    authSQL(`SELECT count(*) FROM loyalty_ledger WHERE sale_id='${walkin.id}'`),
    '0',
    'walk-in retains no loyalty ledger association',
  );
  let writeoff = await ok(
    '/quality/write-offs',
    'POST',
    {
      location_id: shelf.id,
      variant_id: variant.id,
      batch_id: lot.id,
      quantity: '1',
      reason: 'Physically observed damaged unit',
    },
    201,
  );
  writeoff = await transition('/quality/write-offs', writeoff, [
    'approve',
    'post',
  ]);
  equal(writeoff.status, 'POSTED', 'remaining tracked stock written off');
  await ok(
    '/quality/recalls',
    'POST',
    {
      variant_id: variant.id,
      batch_id: lot.id,
      reason: 'Supplier quality notice on recorded lot',
    },
    201,
  );
  equal(
    (await basket(customer, lot)).review_required,
    true,
    'recall blocks further sale from same lifecycle',
  );
  equal(
    authSQL(
      `SELECT sum(quantity)::text FROM quality_stock_balances WHERE organization_id='${org}' AND batch_id='${lot.id}'`,
    ),
    '6.000',
    '8 received minus1 walk-in minus1 writeoff, original sale fully returned',
  );
  equal(
    authSQL(
      `SELECT count(*) FROM stock_movements WHERE organization_id='${org}' AND document_id='${task.transfer_id}' AND batch_id='${lot.id}'`,
    ),
    '2',
    'replenishment has conserved tracked movement pair',
  );
  equal(
    authSQL(
      `SELECT count(*)>0 FROM organization_audit_events WHERE organization_id='${org}'`,
    ),
    't',
    'lifecycle retains audit evidence',
  );
  const closing = await ok(`/pos/shifts/${shift.id}`);
  const closed = await ok(`/pos/shifts/${shift.id}/close`, 'POST', {
    counted_cash: closing.expected_cash,
  });
  equal(
    closed.status,
    'CLOSED',
    'register closes after explicit settled refunds',
  );
  equal(closed.difference, '0.00', 'register financial reconciliation exact');
  console.log(
    JSON.stringify({ suite: 'phase57-flow', assertions, status: 'PASSED' }),
  );
} finally {
  fixture.close();
}
