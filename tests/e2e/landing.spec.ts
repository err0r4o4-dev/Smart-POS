import { expect, test } from '@playwright/test';

const shops = [
  {
    slug: 'krapao',
    name: 'กะเพราพี่ต้น',
    accepting_orders: true,
    business_type: 'RESTAURANT',
  },
  {
    slug: 'mr-tea',
    name: 'Mr.Tea',
    accepting_orders: false,
    business_type: 'CAFE',
  },
  {
    slug: 'bakery',
    name: 'ร้านขนมบ้านสวน',
    accepting_orders: false,
    business_type: 'BAKERY',
  },
  {
    slug: 'grill',
    name: 'ไก่ย่างริมทาง',
    accepting_orders: false,
    business_type: 'FAST_FOOD',
  },
];

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', (route) => route.abort());
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ status: 401, json: { error: { code: 'UNAUTHORIZED' } } }),
  );
  await page.route('**/api/v1/storefronts', (route) =>
    route.fulfill({ json: { data: shops } }),
  );
});

for (const width of [
  320, 360, 390, 767, 768, 1023, 1024, 1280, 1536, 1672, 1920,
]) {
  test(`home page fits the viewport at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'ค้นหาร้านอาหารในชุมชนของคุณ',
    );
    await expect(
      page.getByRole('list', { name: 'ร้านแนะนำ' }).getByRole('listitem'),
    ).toHaveCount(4);
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    for (const container of await page.locator('.landing-container').all()) {
      const bounds = await container.boundingBox();
      if (!bounds) throw new Error('Landing container has no bounding box');
      const expectedWidth = Math.min(1344, width - (width >= 768 ? 48 : 32));
      expect(bounds.width).toBeCloseTo(expectedWidth, 0);
      expect(bounds.x).toBeCloseTo((width - expectedWidth) / 2, 0);
    }
    const header = await page.locator('.landing-header').boundingBox();
    expect(header!.height).toBeCloseTo(66, 0);
    if (width < 768) {
      const copy = (await page.locator('.landing-hero-copy').boundingBox())!;
      const food = (await page.locator('.landing-hero-art').boundingBox())!;
      expect(food.y).toBeGreaterThanOrEqual(copy.y + copy.height);
    }
    await page.locator('main img').evaluateAll(async (images) => {
      await Promise.all(
        images.map(async (element) => {
          const image = element as HTMLImageElement;
          // Load offscreen images before capturing the full page at narrow widths.
          image.loading = 'eager';
          await image.decode();
        }),
      );
    });
    await page.screenshot({
      path: testInfo.outputPath(`home-${width}.png`),
      fullPage: true,
      animations: 'disabled',
    });
    expect(errors).toEqual([]);
  });
}

test('hero search opens the shop directory with the query applied', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await page.getByRole('searchbox', { name: 'ค้นหาร้านอาหาร' }).fill('กะเพรา');
  await page.getByRole('button', { name: 'ค้นหา', exact: true }).click();
  await expect(page).toHaveURL(/\/shop\?q=/);
  await expect(page.getByRole('searchbox', { name: 'ค้นหาร้าน' })).toHaveValue(
    'กะเพรา',
  );
  await expect(
    page.getByRole('heading', { name: 'กะเพราพี่ต้น' }),
  ).toBeVisible();
});

test('filters published stores, keeps favorites, and opens the shop cart selector', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const list = page.getByRole('list', {
    name: 'ร้านแนะนำ',
  });
  await page.getByRole('button', { name: 'เปิดรับออเดอร์' }).click();
  await expect(
    list.getByRole('link', { name: 'กะเพราพี่ต้น' }),
  ).toHaveAttribute('href', '/shop/krapao');
  await expect(list.getByRole('link', { name: 'Mr.Tea' })).toHaveCount(0);
  const favourite = page.getByRole('button', {
    name: 'บันทึก กะเพราพี่ต้น เป็นร้านโปรด',
  });
  await favourite.click();
  await expect(favourite).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await page.getByRole('button', { name: 'ร้านโปรด', exact: true }).click();
  await expect(list.getByRole('link', { name: 'กะเพราพี่ต้น' })).toBeVisible();
  await page.goto('/shop?view=cart');
  await expect(
    page
      .getByRole('article', { name: 'กะเพราพี่ต้น' })
      .getByRole('link', { name: 'เปิดตะกร้า' }),
  ).toHaveAttribute('href', '/shop/krapao/cart');
  await page.goto('/');
  await page.getByRole('link', { name: /สมัครร้านค้าฟรี/ }).click();
  await expect(page).toHaveURL(/\/register$/);
  await page.goto('/');
  await page.getByRole('link', { name: 'เข้าสู่ระบบร้านค้า' }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('mobile navigation opens sign-in directly with the keyboard', async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'เมนู' });
  await menu.waitFor({ state: 'visible' });
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'ข้ามไปเนื้อหาหลัก' }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'VELO POS หน้าแรก' }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(menu).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  const navigation = page.getByRole('navigation', { name: 'เมนูหน้าแรก' });
  const signIn = navigation.getByRole('link', { name: 'เข้าสู่ระบบ', exact: true });
  await expect(signIn).toHaveAttribute('href', '/login');
  for (const name of [
    'หน้าหลัก',
    'สำรวจร้าน',
    'พื้นที่และชุมชน',
    'หมวดหมู่อาหาร',
    'สำหรับร้านค้า',
  ])
    await expect(
      navigation.getByRole('link', { name, exact: true }),
    ).toHaveCount(0);
  for (let i = 0; i < 3; i++) await page.keyboard.press('Tab');
  await expect(signIn).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole('heading', { name: 'เข้าสู่ระบบร้านค้า' }),
  ).toBeVisible();
});

test('home supports keyboard access to the main content', async ({ page }) => {
  await page.goto('/');
  await page.locator('.skip-link').waitFor({ state: 'attached' });
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'ข้ามไปเนื้อหาหลัก' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#landing-main')).toBeFocused();
});

test('the header logo keeps visible keyboard focus and its home destination', async ({
  page,
}) => {
  await page.goto('/');
  const headerLogo = page
    .getByRole('banner')
    .getByRole('link', { name: 'VELO POS หน้าแรก' });
  await page.locator('.skip-link').waitFor({ state: 'attached' });
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(headerLogo).toBeFocused();
  await expect(headerLogo).toHaveCSS('outline-style', 'solid');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/$/);
});

test('the header switches the home page to English', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await page
    .getByRole('banner')
    .getByRole('button', { name: 'English', exact: true })
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(
    'Find restaurants in your community',
  );
  await expect(
    page.getByRole('contentinfo').getByRole('heading', { name: 'Follow us' }),
  ).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
});
