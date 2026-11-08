import { expect, test } from '@playwright/test';

test.use({ channel: process.env.E2E_BROWSER_CHANNEL });

test('Google signup navigates only to the same-origin start endpoint', async ({
  page,
}) => {
  let startPath = '';
  await page.route('**/api/**', (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/google/config'))
      return route.fulfill({ json: { data: { enabled: true } } });
    if (url.pathname.endsWith('/google/start')) {
      startPath = url.pathname + url.search;
      return route.fulfill({
        contentType: 'text/plain',
        body: 'Synthetic OAuth boundary',
      });
    }
    return route.fulfill({
      status: 401,
      json: { error: { message: 'Anonymous' } },
    });
  });
  await page.goto('/register');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByRole('button', { name: 'Sign up with Google' }).click();
  await expect
    .poll(() => startPath)
    .toBe('/api/v1/auth/google/start?returnTo=%2Fsetup');
});

test('pending Google linking requires explicit credentials and keeps failures recoverable', async ({
  page,
}) => {
  const writes: { path: string; body: unknown }[] = [];
  await page.route('**/api/**', (route) => {
    const request = route.request();
    if (request.method() === 'POST')
      writes.push({
        path: new URL(request.url()).pathname,
        body: request.postDataJSON(),
      });
    return route.fulfill({
      status: 401,
      json: { error: { message: 'Invalid email or password' } },
    });
  });
  await page.goto('/login?google=link_required&returnTo=%2Fsetup');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(
    page.getByText(/Confirm your existing account email/),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Sign in with Google' }),
  ).toHaveCount(0);
  await page
    .getByLabel('Email address', { exact: true })
    .fill('person@example.test');
  await page
    .getByLabel('Password', { exact: true })
    .fill('synthetic-wrong-password');
  await page
    .getByRole('button', { name: 'Confirm account and link Google' })
    .click();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByLabel('Email address', { exact: true })).toHaveValue(
    'person@example.test',
  );
  expect(writes).toEqual([
    {
      path: '/api/v1/auth/google/link',
      body: {
        email: 'person@example.test',
        password: 'synthetic-wrong-password',
      },
    },
  ]);
});

test('password recovery reports a generic success without clearing the email', async ({
  page,
}) => {
  await page.route('**/api/**', (route) =>
    route.fulfill(
      new URL(route.request().url()).pathname.endsWith('/forgot-password')
        ? {
            json: {
              data: {
                message:
                  'If an eligible account exists, a reset link has been sent.',
              },
            },
          }
        : { status: 401, json: { error: { message: 'Anonymous' } } },
    ),
  );
  await page.goto('/forgot-password');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page
    .getByLabel('Email address', { exact: true })
    .fill('person@example.test');
  await page.getByRole('button', { name: 'Request reset link' }).click();
  await expect(page.getByRole('status')).toHaveText(/eligible account/);
  await expect(page.getByLabel('Email address', { exact: true })).toHaveValue(
    'person@example.test',
  );
});

for (const width of [320, 700, 701, 1440]) {
  for (const path of [
    '/login',
    '/register',
    '/forgot-password',
    '/reset-password',
    '/setup?verify=synthetic-token',
  ]) {
    test(`account shell ${path} at ${width}px`, async ({ page }, testInfo) => {
      const errors: string[] = [];
      const external: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/*', (route) => {
        const url = new URL(route.request().url());
        if (url.hostname !== '127.0.0.1' && url.hostname !== 'localhost') {
          external.push(url.origin);
          return route.abort();
        }
        if (url.pathname === '/api/v1/auth/google/config')
          return route.fulfill({ json: { data: { enabled: true } } });
        if (url.pathname === '/api/v1/auth/email/verify')
          return route.fulfill({
            status: 400,
            json: { error: { message: 'Verification link expired' } },
          });
        if (url.pathname.startsWith('/api/'))
          return route.fulfill({
            status: 401,
            json: { error: { message: 'Synthetic anonymous session' } },
          });
        return route.continue();
      });
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      await page.getByRole('button', { name: 'ไทย', exact: true }).click();
      await page.evaluate(() => document.fonts.ready);
      const header = page.getByRole('banner');
      await expect(header.getByRole('link', { name: /VELO/ })).toBeVisible();
      const home = page.getByRole('link', {
        name: 'กลับหน้าหลัก',
        exact: true,
      });
      await expect(home).toHaveAttribute('href', '/');
      const headerBounds = await header.boundingBox();
      const homeBounds = await home.boundingBox();
      expect(homeBounds!.y).toBeGreaterThanOrEqual(
        headerBounds!.y + headerBounds!.height,
      );
      await home.focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(home).toBeFocused();
      expect(
        await home.evaluate(
          (element) => getComputedStyle(element).outlineStyle,
        ),
      ).not.toBe('none');
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(width);
      const form = page.locator('.login-card');
      expect(
        await form.evaluate(
          (element) => element.scrollWidth <= element.clientWidth + 1,
        ),
      ).toBe(true);
      if (path === '/login' || path === '/register') {
        const google = page.getByRole('button', { name: /Google/ });
        await expect(google).toBeEnabled();
        await google.scrollIntoViewIfNeeded();
        await expect(google).toBeVisible();
        await expect
          .poll(() =>
            google
              .locator('img')
              .evaluate((image: HTMLImageElement) => image.naturalWidth),
          )
          .toBeGreaterThan(0);
      }
      if (path === '/reset-password') {
        await expect(
          page.getByRole('button', { name: 'เปลี่ยนรหัสผ่าน' }),
        ).toBeDisabled();
        await expect(
          page.getByRole('link', { name: 'ขอลิงก์ตั้งรหัสผ่านใหม่' }),
        ).toBeVisible();
      }
      await home.evaluate((element: HTMLElement) => element.blur());
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: testInfo.outputPath('account.png'),
        fullPage: true,
      });
      expect(external).toEqual([]);
      expect(errors).toEqual([]);
    });
  }
}
