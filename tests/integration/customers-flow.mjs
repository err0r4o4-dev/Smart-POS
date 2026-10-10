import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { adjustmentsFixture } from './adjustments-fixtures.mjs';
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
  throw new Error('Customer acceptance requires explicit Phase54 scratch DB');
const fixture = await adjustmentsFixture();
const { owner, org, branch, variant, variant2, terminal, call } = fixture;
let assertions = 0;
function editable(value) {
  return {
    code: value.code,
    name: value.name,
    phone: value.phone,
    email: value.email,
    notes: value.notes,
    marketing_consent: value.marketing_consent,
    revision: value.revision,
  };
}
function equal(actual, expected, label) {
  assert.deepEqual(actual, expected, label);
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
  const result = await call(path, method, body, key, user, headers);
  equal(result.status, status, path + ': ' + JSON.stringify(result.error));
  return result.data;
}
async function cart(customer = null, quantity = '3') {
  let value = await ok(
    '/pos/carts',
    'POST',
    { terminal_id: terminal.id },
    undefined,
    201,
  );
  value = await ok(`/pos/carts/${value.id}`, 'PATCH', {
    revision: value.revision,
    items: [{ variant_id: variant.id, quantity }],
  });
  if (customer)
    value = await ok(`/pos/carts/${value.id}/customer`, 'PATCH', {
      revision: value.revision,
      customer_id: customer.id,
    });
  return value;
}
async function prepare(value) {
  return ok(
    '/pos/checkout',
    'POST',
    {
      cart_id: value.id,
      revision: value.revision,
      method: 'CASH',
      expected_total: value.total,
      received: value.total,
    },
    undefined,
    201,
  );
}
async function complete(value) {
  await ok(`/pos/payments/${value.id}/confirm`, 'POST', {
    acknowledged: true,
    reference: '',
  });
  return ok(`/pos/checkouts/${value.id}/complete`, 'POST', {});
}
try {
  const groups = await ok('/customers/groups');
  equal(
    groups.items.map((item) => item.code),
    ['GENERAL', 'MEMBER', 'VIP'],
    'default groups',
  );
  const key = randomUUID(),
    input = {
      code: ' c-01 ',
      name: ' Customer Example ',
      phone: '+66 (81) 234-5678',
      email: ' CUSTOMER@EXAMPLE.TEST ',
      notes: 'private acceptance notes',
    };
  let customer = await ok('/customers', 'POST', input, key);
  equal(customer.code, 'C-01');
  equal(customer.phone, '+66812345678');
  equal(customer.email, 'customer@example.test');
  equal(customer.marketing_consent, false);
  equal(
    (await ok('/customers', 'POST', input, key)).id,
    customer.id,
    'idempotent create',
  );
  await ok('/customers', 'POST', { ...input, name: 'Different' }, key, 409);
  for (const duplicate of [
    { code: 'C-01' },
    { code: 'PHONE-DUP', phone: '0812345678' },
    { code: 'EMAIL-DUP', email: input.email },
  ]) {
    if (duplicate.code === 'PHONE-DUP') duplicate.phone = '+66812345678';
    await ok('/customers', 'POST', duplicate, undefined, 409);
  }
  for (const invalid of [
    { code: 'invalid code' },
    { code: 'BAD-PHONE', phone: 'abcdef' },
    { code: 'BAD-EMAIL', email: 'a <a@b.com>' },
    { code: 'CONTROL', name: 'unsafe\nname' },
  ])
    await ok('/customers', 'POST', invalid, undefined, 400);
  const anonymous = await ok('/customers', 'POST', { code: 'NO-PII' });
  equal(anonymous.name, '');
  equal(anonymous.phone, '');
  equal(anonymous.email, '');
  const simultaneous = await Promise.all(
    [1, 2].map(() =>
      call(
        '/customers',
        'POST',
        { code: 'CONCURRENT' },
        '7a57ea31-46a6-44ea-a93d-936df5f86783',
      ),
    ),
  );
  equal(
    simultaneous.map((result) => result.status),
    [200, 200],
  );
  equal(simultaneous[0].data.id, simultaneous[1].data.id);
  const edits = await Promise.all(
    ['First', 'Second'].map((name) =>
      call(`/customers/${customer.id}`, 'PUT', { ...editable(customer), name }),
    ),
  );
  equal(
    edits.map((result) => result.status).sort(),
    [200, 409],
    'optimistic revisions',
  );
  customer = await ok(`/customers/${customer.id}`);
  const customGroup = await ok('/customers/groups', 'POST', {
    code: 'TRADE',
    name: 'Trade',
  });
  customer = await ok(
    `/customers/${customer.id}/groups/${customGroup.id}`,
    'PUT',
    {
      revision: customer.revision,
      group_revision: customGroup.revision,
      present: true,
    },
  );
  equal(customer.groups[0].code, 'TRADE');
  let freshGroup = (await ok('/customers/groups')).items.find(
    (item) => item.id === customGroup.id,
  );
  equal(freshGroup.member_count, 1);
  equal((await ok(`/customers?group_id=${customGroup.id}`)).total, 1);
  await ok(
    `/customers/${customer.id}/groups/${customGroup.id}`,
    'PUT',
    {
      revision: customer.revision - 1,
      group_revision: freshGroup.revision,
      present: false,
    },
    undefined,
    409,
  );
  customer = await ok(
    `/customers/${customer.id}/groups/${customGroup.id}`,
    'PUT',
    {
      revision: customer.revision,
      group_revision: freshGroup.revision,
      present: false,
    },
  );
  equal(customer.groups.length, 0);
  freshGroup = (await ok('/customers/groups')).items.find(
    (item) => item.id === customGroup.id,
  );
  freshGroup = await ok(`/customers/groups/${customGroup.id}`, 'PUT', {
    code: 'TRADE',
    name: 'Trade edited',
    revision: freshGroup.revision,
  });
  await ok(
    `/customers/groups/${customGroup.id}`,
    'PUT',
    { code: 'TRADE', name: 'stale', revision: freshGroup.revision - 1 },
    undefined,
    409,
  );
  await ok(`/customers/groups/${customGroup.id}/archive`, 'POST', {
    revision: freshGroup.revision,
  });
  await ok(
    `/customers/${customer.id}/groups/${customGroup.id}`,
    'PUT',
    {
      revision: customer.revision,
      group_revision: freshGroup.revision + 1,
      present: true,
    },
    undefined,
    409,
  );
  const searched = await ok('/customers/search', 'POST', {
    search: 'customer@',
    page: 1,
    page_size: 1,
  });
  equal(searched.total, 1);
  equal(searched.items[0].id, customer.id);
  equal(searched.items.length, 1);
  equal((await ok('/customers?page_size=1&page=2')).items.length, 1);
  await ok('/customers?page_size=101', 'GET', undefined, undefined, 400);
  const cashier = await inventoryAccount(fixture.clients);
  inventoryMembership(org, cashier, 'CASHIER', [branch]);
  const masked = await ok(
    `/customers/${customer.id}`,
    'GET',
    undefined,
    undefined,
    200,
    cashier,
  );
  equal(masked.phone, '••••5678');
  equal(masked.email, '••••');
  equal(masked.notes, '');
  await ok('/customers', 'POST', { code: 'DENIED' }, undefined, 403, cashier);
  await ok(
    `/customers/${customer.id}/history`,
    'GET',
    undefined,
    undefined,
    403,
    cashier,
  );
  const manager = await inventoryAccount(fixture.clients);
  inventoryMembership(org, manager, 'MANAGER', [branch]);
  const replayKey = randomUUID();
  await ok(
    '/customers',
    'POST',
    { code: 'MANAGER-CREATE' },
    replayKey,
    200,
    manager,
  );
  authSQL(
    `UPDATE organization_memberships SET role='CASHIER' WHERE organization_id='${org}' AND user_id='${manager.id}'`,
  );
  await ok(
    '/customers',
    'POST',
    { code: 'MANAGER-CREATE' },
    replayKey,
    403,
    manager,
  );
  const other = await inventoryAccount(fixture.clients);
  const setup = await inventoryCall(other, '/organizations', 'POST', {
    name: 'Other tenant',
    code: 'OTHER-' + randomUUID().slice(0, 8).toUpperCase(),
    business_type: 'RETAIL',
    contact_email: '',
    contact_phone: '',
    address: '',
    branch: {
      name: 'Main',
      code: 'MAIN',
      address: '',
      phone: '',
      email: '',
      status: 'ACTIVE',
    },
  });
  equal(setup.status, 201);
  const otherOrg = setup.data.organization.id;
  const foreign = await inventoryCall(
    other,
    `/organizations/${otherOrg}/customers`,
    'POST',
    { code: 'FOREIGN' },
  );
  equal(foreign.status, 200);
  const foreignGroup = (
    await inventoryCall(other, `/organizations/${otherOrg}/customers/groups`)
  ).data.items[0];
  await ok(`/customers/${foreign.data.id}`, 'GET', undefined, undefined, 404);
  await ok(
    `/customers/${customer.id}/groups/${foreignGroup.id}`,
    'PUT',
    {
      revision: customer.revision,
      group_revision: foreignGroup.revision,
      present: true,
    },
    undefined,
    404,
  );
  let value = await cart(customer);
  await ok(
    `/pos/carts/${value.id}/customer`,
    'PATCH',
    { revision: value.revision, customer_id: foreign.data.id },
    undefined,
    404,
  );
  await ok(
    `/pos/carts/${value.id}/customer`,
    'PATCH',
    { revision: value.revision, customer_id: randomUUID() },
    undefined,
    404,
  );
  await ok(
    `/pos/carts/${value.id}/customer`,
    'PATCH',
    { revision: value.revision - 1, customer_id: null },
    undefined,
    409,
  );
  let paid = await complete(await prepare(value));
  equal(paid.status, 'COMPLETED');
  let sale = await ok(`/sales/${paid.sale_id}`);
  equal(sale.customer_id, customer.id);
  equal(sale.customer_code_snapshot, 'C-01');
  equal(sale.grand_total, '6.00');
  await ok(
    `/pos/carts/${value.id}/customer`,
    'PATCH',
    { revision: value.revision + 1, customer_id: null },
    undefined,
    409,
  );
  customer = await ok(`/customers/${customer.id}`, 'PUT', {
    ...editable(customer),
    code: 'C-EDIT',
    name: 'Changed after sale',
  });
  equal((await ok(`/sales/${sale.id}`)).customer_code_snapshot, 'C-01');
  const history = await ok(`/customers/${customer.id}/history`);
  equal(history.summary.paid, '6.00');
  equal(history.summary.net_collected, '6.00');
  equal(history.summary.purchases, 1);
  const exchangeSale = await ok(`/returns/sales/${sale.id}`);
  let adjustment = await ok(
    '/exchanges',
    'POST',
    fixture.input(exchangeSale, [[variant2, '2']]),
    undefined,
    201,
  );
  for (const action of ['submit', 'approve'])
    adjustment = await ok(`/exchanges/${adjustment.id}/${action}`, 'POST', {
      revision: adjustment.revision,
    });
  adjustment = await ok(
    `/exchanges/${adjustment.id}/confirm-settlement`,
    'POST',
    {
      revision: adjustment.revision,
      method: 'CASH',
      shift_id: fixture.shift.id,
      acknowledged: true,
      reference: '',
      note: 'Synthetic acknowledged cash',
    },
  );
  adjustment = await ok(`/exchanges/${adjustment.id}/complete`, 'POST', {
    revision: adjustment.revision,
  });
  equal(adjustment.status, 'COMPLETED');
  let after = await ok(`/customers/${customer.id}/history`);
  equal(after.summary.paid, '8.00', 'only external replacement funds counted');
  equal(after.summary.replacements, 1);
  equal(after.summary.net_collected, '8.00');
  equal(
    (await ok(`/sales/${adjustment.replacement_sale_id}`)).customer_id,
    customer.id,
    'replacement inherits original customer',
  );
  let returned = await ok(
    '/returns',
    'POST',
    {
      original_sale_id: sale.id,
      reason: 'Customer history refund',
      items: [
        {
          original_sale_item_id: sale.items[0].id,
          quantity: '1',
          disposition: 'RESTOCK_SELLABLE',
          destination_location_id: fixture.warehouse.id,
        },
      ],
    },
    undefined,
    201,
  );
  for (const action of ['submit', 'approve', 'complete'])
    returned = await ok(`/returns/${returned.id}/${action}`, 'POST', {
      revision: returned.revision,
    });
  after = await ok(`/customers/${customer.id}/history`);
  equal(after.summary.refunded, '0.00');
  equal(after.summary.pending_refund, '2.00');
  let refund = await ok(`/refunds/${returned.refund_id}`);
  refund = await ok(`/refunds/${refund.id}/report-settlement`, 'POST', {
    revision: refund.revision,
    method: 'CASH_REFUND',
    shift_id: fixture.shift.id,
    acknowledged: true,
    reference: '',
    note: 'Synthetic refund acknowledgement',
  });
  refund = await ok(`/refunds/${refund.id}/confirm-settlement`, 'POST', {
    revision: refund.revision,
    acknowledged: true,
    note: 'Synthetic refund confirmed',
  });
  after = await ok(`/customers/${customer.id}/history`);
  equal(after.summary.refunded, '2.00');
  equal(after.summary.pending_refund, '0.00');
  equal(after.summary.net_collected, '6.00');
  equal(
    (await ok(`/customers/${customer.id}/history?page_size=1`)).items.length,
    1,
  );
  await ok(
    `/customers/${customer.id}/history?branch_id=${setup.data.branches[0].id}`,
    'GET',
    undefined,
    undefined,
    404,
  );
  const walk = await complete(await prepare(await cart()));
  equal((await ok(`/sales/${walk.sale_id}`)).customer_id, null, 'Walk-in sale');
  let held = await cart(customer);
  held = await ok(`/pos/carts/${held.id}/hold`, 'POST', {
    revision: held.revision,
  });
  let active = await cart(customer);
  let pending = await prepare(active);
  customer = await ok(`/customers/${customer.id}/archive`, 'POST', {
    revision: customer.revision,
  });
  equal(customer.status, 'ARCHIVED');
  held = await ok(`/pos/carts/${held.id}/resume`, 'POST', {
    revision: held.revision,
  });
  equal(held.customer_id, null);
  equal(held.customer_cleared, true);
  await ok(
    `/pos/carts/${held.id}/customer`,
    'PATCH',
    { revision: held.revision, customer_id: customer.id },
    undefined,
    409,
  );
  pending = await complete(pending);
  equal(pending.status, 'RECONCILIATION_REQUIRED');
  equal(pending.failure_code, 'CUSTOMER_UNAVAILABLE');
  equal(pending.sale_id, '');
  let invalid = await cart();
  await ok(
    `/pos/carts/${invalid.id}/customer`,
    'PATCH',
    { revision: invalid.revision, customer_id: customer.id },
    undefined,
    409,
  );
  equal(
    (await ok(`/customers/${customer.id}/history`)).summary.net_collected,
    '6.00',
    'archive preserves history',
  );
  equal(
    (await ok(`/customers/${customer.id}/audit`)).items.some(
      (item) => item.event_type === 'customers.archived',
    ),
    true,
  );
  await ok(
    `/customers/${customer.id}`,
    'PUT',
    { ...editable(customer), name: 'revive' },
    undefined,
    409,
  );
  await ok('/customers', 'POST', { code: 'NO-CSRF' }, undefined, 403, owner, {
    'X-CSRF-Token': '',
  });
  await ok(
    '/customers',
    'POST',
    { code: 'BAD-ORIGIN' },
    undefined,
    403,
    owner,
    { Origin: 'https://untrusted.example' },
  );
  equal(
    authSQL(
      `BEGIN;SET LOCAL ROLE smartpos_runtime;SELECT count(*) FROM customers;ROLLBACK;`,
    )
      .split('\n')
      .includes('0'),
    true,
    'RLS no context',
  );
  equal(
    authSQL(
      `BEGIN;SET LOCAL ROLE smartpos_runtime;SELECT set_config('app.organization_id','${org}',true);SELECT count(*) FROM customers WHERE id='${foreign.data.id}';ROLLBACK;`,
    )
      .split('\n')
      .includes('0'),
    true,
    'runtime cross tenant',
  );
  const audit = authSQL(
    `SELECT count(*) FROM organization_audit_events WHERE organization_id='${org}' AND (to_jsonb(organization_audit_events)::text LIKE '%private acceptance notes%' OR to_jsonb(organization_audit_events)::text LIKE '%customer@example.test%')`,
  );
  equal(audit, '0', 'audit excludes PII');
  console.log(`Customers flow PASS ${assertions} assertions`);
} finally {
  fixture.close();
}
