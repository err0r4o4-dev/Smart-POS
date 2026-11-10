import { expect, test, type Page, type TestInfo } from '@playwright/test';

const product = {
  variant_id: '11111111-1111-4111-8111-111111111111',
  product_name: 'ข้าวกะเพราไก่ไข่ดาว เมนูทดสอบชื่อยาวสำหรับหน้าจอมือถือ',
  variant_name: 'สูตรต้นตำรับ',
  sku: 'UI-ONLY',
  unit: 'จาน',
  unit_type: 'COUNT',
  unit_price: '89.50',
  quantity: '1.000',
  available: '20.000',
  stock_policy: 'TRACKED',
  saleable: true,
  published: true,
};
const store = {
  slug: 'ui-test',
  name: 'ครัวอุ่นใจ ร้านอาหารทดสอบ',
  description: 'อาหารตามสั่งปรุงสด พร้อมรับที่ร้าน',
  accepting_orders: true,
  delivery_enabled: true,
  published: true,
  contact_phone: '',
  pickup_instructions: 'รับอาหารที่เคาน์เตอร์',
  revision: 1,
  business_type: 'RESTAURANT',
};
const quote = {
  quote_id: 'ui-quote',
  items: [{ ...product, line_total: '89.50' }],
  estimated_total: '89.50',
  currency: 'THB',
};
const order = {
  id: 'ui-order',
  number: 'WEB-UI-TEST',
  status: 'PENDING',
  payment_status: 'UNPAID',
  estimated_total: '89.50',
  final_total: null,
  receipt_number: null,
  store_name: store.name,
  store_phone: '',
  pickup_instructions: store.pickup_instructions,
  expires_at: '2026-12-01T12:00:00Z',
  items: quote.items,
  events: [
    {
      status: 'PENDING',
      message: 'รับคำสั่งซื้อแล้ว',
      created_at: '2026-11-10T10:00:00Z',
    },
  ],
};

test.beforeEach(async ({ page, baseURL }) => {
  const origin = new URL(baseURL!).origin;
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname === '/api/v1/auth/me') {
      return route.fulfill({
        status: 401,
        json: { error: { code: 'UNAUTHORIZED' } },
      });
    }
    const path = url.pathname;
    let data: unknown;
    if (path === '/api/v1/storefronts') data = [store];
    else if (path.endsWith('/products'))
      data = {
        items: [product],
        total: 1,
        page: 1,
        page_size: 24,
        categories: [],
      };
    else if (path.endsWith('/quote')) data = quote;
    else if (path.endsWith('/track') || path.endsWith('/orders')) data = order;
    else if (path === '/api/v1/storefronts/ui-test') data = store;
    else return route.abort();
    return route.fulfill({ json: { data } });
  });
});

