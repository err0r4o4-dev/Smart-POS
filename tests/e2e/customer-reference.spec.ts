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

async function fixture(page: Page, baseURL: string) {
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
    if (path === '/api/v1/storefronts') data = directory;
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

const pages = [
  ['/shop', 'สำรวจร้านอาหาร'],
  ['/areas', 'พื้นที่และชุมชน'],
  ['/areas/campus', 'มศว องครักษ์'],
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

test('header food categories link scrolls the home page to the categories', async ({
  page,
  baseURL,
}) => {
  await fixture(page, baseURL!);
  // Short viewport so the categories section starts below the fold.
  await page.setViewportSize({ width: 1440, height: 400 });
  await page.goto('/shop');
  await page
    .getByRole('navigation', { name: 'เมนูหน้าร้านลูกค้า' })
    .first()
    .getByRole('link', { name: 'หมวดหมู่อาหาร' })
    .click();
  await expect(page).toHaveURL(/\/#landing-categories$/);
  const heading = page.locator('#landing-categories');
  await heading.waitFor();
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(100);
  await expect(heading).toBeInViewport();
});

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
