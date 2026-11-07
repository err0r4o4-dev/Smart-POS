import { expect, test, type Page } from '@playwright/test';

const organization = { id: 'retirement-org', name: 'ร้านทดสอบ', code: 'TEST', business_type: 'RESTAURANT', status: 'ACTIVE', contact_email: '', contact_phone: '', address: '' };
const branch = { id: 'retirement-branch', organization_id: organization.id, name: 'สาขาทดสอบ', code: 'MAIN', status: 'ACTIVE', is_main: true, address: '', phone: '', email: '' };
const permissions = ['online_orders.read', 'online_orders.manage', 'pos.access', 'catalog.read', 'catalog.create', 'catalog.update', 'organization.read', 'sales.read', 'receipts.read', 'refunds.read'];
const retired = /\/(?:restaurant\/(?:recipes|quick-stock|forecast)|inventory)(?:\/|$)/i;
const retiredCopy = /วัตถุดิบ|สูตรอาหาร|ingredient|recipes?|quick.stock|forecast/i;
const violations = new WeakMap<Page, string[]>();
const queueVisible = new WeakMap<Page, boolean>();
const queue = [
  { order_id: 'one', queue_number: '001', channel: 'DINE_IN', table_code: 'T01', status: 'PENDING', created_at: '2026-10-12T00:00:00Z' },
  { order_id: 'two', queue_number: '002', channel: 'PICKUP', status: 'PREPARING', created_at: '2026-10-12T00:00:00Z' },
  { order_id: 'three', queue_number: '003', channel: 'DELIVERY', status: 'READY', created_at: '2026-10-12T00:00:00Z' },
];
const shop = { slug: 'retirement-fixture', name: 'ร้านทดสอบ', description: '', contact_phone: '', pickup_instructions: '', published: true, accepting_orders: true, delivery_enabled: false, shipping_fee: '0.00', revision: 1 };
const item = { variant_name: 'จาน', unit: 'จาน', unit_type: 'COUNT', unit_price: '10.00', saleable: true, published: true };
const products = [
  { ...item, variant_id: 'menu', product_name: 'เมนูเดิมสูตรเก่า', sku: 'MENU', stock_policy: 'MENU_ONLY', available: null },
  { ...item, variant_id: 'tracked', product_name: 'สินค้าจำกัดจำนวน', sku: 'TRACKED', stock_policy: 'TRACKED', available: '2.000' },
  { ...item, variant_id: 'unknown', product_name: 'นโยบายไม่รู้จัก', sku: 'UNKNOWN', stock_policy: 'UNKNOWN', available: '2.000' },
  { ...item, variant_id: 'missing', product_name: 'นโยบายขาดหาย', sku: 'MISSING', available: '2.000' },
];

async function mockNetwork(page: Page, baseURL: string) {
  const errors: string[] = [];
  violations.set(page, errors);
  const origin = new URL(baseURL).origin;
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== 'GET') {
      errors.push(`Unexpected write: ${request.method()} ${url.pathname}`);
      return route.abort();
    }
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (retired.test(url.pathname) || /\/(?:ingredients|recipes)(?:\/|$)/i.test(url.pathname)) {
      errors.push(`Retired API: ${url.pathname}`);
      return route.fulfill({ status: 404, json: { error: { message: 'Retired endpoint' } } });
    }
    let data: unknown;
    if (url.pathname === '/api/v1/auth/me') data = { user: { id: 'retirement-user', email: 'owner@example.test', display_name: 'Owner', status: 'ACTIVE', email_verified: true }, csrf_token: 'synthetic' };
    else if (url.pathname === '/api/v1/storefronts/retirement-fixture') data = shop;
    else if (url.pathname === '/api/v1/storefronts/retirement-fixture/products') data = { items: products, total: products.length, page: 1, page_size: 24 };
    else if (url.pathname === '/api/v1/organizations') data = [organization];
    else if (url.pathname === '/api/v1/organizations/retirement-org/context') data = { organization, branches: [branch], membership: { role: 'OWNER', status: 'ACTIVE', branch_ids: [branch.id], permissions }, permissions };
    else if (/^\/api\/v1\/organizations\/retirement-org\/(products|categories|pos\/products|pos\/shifts|pos\/carts)$/.test(url.pathname)) data = { items: [], total: 0, page: 1, page_size: 100 };
    else if (url.pathname === '/api/v1/organizations/retirement-org/restaurant/queue') {
      if (url.searchParams.get('branch_id') !== branch.id) errors.push('Queue requested with incorrect branch');
      data = queueVisible.get(page) ? queue : [];
    }
    else if (/^\/api\/v1\/organizations\/retirement-org\/online-orders\/(pending|preparing)$/.test(url.pathname)) {
      const status = url.pathname.endsWith('/pending') ? 'PENDING' : 'PREPARING';
      data = { id: status.toLowerCase(), number: 'WEB-UNPAID', status, payment_status: 'UNPAID', customer_name: 'Synthetic guest', contact_phone: '', customer_note: '', store_name: shop.name, store_phone: '', pickup_instructions: '', estimated_total: '10.00', final_total: null, receipt_number: null, revision: 1, created_at: '2026-10-12T00:00:00Z', expires_at: '2026-10-14T00:00:00Z', items: [{ ...products[0], quantity: '1.000', line_total: '10.00' }], events: [] };
    }
    else if (url.pathname === '/api/v1/organizations/retirement-org/pos/terminals') data = { items: [{ id: 'retirement-terminal', branch_id: branch.id, code: 'TEST', name: 'Synthetic terminal', stock_location_id: 'retirement-location', status: 'ACTIVE', revision: 1 }], total: 1, page: 1, page_size: 100 };
    else {
      errors.push(`Unmocked API: ${url.pathname}`);
      return route.fulfill({ status: 404, json: { error: { message: 'Unmocked endpoint' } } });
    }
    return route.fulfill({ json: { data } });
  });
}

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page, baseURL }) => { await mockNetwork(page, baseURL!); });
test.afterEach(async ({ page }) => { expect(violations.get(page), 'No retired API, unmocked API, or writes').toEqual([]); });

