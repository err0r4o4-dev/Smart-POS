import { expect, test } from '@playwright/test';

for (const width of [320, 375, 640, 768, 1024, 1440, 1920]) {
  test(`ready routes render without horizontal overflow at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    for (const route of [
      '/help/system',
      '/help',
      '/login',
      '/register',
      '/forgot-password',
      '/403',
      '/404',
    ]) {
      const errors: string[] = [];
      const listener = (error: Error) => errors.push(error.message);
      page.on('pageerror', listener);
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.locator('body')).toHaveJSProperty('scrollWidth', width);
      expect(errors).toEqual([]);
      if (route === '/help/system') {
        await expect(page.getByText('API & database ready')).toBeVisible();
        await page.screenshot({
          path: `test-results/dashboard-${width}.png`,
          fullPage: true,
        });
      }
      if (
        [375, 1440].includes(width) &&
        ['/login', '/register'].includes(route)
      ) {
        await page.screenshot({
          path: `test-results/${route.replaceAll('/', '-')}-${width}.png`,
          fullPage: true,
        });
      }
      page.off('pageerror', listener);
    }
  });
}

test('mobile navigation supports keyboard, dismissal and real routes', async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/help/system');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  expect(
    await page
      .getByRole('dialog')
      .evaluate((element) => element.contains(document.activeElement)),
  ).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Open navigation' }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page
    .getByRole('navigation', { name: 'Mobile navigation' })
    .getByRole('link', { name: 'คู่มือการใช้งาน', exact: true })
    .click();
  await expect(page).toHaveURL(/\/help$/);
  await expect(
    page.getByRole('heading', { name: 'Build on solid ground.' }),
  ).toBeVisible();
  await expect(page.locator('a[href^="/preview/"]')).toHaveCount(0);
});

for (const route of ['/preview/pos', '/preview/auth']) {
  test(`removed preview ${route} shows the not-found page`, async ({
    page,
  }) => {
    await page.goto(route);
    await expect(
      page.getByRole('heading', { name: 'Nothing on this shelf.' }),
    ).toBeVisible();
    await expect(page.getByText('404 · NOT FOUND')).toBeVisible();
    await expect(page.getByRole('form')).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'Checkout unavailable' }),
    ).toHaveCount(0);
  });
}

test('real authentication and protected business pages remain available', async ({
  page,
}) => {
  await page.goto('/login');
  await expect(page.getByLabel('Email address')).toBeEnabled();
  await expect(page.getByLabel('Password', { exact: true })).toBeEnabled();
  for (const route of ['/pos', '/pos/checkout']) {
    await page.goto(route);
    await expect(page).toHaveURL(
      new RegExp('/login\\?returnTo=' + encodeURIComponent(route) + '$'),
    );
  }
  await page.goto('/products');
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fproducts/);
  await expect(page.getByLabel('Email address')).toBeEnabled();
  await page.goto('/inventory');
  await expect(page).toHaveURL(/\/login\?returnTo=%2Finventory/);
  await page.goto('/inventory/valuation');
  await expect(
    page.getByRole('heading', { name: 'Nothing on this shelf.' }),
  ).toBeVisible();
});

test('loading remains explicit until the real readiness response arrives', async ({
  page,
}) => {
  let release: () => void = () => {};
  const responseGate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/health/ready', async (route) => {
    await responseGate;
    await route.continue();
  });
  await page.goto('/help/system');
  await expect(page.getByRole('status')).toHaveText(
    'Checking service readiness\u2026',
  );
  release();
  await expect(page.getByText('API & database ready')).toBeVisible();
});

test('readiness failure stays honest and refresh recovers', async ({
  page,
}) => {
  await page.route('**/health/ready', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"error":{"code":"DEPENDENCY_UNAVAILABLE"}}',
    }),
  );
  await page.goto('/help/system');
  await expect(page.getByRole('alert')).toContainText('Service not ready');
  await expect(page.getByText('API & database ready')).toHaveCount(0);
  await page.unroute('**/health/ready');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByText('API & database ready')).toBeVisible();
});
