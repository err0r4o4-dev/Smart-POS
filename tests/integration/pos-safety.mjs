import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { authSQL } from './auth-fixtures.mjs';
import {
  inventoryAccount,
  inventoryMembership,
} from './inventory-fixtures.mjs';
import { posFixture } from './pos-fixtures.mjs';

const fixture = await posFixture();
const {
  call,
  org,
  owner,
  branch,
  secondBranch,
  terminal,
  shelf,
  shelf2,
  variant,
  variant2,
} = fixture;
let assertions = 0;
const equal = (actual, expected, label) => {
  assert.equal(actual, expected, label);
  assertions++;
};
async function ok(
  path,
  method = 'GET',
  body,
  status = method === 'POST' ? 201 : 200,
) {
  const result = await call(path, method, body);
  equal(result.status, status, path + ': ' + JSON.stringify(result.error));
  return result.data;
}
async function cart(item = variant2, quantity = '1') {
  const created = await ok('/pos/carts', 'POST', { terminal_id: terminal.id });
  return ok('/pos/carts/' + created.id, 'PATCH', {
    revision: created.revision,
    items: [{ variant_id: item.id, quantity }],
  });
}
async function confirmed(value) {
  const prepared = await ok('/pos/checkout', 'POST', {
    cart_id: value.id,
    revision: value.revision,
    method: 'CASH',
    expected_total: value.total,
    received: value.total,
  });
  return ok(
    `/pos/payments/${prepared.id}/confirm`,
    'POST',
    { acknowledged: true },
    200,
  );
}
async function complete(value) {
  return ok(`/pos/checkouts/${value.id}/complete`, 'POST', {}, 200);
}
async function approved(resource, value) {
  for (const action of ['submit', 'approve'])
    value = await ok(
      `/inventory/${resource}/${value.id}/${action}`,
      'POST',
      { revision: value.revision },
      200,
    );
  return value;
}
const changePrice = (amount) =>
  authSQL(
    `UPDATE product_variants SET selling_price=${amount} WHERE organization_id='${org}' AND id='${variant2.id}';`,
  );
