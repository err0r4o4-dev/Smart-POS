import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { authOrigin, authSQL, startAuthClient } from './auth-fixtures.mjs';
import { xlsxFixture } from './catalog-fixtures.mjs';
const clients = [];
let assertions = 0;
function equal(actual, expected, label) {
  assert.equal(actual, expected, label);
  assertions++;
}
async function call(user, path, method = 'GET', body, headers = {}) {
  const multipart = body instanceof FormData;
  const response = await fetch(`${user.source.proxy}/api/v1${path}`, {
    method,
    headers: {
      Origin: authOrigin,
      Connection: 'close',
      ...(body && !multipart ? { 'Content-Type': 'application/json' } : {}),
      ...(user.cookie ? { Cookie: user.cookie } : {}),
      ...(user.csrf ? { 'X-CSRF-Token': user.csrf } : {}),
      ...headers,
    },
    ...(body ? { body: multipart ? body : JSON.stringify(body) } : {}),
  });
  const result = await response.json();
  return {
    status: response.status,
    data: result.data,
    error: result.error,
    cookie: response.headers.get('set-cookie')?.split(';')[0] ?? '',
  };
}
async function account() {
  const source = await startAuthClient();
  clients.push(source);
  const user = { source, cookie: '', csrf: '', id: '' };
  const email = `catalog-${randomUUID()}@example.test`,
    password = `Catalog-password-${randomUUID()}`;
  equal(
    (
      await call(user, '/auth/register', 'POST', {
        email,
        password,
        display_name: 'Catalog test',
      })
    ).status,
    201,
    'register',
  );
  const login = await call(user, '/auth/login', 'POST', { email, password });
  equal(login.status, 200, 'login');
  user.cookie = login.cookie;
  user.csrf = login.data.csrf_token;
  user.id = login.data.user.id;
  return user;
}
async function setup(user) {
  const result = await call(
    user,
    '/organizations',
    'POST',
    {
      name: 'Catalog test',
      code: `CAT-${randomUUID().slice(0, 12).toUpperCase()}`,
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
    },
    { 'Idempotency-Key': randomUUID() },
  );
  equal(result.status, 201, 'setup');
  return result.data;
}
async function tax(user, org, kind, body) {
  const result = await call(user, `/organizations/${org}/${kind}`, 'POST', {
    name: 'Fixture ' + kind,
    description: '',
    status: 'ACTIVE',
    revision: 0,
    ...body,
  });
  equal(result.status, 201, kind);
  return result.data;
}
const productBody = (unit, sku = 'COKE-325') => ({
  name: 'Coca-Cola test',
  description: 'Catalog only',
  category_id: null,
  brand_id: null,
  status: 'ACTIVE',
  revision: 0,
  variants: [
    {
      sku,
      name: '325ml',
      attributes: { volume: '325ml' },
      unit_id: unit,
      cost_price: '12.01',
      selling_price: '18.99',
      status: 'ACTIVE',
      revision: 0,
    },
  ],
});
const editable = (product) => ({
  name: product.name,
  description: product.description,
  category_id: product.category_id,
  brand_id: product.brand_id,
  status: product.status,
  revision: product.revision,
});
const variantEditable = (variant) => ({
  sku: variant.sku,
  name: variant.name,
  attributes: variant.attributes,
  unit_id: variant.unit_id,
  cost_price: variant.cost_price,
  selling_price: variant.selling_price,
  status: variant.status,
  revision: variant.revision,
});
async function upload(
  user,
  org,
  text,
  filename = 'products.csv',
  mapping = {},
) {
  const body = new FormData();
  body.set('file', new Blob([text]), filename);
  body.set('mapping', JSON.stringify(mapping));
  return call(
    user,
    `/organizations/${org}/products/import/preview`,
    'POST',
    body,
  );
}
try {
  const owner = await account(),
    outsider = await account(),
    employee = await account();
  const contextA = await setup(owner),
    contextB = await setup(outsider);
  const org = contextA.organization.id,
    foreign = contextB.organization.id,
    base = `/organizations/${org}`,
    foreignBase = `/organizations/${foreign}`;
  const unit = await tax(owner, org, 'units', {
      name: 'Can',
      code: 'CAN',
      unit_type: 'COUNT',
      base_unit_id: null,
      conversion_factor: '1',
    }),
    category = await tax(owner, org, 'categories', {}),
    brand = await tax(owner, org, 'brands', {});
  const foreignUnit = await tax(outsider, foreign, 'units', {
      code: 'CAN',
      unit_type: 'COUNT',
      conversion_factor: '1',
    }),
    foreignCategory = await tax(outsider, foreign, 'categories', {}),
    foreignBrand = await tax(outsider, foreign, 'brands', {});
  equal((await call(owner, `${base}/products`)).data.total, 0, 'empty catalog');
  equal((await call(outsider, `${base}/products`)).status, 404, 'nonmember');
  for (const [key, id] of [
    ['category_id', foreignCategory.id],
    ['brand_id', foreignBrand.id],
  ]) {
    equal(
      (
        await call(owner, `${base}/products`, 'POST', {
          ...productBody(unit.id),
          [key]: id,
        })
      ).status,
      400,
      'foreign ' + key,
    );
  }
  const wrong = productBody(foreignUnit.id);
  equal(
    (await call(owner, `${base}/products`, 'POST', wrong)).status,
    400,
    'foreign unit rollback',
  );
  equal(
    (await call(owner, `${base}/products`)).data.total,
    0,
    'creation rollback',
  );
  const created = await call(owner, `${base}/products`, 'POST', {
    ...productBody(unit.id),
    category_id: category.id,
    brand_id: brand.id,
  });
  equal(created.status, 201, 'create');
  let product = created.data;
  const path = `${base}/products/${product.id}`;
  let variant = product.variants[0];
  const variantPath = `${path}/variants/${variant.id}`;
  equal(variant.selling_price, '18.99', 'exact decimal');
  equal(variant.currency, 'THB', 'org currency');
  equal(
    (await call(owner, `${base}/products`, 'POST', productBody(unit.id)))
      .status,
    409,
    'duplicate SKU',
  );
  equal((await call(outsider, path)).status, 404, 'cross product');
  equal(
    (
      await call(owner, path, 'PATCH', {
        ...editable(product),
        name: 'Updated Cola',
      })
    ).status,
    200,
    'update',
  );
  equal(
    (await call(owner, path, 'PATCH', editable(product))).status,
    409,
    'stale revision',
  );
  product = (await call(owner, path)).data;
  equal(
    (await call(owner, `${base}/products?search=COKE-325`)).data.total,
    1,
    'SKU search',
  );
  equal(
    (
      await call(
        owner,
        `${base}/products?category_id=${category.id}&brand_id=${brand.id}`,
      )
    ).data.total,
    1,
    'filters',
  );
  equal(
    (await call(owner, `${base}/products?page_size=101`)).status,
    400,
    'bounded pagination',
  );
  equal(
    (await call(owner, `${base}/products?page_size=1&page=2`)).data.items
      .length,
    0,
    'pagination',
  );
  const child = await tax(owner, org, 'categories', {
    name: 'Child',
    parent_id: category.id,
  });
  equal(
    (
      await call(owner, `${base}/categories/${category.id}`, 'PATCH', {
        name: category.name,
        description: '',
        status: 'ACTIVE',
        revision: category.revision,
        parent_id: child.id,
      })
    ).status,
    409,
    'category cycle',
  );
  equal(
    (
      await call(owner, `${base}/categories/${category.id}`, 'PATCH', {
        name: category.name,
        description: '',
        status: 'ARCHIVED',
        revision: category.revision,
        parent_id: null,
      })
    ).status,
    409,
    'referenced category',
  );
  const pack = await tax(owner, org, 'units', {
    name: 'Pack',
    code: 'PACK',
    unit_type: 'PACKAGING',
    base_unit_id: unit.id,
    conversion_factor: '6',
  });
  equal(pack.conversion_factor, '6.000000', 'exact conversion');
  equal(
    (
      await call(owner, `${base}/units/${unit.id}`, 'PATCH', {
        name: 'Can',
        code: 'CAN',
        unit_type: 'COUNT',
        conversion_factor: '2',
        status: 'ACTIVE',
        revision: 1,
      })
    ).status,
    400,
    'base conversion rule',
  );
  const second = await call(owner, `${path}/variants`, 'POST', {
    ...variantEditable(variant),
    sku: 'COKE-PACK',
    name: '6 pack',
    unit_id: pack.id,
    revision: 0,
  });
  equal(second.status, 201, 'second variant');
  equal(
    (
      await call(owner, variantPath, 'PATCH', {
        ...variantEditable(variant),
        selling_price: '-1',
      })
    ).status,
    400,
    'negative selling',
  );
  equal(
    (
      await call(owner, variantPath, 'PATCH', {
        ...variantEditable(variant),
        selling_price: '0',
      })
    ).status,
    400,
    'zero selling',
  );
  const concurrent = await Promise.all([
    call(owner, `${path}/variants`, 'POST', {
      ...variantEditable(variant),
      sku: 'RACE-SKU',
      revision: 0,
    }),
    call(owner, `${path}/variants`, 'POST', {
      ...variantEditable(variant),
      sku: 'RACE-SKU',
      revision: 0,
    }),
  ]);
  equal(
    concurrent
      .map((item) => item.status)
      .sort()
      .join(','),
    '201,409',
    'concurrent SKU',
  );
  equal(
    (
      await call(owner, `${variantPath}/barcodes`, 'POST', {
        code: '4006381333932',
        symbology: 'EAN13',
        source: 'MANUFACTURER',
        is_primary: true,
      })
    ).status,
    400,
    'checksum',
  );
  const barcode = await call(owner, `${variantPath}/barcodes`, 'POST', {
    code: '036000291452',
    symbology: 'UPCA',
    source: 'MANUFACTURER',
    is_primary: true,
  });
  equal(barcode.status, 201, 'leading-zero barcode');
  equal(
    (await call(owner, `${base}/barcodes/lookup?code=036000291452`)).data
      .variant_id,
    variant.id,
    'variant lookup',
  );
  equal(
    (await call(owner, `${base}/barcodes/lookup?code=UNKNOWN`)).status,
    404,
    'unknown',
  );
  const barcodeRace = await Promise.all([
    call(owner, `${variantPath}/barcodes`, 'POST', {
      code: 'RACE-CODE',
      symbology: 'CODE128',
      source: 'ALIAS',
      is_primary: false,
    }),
    call(owner, `${path}/variants/${second.data.id}/barcodes`, 'POST', {
      code: 'RACE-CODE',
      symbology: 'CODE128',
      source: 'ALIAS',
      is_primary: false,
    }),
  ]);
  equal(
    barcodeRace
      .map((item) => item.status)
      .sort()
      .join(','),
    '201,409',
    'concurrent barcode',
  );
  equal(
    (
      await call(
        outsider,
        `${foreignBase}/products`,
        'POST',
        productBody(foreignUnit.id),
      )
    ).status,
    201,
    'same SKU another tenant',
  );
  const foreignProduct = (await call(outsider, `${foreignBase}/products`)).data
    .items[0];
  equal(
    (
      await call(
        outsider,
        `${foreignBase}/products/${foreignProduct.id}/variants/${foreignProduct.variants[0].id}/barcodes`,
        'POST',
        {
          code: '036000291452',
          symbology: 'UPCA',
          source: 'MANUFACTURER',
          is_primary: true,
        },
      )
    ).status,
    201,
    'same barcode another tenant',
  );
  const generated = await call(
    owner,
    `${variantPath}/barcodes/generate`,
    'POST',
    { is_primary: true },
  );
  equal(generated.status, 201, 'internal');
  assert.match(generated.data.code, /^SP-[A-F0-9]{32}$/);
  equal(generated.data.symbology, 'CODE128', 'no pretend GS1');
  equal(
    (
      await call(
        owner,
        `${variantPath}/barcodes/${generated.data.id}`,
        'DELETE',
      )
    ).status,
    200,
    'remove',
  );
  equal(
    (await call(owner, `${base}/barcodes/lookup?code=${generated.data.code}`))
      .status,
    404,
    'removed lookup',
  );
  equal(
    (await call(owner, path)).data.variants[0].barcodes.filter(
      (item) => item.is_primary,
    ).length,
    1,
    'primary fallback',
  );
  authSQL(
    `INSERT INTO organization_memberships(organization_id,user_id,role) VALUES('${org}','${employee.id}','CASHIER'); INSERT INTO branch_memberships(organization_id,membership_id,branch_id) SELECT organization_id,id,'${contextA.branches[0].id}' FROM organization_memberships WHERE organization_id='${org}' AND user_id='${employee.id}';`,
  );
  for (const role of [
    'CASHIER',
    'PURCHASING_STAFF',
    'INVENTORY_STAFF',
    'MANAGER',
  ]) {
    authSQL(
      `UPDATE organization_memberships SET role='${role}' WHERE organization_id='${org}' AND user_id='${employee.id}'`,
    );
    equal(
      (await call(employee, `${base}/products`)).status,
      200,
      role + ' read',
    );
    equal(
      (
        await call(employee, `${base}/categories`, 'POST', {
          name: 'Role ' + role,
        })
      ).status,
      role === 'MANAGER' ? 201 : 403,
      role + ' category policy',
    );
    equal(
      (await call(employee, `${path}/labels`)).status,
      ['MANAGER', 'INVENTORY_STAFF'].includes(role) ? 200 : 403,
      role + ' labels',
    );
    equal(
      (
        await call(
          employee,
          `${base}/products`,
          'POST',
          productBody(unit.id, 'ROLE-' + role),
        )
      ).status,
      ['MANAGER', 'INVENTORY_STAFF'].includes(role) ? 201 : 403,
      role + ' create',
    );
  }
  authSQL(
    `UPDATE organization_memberships SET role='INVENTORY_STAFF' WHERE organization_id='${org}' AND user_id='${employee.id}'`,
  );
  equal(
    (
      await call(employee, path, 'PATCH', {
        ...editable(product),
        status: 'ARCHIVED',
      })
    ).status,
    403,
    'inventory cannot archive',
  );
  equal(
    (
      await call(
        owner,
        path,
        'PATCH',
        { ...editable(product), status: 'ARCHIVED' },
        { 'X-CSRF-Token': '' },
      )
    ).status,
    403,
    'CSRF',
  );
  equal(
    (
      await call(
        owner,
        path,
        'PATCH',
        { ...editable(product), status: 'ARCHIVED' },
        { Origin: 'https://attacker.invalid' },
      )
    ).status,
    403,
    'Origin',
  );
  const csvHeaders =
    'product_name,sku,barcode,symbology,category,brand,unit,cost_price,selling_price';
  const validCSV = `${csvHeaders}\nImported Tea,IMPORT-TEA,001234,CODE128,,,CAN,0.10,25.99\nImported Milk,IMPORT-MILK,,,${category.name},${brand.name},CAN,1.00,12.00`;
  const preview = await upload(owner, org, validCSV);
  equal(preview.status, 201, 'CSV preview');
  equal(preview.data.valid, 2, 'valid rows');
  equal(
    (await call(owner, `${base}/products?search=IMPORT-TEA`)).data.total,
    0,
    'preview no products',
  );
  equal(
    (await call(outsider, `${base}/products/import/${preview.data.id}`)).status,
    404,
    'foreign job',
  );
  equal(
    (await call(employee, `${base}/products/import/${preview.data.id}`)).status,
    404,
    'job private to creator',
  );
  const confirmPath = `${base}/products/import/${preview.data.id}/confirm`;
  const confirmations = await Promise.all([
    call(owner, confirmPath, 'POST', { mode: 'CREATE' }),
    call(owner, confirmPath, 'POST', { mode: 'CREATE' }),
  ]);
  equal(
    confirmations.map((item) => item.status).join(','),
    '200,200',
    'idempotent concurrent confirm',
  );
  equal(confirmations[0].data.result.imported, 2, 'import count');
  equal(
    (await call(owner, confirmPath, 'POST', { mode: 'UPDATE' })).status,
    409,
    'retry different mode',
  );
  equal(
    (await call(owner, `${base}/barcodes/lookup?code=001234`)).status,
    200,
    'import leading zeros',
  );
  const duplicates = await upload(owner, org, validCSV);
  equal(duplicates.data.duplicates, 2, 'duplicate preview');
  const duplicatePath = `${base}/products/import/${duplicates.data.id}/confirm`;
  equal(
    (await call(owner, duplicatePath, 'POST', { mode: 'CREATE' })).status,
    409,
    'create no overwrite',
  );
  equal(
    (await call(owner, duplicatePath, 'POST', { mode: 'SKIP' })).data.result
      .skipped,
    2,
    'skip existing',
  );
  const updatedCSV = `${csvHeaders}\nChanged Tea,IMPORT-TEA,001234,CODE128,,,CAN,0.20,26.99`;
  const updatePreview = await upload(owner, org, updatedCSV);
  equal(
    (
      await call(
        owner,
        `${base}/products/import/${updatePreview.data.id}/confirm`,
        'POST',
        { mode: 'UPDATE' },
      )
    ).data.result.updated,
    1,
    'update existing',
  );
  equal(
    (await call(owner, `${base}/barcodes/lookup?code=001234`)).data.product
      .variants[0].selling_price,
    '26.99',
    'update exact price',
  );
  const invalid = await upload(
    owner,
    org,
    `${csvHeaders}\nGood,ROLLBACK-GOOD,,,${category.name},${brand.name},CAN,1,2\nBad,ROLLBACK-BAD,,,,,CAN,-1,2`,
  );
  equal(invalid.data.invalid, 1, 'row errors');
  equal(
    (
      await call(
        owner,
        `${base}/products/import/${invalid.data.id}/confirm`,
        'POST',
        { mode: 'CREATE' },
      )
    ).status,
    409,
    'invalid atomic rollback',
  );
  equal(
    (await call(owner, `${base}/products?search=ROLLBACK-GOOD`)).data.total,
    0,
    'no partial products',
  );
  const conflict = await upload(
    owner,
    org,
    `${csvHeaders}\nConflict,NEW-SKU,001234,CODE128,,,CAN,1,2`,
  );
  equal(conflict.data.invalid, 1, 'SKU-barcode conflict');
  const within = await upload(
    owner,
    org,
    `${csvHeaders}\nOne,IN-FILE,001111,CODE128,,,CAN,1,2\nTwo,IN-FILE,001111,CODE128,,,CAN,1,2`,
  );
  equal(within.data.invalid, 1, 'within file duplicates');
  const stale = await upload(owner, org, updatedCSV);
  authSQL(
    `UPDATE product_variants SET revision=revision+1 WHERE organization_id='${org}' AND sku='IMPORT-TEA'`,
  );
  equal(
    (
      await call(
        owner,
        `${base}/products/import/${stale.data.id}/confirm`,
        'POST',
        { mode: 'UPDATE' },
      )
    ).status,
    409,
    'stale preview',
  );
  const expired = await upload(
    owner,
    org,
    `${csvHeaders}\nExpiry,EXPIRED,,,,,CAN,1,2`,
  );
  authSQL(
    `UPDATE product_import_jobs SET expires_at=now()-interval '1 second' WHERE id='${expired.data.id}'`,
  );
  equal(
    (
      await call(
        owner,
        `${base}/products/import/${expired.data.id}/confirm`,
        'POST',
        { mode: 'CREATE' },
      )
    ).status,
    409,
    'expiry',
  );
  const custom = await upload(
    owner,
    org,
    'Name,Code,Unit,Cost,Price\nMapped,MAPPED,CAN,1,2',
    'mapped.csv',
    {
      product_name: 'Name',
      sku: 'Code',
      unit: 'Unit',
      cost_price: 'Cost',
      selling_price: 'Price',
    },
  );
  equal(custom.data.valid, 1, 'mapping');
  const bulkCSV = [
    csvHeaders,
    ...Array.from({ length: 100 }, (_, index) =>
      [
        `Bulk ${index}`,
        `BULK-${index}`,
        '',
        '',
        '',
        '',
        'CAN',
        '1.00',
        '2.00',
      ].join(','),
    ),
  ].join('\n');
  const bulk = await upload(owner, org, bulkCSV);
  equal(bulk.status, 201, 'bulk preview');
  equal(bulk.data.valid, 100, 'bulk valid rows');
  const bulkResult = await call(
    owner,
    `${base}/products/import/${bulk.data.id}/confirm`,
    'POST',
    { mode: 'CREATE' },
  );
  equal(bulkResult.status, 200, 'atomic bulk confirm');
  equal(bulkResult.data.result.imported, 100, 'bulk imported rows');
  equal(bulkResult.data.result.failed, 0, 'bulk no failures');
  equal(
    (await call(owner, `${base}/products?search=BULK-&page_size=20&page=5`))
      .data.items.length,
    20,
    'bulk pagination',
  );
  const xlsx = await upload(
    owner,
    org,
    xlsxFixture(
      ['product_name', 'sku', 'barcode', 'unit', 'cost_price', 'selling_price'],
      [['XLSX item', 'XLSX-ITEM', '000543', 'CAN', '1.01', '2.99']],
    ),
    'products.xlsx',
  );
  equal(xlsx.status, 201, 'XLSX preview');
  equal(xlsx.data.valid, 1, 'XLSX valid');
  equal(
    (
      await call(
        owner,
        `${base}/products/import/${xlsx.data.id}/confirm`,
        'POST',
        { mode: 'CREATE' },
      )
    ).data.result.imported,
    1,
    'XLSX confirm',
  );
  equal(
    (
      await upload(
        owner,
        org,
        xlsxFixture(['product_name', 'sku'], [['unsafe', 'BAD']], true),
        'formula.xlsx',
      )
    ).status,
    400,
    'reject formulas',
  );
  equal(
    (await upload(owner, org, 'bad zip', 'bad.xlsx')).status,
    400,
    'reject malformed xlsx',
  );
  equal(
    (await upload(owner, org, 'a,a\nb,c')).status,
    400,
    'reject malformed headers',
  );
  equal(
    (await upload(owner, org, Buffer.alloc(5 * 1024 * 1024 + 1), 'large.csv'))
      .status,
    400,
    'file limit',
  );
  product = (await call(owner, path)).data;
  equal(
    (
      await call(owner, path, 'PATCH', {
        ...editable(product),
        status: 'ARCHIVED',
      })
    ).status,
    200,
    'archive',
  );
  equal(
    (await call(owner, `${base}/products?search=COKE-325`)).data.total,
    0,
    'archive excluded',
  );
  equal(
    (await call(owner, `${base}/products?search=COKE-325&status=ARCHIVED`)).data
      .total,
    1,
    'archive filter',
  );
  equal(
    (await call(owner, `${base}/barcodes/lookup?code=036000291452`)).data
      .saleable,
    false,
    'archived not saleable',
  );
  equal(
    (await call(owner, `${base}/products`, 'POST', productBody(unit.id)))
      .status,
    409,
    'archived SKU reserved',
  );
  product = (await call(owner, path)).data;
  equal(
    (
      await call(owner, path, 'PATCH', {
        ...editable(product),
        status: 'ACTIVE',
      })
    ).status,
    200,
    'restore',
  );
  authSQL(
    `UPDATE organization_memberships SET status='SUSPENDED' WHERE organization_id='${org}' AND user_id='${employee.id}'`,
  );
  equal((await call(employee, `${base}/products`)).status, 404, 'suspended');
  const audit = (await call(owner, `${base}/audit`)).data;
  assert.ok(
    audit.some((item) => item.event_type === 'catalog.import.completed'),
  );
  assert.ok(
    audit.some((item) => item.event_type === 'catalog.barcode.registered'),
  );
  assertions += 2;
  console.log(
    `PASS: ${assertions} catalog API assertions through real Caddy/PostgreSQL; CRUD, RBAC, tenant isolation, concurrency, barcode and atomic CSV/XLSX imports`,
  );
} finally {
  for (const client of clients.reverse()) client.close();
}
