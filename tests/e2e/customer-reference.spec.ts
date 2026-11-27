import { expect, test, type Page } from '@playwright/test';

// Synthetic customer-page fixture; no real store, order or payment data.
const product = {
  variant_id: '11111111-1111-4111-8111-111111111111',
  product_name: 'ข้าวกะเพราไก่ไข่ดาว',
  variant_name: 'จานปกติ',
  sku: 'UI-REF',
  unit: 'จาน',
  unit_type: 'COUNT',
  unit_price: '65.00',
  available: '20.000',
  stock_policy: 'TRACKED',
  saleable: true,
  published: true,
  category_id: '22222222-2222-4222-8222-222222222222',
  category_name: 'อาหารตามสั่ง',
};
const store = {
  slug: 'ui-test',
  name: 'กะเพราพี่ต้น ร้านทดสอบ',
  description: 'อาหารตามสั่งปรุงสด',
  accepting_orders: true,
  delivery_enabled: true,
  shipping_fee: '20.00',
  published: true,
  contact_phone: '020000000',
  pickup_instructions: 'รับที่เคาน์เตอร์',
  revision: 1,
};
const directory = [
  {
    slug: store.slug,
    name: store.name,
    accepting_orders: true,
    business_type: 'RESTAURANT',
    average_rating: 4.8,
    review_count: 12,
    delivery_enabled: true,
  },
  {
    slug: 'tea',
    name: 'ชานมทดสอบ',
    accepting_orders: false,
    business_type: 'CAFE',
    average_rating: null,
    review_count: 0,
  },
];
const line = { ...product, quantity: '1.000', line_total: '65.00' };
const order = {
  id: 'o1',
  number: 'VP-UI-0001',
  status: 'PENDING',
  payment_status: 'UNPAID',
  estimated_total: '65.00',
  final_total: null,
  receipt_number: null,
  store_name: store.name,
  store_phone: '',
  pickup_instructions: store.pickup_instructions,
  expires_at: '2026-12-01T12:00:00Z',
  items: [line],
  events: [
    {
      status: 'PENDING',
      message: 'received',
      created_at: '2026-11-26T03:24:00Z',
    },
  ],
};
const token = 'a'.repeat(64);

async function fixture(page: Page, baseURL: string, directoryRows = directory) {
  const origin = new URL(baseURL).origin;
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname === '/api/v1/auth/me')
      return route.fulfill({
        status: 401,
        json: { error: { code: 'UNAUTHORIZED' } },
      });
    const path = url.pathname;
    let data: unknown;
    if (path === '/api/v1/storefronts') data = directoryRows;
    else if (path.endsWith('/products'))
      data = {
        items: [product],
        total: 1,
        page: 1,
        page_size: 24,
        categories: [
          { id: product.category_id, name: 'อาหารตามสั่ง', count: 1 },
        ],
      };
    else if (path.endsWith('/track')) data = order;
    else if (path === `/api/v1/storefronts/${store.slug}`) data = store;
    else return route.abort();
    return route.fulfill({ json: { data } });
  });
}

for (const width of [360, 390, 1280]) {
  test(`restaurant discovery works without area browsing at ${width}px`, async ({
    page,
    baseURL,
  }) => {
    await fixture(page, baseURL!);
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'สำรวจร้านตามพื้นที่' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'พื้นที่', exact: true })).toHaveCount(0);
    const search = page.getByRole('button', { name: 'ค้นหา', exact: true });
    await search.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/shop$/);
    await expect(page.getByRole('link', { name: 'พื้นที่', exact: true })).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'เลือกพื้นที่' })).toHaveCount(0);
    const shop = page.getByRole('link', { name: store.name, exact: true });
    await expect(shop).toBeVisible();
    await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await shop.click();
    await expect(page.getByRole('heading', { level: 1, name: store.name })).toBeVisible();
  });
}

test('legacy area links redirect to the directory and keep supported filters', async ({
  page,
  baseURL,
}) => {
  await fixture(page, baseURL!);
  await page.goto('/areas');
  await expect(page).toHaveURL(/\/shop$/);
  await page.goto('/areas/campus?q=fixture&filter=open&sort=name&view=cart');
  await expect(page).toHaveURL(/\/shop\?q=fixture&filter=open&sort=name$/);
  await expect(page.getByRole('searchbox', { name: 'ค้นหาร้าน' })).toHaveValue('fixture');
  await expect(page.getByRole('button', { name: 'เปิดรับออเดอร์' })).toHaveAttribute('aria-pressed', 'true');
});

test('directory restores its filters and scroll after visiting a store', async ({
  page,
  baseURL,
}) => {
  const moreStores = Array.from({ length: 16 }, (_, index) => ({
    ...directory[0],
    slug: `fixture-${index}`,
    name: `${store.name} ${index + 1}`,
  }));
  await fixture(page, baseURL!, [...moreStores, ...directory]);
  await page.setViewportSize({ width: 1280, height: 540 });
  await page.goto('/');
  await page.getByRole('button', { name: 'ค้นหา', exact: true }).click();
  await expect(page).toHaveURL(/\/shop$/);
  await expect(
    page.getByRole('heading', { name: 'ค้นหาร้านอาหารในชุมชนของคุณ', level: 1 }),
  ).toBeVisible();
  const search = page.getByRole('searchbox', {
    name: 'ค้นหาร้าน',
    exact: true,
  });
  const openFilter = page.getByRole('button', { name: 'เปิดรับออเดอร์' });
  const shopLink = page.getByRole('link', { name: store.name, exact: true });
  await search.fill('ร้านทดสอบ');
  await expect(page).toHaveURL(/[?&]q=/);
  await openFilter.click();
  await expect(page.getByText('แสดง 17 ร้าน')).toBeVisible();
  await shopLink.scrollIntoViewIfNeeded();
  const previousScroll = await page.evaluate(() => window.scrollY);
  expect(previousScroll).toBeGreaterThan(300);
  await shopLink.click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(store.name);
  await page.getByRole('link', { name: 'กลับไปยังผลการค้นหา' }).click();
  await expect(search).toHaveValue('ร้านทดสอบ');
  await expect(openFilter).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBe(previousScroll);

});

