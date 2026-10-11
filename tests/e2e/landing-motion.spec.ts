import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ status: 401, json: { error: { code: 'UNAUTHORIZED' } } }),
  );
});

test('Golden Orbit decorates the preview without changing public navigation', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const orbit = page.locator('.landing-preview-orbits');
  await expect(orbit).toHaveAttribute('aria-hidden', 'true');
  await expect(orbit.locator('span')).toHaveCount(3);
  await expect(
    page.getByRole('link', { name: 'เริ่มต้นใช้งาน' }),
  ).toHaveAttribute('href', '/register');
  await page.getByRole('link', { name: 'ดูวิธีใช้งาน' }).click();
  await expect(
    page.getByRole('heading', { name: 'พร้อมดูแลร้าน ใน 3 ขั้นตอน' }),
  ).toBeInViewport();
  await expect(page.locator('.landing-steps')).toHaveAttribute(
    'data-landing-reveal',
    'visible',
  );
});

test('the POS preview tilts only while a fine pointer is over it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const preview = page.locator('.landing-preview');
  const window = page.locator('.landing-pos-window');
  await preview.hover({ position: { x: 30, y: 60 } });
  await expect
    .poll(() =>
      preview.evaluate((element) =>
        element.style.getPropertyValue('--preview-rotate-y'),
      ),
    )
    .not.toBe('');
  await expect
    .poll(() =>
      preview.evaluate((element) =>
        element.style.getPropertyValue('--preview-rotate-y'),
      ),
    )
    .not.toBe('0deg');
  await page.getByRole('heading', { level: 1 }).hover();
  await expect
    .poll(() =>
      preview.evaluate((element) =>
        element.style.getPropertyValue('--preview-rotate-y'),
      ),
    )
    .toBe('');
  await expect(window).toBeVisible();
});

test('reduced motion disables decorative movement and preview tilt', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  for (const selector of [
    '.landing-hero-copy > h1',
    '.landing-preview',
    '.landing-preview-float',
    '.landing-step',
    '.landing-feature-grid article',
  ]) {
    for (const element of await page.locator(selector).all()) {
      await expect(element).toHaveCSS('animation-name', 'none');
      await expect(element).toHaveCSS('opacity', '1');
    }
  }
  const preview = page.locator('.landing-preview');
  await preview.hover({ position: { x: 30, y: 60 } });
  await expect(page.locator('.landing-pos-window')).toHaveCSS(
    'transform',
    'none',
  );
  expect(
    await preview.evaluate((element) =>
      element.style.getPropertyValue('--preview-rotate-y'),
    ),
  ).toBe('');
  await page.getByRole('link', { name: 'ดูวิธีใช้งาน' }).click();
  await expect(
    page.getByRole('heading', { name: 'พร้อมดูแลร้าน ใน 3 ขั้นตอน' }),
  ).toBeInViewport();
});

test('disabling motion at runtime resets an active tilt', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const preview = page.locator('.landing-preview');
  await preview.hover({ position: { x: 30, y: 60 } });
  await expect
    .poll(() =>
      preview.evaluate((element) =>
        element.style.getPropertyValue('--preview-rotate-y'),
      ),
    )
    .not.toBe('');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect
    .poll(() =>
      preview.evaluate((element) =>
        element.style.getPropertyValue('--preview-rotate-y'),
      ),
    )
    .toBe('');
  await expect(page.locator('.landing-pos-window')).toHaveCSS(
    'transform',
    'none',
  );
});

for (const width of [320, 375, 768, 1024, 1440, 1920]) {
  test(`Golden Orbit remains readable at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'เริ่มต้นใช้งาน' }),
    ).toBeVisible();
    await expect(page.getByRole('figure')).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBe(width);
    await page.screenshot({
      path: testInfo.outputPath(`golden-orbit-${width}.png`),
      fullPage: true,
    });
  });
}

test.describe('Golden Orbit on touch screens', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test('touch does not tilt the demo or animate its floating badges', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    const preview = page.locator('.landing-preview');
    await preview.tap();
    expect(
      await preview.evaluate((element) =>
        element.style.getPropertyValue('--preview-rotate-y'),
      ),
    ).toBe('');
    await expect(page.locator('.landing-pos-window')).toHaveCSS(
      'transform',
      'none',
    );
    for (const badge of await page.locator('.landing-preview-float').all()) {
      await expect(badge).toHaveCSS('animation-name', 'none');
    }
  });
});

test('content stays usable without IntersectionObserver', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'IntersectionObserver', { value: undefined });
  });
  await page.goto('/');
  await page.getByRole('link', { name: 'ดูวิธีใช้งาน' }).click();
  await expect(
    page.getByRole('heading', { name: 'ตั้งค่าร้านและสาขา' }),
  ).toBeVisible();
  await expect(
    page.getByRole('heading', { name: 'กำหนดสิทธิ์ให้เหมาะกับทีม' }),
  ).toBeVisible();
});
