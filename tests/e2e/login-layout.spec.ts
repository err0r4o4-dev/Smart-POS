import { expect, test } from '@playwright/test';

test.use({ channel: process.env.E2E_BROWSER_CHANNEL });

for (const width of [320, 375, 700, 701, 768, 900, 901, 1024, 1440]) {
  test(`login reference layout and controls at ${width}px`, async ({
    page,
  }, testInfo) => {
    const writes: string[] = [];
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/**', (route) => {
      if (route.request().method() !== 'GET') {
        writes.push(route.request().method());
      }
      return route.fulfill({
        status: 401,
        json: { error: { code: 'UNAUTHORIZED', message: 'UI-only fixture' } },
      });
    });
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/login');
    await page.getByRole('button', { name: 'ไทย', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'ยินดีต้อนรับกลับ' }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    const visual = page.getByRole('region', { name: 'จัดการร้านให้ง่ายขึ้น' });
    const panel = page.getByRole('region', { name: 'ยินดีต้อนรับกลับ' });
    const illustration = visual.getByRole('img', {
      name: /เครื่องขายหน้าร้าน/,
    });
    await expect(illustration).toBeVisible();
    await expect
      .poll(() =>
        illustration.evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBe(620);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);

    const visualBounds = await visual.boundingBox();
    const panelBounds = await panel.boundingBox();
    expect(visualBounds).not.toBeNull();
    expect(panelBounds).not.toBeNull();
    if (width >= 1024) {
      expect(panelBounds!.x).toBeGreaterThanOrEqual(
        visualBounds!.x + visualBounds!.width - 1,
      );
    } else {
      expect(panelBounds!.y).toBeGreaterThanOrEqual(
        visualBounds!.y + visualBounds!.height - 1,
      );
    }
    await page.screenshot({
      path: testInfo.outputPath(`login-th-${width}.png`),
      fullPage: true,
    });

    await page
      .getByLabel('ที่อยู่อีเมล', { exact: true })
      .fill('synthetic@example.test');
    await page
      .getByLabel('รหัสผ่าน', { exact: true })
      .fill('synthetic-password');
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await expect(page.getByLabel('Email address', { exact: true })).toHaveValue(
      'synthetic@example.test',
    );
    await expect(page.getByLabel('Password', { exact: true })).toHaveValue(
      'synthetic-password',
    );
    await page
      .getByRole('button', { name: 'Show password', exact: true })
      .focus();
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute(
      'type',
      'text',
    );
    await page.keyboard.press('Enter');
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute(
      'type',
      'password',
    );
    await expect(
      page.getByRole('link', { name: 'Forgot password?' }),
    ).toHaveAttribute('href', '/forgot-password');
    await expect(
      page.getByRole('link', { name: 'Create account' }),
    ).toHaveAttribute('href', '/register');
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
  });
}
