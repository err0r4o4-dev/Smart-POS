import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { purchasingFixture } from './purchasing-fixtures.mjs';
import {
  inventoryAccount,
  inventoryMembership,
} from './inventory-fixtures.mjs';
import { authSQL } from './auth-fixtures.mjs';

let assertions = 0;
const equal = (actual, expected, label) => {
  assert.equal(actual, expected, label);
  assertions++;
};
const fixture = await purchasingFixture();
const {
  call,
  org,
  branch,
  supplier,
  variant,
  variant2,
  warehouse,
  shelf,
  owner,
} = fixture;
const timings = [];
async function ok(
  path,
  method = 'GET',
  body,
  key,
  user = owner,
  status = method === 'POST' ? 201 : 200,
) {
  const start = performance.now();
  const result = await call(path, method, body, key, user);
  equal(result.status, status, path + ': ' + JSON.stringify(result.error));
  timings.push({ path, ms: Math.round(performance.now() - start) });
  return result.data;
}
async function act(resource, doc, action, key, user = owner) {
  return ok(
    `/purchasing/${resource}/${doc.id}/${action}`,
    'POST',
    { revision: doc.revision, reason: 'Isolated test evidence' },
    key,
    user,
    200,
  );
}
async function order(quantity, items = [[variant, quantity]]) {
  let doc = await ok('/purchasing/orders', 'POST', {
    branch_id: branch,
    supplier_id: supplier.id,
    notes: 'Isolated purchase',
    items: items.map(([item, amount]) => ({
      variant_id: item.id,
      purchase_unit_id: item.unit_id,
      quantity: amount,
      unit_cost: '12.00',
    })),
  });
  for (const action of ['submit', 'approve', 'issue'])
    doc = await act('orders', doc, action);
  return doc;
}
async function receipt(
  po,
  quantity,
  variants = [[po.items[0], quantity]],
  extras = {},
) {
  return ok('/purchasing/receipts', 'POST', {
    branch_id: branch,
    supplier_id: supplier.id,
    parent_id: po.id,
    location_id: warehouse.id,
    notes: 'Actual inspection',
    items: variants.map(([item, amount]) => ({
      variant_id: item.variant_id,
      parent_item_id: item.id,
      quantity: amount,
      delivered_quantity: amount,
      rejected_quantity: '0',
      damaged_quantity: '0',
      reason: 'Partial delivery reviewed',
      ...extras,
    })),
  });
}
async function reviewed(doc, resource = 'receipts') {
  doc = await act(resource, doc, 'submit');
  return act(resource, doc, 'approve');
}
async function stock(location, target = variant) {
  const page = await ok(
    `/inventory/balances?branch_id=${branch}&location_id=${location.id}&variant_id=${target.id}`,
  );
  return page.items[0]?.quantity ?? '0.000';
}