try {
  for (const type of ['QUARANTINE', 'DAMAGED']) {
    const location = await ok('/inventory/locations', 'POST', {
      branch_id: branch,
      code: type,
      name: type,
      type,
      parent_location_id: null,
      status: 'ACTIVE',
      description: '',
    });
    equal(
      (
        await call('/pos/terminals', 'POST', {
          branch_id: branch,
          code: type,
          name: type,
          stock_location_id: location.id,
        })
      ).status,
      409,
      'non-saleable stock source ' + type,
    );
  }
  equal(
    (
      await call('/pos/terminals', 'POST', {
        branch_id: secondBranch,
        code: 'CROSS-BRANCH',
        name: 'Invalid',
        stock_location_id: shelf.id,
      })
    ).status,
    409,
    'terminal source must belong to same branch',
  );
  const shift = await ok('/pos/shifts/open', 'POST', {
    terminal_id: terminal.id,
    opening_cash: '0.00',
  });
  equal(
    (
      await call('/pos/terminals/' + terminal.id, 'PATCH', {
        ...terminal,
        id: undefined,
        revision: terminal.revision,
        stock_location_id: shelf2.id,
      })
    ).status,
    409,
    'cannot change stock source during open shift',
  );
  equal(
    authSQL(
      `DO $$ BEGIN BEGIN UPDATE product_variants SET selling_price=0 WHERE organization_id='${org}' AND id='${variant2.id}'; RAISE EXCEPTION 'zero price accepted'; EXCEPTION WHEN check_violation THEN NULL; END; END $$; SELECT 'ZERO_PRICE_BLOCKED';`,
    ),
    'DO\nZERO_PRICE_BLOCKED',
    'catalog already rejects zero selling price at persistence boundary',
  );
  let count = await ok('/inventory/counts', 'POST', {
    location_id: shelf.id,
    reason_code: 'POS_SAFETY',
    notes: '',
    items: [{ variant_id: variant2.id, quantity: '0' }],
  });
  count = await ok(`/inventory/counts/${count.id}/items`, 'PATCH', {
    revision: count.revision,
    items: [{ variant_id: variant2.id, counted_quantity: '4' }],
  });
  count = await approved('counts', count);
  const first = await complete(await confirmed(await cart()));
  equal(first.status, 'COMPLETED', 'sale before count posting');
  equal(
    (
      await call(`/inventory/counts/${count.id}/post`, 'POST', {
        revision: count.revision,
      })
    ).status,
    409,
    'sale invalidates physical count snapshot',
  );

  let transfer = await ok('/inventory/transfers', 'POST', {
    location_id: shelf.id,
    destination_location_id: shelf2.id,
    reason_code: 'POS_SAFETY',
    notes: '',
    items: [{ variant_id: variant.id, quantity: '3' }],
  });
  transfer = await approved('transfers', transfer);
  const raceIntent = await confirmed(await cart(variant, '4'));
  const [saleRace, transferRace] = await Promise.all([
    complete(raceIntent),
    call(`/inventory/transfers/${transfer.id}/dispatch`, 'POST', {
      revision: transfer.revision,
    }),
  ]);
  equal(
    Number(saleRace.status === 'COMPLETED') +
      Number(transferRace.status === 200),
    1,
    'checkout and transfer cannot both oversell',
  );
  if (saleRace.status !== 'COMPLETED') {
    equal(
      saleRace.failure_code,
      'INSUFFICIENT_STOCK',
      'transfer winning retains funds evidence',
    );
    await ok(
      `/pos/checkouts/${saleRace.id}/resolve`,
      'POST',
      {
        acknowledged: true,
        note: 'Verified manual funds disposition after transfer race',
      },
      200,
    );
  }
  const balance = await ok(
    `/inventory/balances?location_id=${shelf.id}&variant_id=${variant.id}`,
  );
  equal(
    balance.items[0].quantity,
    saleRace.status === 'COMPLETED' ? '1.000' : '2.000',
    'race stock has no lost update',
  );

  let held = await cart();
  held = await ok(
    `/pos/carts/${held.id}/hold`,
    'POST',
    { revision: held.revision },
    200,
  );
  changePrice('3.00');
  held = await ok(
    `/pos/carts/${held.id}/resume`,
    'POST',
    { revision: held.revision },
    200,
  );
  equal(held.review_required, true, 'held price revalidation');
  equal(held.items[0].previous_price, '2.00', 'old quote visible');
  equal(
    (
      await call('/pos/checkout', 'POST', {
        cart_id: held.id,
        revision: held.revision,
        method: 'CASH',
        expected_total: held.total,
        received: held.total,
      })
    ).status,
    409,
    'unaccepted price blocks collection',
  );
  held = await ok(`/pos/carts/${held.id}`, 'PATCH', {
    revision: held.revision,
    items: [{ variant_id: variant2.id, quantity: '1' }],
  });
  const priceIntent = await confirmed(held);
  changePrice('4.00');
  const changed = await complete(priceIntent);
  equal(
    changed.status,
    'RECONCILIATION_REQUIRED',
    'price change after funds confirmation',
  );
  equal(changed.failure_code, 'PRICE_CHANGED', 'price conflict explicit');
  await ok(
    `/pos/checkouts/${changed.id}/resolve`,
    'POST',
    { acknowledged: true, note: 'Verified manual resolution for stale price' },
    200,
  );
  changePrice('2.00');
  const sale = await ok('/sales/' + first.sale_id);
  equal(
    sale.items[0].unit_price,
    '2.00',
    'receipt price immutable after catalog change',
  );
  authSQL(
    `UPDATE units SET status='INACTIVE' WHERE organization_id='${org}' AND id='${variant2.unit_id}';`,
  );
  const inactive = await ok(
    `/pos/barcodes/POS-TEST-001?terminal_id=${terminal.id}`,
  );
  equal(inactive.items[0].saleable, false, 'inactive unit blocks sale');
  authSQL(
    `UPDATE units SET status='ACTIVE' WHERE organization_id='${org}' AND id='${variant2.unit_id}';`,
  );

  const raceCloseIntent = await confirmed(await cart());
  const [closingSale, closingShift] = await Promise.all([
    complete(raceCloseIntent),
    call(`/pos/shifts/${shift.id}/close`, 'POST', { counted_cash: '0.00' }),
  ]);
  equal(
    closingSale.status,
    'COMPLETED',
    'pending settlement cannot be closed out',
  );
  assert.ok([200, 409].includes(closingShift.status));
  assertions++;
  const closed =
    closingShift.status === 200
      ? closingShift.data
      : await ok(
          `/pos/shifts/${shift.id}/close`,
          'POST',
          { counted_cash: '0.00' },
          200,
        );
  equal(closed.status, 'CLOSED', 'close eventually succeeds');
  equal(
    closed.cash_sales,
    saleRace.status === 'COMPLETED' ? '12.00' : '4.00',
    'close includes every committed cash sale',
  );
  equal(
    (await complete(raceCloseIntent)).sale_id,
    closingSale.sale_id,
    'completed retry works after shift closes',
  );
  equal(
    (await call(`/pos/carts/${randomUUID()}`)).status,
    404,
    'foreign object ID hidden',
  );
  const other = await inventoryAccount(fixture.clients);
  inventoryMembership(org, other, 'CASHIER', [branch]);
  authSQL(
    `UPDATE organization_memberships SET status='SUSPENDED' WHERE organization_id='${org}' AND user_id='${other.id}';`,
  );
  equal(
    (await call('/pos/terminals', 'GET', undefined, undefined, other)).status,
    404,
    'suspended membership immediate and tenant hidden',
  );
  authSQL(
    `UPDATE auth_sessions SET revoked_at=now() WHERE user_id='${other.id}';`,
  );
  equal(
    (await call('/pos/terminals', 'GET', undefined, undefined, other)).status,
    401,
    'revoked session immediate',
  );

  const result =
    authSQL(`BEGIN; SET LOCAL ROLE smartpos_runtime; SELECT set_config('app.organization_id','${org}',true); DO $$ BEGIN
    BEGIN INSERT INTO sale_items(organization_id,sale_id,variant_id,stock_location_id,branch_id,product_name,variant_name,sku,barcode,unit,quantity,unit_price,line_total) SELECT organization_id,sale_id,variant_id,stock_location_id,branch_id,product_name,variant_name,sku,barcode,unit,quantity,unit_price,line_total FROM sale_items WHERE sale_id='${first.sale_id}'; RAISE EXCEPTION 'append guard absent'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
    BEGIN INSERT INTO pos_terminals(organization_id,branch_id,code,name,stock_location_id) VALUES('${org}','${secondBranch}','INVALID-FK','Invalid','${shelf.id}'); RAISE EXCEPTION 'composite FK absent'; EXCEPTION WHEN foreign_key_violation THEN NULL; END;
    BEGIN UPDATE sales SET grand_total=0 WHERE id='${first.sale_id}'; RAISE EXCEPTION 'immutable grant absent'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END $$; SELECT 'POS_SQL_PASS'; ROLLBACK;`);
  assert.ok(result.includes('POS_SQL_PASS'));
  assertions++;
  equal(
    authSQL(
      `SELECT count(*) FROM stock_balances balance WHERE organization_id='${org}' AND (balance.quantity<0 OR balance.quantity<>(SELECT sum(movement.quantity_delta) FROM stock_movements movement WHERE movement.organization_id=balance.organization_id AND movement.location_id=balance.location_id AND movement.variant_id=balance.variant_id))`,
    ),
    '0',
    'ledger reconciliation and nonnegative balances',
  );
  console.log(
    `PASS: POS safety (${assertions} assertions): count/transfer/shift races, price/unit changes, snapshot immutability, suspension/revocation, append/FK guards and ledger reconciliation`,
  );
} finally {
  fixture.close();
}
