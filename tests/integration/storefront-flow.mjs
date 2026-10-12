import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { authOrigin, authSQL } from './auth-fixtures.mjs';
import {
  inventoryAccount,
  inventoryMembership,
} from './inventory-fixtures.mjs';
import { posFixture } from './pos-fixtures.mjs';

let assertions = 0;
const equal = (actual, expected, label) => {
  assert.deepEqual(actual, expected, label);
  assertions++;
};
const fixture = await posFixture();
const {
  call,
  owner,
  org,
  branch,
  secondBranch,
  terminal,
  variant,
  variant2,
  shelf,
  clients,
} = fixture;
const slug = `test-${randomUUID().slice(0, 12)}`;
const root = `/api/v1/storefronts/${slug}`;
async function ok(
  path,
  method = 'GET',
  body,
  key,
  user = owner,
  status = method === 'POST' ? 201 : 200,
) {
  const result = await call(path, method, body, key, user);
  equal(result.status, status, path + ': ' + JSON.stringify(result.error));
  return result.data;
}
async function guest(path = '', body, key, origin = authOrigin) {
  const response = await fetch(owner.source.proxy + root + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      Origin: origin,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(key ? { 'Idempotency-Key': key } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, ...(await response.json()) };
}
const items = [{ variant_id: variant.id, quantity: '1.000' }];
const stock = async () =>
  (
    await ok(
      `/inventory/balances?location_id=${shelf.id}&variant_id=${variant.id}`,
    )
  ).items[0].quantity;
async function order() {
  const quote = await guest('/quote', { items });
  equal(quote.status, 200, 'guest quote');
  const id = randomUUID(),
    token = randomBytes(32).toString('hex');
  const body = {
    items,
    quote_id: quote.data.quote_id,
    customer_name: 'Guest test',
    contact_phone: '0812345678',
    customer_note: 'Pickup only',
    access_token: token,
  };
  const result = await guest('/orders', body, id);
  equal(result.status, 201, 'guest order: ' + JSON.stringify(result.error));
  return { id, token, body, data: result.data };
}
async function transition(value, status, message = '') {
  return ok(
    `/online-orders/${value.id}/status`,
    'POST',
    { status, message, revision: value.revision },
    undefined,
    owner,
    200,
  );
}
try {
  equal((await guest()).status, 404, 'unpublished store absent');
  let settings = await ok('/storefront', 'PUT', {
    slug,
    name: 'Pickup fixture',
    description: '',
    contact_phone: '021234567',
    pickup_instructions: 'Main counter',
    terminal_id: terminal.id,
    published: true,
    accepting_orders: true,
    revision: 0,
  });
  equal((await guest('/products')).data.items.length, 0, 'opt-in publication');
  await ok(`/storefront/products/${variant.id}`, 'PUT', {
    published: true,
    revision: settings.revision,
  });
  settings = await ok('/storefront');
  const catalog = await guest('/products');
  equal(catalog.status, 200, 'public catalog');
  equal(
    catalog.data.items.map((item) => item.variant_id),
    [variant.id],
    'only published variant',
  );
  equal(catalog.data.items[0].unit_price, '2.00', 'exact public price');
  equal(
    (
      await guest('/quote', {
        items: [{ variant_id: variant.id, quantity: '6.000' }],
      })
    ).status,
    409,
    'insufficient source stock',
  );
  equal(
    (
      await guest('/quote', {
        items: [{ variant_id: variant2.id, quantity: '1' }],
      })
    ).status,
    409,
    'unpublished variant denied',
  );
  equal(
    (
      await guest('/quote', {
        items: [{ variant_id: variant.id, quantity: '1.5' }],
      })
    ).status,
    400,
    'fractional count denied',
  );
  equal(
    (await guest('/quote', { items }, undefined, 'https://untrusted.example'))
      .status,
    403,
    'foreign origin denied',
  );
  const created = await order();
  equal(created.data.status, 'PENDING', 'unpaid pending');
  equal(created.data.payment_status, 'UNPAID', 'not a payment');
  for (const field of [
    'customer_name',
    'contact_phone',
    'customer_note',
    'branch_id',
    'terminal_id',
    'cart_id',
    'sale_id',
    'access_token',
    'access_hash',
  ])
    equal(field in created.data, false, 'public projection: ' + field);
  equal(await stock(), '5.000', 'ordering leaves physical on-hand unchanged');
  equal((await call('/online-orders')).status, 400, 'branch filter required');
  const concurrent = await Promise.all(
    Array.from({ length: 3 }, () => guest('/orders', created.body, created.id)),
  );
  equal(
    concurrent.map((result) => [result.status, result.data?.id]),
    Array.from({ length: 3 }, () => [201, created.id]),
    'concurrent retry is one order',
  );
  equal(
    authSQL(
      `SELECT count(*) FROM online_orders WHERE organization_id='${org}' AND id='${created.id}'`,
    ),
    '1',
    'one stored order',
  );
  equal(
    (
      await guest(
        '/orders',
        { ...created.body, quote_id: '0'.repeat(64) },
        randomUUID(),
      )
    ).status,
    409,
    'stale quote rejected before writing',
  );
  equal(
    (await guest('/orders', created.body, created.id)).data.id,
    created.id,
    'idempotent create',
  );
  equal(
    (
      await guest(
        '/orders',
        { ...created.body, customer_name: 'Changed' },
        created.id,
      )
    ).status,
    409,
    'key body mismatch',
  );
  equal(
    (
      await guest('/track', {
        order_id: created.id,
        access_token: randomBytes(32).toString('hex'),
      })
    ).status,
    404,
    'wrong token denied',
  );
  equal(
    (
      await guest('/track', {
        order_id: created.id,
        access_token: created.token,
      })
    ).data.status,
    'PENDING',
    'correct private tracking',
  );
  const cashier = await inventoryAccount(clients),
    inventory = await inventoryAccount(clients),
    other = await inventoryAccount(clients);
  inventoryMembership(org, cashier, 'CASHIER', [branch]);
  inventoryMembership(org, inventory, 'INVENTORY_STAFF', [branch]);
  inventoryMembership(org, other, 'CASHIER', [secondBranch]);
  equal(
    (await call('/storefront', 'GET', undefined, undefined, cashier)).status,
    403,
    'cashier cannot manage store',
  );
  equal(
    (await call('/online-orders', 'GET', undefined, undefined, inventory))
      .status,
    403,
    'inventory cannot view contacts',
  );
  equal(
    (
      await call(
        `/online-orders/${created.id}`,
        'GET',
        undefined,
        undefined,
        other,
      )
    ).status,
    403,
    'other branch denied',
  );
  const outsider = await inventoryAccount(clients);
  equal(
    (await call('/online-orders', 'GET', undefined, undefined, outsider))
      .status,
    404,
    'foreign tenant hidden',
  );
  let doc = await ok(`/online-orders/${created.id}`);
  equal(doc.contact_phone, '0812345678', 'staff contact available');
  equal(
    (
      await call(`/online-orders/${doc.id}/status`, 'POST', {
        status: 'COMPLETED',
        message: '',
        revision: doc.revision,
      })
    ).status,
    409,
    'cannot fake completion',
  );
  equal(
    (
      await call(`/online-orders/${doc.id}/status`, 'POST', {
        status: 'READY',
        message: '',
        revision: doc.revision,
      })
    ).status,
    409,
    'cannot skip preparation',
  );
  doc = await transition(doc, 'PREPARING');
  equal(
    (
      await call(`/online-orders/${doc.id}/status`, 'POST', {
        status: 'READY',
        message: '',
        revision: doc.revision - 1,
      })
    ).status,
    409,
    'stale revision',
  );
  doc = await transition(doc, 'READY');
  equal(
    (
      await call(`/online-orders/${doc.id}/pos-cart`, 'POST', {
        revision: doc.revision,
      })
    ).status,
    409,
    'own shift required',
  );
  await ok('/pos/shifts/open', 'POST', {
    terminal_id: terminal.id,
    opening_cash: '100.00',
  });
  let cart = await ok(
    `/online-orders/${doc.id}/pos-cart`,
    'POST',
    { revision: doc.revision },
    undefined,
    owner,
    200,
  );
  equal(cart.online_order.id, doc.id, 'POS order association');
  cart = await ok(
    `/pos/carts/${cart.id}/hold`,
    'POST',
    { revision: cart.revision },
    undefined,
    owner,
    200,
  );
  equal(cart.status, 'HELD', 'online cart can be held without stock deduction');
  cart = await ok(
    `/online-orders/${doc.id}/pos-cart`,
    'POST',
    { revision: doc.revision },
    undefined,
    owner,
    200,
  );
  equal(cart.status, 'ACTIVE', 'same cashier import resumes held cart');
  equal(
    (
      await ok(
        `/online-orders/${doc.id}/pos-cart`,
        'POST',
        { revision: doc.revision },
        undefined,
        owner,
        200,
      )
    ).id,
    cart.id,
    'import replay',
  );
  equal(
    (
      await call(`/pos/carts/${cart.id}`, 'PATCH', {
        revision: cart.revision,
        items: [{ variant_id: variant.id, quantity: '2.000' }],
      })
    ).status,
    409,
    'locked quantities',
  );
  equal(
    (
      await call(`/online-orders/${doc.id}/status`, 'POST', {
        status: 'CANCELLED',
        message: 'Cancel',
        revision: cart.revision,
      })
    ).status,
    409,
    'linked order cannot cancel directly',
  );
  cart = await ok(
    `/pos/carts/${cart.id}`,
    'PATCH',
    {
      revision: cart.revision,
      items: [{ variant_id: variant.id, quantity: '1.000', batch_id: null }],
    },
    undefined,
    owner,
    200,
  );
  const cancelledCart = cart.id;
  await ok(
    `/pos/carts/${cart.id}/cancel`,
    'POST',
    { revision: cart.revision },
    undefined,
    owner,
    200,
  );
  doc = await ok(`/online-orders/${doc.id}`);
  equal(doc.cart_id, undefined, 'cart release');
  cart = await ok(
    `/online-orders/${doc.id}/pos-cart`,
    'POST',
    { revision: doc.revision },
    undefined,
    owner,
    200,
  );
  equal(cart.id === cancelledCart, false, 'reimport creates fresh cart');
  cart = await ok(
    `/pos/carts/${cart.id}`,
    'PATCH',
    {
      revision: cart.revision,
      items: [{ variant_id: variant.id, quantity: '1.000', batch_id: null }],
    },
    undefined,
    owner,
    200,
  );
  const checkout = await ok('/pos/checkout', 'POST', {
    cart_id: cart.id,
    revision: cart.revision,
    method: 'CASH',
    expected_total: cart.total,
    received: cart.total,
    pricing_revision: cart.pricing.revision,
  });
  await ok(
    `/pos/payments/${checkout.id}/confirm`,
    'POST',
    { acknowledged: true, reference: '' },
    undefined,
    owner,
    200,
  );
  const completed = await ok(
    `/pos/checkouts/${checkout.id}/complete`,
    'POST',
    {},
    undefined,
    owner,
    200,
  );
  equal(completed.status, 'COMPLETED', 'sale completed');
  equal(await stock(), '4.000', 'one stock deduction');
  await ok(
    `/pos/checkouts/${checkout.id}/complete`,
    'POST',
    {},
    undefined,
    owner,
    200,
  );
  equal(await stock(), '4.000', 'settlement retry no double deduction');
  const tracked = (
    await guest('/track', { order_id: created.id, access_token: created.token })
  ).data;
  equal(tracked.status, 'COMPLETED', 'public completed via real POS');
  equal(tracked.payment_status, 'PAID_AT_STORE', 'payment separate status');
  equal(tracked.final_total, '2.00', 'real sale total');
  equal(typeof tracked.receipt_number, 'string', 'real receipt');
  equal(
    authSQL(
      `SELECT (SELECT count(*) FROM sales WHERE organization_id='${org}')||'|'||(SELECT count(*) FROM receipts WHERE organization_id='${org}')||'|'||(SELECT count(*) FROM sale_payments WHERE organization_id='${org}')`,
    ),
    '1|1|1',
    'one atomic sale, receipt, payment',
  );
  const rejected = await order();
  let rejectedDoc = await ok(`/online-orders/${rejected.id}`);
  equal(
    (
      await call(`/online-orders/${rejected.id}/status`, 'POST', {
        status: 'REJECTED',
        message: '',
        revision: rejectedDoc.revision,
      })
    ).status,
    400,
    'public rejection reason required',
  );
  rejectedDoc = await transition(
    rejectedDoc,
    'REJECTED',
    'สินค้าหมดก่อนเตรียม',
  );
  equal(rejectedDoc.status, 'REJECTED', 'rejected terminal state');
  const rejection = (
    await guest('/track', {
      order_id: rejected.id,
      access_token: rejected.token,
    })
  ).data;
  equal(
    rejection.events.at(-1).message,
    'สินค้าหมดก่อนเตรียม',
    'customer sees reason',
  );
  equal(await stock(), '4.000', 'rejection does not mutate stock');
  settings = await ok('/storefront');
  settings = await ok('/storefront', 'PUT', {
    ...settings,
    accepting_orders: false,
    branch_id: undefined,
    stock_location_id: undefined,
  });
  equal(
    (await guest('/quote', { items })).status,
    409,
    'temporary closure blocks new quotes',
  );
  equal(
    (
      await guest('/track', {
        order_id: rejected.id,
        access_token: rejected.token,
      })
    ).data.status,
    'REJECTED',
    'tracking survives closure',
  );
  const foreignOrg = randomUUID();
  authSQL(
    `BEGIN; SET LOCAL ROLE smartpos_runtime; SELECT set_config('app.organization_id','${foreignOrg}',true); DO $$ BEGIN IF EXISTS(SELECT 1 FROM online_orders WHERE id='${created.id}') THEN RAISE EXCEPTION 'cross-tenant order leaked'; END IF; END $$; ROLLBACK;`,
  );
  assertions++;
  settings = await ok('/storefront');
  equal(
    (
      await call('/storefront', 'PUT', {
        ...settings,
        slug: slug + '-new',
        branch_id: undefined,
        stock_location_id: undefined,
      })
    ).status,
    409,
    'historical tracking slug preserved',
  );
  settings = await ok('/storefront', 'PUT', {
    ...settings,
    published: false,
    accepting_orders: false,
    branch_id: undefined,
    stock_location_id: undefined,
  });
  equal((await guest()).status, 404, 'unpublished shop hidden');
  equal(
    (
      await guest('/track', {
        order_id: created.id,
        access_token: created.token,
      })
    ).data.status,
    'COMPLETED',
    'tracking survives unpublishing',
  );
  console.log(
    `PASS storefront guest -> staff -> POS: ${assertions} assertions, isolated database only`,
  );
} finally {
  fixture.close();
}
