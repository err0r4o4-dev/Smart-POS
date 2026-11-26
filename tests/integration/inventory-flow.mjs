import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { authSQL } from './auth-fixtures.mjs';
import {
  inventoryFixture,
  inventoryCall,
  inventoryAccount,
  inventoryMembership,
} from './inventory-fixtures.mjs';

let assertions = 0;
function equal(actual, expected, label) {
  assert.equal(actual, expected, label);
  assertions++;
}
const fixture = await inventoryFixture();
const {
  owner,
  org,
  branch,
  secondBranch,
  inventory,
  warehouse,
  shelf,
  shelf2,
  destination,
  variant,
  variant2,
  weightVariant,
} = fixture;
const body = (location, items, extras = {}) => ({
  location_id: location.id,
  reason_code: 'TEST',
  notes: 'Inventory verification',
  items: items.map(([item, quantity]) => ({ variant_id: item.id, quantity })),
  ...extras,
});
async function call(path, method = 'GET', input, key, user = owner) {
  return inventoryCall(user, inventory + path, method, input, key);
}
async function create(resource, input, user = owner) {
  const result = await call('/' + resource, 'POST', input, undefined, user);
  equal(
    result.status,
    201,
    resource + ' create: ' + JSON.stringify(result.error),
  );
  return result.data;
}
async function action(resource, doc, step, key, user = owner) {
  const result = await call(
    `/${resource}/${doc.id}/${step}`,
    'POST',
    { revision: doc.revision },
    key,
    user,
  );
  equal(
    result.status,
    200,
    `${resource} ${step}: ${JSON.stringify(result.error)}`,
  );
  return result.data;
}
async function approved(resource, doc) {
  doc = await action(resource, doc, 'submit');
  return action(resource, doc, 'approve');
}
async function balance(location, item = variant) {
  const result = await call(
    `/balances?location_id=${location.id}&variant_id=${item.id}`,
  );
  equal(result.status, 200, 'balance read');
  return result.data.items[0]?.quantity ?? '0.000';
}
async function transfer(quantity, from = warehouse, to = shelf, items) {
  return create(
    'transfers',
    body(from, items ?? [[variant, quantity]], {
      destination_location_id: to.id,
    }),
  );
}
try {
  const opening = body(warehouse, [
    [variant, '10'],
    [variant2, '5'],
    [weightVariant, '1.125'],
  ]);
  const key = randomUUID();
  const first = await call('/opening-balances', 'POST', opening, key);
  equal(first.status, 201, 'opening');
  equal(
    (await call('/opening-balances', 'POST', opening, key)).data.id,
    first.data.id,
    'opening retry',
  );
  equal(
    (
      await call(
        '/opening-balances',
        'POST',
        { ...opening, reason_code: 'DIFFERENT' },
        key,
      )
    ).status,
    409,
    'fingerprint conflict',
  );
  equal(
    (await call('/opening-balances', 'POST', opening)).status,
    409,
    'opening history',
  );
  equal(await balance(warehouse), '10.000', 'initial quantity');
  equal(
    (await call('/opening-balances', 'POST', body(shelf, [[variant, '0.1']])))
      .status,
    400,
    'fractional discrete',
  );
  equal(
    (
      await call('/locations/' + warehouse.id, 'PATCH', {
        ...warehouse,
        status: 'INACTIVE',
      })
    ).status,
    400,
    'unknown fields reject',
  );
  const competing = await Promise.all([
    transfer('8', warehouse, shelf),
    transfer('7', warehouse, shelf2),
  ]);
  const approvedTransfers = [];
  for (const doc of competing)
    approvedTransfers.push(await approved('transfers', doc));
  const outcomes = await Promise.all(
    approvedTransfers.map((doc) =>
      call(`/transfers/${doc.id}/dispatch`, 'POST', { revision: doc.revision }),
    ),
  );
  equal(
    outcomes.filter((item) => item.status === 200).length,
    1,
    'only funded transfer succeeds',
  );
  equal(
    outcomes.filter((item) => item.status === 409).length,
    1,
    'oversell conflict',
  );
  const successful = outcomes.find((item) => item.status === 200).data;
  equal(successful.status, 'RECEIVED', 'same branch immediate');
  equal(
    authSQL(
      `SELECT sum(quantity)::text FROM stock_balances WHERE organization_id='${org}' AND variant_id='${variant.id}';`,
    ),
    '10.000',
    'same branch conservation',
  );
  const failed = await approved(
    'transfers',
    await transfer('1', warehouse, shelf, [
      [variant2, '1'],
      [weightVariant, '50'],
    ]),
  );
  const ledgerBefore = authSQL(
    `SELECT count(*) FROM stock_movements WHERE organization_id='${org}';`,
  );
  equal(
    (
      await call(`/transfers/${failed.id}/dispatch`, 'POST', {
        revision: failed.revision,
      })
    ).status,
    409,
    'multi item failure',
  );
  equal(
    authSQL(
      `SELECT count(*) FROM stock_movements WHERE organization_id='${org}';`,
    ),
    ledgerBefore,
    'no partial ledger',
  );
  equal(await balance(warehouse, variant2), '5.000', 'no partial deduction');
  let adjustment = await approved(
    'adjustments',
    await create(
      'adjustments',
      body(warehouse, [[variant, '20']], { adjustment_type: 'INCREASE' }),
    ),
  );
  const adjustmentKey = randomUUID();
  const adjustmentRequest = { revision: adjustment.revision };
  const posted = await call(
    `/adjustments/${adjustment.id}/post`,
    'POST',
    adjustmentRequest,
    adjustmentKey,
  );
  equal(posted.status, 200, 'adjustment');
  equal(
    (
      await call(
        `/adjustments/${adjustment.id}/post`,
        'POST',
        adjustmentRequest,
        adjustmentKey,
      )
    ).data.id,
    posted.data.id,
    'adjustment retry',
  );
  equal(
    (
      await call(
        `/adjustments/${adjustment.id}/post`,
        'POST',
        adjustmentRequest,
      )
    ).status,
    409,
    'adjustment repost denied',
  );
  const concurrent = [];
  for (const quantity of ['2', '3'])
    concurrent.push(
      await approved(
        'adjustments',
        await create(
          'adjustments',
          body(warehouse, [[variant, quantity]], {
            adjustment_type: 'INCREASE',
          }),
        ),
      ),
    );
  const pre = BigInt((await balance(warehouse)).split('.')[0]);
  const adjustments = await Promise.all(
    concurrent.map((doc) =>
      call(`/adjustments/${doc.id}/post`, 'POST', { revision: doc.revision }),
    ),
  );
  adjustments.forEach((item) =>
    equal(item.status, 200, 'concurrent adjustment'),
  );
  equal(await balance(warehouse), `${pre + 5n}.000`, 'no lost adjustment');
  let count = await create('counts', body(warehouse, [[variant, '0']]));
  const expected = count.items[0].expected_quantity;
  let save = await call(`/counts/${count.id}/items`, 'PATCH', {
    revision: count.revision,
    items: [{ variant_id: variant.id, counted_quantity: '18' }],
  });
  equal(save.status, 200, 'save physical');
  count = save.data;
  equal(await balance(warehouse), expected, 'count entry not stock');
  count = await approved('counts', count);
  count = await action('counts', count, 'post');
  equal(
    count.items[0].variance,
    `${18n - BigInt(expected.split('.')[0])}.000`,
    'variance',
  );
  equal(await balance(warehouse), '18.000', 'count correction');
  let stale = await create('counts', body(warehouse, [[variant, '0']]));
  save = await call(`/counts/${stale.id}/items`, 'PATCH', {
    revision: stale.revision,
    items: [{ variant_id: variant.id, counted_quantity: '17' }],
  });
  equal(save.status, 200, 'stale evidence saved');
  stale = await approved('counts', save.data);
  const move = await approved('transfers', await transfer('1'));
  await action('transfers', move, 'dispatch');
  equal(
    (
      await call(`/counts/${stale.id}/post`, 'POST', {
        revision: stale.revision,
      })
    ).status,
    409,
    'stale snapshot denied',
  );
  equal(await balance(warehouse), '17.000', 'stale count preserves transfer');
  let correction = await approved(
    'adjustments',
    await create(
      'adjustments',
      body(warehouse, [[variant, '16']], { adjustment_type: 'CORRECTION' }),
    ),
  );
  await action('adjustments', correction, 'post');
  equal(await balance(warehouse), '16.000', 'absolute correction');
  const organizationTotal = authSQL(
    `SELECT sum(quantity)::text FROM stock_balances WHERE organization_id='${org}' AND variant_id='${variant.id}';`,
  );
  let inter = await approved(
    'transfers',
    await transfer('4', warehouse, destination),
  );
  const dispatchKey = randomUUID(),
    dispatchBody = { revision: inter.revision };
  const dispatch = await call(
    `/transfers/${inter.id}/dispatch`,
    'POST',
    dispatchBody,
    dispatchKey,
  );
  equal(dispatch.status, 200, 'inter dispatch');
  inter = dispatch.data;
  equal(inter.status, 'DISPATCHED', 'transit status');
  equal(
    (
      await call(
        `/transfers/${inter.id}/dispatch`,
        'POST',
        dispatchBody,
        dispatchKey,
      )
    ).data.id,
    inter.id,
    'dispatch retry',
  );
  equal(
    (
      await call(`/transfers/${inter.id}/cancel`, 'POST', {
        revision: inter.revision,
      })
    ).status,
    409,
    'cannot cancel transit',
  );
  equal(
    await balance({ id: inter.transit_location_id }),
    '4.000',
    'transit recorded',
  );
  const receiveKey = randomUUID(),
    receiveBody = { revision: inter.revision };
  const received = await Promise.all([
    call(`/transfers/${inter.id}/receive`, 'POST', receiveBody, receiveKey),
    call(`/transfers/${inter.id}/receive`, 'POST', receiveBody, receiveKey),
  ]);
  received.forEach((item) =>
    equal(item.status, 200, 'simultaneous receipt retry'),
  );
  equal(await balance(destination), '4.000', 'credit once');
  equal(
    await balance({ id: inter.transit_location_id }),
    '0.000',
    'transit consumed',
  );
  equal(
    authSQL(
      `SELECT sum(quantity)::text FROM stock_balances WHERE organization_id='${org}' AND variant_id='${variant.id}';`,
    ),
    organizationTotal,
    'transfer conserves count-adjusted organization stock',
  );
  equal(
    (
      await call('/reorder-points', 'PUT', {
        branch_id: branch,
        variant_id: variant.id,
        minimum_quantity: '30',
        target_quantity: '40',
        status: 'ACTIVE',
      })
    ).status,
    200,
    'threshold',
  );
  const thresholds = await call('/reorder-points');
  equal(thresholds.status, 200, 'threshold query');
  equal(thresholds.data.items[0].below_minimum, true, 'below minimum');
  equal((await call('/overview')).status, 200, 'overview');
  equal(
    (await call('/balances?page_size=1&page=2')).data.items.length,
    1,
    'pagination',
  );
  equal((await call('/movements')).status, 200, 'immutable history');
  equal(
    (
      await call(
        '/opening-balances',
        'POST',
        body(warehouse, [[variant, '1']], { branch_id: secondBranch }),
      )
    ).status,
    400,
    'forged opening branch denied',
  );
  equal(
    (
      await inventoryCall(
        owner,
        inventory + '/opening-balances',
        'POST',
        body(warehouse, [[variant, '1']]),
        undefined,
        { 'Idempotency-Key': '' },
      )
    ).status,
    400,
    'missing idempotency key denied',
  );
  equal(
    (
      await call('/opening-balances', 'POST', {
        ...body(warehouse, [[variant, '1']]),
        unsupported: true,
      })
    ).status,
    400,
    'unknown command fields denied',
  );
  const currentWarehouse = (await call('/locations/' + warehouse.id)).data;
  const locationInput = {
    branch_id: branch,
    code: currentWarehouse.code,
    name: currentWarehouse.name,
    type: currentWarehouse.type,
    status: 'ACTIVE',
    description: '',
    parent_location_id: null,
    revision: currentWarehouse.revision,
  };
  equal(
    (
      await call('/locations/' + warehouse.id, 'PATCH', {
        ...locationInput,
        status: 'INACTIVE',
      })
    ).status,
    409,
    'location with stock cannot deactivate',
  );
  equal(
    (
      await call('/locations/' + warehouse.id, 'PATCH', {
        ...locationInput,
        type: 'SHELF',
      })
    ).status,
    409,
    'location type immutable after history',
  );
  equal(
    (
      await call('/locations/' + warehouse.id, 'PATCH', {
        ...locationInput,
        parent_location_id: shelf.id,
      })
    ).status,
    409,
    'hierarchy cycle denied',
  );
  equal(
    (
      await call('/locations/' + warehouse.id, 'PATCH', {
        ...locationInput,
        parent_location_id: destination.id,
      })
    ).status,
    400,
    'cross branch parent denied',
  );
  const scopedOverview = await call('/overview?branch_id=' + branch);
  equal(
    scopedOverview.data.alerts.active_variants,
    3,
    'real active variant overview',
  );
  equal(
    scopedOverview.data.alerts.low_stock_variants,
    1,
    'real low-stock overview',
  );
  equal(
    scopedOverview.data.recent_movements.length > 0,
    true,
    'recent real ledger overview',
  );
  const manager = await inventoryAccount(fixture.clients);
  inventoryMembership(org, manager, 'MANAGER', [branch]);
  equal(
    (
      await call(
        '/balances?branch_id=' + branch,
        'GET',
        undefined,
        undefined,
        manager,
      )
    ).status,
    200,
    'assigned manager read',
  );
  equal(
    (
      await call(
        '/balances?branch_id=' + secondBranch,
        'GET',
        undefined,
        undefined,
        manager,
      )
    ).status,
    403,
    'manager branch restriction',
  );
  equal(
    (
      await call(
        '/adjustments',
        'POST',
        body(destination, [[variant, '1']], { adjustment_type: 'INCREASE' }),
        undefined,
        manager,
      )
    ).status,
    403,
    'manager cannot mutate unassigned stock',
  );
  const cashier = await inventoryAccount(fixture.clients);
  inventoryMembership(org, cashier, 'CASHIER', [branch]);
  equal(
    (
      await call(
        '/overview?branch_id=' + branch,
        'GET',
        undefined,
        undefined,
        cashier,
      )
    ).data.recent_movements.length,
    0,
    'cashier overview does not expose audit ledger',
  );
  equal(
    (await call('/balances', 'GET', undefined, undefined, cashier)).status,
    200,
    'cashier limited read',
  );
  equal(
    (
      await call(
        '/adjustments',
        'POST',
        body(warehouse, [[variant, '1']], { adjustment_type: 'INCREASE' }),
        undefined,
        cashier,
      )
    ).status,
    403,
    'cashier adjustment denied',
  );
  equal(
    (
      await call(
        `/balances?branch_id=${secondBranch}`,
        'GET',
        undefined,
        undefined,
        cashier,
      )
    ).status,
    403,
    'unauthorized branch',
  );
  equal(
    (
      await call(
        '/locations/' + destination.id,
        'GET',
        undefined,
        undefined,
        cashier,
      )
    ).status,
    403,
    'IDOR branch',
  );
  const staff = await inventoryAccount(fixture.clients);
  inventoryMembership(org, staff, 'INVENTORY_STAFF', [branch]);
  const request = await create(
    'adjustments',
    body(warehouse, [[variant, '1']], { adjustment_type: 'INCREASE' }),
    staff,
  );
  const submitted = await action(
    'adjustments',
    request,
    'submit',
    undefined,
    staff,
  );
  equal(
    (
      await call(
        `/adjustments/${submitted.id}/approve`,
        'POST',
        { revision: submitted.revision },
        undefined,
        staff,
      )
    ).status,
    403,
    'staff approval denied',
  );
  equal(
    (
      await call(
        '/opening-balances',
        'POST',
        body(shelf2, [[variant, '1']]),
        undefined,
        staff,
      )
    ).status,
    403,
    'staff opening denied',
  );
  equal(
    (
      await call(
        '/transfers',
        'POST',
        body(warehouse, [[variant, '1']], {
          destination_location_id: destination.id,
        }),
        undefined,
        staff,
      )
    ).status,
    403,
    'transfer needs both branches',
  );
  const receiver = await inventoryAccount(fixture.clients);
  inventoryMembership(org, receiver, 'INVENTORY_STAFF', [secondBranch]);
  let receiveOnly = await approved(
    'transfers',
    await transfer('1', warehouse, destination),
  );
  receiveOnly = await action('transfers', receiveOnly, 'dispatch');
  equal(
    (
      await call(
        `/transfers/${receiveOnly.id}`,
        'GET',
        undefined,
        undefined,
        receiver,
      )
    ).status,
    200,
    'destination participant detail',
  );
  await action('transfers', receiveOnly, 'receive', undefined, receiver);
  equal(
    (
      await call(
        `/balances?branch_id=${branch}`,
        'GET',
        undefined,
        undefined,
        receiver,
      )
    ).status,
    403,
    'receiver cannot browse source',
  );
  const stranger = await inventoryAccount(fixture.clients);
  for (const resource of [
    'locations',
    'balances',
    'movements',
    'counts',
    'adjustments',
    'transfers',
    'reorder-points',
  ])
    equal(
      (await call('/' + resource, 'GET', undefined, undefined, stranger))
        .status,
      404,
      'cross tenant ' + resource,
    );
  equal(
    (
      await inventoryCall(
        owner,
        inventory + '/opening-balances',
        'POST',
        body(shelf, [[variant, '1']]),
        undefined,
        { 'X-CSRF-Token': 'wrong' },
      )
    ).status,
    403,
    'CSRF',
  );
  authSQL(
    `UPDATE organization_memberships SET status='SUSPENDED' WHERE organization_id='${org}' AND user_id='${staff.id}';`,
  );
  equal(
    (await call('/balances', 'GET', undefined, undefined, staff)).status,
    404,
    'suspended denied',
  );
  equal(
    authSQL(
      `SELECT count(*) FROM stock_balances balance LEFT JOIN (SELECT organization_id,location_id,variant_id,sum(quantity_delta) quantity FROM stock_movements WHERE organization_id='${org}' GROUP BY organization_id,location_id,variant_id) ledger USING(organization_id,location_id,variant_id) WHERE balance.organization_id='${org}' AND balance.quantity<>COALESCE(ledger.quantity,0);`,
    ),
    '0',
    'ledger reconciliation',
  );
  equal(
    (
      await inventoryCall(
        owner,
        fixture.base + '/branches/' + secondBranch,
        'PATCH',
        {
          name: 'Second',
          code: 'SECOND',
          address: '',
          phone: '',
          email: '',
          status: 'INACTIVE',
        },
      )
    ).status,
    200,
    'inactive branch fixture',
  );
  const inactiveBalances = await call('/balances?branch_id=' + secondBranch);
  equal(
    inactiveBalances.status,
    200,
    'owner may inspect historical inactive branch stock',
  );
  equal(
    inactiveBalances.data.items.every(
      (item) =>
        item.available === '0.000' && item.availability_status === 'RESTRICTED',
    ),
    true,
    'inactive branch stock never eligible',
  );
  equal(
    (
      await call(
        '/adjustments',
        'POST',
        body(destination, [[variant, '1']], { adjustment_type: 'INCREASE' }),
      )
    ).status,
    409,
    'inactive branch mutation denied',
  );
  console.log(
    `PASS: ${assertions} inventory assertions through real Caddy/PostgreSQL, concurrency, idempotency, counts, transfers, branch/RBAC and reconciliation`,
  );
} finally {
  fixture.close();
}