test('mobile directory keeps the quick filters and reveals store types on demand', async ({
  page,
  baseURL,
}) => {
  await fixture(page, baseURL!);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/shop');
  const type = page.getByRole('combobox', { name: 'ประเภทร้าน' });
  await expect(type).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'เปิดรับออเดอร์' }),
  ).toBeVisible();
  const filters = page.locator('summary').getByText('ตัวกรอง');
  await filters.focus();
  await page.keyboard.press('Enter');
  await type.selectOption('CAFE');
  await expect(page.getByRole('heading', { name: 'ชานมทดสอบ' })).toBeVisible();
  await expect(page.getByRole('heading', { name: store.name })).toHaveCount(0);
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

const pages = [
  ['/shop', 'ค้นหาร้านอาหารในชุมชนของคุณ'],
  ['/shop/ui-test', store.name],
  ['/shop/ui-test/cart', 'ตะกร้าของคุณ'],
  [`/shop/ui-test/orders/o1#access=${token}`, 'คำสั่งซื้อของฉัน'],
] as const;

for (const width of [320, 390, 768, 1440]) {
  test(`customer reference pages fit and keep navigation at ${width}px`, async ({
    page,
    baseURL,
  }, testInfo) => {
    await fixture(page, baseURL!);
    await page.setViewportSize({ width, height: 900 });
    await page.addInitScript(() => {
      localStorage.setItem(
        'shop-cart:ui-test',
        JSON.stringify([
          {
            variant_id: '11111111-1111-4111-8111-111111111111',
            product_name: 'ข้าวกะเพราไก่ไข่ดาว',
            variant_name: 'จานปกติ',
            sku: 'UI-REF',
            unit: 'จาน',
            unit_type: 'COUNT',
            unit_price: '65.00',
            quantity: '1.000',
          },
        ]),
      );
    });
    for (const [path, heading] of pages) {
      await page.goto(path);
      await expect(
        page.getByRole('heading', { level: 1, name: heading }),
      ).toBeVisible();
      if (width > 1180)
        await expect(
          page.getByRole('navigation', { name: 'เมนูหน้าร้านลูกค้า' }).first(),
        ).toBeVisible();
      else
        await expect(page.getByRole('button', { name: 'เมนู' })).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        `${path} has no horizontal scroll at ${width}px`,
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(
          `${path.replace(/[^a-z0-9]+/gi, '-').replace(/-+$/, '')}-${width}.png`,
        ),
        fullPage: true,
      });
    }
  });
}

for (const width of [360, 390, 1280]) {
  test(`guest discovery and shared sign-in are available at ${width}px`, async ({
    page,
    baseURL,
  }) => {
    await fixture(page, baseURL!);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page
      .getByRole('region', { name: 'ประเภทอาหาร' })
      .getByRole('link', { name: 'ดูร้านทั้งหมด' })
      .click();
    await expect(page).toHaveURL(/\/shop$/);
    await expect(
      page.getByRole('searchbox', { name: 'ค้นหาร้าน' }),
    ).toBeVisible();
    await expect(page.getByRole('link', { name: store.name })).toBeVisible();
    const customerNav = page.getByRole('navigation', {
      name: 'เมนูหน้าร้านลูกค้า',
    });
    await expect(
      page
        .getByRole('banner')
        .getByRole('link', { name: 'เข้าสู่ระบบ', exact: true }),
    ).toHaveAttribute('href', '/login?returnTo=%2Fshop');
    const menu = page.getByRole('button', { name: 'เมนู', exact: true });
    if (width < 768) await menu.click();
    const returnHome = customerNav.getByRole('link', { name: 'กลับหน้าแรก' });
    await expect(returnHome).toBeVisible();
    await expect(
      customerNav.locator(
        'a[href="/login"], a[href="/register"], a[href="/workspace"]',
      ),
    ).toHaveCount(0);
    await returnHome.click();
    await expect(page).toHaveURL(/\/$/);

    const signIn = page
      .getByRole('banner')
      .getByRole('link', { name: 'เข้าสู่ระบบ', exact: true });
    await expect(signIn).toBeInViewport();
    await signIn.click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole('heading', { name: 'เข้าสู่ระบบ', level: 1 }),
    ).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
    expect(errors).toEqual([]);
  });
}

test('tracking keeps Start payment reachable at 320px', async ({
  page,
  baseURL,
}) => {
  await fixture(page, baseURL!);
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto(`/shop/ui-test/orders/o1#access=${token}`);
  const start = page.getByRole('button', { name: 'เริ่มชำระเงิน' });
  await start.scrollIntoViewIfNeeded();
  await expect(start).toBeInViewport();
  const box = await start.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  await expect(page.getByText('โหมดทดสอบ')).toBeVisible();
});

test('menu details open from a product card and close with Escape', async ({
  page,
  baseURL,
}) => {
  await fixture(page, baseURL!);
  await page.goto('/shop/ui-test');
  const opener = page.getByRole('button', {
    name: `ดูรายละเอียด ${product.product_name}`,
  });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: product.product_name });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(opener).toBeFocused();
});