for (const width of [320, 768, 1440, 1920, 2560]) {
  test(`background composition stays stable as content grows at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 600 });
    await page.goto('/shop');
    await expect(page.getByRole('heading', { name: store.name })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    const content = page.locator('.storefront-content');
    await content.evaluate((element) => {
      element.style.minHeight = '1000px';
    });
    await page.addStyleTag({
      content: '.shop-directory-shell > * { visibility: hidden !important; }',
    });
    const captureBackground = async () => {
      const styles = await page.evaluate(() => {
        const shell = document.querySelector('.storefront-shell')!;
        const shellStyle = getComputedStyle(shell);
        const wavesStyle = getComputedStyle(shell, '::before');
        return {
          shellHeight: shell.getBoundingClientRect().height,
          backgroundImage: shellStyle.backgroundImage,
          backgroundPosition: shellStyle.backgroundPosition,
          backgroundSize: shellStyle.backgroundSize,
          backgroundRepeat: shellStyle.backgroundRepeat,
          wavesContent: wavesStyle.content,
          wavesImage: wavesStyle.backgroundImage,
          wavesPosition: wavesStyle.backgroundPosition,
          wavesSize: wavesStyle.backgroundSize,
          wavesHeight: wavesStyle.height,
        };
      });
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
      return styles;
    };
    const short = await captureBackground();
    await content.evaluate((element) => {
      element.style.minHeight = '4000px';
    });
    const long = await captureBackground();
    expect(short.backgroundImage).toContain(
      '/images/shop-directory-background.svg',
    );
    expect(short.backgroundSize).toBe('max(100%, 960px) auto');
    expect(short.backgroundPosition).toBe('50% 0%');
    expect(short.backgroundRepeat).toBe('no-repeat');
    expect(short.wavesContent).toBe('""');
    expect(short.wavesImage).toContain(
      '/images/shop-directory-bottom-waves.svg',
    );
    expect(short.wavesPosition).toBe('50% 100%');
    expect(short.wavesSize).toBe('cover');
    expect(short.wavesHeight).not.toBe('0px');
    for (const asset of [
      '/images/shop-directory-background.svg',
      '/images/shop-directory-bottom-waves.svg',
    ]) {
      const response = await page.request.get(asset);
      expect(response.ok(), `${asset} should be served`).toBe(true);
      expect(response.headers()['content-type']).toContain('image/svg+xml');
    }
    expect(long.backgroundSize).toBe(short.backgroundSize);
    expect(long.backgroundPosition).toBe(short.backgroundPosition);
    expect(long.wavesHeight).toBe(short.wavesHeight);
    await page.setViewportSize({ width, height: 1200 });
    const tall = await captureBackground();
    expect(tall.backgroundSize).toBe(long.backgroundSize);
    expect(tall.backgroundPosition).toBe(long.backgroundPosition);
    expect(tall.wavesHeight).toBe(long.wavesHeight);
    await testInfo.attach('background-contract', {
      body: Buffer.from(JSON.stringify({ short, long, tall }, null, 2)),
      contentType: 'application/json',
    });
  });
}

async function assertPage(
  page: Page,
  width: number,
  state: string,
  testInfo: TestInfo,
) {
  await page.evaluate(() => document.fonts.ready);
  await expect(page.locator('.storefront-shell')).toHaveClass(
    /shop-directory-shell/,
  );
  await expect(page.locator('.shop-directory-footer')).toBeVisible();
  const overflow = await page.evaluate(() =>
    Array.from(document.querySelectorAll('body *'))
      .filter((element) => element.getBoundingClientRect().right > innerWidth)
      .map((element) => `${element.tagName}.${element.className}`),
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
    `${state}: ${overflow.join(', ')}`,
  ).toBeLessThanOrEqual(width);
  const content = (await page.locator('.storefront-content').boundingBox())!;
  const gutter = width < 768 ? 16 : 24;
  expect(content.width).toBeCloseTo(Math.min(1232, width - 2 * gutter), 0);
  const header = (await page.locator('.storefront-header').boundingBox())!;
  expect(header.height).toBeCloseTo(66, 0);
  for (const control of await page
    .locator('.storefront-header a, .storefront-header button')
    .all()) {
    const bounds = (await control.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(gutter);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width - gutter);
    expect(bounds.width).toBeGreaterThanOrEqual(44);
    expect(bounds.height).toBeGreaterThanOrEqual(44);
  }
  if (width === 320 || width === 1440) {
    await page.screenshot({
      path: testInfo.outputPath(`${state}-${width}.png`),
      fullPage: true,
      animations: 'disabled',
    });
  }
}

for (const width of [320, 375, 768, 1024, 1440]) {
  test(`customer journey keeps the directory visual language at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/shop');
    await expect(page.getByRole('heading', { name: store.name })).toBeVisible();
    await assertPage(page, width, 'directory', testInfo);
    await page.getByRole('link', { name: 'ดูหน้าร้าน', exact: true }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: store.name }),
    ).toBeVisible();
    await expect(page.getByText(store.description)).toBeVisible();
    await expect(
      page.getByRole('heading', { name: product.product_name }),
    ).toBeVisible();
    await assertPage(page, width, 'catalog', testInfo);
    await page
      .getByRole('button', { name: 'เพิ่มลงตะกร้า', exact: true })
      .click();
    await page.locator('.storefront-cart-link').click();
    await expect(
      page.getByRole('heading', { name: product.product_name }),
    ).toBeVisible();
    await expect(page.locator('[aria-current="step"]')).toHaveText(
      /ตะกร้าสินค้า/,
    );
    await expect(
      page.getByRole('button', { name: 'เมนู', exact: true }),
    ).toHaveCount(0);
    await assertPage(page, width, 'cart', testInfo);
    await page.getByRole('button', { name: 'ตรวจรายการและยอดล่าสุด' }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'ยืนยันคำสั่งซื้อ' }),
    ).toBeVisible();
    await expect(page.locator('[aria-current="step"]:visible')).toHaveText(
      /ยืนยันคำสั่งซื้อ/,
    );
    await assertPage(page, width, 'review', testInfo);
    await page.getByLabel('ชื่อผู้รับสินค้า').fill('UI Test');
    await page.getByLabel('เบอร์ติดต่อ').fill('0800000000');
    await page.getByRole('checkbox').check();
    await page
      .getByRole('button', { name: 'ส่งออเดอร์ · ยังไม่ชำระเงิน' })
      .click();
    await expect(page.getByText(order.number)).toBeVisible();
    await expect(page.locator('[aria-current="step"]')).toHaveText(
      /ติดตามออเดอร์/,
    );
    await expect(
      page.getByRole('button', { name: 'เริ่มชำระเงิน', exact: true }),
    ).toBeEnabled();
    await assertPage(page, width, 'tracking', testInfo);
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await expect(
      page.getByRole('navigation', { name: 'Order steps' }),
    ).toBeVisible();
    await assertPage(page, width, 'tracking-en', testInfo);
  });
}

test('cart keeps a keyboard-visible focus and a recoverable empty state', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 600 });
  await page.goto('/shop/ui-test/cart');
  await expect(
    page.getByRole('heading', { name: 'ตะกร้ายังว่าง' }),
  ).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  await assertPage(page, 320, 'cart-empty', testInfo);
});
