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

test('the header logo introduces itself once while the footer contains navigation instead', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const headerLogo = page
    .getByRole('banner')
    .getByRole('link', { name: 'VELO POS หน้าแรก' });
  const mark = headerLogo.locator('.brand-mark');
  await expect(mark).not.toHaveCSS('animation-name', 'none');
  await expect(mark).toHaveCSS('animation-iteration-count', '1');
  await expect(headerLogo.locator('.brand > span:last-child')).not.toHaveCSS(
    'animation-name',
    'none',
  );
  await expect(headerLogo.locator('small')).not.toHaveCSS(
    'animation-name',
    'none',
  );
  const sheen = await mark.evaluate((element) => {
    const style = getComputedStyle(element, '::after');
    return {
      name: style.animationName,
      iterations: style.animationIterationCount,
      pointerEvents: style.pointerEvents,
    };
  });
  expect(sheen.name).not.toBe('none');
  expect(sheen.iterations).toBe('1');
  expect(sheen.pointerEvents).toBe('none');
  const footer = page.getByRole('contentinfo');
  await expect(footer.locator('.brand')).toHaveCount(0);
  await expect(
    footer.getByRole('navigation', { name: 'ลิงก์ท้ายหน้า' }),
  ).toBeVisible();
  await expect(headerLogo).toHaveAttribute('href', '/');
});

for (const width of [375, 1440]) {
  test(`footer guide links replace the logo on the left at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    const footer = page.getByRole('contentinfo');
    const navigation = footer.getByRole('navigation', {
      name: 'ลิงก์ท้ายหน้า',
    });
    await navigation.scrollIntoViewIfNeeded();
    await expect(
      footer.getByRole('link', { name: 'VELO POS หน้าแรก' }),
    ).toHaveCount(0);
    await expect(
      navigation.getByRole('link', { name: 'คู่มือการใช้งาน' }),
    ).toHaveAttribute('href', '/help');
    const container = await footer
      .locator('.landing-footer-inner')
      .boundingBox();
    const links = await navigation.boundingBox();
    expect(container).not.toBeNull();
    expect(links).not.toBeNull();
    expect(links!.x).toBeCloseTo(container!.x, 0);
    await navigation.getByRole('link', { name: 'วิธีเริ่มต้น' }).click();
    await expect(
      page.getByRole('heading', { name: 'พร้อมดูแลร้าน ใน 3 ขั้นตอน' }),
    ).toBeInViewport();
  });
}

test('the header logo responds to hover and press without replaying its entrance', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.goto('/');
  const headerLogo = page
    .getByRole('banner')
    .getByRole('link', { name: 'VELO POS หน้าแรก' });
  const mark = headerLogo.locator('.brand-mark');
  await headerLogo.evaluate(async (element) => {
    await Promise.all(
      element
        .getAnimations({ subtree: true })
        .map((animation) => animation.finished),
    );
  });
  await expect(mark).toHaveCSS('transform', 'none');
  await headerLogo.hover();
  await expect(mark).toHaveCSS('transform', 'matrix(1.03, 0, 0, 1.03, 0, -2)');
  await expect(mark).not.toHaveCSS('box-shadow', 'none');
  await page.mouse.down();
  await expect(mark).toHaveCSS('transform', 'matrix(0.97, 0, 0, 0.97, 0, 0)');
  await page.mouse.up();
  await page.mouse.move(0, 0);
  await expect(mark).toHaveCSS('transform', 'none');
  const sheenOpacity = await mark.evaluate(
    (element) => getComputedStyle(element, '::after').opacity,
  );
  expect(sheenOpacity).toBe('0');
  expect(
    await headerLogo.evaluate((element) =>
      element
        .getAnimations({ subtree: true })
        .some((animation) => animation.playState === 'running'),
    ),
  ).toBe(false);
});

test('the header logo retains visible keyboard focus and its home destination', async ({
  page,
}) => {
  await page.goto('/?brand-check=keyboard');
  const headerLogo = page
    .getByRole('banner')
    .getByRole('link', { name: 'VELO POS หน้าแรก' });
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(headerLogo).toBeFocused();
  await expect(headerLogo).toHaveCSS('outline-style', 'solid');
  await expect(headerLogo).toHaveCSS('outline-width', '3px');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/login');
  await expect(page.locator('.auth-story .brand-mark')).toHaveCSS(
    'animation-name',
    'none',
  );
});

test('reduced motion keeps the logo static and immediately usable', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?brand-check=reduced');
  const headerLogo = page
    .getByRole('banner')
    .getByRole('link', { name: 'VELO POS หน้าแรก' });
  const mark = headerLogo.locator('.brand-mark');
  for (const element of [
    mark,
    headerLogo.locator('.brand > span:last-child'),
    headerLogo.locator('small'),
  ]) {
    await expect(element).toHaveCSS('animation-name', 'none');
    await expect(element).toHaveCSS('opacity', '1');
    await expect(element).toHaveCSS('transform', 'none');
  }
  await headerLogo.hover();
  await expect(mark).toHaveCSS('transform', 'none');
  await expect(mark).toHaveCSS('transition-duration', '0s');
  expect(
    await mark.evaluate(
      (element) => getComputedStyle(element, '::after').content,
    ),
  ).toBe('none');
  await headerLogo.click();
  await expect(page).toHaveURL(/\/$/);
});

test.describe('the header logo on touch screens', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test('tapping goes home without leaving a sticky hover effect', async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/?brand-check=touch');
    const headerLogo = page
      .getByRole('banner')
      .getByRole('link', { name: 'VELO POS หน้าแรก' });
    await headerLogo.tap();
    await expect(page).toHaveURL(/\/$/);
    await expect(headerLogo.locator('.brand-mark')).toHaveCSS(
      'transform',
      'none',
    );
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 390);
  });
});
