import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/api/**', (route) => route.abort());
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ status: 401, json: { error: { code: 'UNAUTHORIZED' } } }),
  );
});

for (const width of [320, 375, 767, 768, 1023, 1024, 1279, 1280, 1440, 1920]) {
  test(`landing page fits the viewport at ${width}px`, async ({
    page,
  }, testInfo) => {
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
      const expectedWidth = Math.min(1232, width - (width >= 768 ? 48 : 32));
      const expectedMargin = (width - expectedWidth) / 2;
      expect(bounds.width).toBeCloseTo(expectedWidth, 0);
      expect(bounds.x).toBeCloseTo(expectedMargin, 0);
      expect(width - bounds.x - bounds.width).toBeCloseTo(expectedMargin, 0);
    }
    await page.screenshot({
      path: testInfo.outputPath(`landing-${width}.png`),
      fullPage: true,
      animations: 'disabled',
    });
    expect(errors).toEqual([]);
  });
}

test('landing container and header follow the layout contract', async ({
  page,
}) => {
  for (const width of [320, 767, 768, 1023, 1024, 1279, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const gutter = width >= 768 ? 24 : 16;
    const shellInset = (gutter + Math.max(gutter, (width - 1232) / 2)) / 2;
    const shell = await page.locator('.landing-header-inner').boundingBox();
    expect(shell).not.toBeNull();
    expect(shell!.width).toBeCloseTo(width - shellInset * 2, 0);
    expect(shell!.x).toBeCloseTo(shellInset, 0);
    const content = await page.locator('.landing-hero-inner').boundingBox();
    expect(content).not.toBeNull();
    expect(content!.width).toBeCloseTo(Math.min(1232, width - gutter * 2), 0);
    expect(content!.x).toBeCloseTo((width - content!.width) / 2, 0);
    const header = await page.locator('.landing-header').boundingBox();
    expect(header!.height).toBeCloseTo(66, 0);
    for (const selector of [
      '.landing-hero-inner',
      '.landing-steps',
      '.landing-feature-grid',
    ]) {
      await expect(page.locator(selector)).toHaveCSS('gap', '24px');
    }
    for (const card of await page
      .locator('.landing-step, .landing-feature-panel')
      .all()) {
      for (const side of ['top', 'right', 'bottom', 'left']) {
        await expect(card).toHaveCSS(`padding-${side}`, '24px');
      }
    }
    await expect(page.locator('.landing-hero-inner')).toHaveCSS(
      'padding-top',
      '80px',
    );
    await expect(page.locator('.landing-hero-inner')).toHaveCSS(
      'padding-bottom',
      '40px',
    );
    await expect(page.locator('.landing-how')).toHaveCSS('padding-top', '40px');
    await expect(page.locator('.landing-how')).toHaveCSS(
      'padding-bottom',
      '40px',
    );
    await expect(page.locator('.landing-features')).toHaveCSS(
      'padding-top',
      '40px',
    );
    await expect(page.locator('.landing-features')).toHaveCSS(
      'padding-bottom',
      '80px',
    );
  }
});

test('mobile navigation exposes all destinations with the keyboard', async ({
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
  await expect(menu).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Enter');
  await expect(menu).toHaveAttribute('aria-expanded', 'true');
  const navigation = page.getByRole('navigation', { name: 'เมนูหน้าแรก' });
  await expect(
    navigation.getByRole('link', { name: 'หน้าร้านออนไลน์' }),
  ).toBeVisible();
  await page.keyboard.press('Tab');
  await expect(
    navigation.getByRole('link', { name: 'หน้าร้านออนไลน์' }),
  ).toBeFocused();
  await expect(
    navigation.getByRole('link', { name: 'วิธีใช้งาน' }),
  ).toBeVisible();
  await expect(
    navigation.getByRole('link', { name: 'เข้าสู่ระบบ' }),
  ).toBeVisible();
});
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
  await page.getByRole('link', { name: 'คู่มือ', exact: true }).click();
  await expect(page).toHaveURL(/\/help$/);
});
test('landing supports keyboard access to the main content', async ({
  page,
}) => {
  await page.goto('/');
  const skip = page.locator('.skip-link');
  await skip.waitFor({ state: 'attached' });
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
      navigation.getByRole('link', { name: 'คู่มือ', exact: true }),
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
  await headerLogo.waitFor({ state: 'attached' });
  const skip = page.locator('.skip-link');
  await skip.waitFor({ state: 'attached' });
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  await expect(headerLogo).toBeFocused();
  await expect(headerLogo).toHaveCSS('outline-style', 'solid');
  await expect(headerLogo).toHaveCSS('outline-width', '3px');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/login');
  await expect(page.locator('.account-brand .brand-mark')).toHaveCSS(
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