for (const width of [320, 1440]) {
  test(`navigation and menu catalog exclude retired flows at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/manage/products');
    await expect(page.getByRole('table')).toBeVisible();
    await expect(page.getByLabel('ค้นหาชื่อเมนู / SKU', { exact: true })).toBeVisible();
    await expect(page.getByRole('main')).not.toContainText(retiredCopy);
    if (width === 320) await page.getByRole('button', { name: /^(เปิดเมนู|Open navigation)$/ }).click();
    const nav = page.getByRole('navigation', { name: width === 320 ? /^(เมนูบนมือถือ|Mobile navigation)$/ : /^(เมนูหลัก|Main navigation)$/ });
    await expect(nav).toBeVisible();
    await expect(nav).not.toContainText(retiredCopy);
    const links = await nav.locator('a').evaluateAll((elements) => elements.map((element) => element.getAttribute('href') ?? ''));
    expect(links.filter((href) => retired.test(href))).toEqual([]);
    await expect(nav.getByRole('link', { name: 'เมนูอาหาร', exact: true })).toBeVisible();
  });
}

for (const prefix of ['/manage', '', '/work']) {
  for (const path of ['/restaurant/recipes', '/restaurant/recipes/example', '/restaurant/quick-stock', '/restaurant/forecast', '/inventory', '/inventory/batches']) {
    test(`retired deep link ${prefix}${path} does not render its form or call its API`, async ({ page }) => {
      await page.goto(`${prefix}${path}`);
      await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
      await expect(page.locator('form')).toHaveCount(0);
      await expect(page.locator('body')).not.toContainText(retiredCopy);
    });
  }
}

test('queue and POS remain accessible with synthetic data', async ({ page }) => {
  await page.goto('/manage/restaurant/queue');
  await expect(page.getByRole('status')).toHaveText('ยังไม่มีออเดอร์ที่ชำระแล้วรอทำอาหาร');
  await page.goto('/manage/pos');
  await expect(page.getByRole('combobox', { name: 'เครื่องขายที่ใช้งาน' })).toHaveValue('retirement-terminal');
  await expect(page.getByRole('textbox', { name: 'สแกนบาร์โค้ด', exact: true })).toBeVisible();
});

for (const [status, button] of [['PENDING', 'เริ่มเตรียมสินค้า'], ['PREPARING', 'พร้อมรับสินค้า']]) {
  test(`unpaid ${status} order cannot advance in management`, async ({ page }) => {
    await page.goto(`/manage/online-orders/${status.toLowerCase()}`);
    await expect(page.getByText('WEB-UNPAID')).toBeVisible();
    await expect(page.getByRole('button', { name: button })).toBeDisabled();
  });
}

test('management kitchen queue renders paid order channels and statuses', async ({ page }) => {
  await page.goto('/manage/restaurant/queue');
  await expect(page.getByRole('status')).toHaveText('ยังไม่มีออเดอร์ที่ชำระแล้วรอทำอาหาร');
  queueVisible.set(page, true);
  await page.getByRole('button', { name: 'อัปเดตคิว' }).click();
  await expect(page.getByRole('row', { name: /001.*ทานที่ร้าน · โต๊ะ T01.*รอทำ/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /002.*รับที่ร้าน.*กำลังทำ/ })).toBeVisible();
  await expect(page.getByRole('row', { name: /003.*จัดส่ง.*พร้อมรับ/ })).toBeVisible();
});

for (const width of [320, 1440]) {
  test(`menu-only item with null availability enters local basket at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/shop/retirement-fixture');
    const menu = page.getByRole('article', { name: 'เมนูเดิมสูตรเก่า' });
    const tracked = page.getByRole('article', { name: 'สินค้าจำกัดจำนวน' });
    await expect(menu).toBeVisible();
    await expect(menu).not.toContainText(/null|สินค้ายังไม่พร้อมขาย|หมด|out of stock|unavailable/i);
    await expect(tracked.getByRole('spinbutton')).toHaveAttribute('max', '2');
    const quantity = menu.getByRole('spinbutton');
    await expect(quantity).toBeEnabled();
    await quantity.fill('3');
    await expect(menu.getByRole('button', { name: 'เพิ่มลงตะกร้า' })).toBeEnabled();
    await page.screenshot({ path: testInfo.outputPath(`storefront-${width}.png`), fullPage: true, animations: 'disabled' });
    await menu.getByRole('button', { name: 'เพิ่มลงตะกร้า' }).click();
    await page.getByRole('link', { name: 'ตะกร้า (1)' }).click();
    await expect(page).toHaveURL(/\/shop\/retirement-fixture\/cart$/);
    await expect(page.getByRole('textbox', { name: 'จำนวน เมนูเดิมสูตรเก่า', exact: true })).toHaveValue('3');
    await expect(page.getByRole('main')).not.toContainText(/null|สินค้ายังไม่พร้อมขาย|หมด|out of stock/i);
  });
}

for (const name of ['นโยบายไม่รู้จัก', 'นโยบายขาดหาย']) {
  test(`product with ${name} is restricted even with positive availability`, async ({ page }) => {
    await page.goto('/shop/retirement-fixture');
    const card = page.getByRole('article', { name });
    await expect(card).toBeVisible();
    await expect(card.getByRole('button', { name: 'เพิ่มลงตะกร้า' })).toBeDisabled();
    await expect(card.getByRole('spinbutton')).toBeDisabled();
  });
}
