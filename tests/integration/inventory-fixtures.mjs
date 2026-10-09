import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { authOrigin, authSQL, startAuthClient } from './auth-fixtures.mjs';

export async function inventoryCall(
  user,
  path,
  method = 'GET',
  body,
  key,
  extra = {},
) {
  const response = await fetch(`${user.source.proxy}/api/v1${path}`, {
    method,
    headers: {
      Origin: authOrigin,
      Connection: 'close',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(user.cookie ? { Cookie: user.cookie } : {}),
      ...(user.csrf ? { 'X-CSRF-Token': user.csrf } : {}),
      ...(method !== 'GET' ? { 'Idempotency-Key': key ?? randomUUID() } : {}),
      ...extra,
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  return {
    status: response.status,
    data: result.data,
    error: result.error,
    cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '',
  };
}
export async function inventoryAccount(clients) {
  const source = await startAuthClient();
  clients.push(source);
  const user = { source, cookie: '', csrf: '', id: '' };
  const email = `inventory-${randomUUID()}@example.test`,
    password = `Inventory-${randomUUID()}`;
  assert.equal(
    (
      await inventoryCall(user, '/auth/register', 'POST', {
        email,
        password,
        display_name: 'Inventory test',
      })
    ).status,
    201,
  );
  const login = await inventoryCall(user, '/auth/login', 'POST', {
    email,
    password,
  });
  assert.equal(login.status, 200);
  user.cookie = login.cookie;
  user.csrf = login.data.csrf_token;
  user.id = login.data.user.id;
  return user;
}
export function inventoryMembership(org, user, role, branches) {
  for (const id of [org, user.id, ...branches])
    assert.match(id, /^[a-f0-9-]{36}$/i);
  assert.ok(
    ['CASHIER', 'MANAGER', 'INVENTORY_STAFF', 'PURCHASING_STAFF'].includes(
      role,
    ),
  );
  return authSQL(
    `BEGIN; INSERT INTO organization_memberships(organization_id,user_id,role) VALUES('${org}','${user.id}','${role}'); INSERT INTO branch_memberships(organization_id,membership_id,branch_id) SELECT '${org}',member.id,branch.id FROM organization_memberships member CROSS JOIN unnest(ARRAY[${branches.map((id) => `'${id}'::uuid`).join(',')}]) branch(id) WHERE member.organization_id='${org}' AND member.user_id='${user.id}'; COMMIT;`,
  );
}
export async function inventoryFixture() {
  const clients = [];
  try {
    const owner = await inventoryAccount(clients);
    const setup = await inventoryCall(owner, '/organizations', 'POST', {
      name: 'Inventory fixture',
      code: `INV-${randomUUID().slice(0, 12).toUpperCase()}`,
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
    assert.equal(setup.status, 201);
    const org = setup.data.organization.id,
      branch = setup.data.branches[0].id,
      base = `/organizations/${org}`,
      inventory = `${base}/inventory`;
    const second = await inventoryCall(owner, `${base}/branches`, 'POST', {
      name: 'Second',
      code: 'SECOND',
      address: '',
      phone: '',
      email: '',
      status: 'ACTIVE',
    });
    assert.equal(second.status, 201);
    const secondBranch = second.data.id;
    async function unit(code, type) {
      const result = await inventoryCall(owner, `${base}/units`, 'POST', {
        name: code,
        code,
        unit_type: type,
        base_unit_id: null,
        conversion_factor: '1',
        description: '',
        status: 'ACTIVE',
      });
      assert.equal(result.status, 201);
      return result.data;
    }
    const countUnit = await unit('PCS', 'COUNT'),
      weightUnit = await unit('KG', 'WEIGHT');
    async function product(sku, unit) {
      const result = await inventoryCall(owner, `${base}/products`, 'POST', {
        name: sku,
        description: 'Inventory fixture',
        category_id: null,
        brand_id: null,
        status: 'ACTIVE',
        variants: [
          {
            sku,
            name: 'Default',
            attributes: {},
            unit_id: unit.id,
            cost_price: '1.00',
            selling_price: '2.00',
            status: 'ACTIVE',
          },
        ],
      });
      assert.equal(result.status, 201);
      return result.data.variants[0];
    }
    const variant = await product('INV-ONE', countUnit),
      variant2 = await product('INV-TWO', countUnit),
      weightVariant = await product('INV-WEIGHT', weightUnit);
    async function location(code, type, branchID, parent = null) {
      const result = await inventoryCall(
        owner,
        `${inventory}/locations`,
        'POST',
        {
          branch_id: branchID,
          code,
          name: code,
          type,
          parent_location_id: parent,
          status: 'ACTIVE',
          description: '',
        },
      );
      assert.equal(result.status, 201, JSON.stringify(result.error));
      return result.data;
    }
    const warehouse = await location('WH', 'WAREHOUSE', branch),
      shelf = await location('SHELF', 'SHELF', branch, warehouse.id),
      shelf2 = await location('SHELF2', 'SALES_FLOOR', branch),
      destination = await location('WH2', 'WAREHOUSE', secondBranch);
    return {
      clients,
      owner,
      org,
      branch,
      secondBranch,
      base,
      inventory,
      warehouse,
      shelf,
      shelf2,
      destination,
      variant,
      variant2,
      weightVariant,
      countUnit,
      weightUnit,
      close: () => clients.forEach((client) => client.close()),
    };
  } catch (error) {
    clients.forEach((client) => client.close());
    throw error;
  }
}
