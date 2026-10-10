import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { authSQL } from './auth-fixtures.mjs';
import { adjustmentsFixture } from './adjustments-fixtures.mjs';

if (!/^smartpos_phase53_[a-z0-9_]+$/.test(process.env.AUTH_TEST_DATABASE ?? ''))
  throw new Error('Pricing safety requires an isolated Phase53 scratch DB');
const fixture = await adjustmentsFixture();
const { org, branch, owner, variant } = fixture;
let assertions = 0;
function equal(actual, expected, label) {
  assert.equal(actual, expected, label);
  assertions++;
}
async function call(path, method = 'GET', body, key, status = 200) {
  const result = await fixture.call(path, method, body, key);
  equal(result.status, status, `${path}: ${JSON.stringify(result.error)}`);
  return result.data;
}
function deniedSQL(statement, label) {
  const result = authSQL(`BEGIN; DO $guard$ BEGIN
    BEGIN ${statement}; RAISE EXCEPTION 'guard accepted invalid write';
    EXCEPTION WHEN check_violation OR insufficient_privilege OR foreign_key_violation THEN NULL; END;
    END $guard$; SELECT 'guard-pass'; ROLLBACK;`);
  equal(result.includes('guard-pass'), true, label);
}
try {
  let cart = await call(
    '/pos/carts',
    'POST',
    { terminal_id: fixture.terminal.id },
    undefined,
    201,
  );
  cart = await call(`/pos/carts/${cart.id}`, 'PATCH', {
    revision: cart.revision,
    items: [{ variant_id: variant.id, quantity: '2' }],
  });
  const body = {
    cart_id: cart.id,
    revision: cart.revision,
    pricing_revision: cart.pricing.revision,
    amount: '1.00',
    reason: 'Approval consumption acceptance',
  };
  const key = randomUUID();
  let approval = await call('/discount-approvals', 'POST', body, key);
  const duplicate = await call('/discount-approvals', 'POST', body, key);
  equal(duplicate.id, approval.id, 'approval request idempotency');
  await call(
    '/discount-approvals',
    'POST',
    { ...body, amount: '1.01' },
    key,
    409,
  );
  approval = await call(`/discount-approvals/${approval.id}/approve`, 'POST', {
    revision: approval.revision,
  });
  const expired = randomUUID(),
    expiredKey = randomUUID();
  authSQL(`INSERT INTO discount_approvals(id,organization_id,branch_id,cart_id,cart_revision,pricing_revision,amount,reason,status,requested_by,approved_by,approved_at,expires_at,idempotency_key,fingerprint)
    SELECT '${expired}',organization_id,branch_id,cart_id,cart_revision,pricing_revision,amount,reason,status,requested_by,approved_by,approved_at,now()-interval '1 second','${expiredKey}',fingerprint FROM discount_approvals WHERE id='${approval.id}'`);
  await call('/discount-approvals', 'POST', body, expiredKey, 409);
  await call(
    `/pos/carts/${cart.id}/quote?approval_id=${expired}`,
    'GET',
    undefined,
    undefined,
    409,
  );
  await call(
    `/discount-approvals/${expired}/approve`,
    'POST',
    { revision: 1 },
    undefined,
    409,
  );
  const quote = await call(
    `/pos/carts/${cart.id}/quote?approval_id=${approval.id}`,
  );
  equal(quote.total, '3.00', 'approved exact discount');
  const checkout = await call(
    '/pos/checkout',
    'POST',
    {
      cart_id: cart.id,
      revision: cart.revision,
      method: 'CASH',
      expected_total: quote.total,
      received: quote.total,
      pricing_revision: quote.revision,
      approval_id: approval.id,
    },
    randomUUID(),
    201,
  );
  await call(
    `/pos/payments/${checkout.id}/confirm`,
    'POST',
    { acknowledged: true, reference: '' },
    randomUUID(),
  );
  const completed = await call(
    `/pos/checkouts/${checkout.id}/complete`,
    'POST',
    {},
    randomUUID(),
  );
  equal(completed.status, 'COMPLETED', 'approved checkout completes');
  equal(
    authSQL(`SELECT status FROM discount_approvals WHERE id='${approval.id}'`),
    'CONSUMED',
    'approval atomically consumed',
  );
  const replay = await call(
    `/pos/checkouts/${checkout.id}/complete`,
    'POST',
    {},
    randomUUID(),
  );
  equal(replay.sale_id, completed.sale_id, 'completion replay keeps same sale');
  equal(
    authSQL(`SELECT count(*) FROM sales WHERE checkout_id='${checkout.id}'`),
    '1',
    'one sale',
  );
  equal(
    authSQL(
      `SELECT count(*) FROM sale_payments WHERE sale_id='${completed.sale_id}'`,
    ),
    '1',
    'one payment',
  );
  deniedSQL(
    `UPDATE sales SET pricing_snapshot='{}' WHERE id='${completed.sale_id}'`,
    'immutable sale pricing snapshot',
  );
  deniedSQL(
    `UPDATE sale_items SET discount_total=0,line_total=gross_total WHERE sale_id='${completed.sale_id}'`,
    'immutable historical paid allocation',
  );
  deniedSQL(
    `UPDATE discount_approvals SET status='APPROVED',revision=revision+1 WHERE id='${approval.id}'`,
    'consumed approval cannot be resurrected',
  );
  deniedSQL(
    `UPDATE discount_approvals SET amount=0.50,revision=revision+1 WHERE id='${approval.id}'`,
    'approval amount cannot change',
  );
  let promotion = await call('/promotions', 'POST', {
    name: 'Database guard acceptance',
    branch_id: branch,
    priority: 0,
    starts_at: null,
    ends_at: null,
    rule: {
      type: 'FIXED',
      policy: 'EXCLUSIVE',
      amount: '1.00',
      minimum_spend: '0.00',
      basis_points: 0,
      buy: 0,
      get: 0,
      variant_ids: [variant.id],
      category_ids: [],
      usage_limit: 1,
    },
  });
  for (const action of ['submit', 'approve', 'activate'])
    promotion = await call(`/promotions/${promotion.id}/${action}`, 'POST', {
      revision: promotion.revision,
    });
  deniedSQL(
    `UPDATE promotions SET used=1 WHERE id='${promotion.id}'; SET CONSTRAINTS ALL IMMEDIATE`,
    'usage must reconcile with redemptions',
  );
  deniedSQL(
    `UPDATE promotions SET rule=jsonb_set(rule,'{amount}','"999.00"'),revision=revision+1 WHERE id='${promotion.id}'`,
    'active rule immutable',
  );
  deniedSQL(
    `INSERT INTO promotion_redemptions(organization_id,promotion_id,sale_id,promotion_revision,discount,snapshot) VALUES('${org}','${promotion.id}','${completed.sale_id}',${promotion.revision},1,'{}')`,
    'forged redemption rejected',
  );
  deniedSQL(
    `SET LOCAL ROLE smartpos_runtime; DELETE FROM promotions WHERE id='${promotion.id}'`,
    'runtime cannot delete definitions',
  );
  deniedSQL(
    `INSERT INTO price_lists(organization_id,branch_id,name,priority,items,created_by) VALUES('${org}','${randomUUID()}','Foreign branch',0,'[]','${owner.id}')`,
    'tenant branch FK enforced',
  );
  deniedSQL(
    `INSERT INTO price_lists(organization_id,name,priority,items,created_by) VALUES('${org}','Foreign variant',0,'[{"variant_id":"${randomUUID()}","unit_price":"1.00"}]','${owner.id}')`,
    'tenant item references enforced',
  );
  for (const table of [
    'price_lists',
    'promotions',
    'discount_approvals',
    'promotion_redemptions',
  ]) {
    const count = authSQL(
      `BEGIN; SET LOCAL ROLE smartpos_runtime; SELECT set_config('app.organization_id','${randomUUID()}',true); SELECT count(*) FROM ${table} WHERE organization_id='${org}'; ROLLBACK;`,
    )
      .split('\n')
      .filter((value) => /^\d+$/.test(value))
      .join();
    equal(count, '0', `${table} runtime tenant isolation`);
  }
  console.log(
    `PASS: Phase 5.3 pricing safety (${assertions} assertions): approval consumption/replay/expiry, immutable allocations, usage/redemption guards, tenant FKs and runtime RLS`,
  );
} finally {
  fixture.close();
}
