import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ status: 401, json: { error: { code: 'UNAUTHORIZED' } } }),
  );
});

for (const width of [320, 375, 768, 1024, 1440, 1920]) {
  test(`landing page fits the viewport at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'จัดการร้านให้ง่ายขายได้อย่างมั่นใจ',
    );
    await expect(
      page.getByRole('heading', { name: 'พร้อมดูแลร้าน ใน 3 ขั้นตอน' }),
    ).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' }),
    ).toHaveCount(0);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', width);
    await expect(page.locator('.landing-access')).toHaveCount(0);
    await expect(page.locator('.landing-access-grid')).toHaveCount(0);
    const containers = await page.locator('.landing-container').all();
    for (const container of containers) {
      const bounds = await container.boundingBox();
      expect(bounds).not.toBeNull();
      if (!bounds) throw new Error('Landing container has no bounding box');
      const expectedWidth = width >= 768 ? width * 0.7 : width - 40;
      const expectedMargin = (width - expectedWidth) / 2;
      expect(bounds.width).toBeCloseTo(expectedWidth, 0);
      expect(bounds.x).toBeCloseTo(expectedMargin, 0);
      expect(width - bounds.x - bounds.width).toBeCloseTo(expectedMargin, 0);
    }
    await page.screenshot({
      path: `test-results/landing-${width}.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
  });
}
test('landing actions lead to existing routes and the guide anchor', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'ดูวิธีใช้งาน' }).click();
  await expect(page).toHaveURL(/\/#how-it-works$/);
  await expect(
    page.getByRole('heading', { name: 'พร้อมดูแลร้าน ใน 3 ขั้นตอน' }),
  ).toBeInViewport();
  await page.getByRole('link', { name: 'เริ่มต้นใช้งาน' }).click();
  await expect(page).toHaveURL(/\/register$/);
  await page.goto('/');
  await page.getByRole('link', { name: 'เข้าสู่ระบบ' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/');
  await page.getByRole('link', { name: 'คู่มือการใช้งาน' }).click();
  await expect(page).toHaveURL(/\/help$/);
});
test('landing supports keyboard access to the main content', async ({
  page,
}) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('link', { name: 'ข้ามไปเนื้อหาหลัก' }),
  ).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#landing-main')).toBeFocused();
});
