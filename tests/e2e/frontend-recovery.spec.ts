import { expect, test, type Page } from '@playwright/test';

// Every API request is fulfilled locally. These scenarios never create backend
// fixtures, change stock, or settle a real sale.
async function mockAPI(page: Page) {
  const state = {
    inventoryUnavailable: false,
    checkoutUnavailable: false,
    rejectSave: false,
    writes: [] as {
      path: string;
      body: Record<string, unknown>;
      key?: string;
    }[],
  };
  const permissions = [
    'inventory.read',
    'inventory.location.manage',
    'pos.access',
    'pos.register.open',
    'catalog.read',
    'supplier.read',
    'purchasing.read',
  ];
  const organization = {
    id: 'org',
    name: 'ร้านทดสอบ Frontend',
    code: 'FRONTEND',
    currency: 'THB',
    status: 'ACTIVE',
  };
  const branch = {
    id: 'branch',
    organization_id: 'org',
    name: 'สาขาทดสอบ',
    code: 'MAIN',
    status: 'ACTIVE',
    is_main: true,
  };
  const terminal = {
    id: 'terminal',
    branch_id: 'branch',
    code: 'POS',
    name: 'เครื่องทดสอบ',
    status: 'ACTIVE',
  };
  const cart = {
    id: 'cart',
    branch_id: 'branch',
    terminal_id: 'terminal',
    cashier_id: 'user',
    revision: 1,
    status: 'ACTIVE',
    total: '10.00',
    items: [
      {
        variant_id: 'variant',
        quantity: '1.000',
        unit_price: '10.00',
        line_total: '10.00',
        product_name: 'สินค้าทดสอบ',
        variant_name: 'ปกติ',
        sku: 'TEST',
      },
    ],
  };
  const pageData = (items: unknown[] = []) => ({
    items,
    total: items.length,
    page: 1,
    page_size: 20,
  });
  await page.route('**/health/**', (route) =>
    route.fulfill({ json: { status: 'ready' } }),
  );
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== 'GET') {
      state.writes.push({
        path,
        body: request.postDataJSON(),
        key: request.headers()['idempotency-key'],
      });
      if (state.rejectSave)
        return route.fulfill({
          status: 503,
          contentType: 'text/html',
          body: '<h1>Unavailable</h1>',
        });
      return route.fulfill({ json: { data: { id: 'saved' } } });
    }
    let data: unknown;
    if (path === '/api/v1/auth/me')
      data = {
        user: {
          id: 'user',
          email: 'frontend@example.test',
          display_name: 'ผู้ทดสอบ',
          status: 'ACTIVE',
        },
        csrf_token: 'synthetic-csrf',
      };
    else if (path === '/api/v1/organizations') data = [organization];
    else if (path.endsWith('/context'))
      data = {
        organization,
        membership: {
          user_id: 'user',
          role: 'OWNER',
          permissions,
          branch_ids: ['branch'],
          status: 'ACTIVE',
        },
        branches: [branch],
        permissions,
      };
    else if (path.endsWith('/inventory/locations')) {
      if (state.inventoryUnavailable)
        return route.fulfill({
          status: 503,
          contentType: 'text/html',
          body: '<h1>Unavailable</h1>',
        });
      data = pageData();
    } else if (path.endsWith('/pos/terminals')) data = pageData([terminal]);
    else if (path.endsWith('/pos/shifts'))
      data = pageData([
        {
          id: 'shift',
          terminal_id: 'terminal',
          cashier_id: 'user',
          status: 'OPEN',
          opening_cash: '0.00',
        },
      ]);
    else if (path.endsWith('/pos/carts'))
      data = pageData([{ id: 'cart', status: 'ACTIVE', revision: 1 }]);
    else if (path.endsWith('/pos/carts/cart')) data = cart;
    else if (path.endsWith('/pos/checkouts')) {
      if (state.checkoutUnavailable)
        return route.fulfill({
          status: 503,
          contentType: 'text/html',
          body: '<h1>Unavailable</h1>',
        });
      data = pageData();
    } else if (path.endsWith('/discount-approvals')) data = [];
    else data = pageData();
    return route.fulfill({ json: { data } });
  });
  return state;
}

