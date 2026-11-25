import { expect, test } from '@playwright/test';

test.use({ channel: process.env.E2E_BROWSER_CHANNEL });

for (const width of [320, 360, 390, 767, 768, 900, 1024, 1280, 1440, 1672]) {
  test(`login reference layout and controls at ${width}px`, async ({
    page,
  }, testInfo) => {
    const writes: string[] = [];
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/**', (route) => {
      if (
        new URL(route.request().url()).pathname === '/api/v1/auth/google/config'
      ) {
        return route.fulfill({ json: { data: { enabled: true } } });
      }
      if (route.request().method() !== 'GET') {
        writes.push(route.request().method());
      }
      return route.fulfill({
        status: 401,
        json: { error: { code: 'UNAUTHORIZED', message: 'UI-only fixture' } },
      });
    });
    await page.setViewportSize({ width, height: width === 1672 ? 941 : 900 });
    await page.goto('/login');
    await page.getByRole('button', { name: 'ไทย', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'ยินดีต้อนรับกลับ' }),
    ).toBeVisible();
    await page.evaluate(() => document.fonts.ready);

    const visual = page.getByRole('region', { name: 'จัดการร้านให้ง่ายขึ้น' });
    const panel = page.getByRole('region', { name: 'ยินดีต้อนรับกลับ' });
    await expect(panel.getByRole('button', { name: /Google/ })).toBeEnabled();
    const illustration = visual.getByRole('img', {
      name: /เครื่องขายหน้าร้าน/,
    });
    await expect(illustration).toBeVisible();
    await expect
      .poll(() =>
        illustration.evaluate((image: HTMLImageElement) => image.naturalWidth),
      )
      .toBe(1729);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);

    const visualBounds = await visual.boundingBox();
    const panelBounds = await panel.boundingBox();
    expect(visualBounds).not.toBeNull();
    expect(panelBounds).not.toBeNull();
    if (width >= 768) {
      expect(panelBounds!.x).toBeGreaterThanOrEqual(
        visualBounds!.x + visualBounds!.width - 1,
      );
    } else {
      expect(panelBounds!.y).toBeGreaterThanOrEqual(
        visualBounds!.y + visualBounds!.height - 1,
      );
      const title = visual.getByRole('heading');
      expect((await illustration.boundingBox())!.y).toBeLessThan(
        (await title.boundingBox())!.y,
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
    const recoveryLink = page.getByRole('link', { name: 'Forgot password?' });
    const submit = page.getByRole('button', { name: 'Sign in', exact: true });
    await expect(recoveryLink).toBeVisible();
    await expect(submit).toBeVisible();
    expect((await recoveryLink.boundingBox())!.y).toBeLessThan(
      (await submit.boundingBox())!.y,
    );
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

test('login uses the full-width account header with home and language controls', async ({
  page,
}) => {
  await page.route('**/api/**', (route) =>
    route.fulfill({ status: 401, json: { error: { code: 'UNAUTHORIZED' } } }),
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/login');
  await page.getByRole('button', { name: 'ไทย', exact: true }).click();

  const header = page.getByRole('banner');
  await expect(header.getByRole('link')).toHaveCount(1);
  await expect(header.getByRole('link')).toHaveAttribute('href', '/');
  await expect(header.getByRole('navigation')).toHaveCount(0);
  await expect(header.getByRole('group').getByRole('button')).toHaveCount(2);
  expect(await header.boundingBox()).toMatchObject({ x: 0, width: 1440 });
});

for (const { destination, target } of [
  { destination: '/#for-merchants', target: '#for-merchants' },
  { destination: '/help#help-support', target: '#help-support' },
]) {
  test(`public link scrolls to ${target} after the destination loads`, async ({
    page,
  }) => {
    await page.route('**/api/**', (route) =>
      route.fulfill({ status: 401, json: { error: { code: 'UNAUTHORIZED' } } }),
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(destination);

    await expect(page).toHaveURL(destination);
    await expect(page.locator(target).getByRole('heading')).toBeInViewport();
  });
}
