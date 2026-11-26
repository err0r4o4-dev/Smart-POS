import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { customersFixture } from './customers-fixtures.mjs';
import {
  inventoryAccount,
  inventoryMembership,
  inventoryCall,
} from './inventory-fixtures.mjs';
import { authSQL } from './auth-fixtures.mjs';

if (
  !/^smartpos_phase53_phase54_[a-z0-9_]+$/.test(
    process.env.AUTH_TEST_DATABASE ?? '',
  )
)
  throw new Error('Customer safety requires explicit Phase54 scratch DB');
const fixture = await customersFixture();
let assertions = 0;
function equal(actual, expected, message) {
  assert.deepEqual(actual, expected, message);
  assertions++;
}
async function ok(
  path,
  method = 'GET',
  body,
  status = 200,
  key,
  user = fixture.owner,
) {
  const result = await fixture.call(path, method, body, key, user);
  equal(result.status, status, path + ': ' + JSON.stringify(result.error));
  return result.data;
}
function rejectedSQL(statement) {
  const result = authSQL(
    `BEGIN; SET LOCAL ROLE smartpos_runtime; SELECT set_config('app.organization_id','${fixture.org}',true); DO $$ BEGIN BEGIN ${statement}; RAISE EXCEPTION 'unexpected accepted mutation'; EXCEPTION WHEN check_violation OR foreign_key_violation OR insufficient_privilege THEN NULL; END; END $$; ROLLBACK; SELECT 'rejected';`,
  );
  equal(result.split('\n').at(-1), 'rejected', 'runtime mutation rejected');
}
async function sale(customer, quantity = '2') {
  let cart = await ok(
    '/pos/carts',
    'POST',
    { terminal_id: fixture.terminal.id },
    201,
  );
  cart = await ok(`/pos/carts/${cart.id}`, 'PATCH', {
    revision: cart.revision,
    items: [{ variant_id: fixture.variant.id, quantity }],
  });
  cart = await ok(`/pos/carts/${cart.id}/customer`, 'PATCH', {
    revision: cart.revision,
    customer_id: customer.id,
  });
  const body = {
    cart_id: cart.id,
    revision: cart.revision,
    method: 'CASH',
    expected_total: cart.total,
    received: cart.total,
  };
  await ok('/pos/checkout', 'POST', { ...body, customer_id: customer.id }, 400);
  let checkout = await ok('/pos/checkout', 'POST', body, 201);
  await ok(`/pos/payments/${checkout.id}/confirm`, 'POST', {
    acknowledged: true,
    reference: '',
  });
  checkout = await ok(`/pos/checkouts/${checkout.id}/complete`, 'POST', {});
  return ok(`/returns/sales/${checkout.sale_id}`);
}
async function adjustment(
  original,
  replacements,
  quantity,
  method,
  reversal = false,
) {
  const root = reversal ? '/sales/voids' : '/exchanges';
  let document = await ok(
    root,
    'POST',
    fixture.input(original, replacements, quantity),
    201,
  );
  for (const action of ['submit', 'approve'])
    document = await ok(`${root}/${document.id}/${action}`, 'POST', {
      revision: document.revision,
    });
  document = await ok(`${root}/${document.id}/confirm-settlement`, 'POST', {
    revision: document.revision,
    method,
    acknowledged: true,
    shift_id: method === 'CASH_REFUND' ? fixture.shift.id : null,
    reference: '',
    note: 'Synthetic customer financial safety',
  });
  document = await ok(`${root}/${document.id}/complete`, 'POST', {
    revision: document.revision,
  });
  equal(document.status, 'COMPLETED');
  return document;
}
try {
  let customer = await ok('/customers', 'POST', {
    code: 'SAFETY',
    name: 'Synthetic safety',
  });
  for (const field of [
    { id: randomUUID() },
    { status: 'ACTIVE' },
    { member_count: 99 },
  ])
    await ok(
      '/customers/groups',
      'POST',
      { code: 'SERVER-FIELDS', name: 'Group', ...field },
      400,
    );
  const key = randomUUID();
  const groupResponses = await Promise.all(
    [1, 2].map(() =>
      fixture.call(
        '/customers/groups',
        'POST',
        { code: 'RACE', name: 'Group race' },
        key,
      ),
    ),
  );
  equal(
    groupResponses.map((result) => result.status),
    [200, 200],
  );
  equal(groupResponses[0].data.id, groupResponses[1].data.id);
  let group = groupResponses[0].data;
  const groupEdits = await Promise.all(
    ['First', 'Second'].map((name) =>
      fixture.call(`/customers/groups/${group.id}`, 'PUT', {
        code: group.code,
        name,
        revision: group.revision,
      }),
    ),
  );
  equal(groupEdits.map((result) => result.status).sort(), [200, 409]);
  group = (await ok('/customers/groups')).items.find(
    (item) => item.id === group.id,
  );
  customer = await ok(`/customers/${customer.id}/groups/${group.id}`, 'PUT', {
    revision: customer.revision,
    group_revision: group.revision,
    present: true,
  });
  equal(customer.groups.find((item) => item.id === group.id).member_count, 1);
  const manager = await inventoryAccount(fixture.clients);
  inventoryMembership(fixture.org, manager, 'MANAGER', [fixture.branch]);
  const replayKey = randomUUID();
  await ok(
    '/customers/groups',
    'POST',
    { code: 'REPLAY', name: 'Replay' },
    200,
    replayKey,
    manager,
  );
  authSQL(
    `UPDATE organization_memberships SET role='CASHIER' WHERE organization_id='${fixture.org}' AND user_id='${manager.id}'`,
  );
  await ok(
    '/customers/groups',
    'POST',
    { code: 'REPLAY', name: 'Replay' },
    403,
    replayKey,
    manager,
  );
  authSQL(
    `UPDATE organization_memberships SET role='MANAGER' WHERE organization_id='${fixture.org}' AND user_id='${manager.id}'`,
  );
  await ok(
    `/customers/${customer.id}/history?branch_id=${fixture.secondBranch}`,
    'GET',
    undefined,
    403,
    undefined,
    manager,
  );
  const zeroOriginal = await sale(customer);
  rejectedSQL(
    `UPDATE sales SET customer_id=NULL,customer_code_snapshot='' WHERE id='${zeroOriginal.id}'`,
  );
  equal((await ok(`/sales/${zeroOriginal.id}`)).customer_id, customer.id);
  await adjustment(zeroOriginal, [[fixture.variant2, '1']], '1', 'NONE');
  let history = await ok(`/customers/${customer.id}/history`);
  equal(history.summary.paid, '4.00', 'zero exchange collects no new money');
  equal(history.summary.refunded, '0.00');
  equal(history.summary.replacements, 1);
  equal(
    (
      await ok(
        `/customers/${customer.id}/history?branch_id=${fixture.secondBranch}`,
      )
    ).summary.paid,
    '0.00',
  );
  const negativeOriginal = await sale(customer, '2');
  await adjustment(
    negativeOriginal,
    [[fixture.variant2, '1']],
    '2',
    'CASH_REFUND',
  );
  history = await ok(`/customers/${customer.id}/history`);
  equal(
    history.summary.paid,
    '8.00',
    'negative exchange replacement credit not new funds',
  );
  equal(history.summary.refunded, '2.00');
  equal(history.summary.net_collected, '6.00');
  const reversalOriginal = await sale(customer, '1');
  await adjustment(reversalOriginal, [], '1', 'CASH_REFUND', true);
  history = await ok(`/customers/${customer.id}/history`);
  equal(history.summary.paid, '10.00');
  equal(history.summary.refunded, '4.00');
  equal(history.summary.net_collected, '6.00');
  equal(
    history.items.some(
      (item) => item.kind === 'REVERSAL' && item.status === 'COMPLETED',
    ),
    true,
  );
  const archivedOriginal = await sale(customer, '1');
  customer = await ok(`/customers/${customer.id}/archive`, 'POST', {
    revision: customer.revision,
  });
  const historical = await adjustment(
    archivedOriginal,
    [[fixture.variant2, '1']],
    '1',
    'NONE',
  );
  equal(
    (await ok(`/sales/${historical.replacement_sale_id}`)).customer_id,
    customer.id,
    'archival keeps historical exchange references',
  );
  history = await ok(`/customers/${customer.id}/history`);
  equal(history.summary.paid, '12.00');
  equal(history.summary.refunded, '4.00');
  equal(history.summary.net_collected, '8.00');
  equal(history.summary.replacements, 3);
  await ok(
    `/customers/${customer.id}/history?from=2020-01-01T00:00:00Z&to=2026-01-01T00:00:00Z`,
    'GET',
    undefined,
    400,
  );
  authSQL(
    `DELETE FROM branch_memberships WHERE organization_id='${fixture.org}' AND membership_id=(SELECT id FROM organization_memberships WHERE organization_id='${fixture.org}' AND user_id='${manager.id}')`,
  );
  await ok(
    `/customers/${customer.id}`,
    'GET',
    undefined,
    403,
    undefined,
    manager,
  );
  const foreignOrg = await inventoryCall(
    fixture.owner,
    '/organizations',
    'POST',
    {
      name: 'Customer foreign safety',
      code: 'FOREIGN-' + randomUUID().slice(0, 8).toUpperCase(),
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
    },
  );
  equal(foreignOrg.status, 201);
  const foreignGroup = (
    await inventoryCall(
      fixture.owner,
      `/organizations/${foreignOrg.data.organization.id}/customers/groups`,
    )
  ).data.items[0];
  const active = await ok('/customers', 'POST', { code: 'FK-ACTIVE' });
  rejectedSQL(
    `INSERT INTO customer_group_memberships(organization_id,customer_id,group_id,created_by) VALUES('${fixture.org}','${active.id}','${foreignGroup.id}','${fixture.owner.id}')`,
  );
  rejectedSQL(`DELETE FROM customers WHERE id='${active.id}'`);
  equal(
    authSQL(
      `SELECT count(*) FROM sale_payments payment JOIN sales sale ON sale.organization_id=payment.organization_id AND sale.id=payment.sale_id WHERE sale.organization_id='${fixture.org}' AND sale.grand_total<>payment.amount+payment.credit_amount`,
    ),
    '0',
  );
  equal(
    authSQL(
      `SELECT count(*) FROM stock_balances balance WHERE organization_id='${fixture.org}' AND quantity<>(SELECT COALESCE(sum(quantity_delta),0) FROM stock_movements WHERE organization_id=balance.organization_id AND variant_id=balance.variant_id AND location_id=balance.location_id)`,
    ),
    '0',
  );
  console.log(
    `PASS: Customer safety ${assertions} assertions; zero/negative exchange, reversal, archived history, revision/replay/branch guards and DB reconciliation`,
  );
} finally {
  fixture.close();
}