for (const width of [375, 768, 1440]) {
  test(`inventory retries reads and preserves failed form input at ${width}px`, async ({
    page,
  }, info) => {
    const state = await mockAPI(page);
    state.inventoryUnavailable = true;
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/manage/inventory/locations');
    const retry = page.getByRole('button', { name: 'ลองโหลดข้อมูลอีกครั้ง' });
    await expect(retry).toBeEnabled();
    state.inventoryUnavailable = false;
    await retry.focus();
    await page.keyboard.press('Enter');
    await expect(retry).toHaveCount(0);
    await page.getByLabel('Location code', { exact: true }).fill('test');
    await page.getByLabel('Location name', { exact: true }).fill('คลังทดสอบ');
    state.rejectSave = true;
    await page
      .getByRole('button', { name: 'บันทึก Location', exact: true })
      .click();
    await expect(page.getByRole('alert')).toContainText('บริการไม่พร้อมใช้งาน');
    await expect(page.getByLabel('Location name', { exact: true })).toHaveValue(
      'คลังทดสอบ',
    );
    state.rejectSave = false;
    await page
      .getByRole('button', { name: 'บันทึก Location', exact: true })
      .click();
    await expect(
      page.getByText('บันทึกรายการแล้ว', { exact: true }),
    ).toBeVisible();
    await expect(page.getByLabel('Location name', { exact: true })).toHaveValue(
      '',
    );
    expect(state.writes).toHaveLength(2);
    expect(state.writes[0].key).toBeTruthy();
    expect(state.writes[0].key).toBe(state.writes[1].key);
    expect(state.writes[1].body).toMatchObject({
      branch_id: 'branch',
      code: 'TEST',
      name: 'คลังทดสอบ',
      revision: 0,
    });
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', width);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: info.outputPath('inventory.png'),
      fullPage: true,
    });
  });

  test(`checkout recovers server state before enabling preparation at ${width}px`, async ({
    page,
  }, info) => {
    const state = await mockAPI(page);
    state.checkoutUnavailable = true;
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/manage/pos/checkout');
    await page.getByLabel('เงินรับ', { exact: true }).fill('20.00');
    const prepare = page.getByRole('button', {
      name: 'ตรวจสอบยอดและเตรียมชำระเงิน',
    });
    const retry = page.getByRole('button', { name: 'ลองโหลดข้อมูลอีกครั้ง' });
    await expect(retry).toBeEnabled();
    await expect(prepare).toBeDisabled();
    state.checkoutUnavailable = false;
    await retry.click();
    await expect(prepare).toBeEnabled();
    await expect(page.getByLabel('เงินรับ', { exact: true })).toHaveValue(
      '20.00',
    );
    expect(state.writes).toEqual([]);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', width);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      path: info.outputPath('checkout.png'),
      fullPage: true,
    });
  });
}

for (const [path, resource, label, width] of [
  ['/manage/products', 'products', 'ค้นหาชื่อ / SKU / บาร์โค้ด', 375],
  ['/manage/purchasing/orders', 'purchasing/orders', 'ค้นหา', 768],
] as const) {
  test(`${resource} preserves search input while retrying a failed list`, async ({
    page,
  }, info) => {
    const state = await mockAPI(page);
    let unavailable = true;
    await page.route('**/api/**', (route) => {
      if (
        unavailable &&
        new URL(route.request().url()).pathname ===
          `/api/v1/organizations/org/${resource}`
      ) {
        return route.fulfill({
          status: 503,
          contentType: 'text/html',
          body: '<h1>Unavailable</h1>',
        });
      }
      return route.fallback();
    });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(path);
    await page.getByLabel(label, { exact: true }).fill('TEST');
    const retry = page.getByRole('button', { name: 'ลองโหลดข้อมูลอีกครั้ง' });
    await expect(retry).toBeEnabled();
    unavailable = false;
    await retry.click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByLabel(label, { exact: true })).toHaveValue('TEST');
    expect(state.writes).toEqual([]);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', width);
    await page.screenshot({
      path: info.outputPath('list-recovery.png'),
      fullPage: true,
    });
  });
}

test('the public storefront does not download operational page modules', async ({
  page,
}) => {
  await mockAPI(page);
  const scripts: string[] = [];
  page.on('request', (request) => {
    if (request.resourceType() === 'script') scripts.push(request.url());
  });
  await page.goto('/shop');
  await expect(
    page.getByRole('heading', { name: 'หน้าร้านออนไลน์', exact: true }),
  ).toBeVisible();
  expect(
    scripts.some((url) =>
      /(?:InventoryPage|POSTerminalPage|CheckoutPage|PurchasingPage|OrganizationPages)[-.]/.test(
        url,
      ),
    ),
  ).toBe(false);
});

test('a failed lazy module offers recovery and reloads after the failure clears', async ({
  page,
}, info) => {
  await mockAPI(page);
  const chunk = '**/assets/InventoryPage-*.js';
  await page.route(chunk, (route) => route.abort());
  await page.goto('/manage/inventory/locations');
  await expect(
    page.getByRole('heading', { name: 'ไม่สามารถแสดงหน้านี้ได้' }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(
    'ตรวจสอบสถานะรายการก่อนทำซ้ำ',
  );
  await page.screenshot({
    path: info.outputPath('route-error.png'),
    fullPage: true,
  });
  await page.unroute(chunk);
  await page.getByRole('button', { name: 'โหลดหน้าอีกครั้ง' }).click();
  await expect(
    page.getByRole('heading', { name: 'สถานที่เก็บ', level: 1 }),
  ).toBeVisible();
});