try {
  equal((await ok('/suppliers?search=SUP-ONE')).total, 1, 'supplier search');
  let updated = await ok(`/suppliers/${supplier.id}`, 'PATCH', {
    ...Object.fromEntries(
      [
        'code',
        'name',
        'contact_person',
        'email',
        'phone',
        'address',
        'tax_identifier',
        'notes',
        'status',
        'revision',
      ].map((key) => [key, supplier[key]]),
    ),
    name: 'Updated supplier',
  });
  equal(updated.revision, 2, 'supplier revision');
  equal(
    (
      await call(`/suppliers/${supplier.id}`, 'PATCH', {
        code: supplier.code,
        name: 'Stale',
        revision: 1,
        status: 'ACTIVE',
      })
    ).status,
    409,
    'stale supplier',
  );
  equal(
    (await ok(`/suppliers/${supplier.id}/products`)).length,
    3,
    'supplier links',
  );
  equal(
    (
      await call(`/suppliers/${supplier.id}/products`, 'POST', {
        variant_id: variant.id,
        purchase_unit_id: variant.unit_id,
        unit_cost: '1.001',
        minimum_order_quantity: '1',
        order_multiple: '1',
        lead_time_days: 3,
      })
    ).status,
    400,
    'money precision',
  );
  const cashier = await inventoryAccount(fixture.clients);
  inventoryMembership(org, cashier, 'CASHIER', [branch]);
  const buyer = await inventoryAccount(fixture.clients);
  inventoryMembership(org, buyer, 'PURCHASING_STAFF', [branch]);
  const manager = await inventoryAccount(fixture.clients);
  inventoryMembership(org, manager, 'MANAGER', [fixture.secondBranch]);
  const staff = await inventoryAccount(fixture.clients);
  inventoryMembership(org, staff, 'INVENTORY_STAFF', [branch]);
  equal(
    (await call('/suppliers', 'GET', undefined, undefined, cashier)).status,
    403,
    'cashier suppliers denial',
  );
  equal(
    (
      await call(
        `/purchasing/orders?branch_id=${branch}`,
        'GET',
        undefined,
        undefined,
        manager,
      )
    ).status,
    403,
    'cross branch list',
  );
  equal(
    (await call('/suppliers?page_size=101')).status,
    400,
    'bounded pagination',
  );
  const createInput = {
    branch_id: branch,
    supplier_id: supplier.id,
    items: [
      {
        variant_id: variant.id,
        purchase_unit_id: variant.unit_id,
        quantity: '2',
        unit_cost: '12.00',
      },
    ],
  };
  const createKey = randomUUID();
  let draft = await ok('/purchasing/orders', 'POST', createInput, createKey);
  equal(
    (await ok('/purchasing/orders', 'POST', createInput, createKey)).id,
    draft.id,
    'create replay',
  );
  equal(
    (
      await call(
        '/purchasing/orders',
        'POST',
        { ...createInput, notes: 'Different' },
        createKey,
      )
    ).status,
    409,
    'create key payload conflict',
  );
  const edit = {
    ...createInput,
    revision: draft.revision,
    notes: 'Amended draft',
  };
  const editKey = randomUUID();
  draft = await ok(`/purchasing/orders/${draft.id}`, 'PATCH', edit, editKey);
  equal(
    (await ok(`/purchasing/orders/${draft.id}`, 'PATCH', edit, editKey))
      .revision,
    draft.revision,
    'edit retry',
  );
  equal(
    (await call(`/purchasing/orders/${draft.id}`, 'PATCH', edit)).status,
    409,
    'stale draft',
  );
  draft = await act('orders', draft, 'submit');
  equal(
    (
      await call(
        `/purchasing/orders/${draft.id}/approve`,
        'POST',
        { revision: draft.revision },
        undefined,
        buyer,
      )
    ).status,
    403,
    'buyer cannot approve',
  );
  equal(
    (
      await call(
        `/purchasing/orders/${draft.id}/approve`,
        'POST',
        { revision: draft.revision },
        undefined,
        manager,
      )
    ).status,
    403,
    'cross branch approval',
  );
  draft = await act('orders', draft, 'approve');
  const issueKey = randomUUID();
  const beforeIssue = draft;
  draft = await act('orders', draft, 'issue', issueKey);
  equal(
    (await act('orders', beforeIssue, 'issue', issueKey)).id,
    draft.id,
    'issue replay',
  );
  equal(
    (
      await call(`/purchasing/orders/${draft.id}`, 'PATCH', {
        ...createInput,
        revision: draft.revision,
      })
    ).status,
    409,
    'issued terms immutable',
  );
  let po = await order('100');
  let expected = 100;
  for (const amount of ['40', '35', '25']) {
    let doc = await receipt(po, amount);
    doc = await reviewed(doc);
    const body = { revision: doc.revision, reason: 'Post accepted' };
    const postKey = randomUUID();
    doc = await ok(
      `/purchasing/receipts/${doc.id}/post`,
      'POST',
      body,
      postKey,
      staff,
      200,
    );
    equal(
      (
        await ok(
          `/purchasing/receipts/${doc.id}/post`,
          'POST',
          body,
          postKey,
          staff,
          200,
        )
      ).id,
      doc.id,
      'receipt post retry',
    );
    expected += Number(amount);
    equal(await stock(warehouse), `${expected}.000`, 'accepted stock');
    po = await ok('/purchasing/orders/' + po.id);
    equal(
      po.status,
      amount === '25' ? 'RECEIVED' : 'PARTIALLY_RECEIVED',
      'partial PO status',
    );
  }
  equal(po.items[0].accepted_quantity, '100.000', 'accepted sum');
  equal(
    (
      await call(
        `/purchasing/receipts/${(await ok('/purchasing/receipts?parent_id=' + po.id)).items[0].id}`,
        'PATCH',
        { ...createInput, revision: 1 },
      )
    ).status,
    409,
    'posted receipt immutable',
  );
  let racing = await order('30');
  const receiptA = await reviewed(await receipt(racing, '20'));
  const receiptB = await reviewed(await receipt(racing, '20'));
  const results = await Promise.all(
    [receiptA, receiptB].map((doc) =>
      call(`/purchasing/receipts/${doc.id}/post`, 'POST', {
        revision: doc.revision,
      }),
    ),
  );
  equal(
    results.filter((result) => result.status === 200).length,
    1,
    'one concurrent receipt posts',
  );
  equal(
    results.filter((result) => result.status === 409).length,
    1,
    'overreceive concurrent conflict',
  );
  equal(
    (await ok('/purchasing/orders/' + racing.id)).items[0].accepted_quantity,
    '20.000',
    'concurrent PO total',
  );
  equal(await stock(warehouse), '220.000', 'racing stock');
  const multi = await order('10', [
    [variant, '10'],
    [variant2, '10'],
  ]);
  const multiReceipt = await reviewed(
    await receipt(multi, '10', [
      [multi.items[0], '10'],
      [multi.items[1], '10'],
    ]),
  );
  const validSecond = await reviewed(
    await receipt(multi, '10', [[multi.items[1], '10']]),
  );
  await act('receipts', validSecond, 'post');
  const beforeAtomic = await stock(warehouse);
  equal(
    (
      await call(`/purchasing/receipts/${multiReceipt.id}/post`, 'POST', {
        revision: multiReceipt.revision,
      })
    ).status,
    409,
    'multi item rollback',
  );
  equal(await stock(warehouse), beforeAtomic, 'no partial stock');
  equal(
    (await ok('/purchasing/orders/' + multi.id)).items[0].accepted_quantity,
    '0.000',
    'no partial parent update',
  );
  const damagePO = await order('10');
  let damaged = await receipt(damagePO, '7', undefined, {
    delivered_quantity: '9',
    rejected_quantity: '2',
    damaged_quantity: '1',
    reason: 'One damaged, one rejected',
  });
  equal(
    (
      await call(`/purchasing/receipts/${damaged.id}/post`, 'POST', {
        revision: damaged.revision,
      })
    ).status,
    409,
    'unreviewed blocked',
  );
  damaged = await reviewed(damaged);
  damaged = await act('receipts', damaged, 'post');
  equal(
    (await ok('/purchasing/discrepancies?parent_id=' + damagePO.id)).total,
    1,
    'discrepancy evidence',
  );
  equal(
    (await ok('/purchasing/orders/' + damagePO.id)).items[0].accepted_quantity,
    '7.000',
    'rejected not accepted',
  );
  const makeReturn = () =>
    ok('/purchasing/returns', 'POST', {
      branch_id: branch,
      supplier_id: supplier.id,
      parent_id: damaged.id,
      location_id: warehouse.id,
      items: [
        {
          variant_id: variant.id,
          parent_item_id: damaged.items[0].id,
          quantity: '5',
          reason: 'Supplier-authorized damage return',
        },
      ],
    });
  const returnA = await reviewed(await makeReturn(), 'returns');
  const returnB = await reviewed(await makeReturn(), 'returns');
  const returns = await Promise.all(
    [returnA, returnB].map((doc) =>
      call(`/purchasing/returns/${doc.id}/dispatch`, 'POST', {
        revision: doc.revision,
      }),
    ),
  );
  equal(
    returns.filter((result) => result.status === 200).length,
    1,
    'single net allocation return',
  );
  equal(
    returns.filter((result) => result.status === 409).length,
    1,
    'overreturn denied',
  );
  equal(await stock(warehouse), '222.000', 'return deduction');
  const successReturn = returns.find((result) => result.status === 200).data;
  equal(
    (
      await call(`/purchasing/returns/${successReturn.id}/dispatch`, 'POST', {
        revision: successReturn.revision,
      })
    ).status,
    409,
    'return cannot repost with new key',
  );
  const caseUnit = await ok('/units', 'POST', {
    code: 'CASE24',
    name: 'Case of 24',
    unit_type: 'PACKAGING',
    base_unit_id: fixture.countUnit.id,
    conversion_factor: '24',
    status: 'ACTIVE',
    description: '',
  });
  const supplier2 = await ok('/suppliers', 'POST', {
    code: 'SUP-CASE',
    name: 'Case supplier',
  });
  await ok(`/suppliers/${supplier2.id}/products`, 'POST', {
    variant_id: variant.id,
    purchase_unit_id: caseUnit.id,
    unit_cost: '240',
    minimum_order_quantity: '1',
    order_multiple: '1',
    lead_time_days: 2,
  });
  let casePO = await ok('/purchasing/orders', 'POST', {
    branch_id: branch,
    supplier_id: supplier2.id,
    items: [
      {
        variant_id: variant.id,
        purchase_unit_id: caseUnit.id,
        quantity: '5',
        unit_cost: '240',
      },
    ],
  });
  equal(casePO.items[0].base_quantity, '120.000', 'exact conversion');
  equal(casePO.total, '1200.00', 'exact cost');
  for (const action of ['submit', 'approve', 'issue'])
    casePO = await act('orders', casePO, action);
  let caseReceipt = await ok('/purchasing/receipts', 'POST', {
    branch_id: branch,
    supplier_id: supplier2.id,
    parent_id: casePO.id,
    location_id: warehouse.id,
    items: [
      {
        variant_id: variant.id,
        parent_item_id: casePO.items[0].id,
        quantity: '5',
        delivered_quantity: '5',
        rejected_quantity: '0',
        damaged_quantity: '0',
      },
    ],
  });
  caseReceipt = await reviewed(caseReceipt);
  await act('receipts', caseReceipt, 'post');
  equal(await stock(warehouse), '342.000', 'case receipt base inventory');
  await ok(
    '/inventory/reorder-points',
    'PUT',
    {
      branch_id: branch,
      variant_id: variant.id,
      minimum_quantity: '400',
      target_quantity: '500',
      status: 'ACTIVE',
    },
    undefined,
    owner,
    200,
  );
  const suggestions = await ok('/purchasing/suggestions?branch_id=' + branch);
  equal(suggestions.total, 1, 'deterministic suggestion');
  equal(
    suggestions.items[0].current_quantity,
    '347.000',
    'eligible stock scope',
  );
  equal(suggestions.items[0].incoming_quantity, '25.000', 'outstanding only');
  equal(suggestions.items[0].suggested_quantity, '128.000', 'net requirement');
  const suggestion = suggestions.items[0];
  const suggestionDraft = await ok(
    '/purchasing/suggestions/create-draft',
    'POST',
    {
      branch_id: branch,
      supplier_id: suggestion.supplier_id,
      items: [
        {
          variant_id: suggestion.variant_id,
          purchase_unit_id: suggestion.purchase_unit_id,
          quantity: suggestion.suggested_quantity,
          unit_cost: suggestion.unit_cost,
        },
      ],
    },
  );
  equal(suggestionDraft.status, 'DRAFT', 'suggestions never auto-approve');
  equal(
    await stock(warehouse),
    '342.000',
    'draft suggestion never posts stock',
  );
  const shelved = await ok('/shelves', 'POST', {
    branch_id: branch,
    stock_location_id: shelf.id,
    code: 'A1',
    name: 'Shelf A1',
    zone: 'Front',
  });
  const slot = await ok(`/shelves/${shelved.id}/slots`, 'POST', {
    code: 'A1-1',
    position: 1,
  });
  const assignment = await ok(`/shelves/${shelved.id}/assignments`, 'POST', {
    slot_id: slot.id,
    variant_id: variant.id,
    minimum_quantity: '12',
    target_quantity: '36',
    capacity_quantity: '48',
  });
  equal(assignment.recorded_quantity, '5.000', 'ledger-derived shelf');
  equal(
    (
      await call(`/shelves/${shelved.id}/assignments`, 'POST', {
        slot_id: slot.id,
        variant_id: variant2.id,
        minimum_quantity: '12',
        target_quantity: '50',
        capacity_quantity: '48',
      })
    ).status,
    400,
    'capacity validation',
  );
  const refill = await ok(
    '/shelves/replenishments/suggestions?branch_id=' + branch,
  );
  equal(refill.items[0].suggested_quantity, '31.000', 'replenishment formula');
  const taskBody = {
    assignment_id: assignment.id,
    source_location_id: warehouse.id,
    quantity: '31',
  };
  const taskKey = randomUUID();
  let task = await ok('/shelves/replenishments', 'POST', taskBody, taskKey);
  equal(
    (await ok('/shelves/replenishments', 'POST', taskBody, taskKey)).id,
    task.id,
    'task create replay',
  );
  equal(
    (await ok('/shelves/replenishments/suggestions?branch_id=' + branch)).total,
    0,
    'suppress duplicate work',
  );
  equal(await stock(shelf), '5.000', 'task not transfer');
  task = await ok(
    `/shelves/replenishments/${task.id}/assign`,
    'POST',
    { revision: task.revision, assigned_to: staff.id },
    undefined,
    owner,
    200,
  );
  task = await ok(
    `/shelves/replenishments/${task.id}/start`,
    'POST',
    { revision: task.revision },
    undefined,
    staff,
    200,
  );
  const completeKey = randomUUID(),
    completeBody = { revision: task.revision };
  const completed = await Promise.all(
    [1, 2].map(() =>
      call(
        `/shelves/replenishments/${task.id}/complete`,
        'POST',
        completeBody,
        completeKey,
        staff,
      ),
    ),
  );
  for (const result of completed)
    equal(result.status, 200, 'duplicate completion same result');
  equal(
    completed[0].data.transfer_id,
    completed[1].data.transfer_id,
    'one native transfer',
  );
  equal(await stock(shelf), '36.000', 'shelf increase');
  equal(await stock(warehouse), '311.000', 'warehouse decrease');
  equal(
    (await call('/shelves/replenishments', 'POST', taskBody)).status,
    409,
    'no overfilling',
  );
  const cross = await purchasingFixture();
  try {
    equal(
      (await call(`/purchasing/orders/${cross.supplier.id}`)).status,
      404,
      'foreign document hidden',
    );
    equal(
      (
        await call('/purchasing/orders', 'POST', {
          ...createInput,
          supplier_id: cross.supplier.id,
        })
      ).status,
      404,
      'foreign supplier denied',
    );
    equal(
      (
        await call(`/shelves/${shelved.id}/assignments`, 'POST', {
          slot_id: slot.id,
          variant_id: cross.variant.id,
          minimum_quantity: '0',
          target_quantity: '1',
          capacity_quantity: '2',
        })
      ).status,
      404,
      'foreign variant denied',
    );
  } finally {
    cross.close();
  }
  authSQL(
    `UPDATE organization_memberships SET status='SUSPENDED' WHERE organization_id='${org}' AND user_id='${buyer.id}'`,
  );
  equal(
    (await call('/purchasing/orders', 'POST', createInput, undefined, buyer))
      .status,
    404,
    'revoked membership',
  );
  equal(
    authSQL(
      `SELECT count(*) FROM (SELECT location_id,variant_id,sum(quantity_delta) quantity FROM stock_movements WHERE organization_id='${org}' GROUP BY location_id,variant_id) ledger JOIN stock_balances balance ON balance.organization_id='${org}' AND balance.location_id=ledger.location_id AND balance.variant_id=ledger.variant_id WHERE balance.quantity<>ledger.quantity`,
    ),
    '0',
    'ledger balance reconciliation',
  );
  console.log(
    `Phase 4 purchasing/shelves: ${assertions} assertions passed; concurrency receipt/return/task gates passed`,
  );
  console.log(
    'Representative local latency (ms):',
    JSON.stringify(
      timings.filter((item) =>
        /suppliers\?|\/post$|\/complete$|suggestions/.test(item.path),
      ),
    ),
  );
} finally {
  fixture.close();
}
