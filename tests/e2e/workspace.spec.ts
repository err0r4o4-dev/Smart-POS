import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { startAuthClient } from '../integration/auth-fixtures.mjs';

test('anonymous entrypoints require login and preserve deep links', async ({
  page,
}) => {
  for (const path of [
    '/',
    '/dashboard',
    '/setup',
    '/products?search=coffee',
    '/pos',
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole('heading', { name: 'Welcome back.' }),
    ).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/login');
    expect(new URL(page.url()).searchParams.get('returnTo')).toBe(
      path === '/' ? '/dashboard' : path,
    );
  }
  await page.goto('/preview/foundation');
  await expect(
    page.getByRole('heading', { name: 'A smarter start.' }),
  ).toBeVisible();
});

test('real login, onboarding, operational navigation, tenant switching and returnTo', async ({
  browser,
}, testInfo) => {
  test.skip(
    process.env.AUTH_E2E !== '1',
    'Requires isolated smartpos-auth-test stack',
  );
  test.setTimeout(180_000);
  const source = await startAuthClient();
  const context = await browser.newContext({
    baseURL: 'http://localhost:18088',
    proxy: { server: source.proxy },
    viewport: { width: 1440, height: 1000 },
  });
  context.setDefaultTimeout(15_000);
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const unique = randomUUID().slice(0, 8);
  const email = `workspace-${randomUUID()}@example.test`;
  const password = `Workspace-${randomUUID()}`;
  async function signIn() {
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  }
  try {
    await page.goto('/register');
    await page.getByLabel('Display name').fill('Workspace smoke owner');
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel('Confirm password').fill(password);
    await page
      .getByRole('button', { name: 'Create account', exact: true })
      .click();
    await expect(page).toHaveURL(/\/login\?registered=1$/);
    await signIn();
    await expect(page).toHaveURL(/\/setup$/);
    await page
      .getByLabel('ชื่อองค์กร', { exact: true })
      .fill(`Workspace ${unique}`);
    await page.getByLabel('รหัสองค์กร', { exact: true }).fill(`WS-${unique}`);
    await page.getByRole('button', { name: 'ถัดไป', exact: true }).click();
    await page.getByRole('button', { name: 'ถัดไป', exact: true }).click();
    await page.getByRole('button', { name: 'สร้างร้าน', exact: true }).click();
    await expect(page).toHaveURL(/\/settings\/store$/);
    await page.goto('/');
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole('heading', { name: 'พื้นที่ปฏิบัติงาน' }),
    ).toBeVisible();
    const navigation = page.getByRole('navigation', {
      name: 'Main navigation',
      exact: true,
    });
    await expect(
      navigation.getByRole('link', { name: 'POS layout', exact: true }),
    ).toHaveCount(0);
    const links = await navigation
      .locator('a')
      .evaluateAll((elements) =>
        elements.map((element) => element.getAttribute('href')!),
      );
    expect(links).toEqual(
      expect.arrayContaining([
        '/pos',
        '/products',
        '/inventory',
        '/purchasing/orders',
        '/shelves',
        '/sales',
        '/pos/returns',
        '/pos/exchanges',
        '/pricing',
        '/promotions',
        '/customers',
        '/settings/branches',
        '/employees',
        '/roles',
      ]),
    );
    for (const width of [320, 375, 768, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect(page.locator('body')).toHaveJSProperty('scrollWidth', width);
      await page.screenshot({
        path: testInfo.outputPath(`workspace-${width}.png`),
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole('button', { name: 'Open navigation' }).click();
    await page
      .getByRole('navigation', { name: 'Mobile navigation' })
      .getByRole('link', { name: 'สินค้า / แค็ตตาล็อก', exact: true })
      .click();
    await expect(page).toHaveURL(/\/products$/);
    await page.setViewportSize({ width: 1440, height: 1000 });
    for (const path of links) {
      await page.goto(path);
      await expect(page.locator('h1').first()).toBeVisible();
      await expect(
        page.getByRole('heading', { name: 'Nothing on this shelf.' }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('heading', { name: 'This space is restricted.' }),
      ).toHaveCount(0);
      expect(new URL(page.url()).pathname).toBe(path);
    }
    const session = (
      await (await context.request.get('/api/v1/auth/me')).json()
    ).data;
    const response = await context.request.post('/api/v1/organizations', {
      headers: {
        Origin: 'http://localhost:18088',
        'X-CSRF-Token': session.csrf_token,
        'Idempotency-Key': randomUUID(),
      },
      data: {
        name: `Second workspace ${unique}`,
        code: `WS2-${unique}`,
        business_type: 'RETAIL',
        contact_email: '',
        contact_phone: '',
        address: '',
        branch: {
          name: 'Second main branch',
          code: 'MAIN',
          address: '',
          phone: '',
          email: '',
          status: 'ACTIVE',
        },
      },
    });
    expect(response.status()).toBe(201);
    const second = (await response.json()).data;
    await page.goto('/dashboard');
    await page
      .getByLabel('องค์กรที่ใช้งาน', { exact: true })
      .selectOption(second.organization.id);
    await expect(
      page.getByText(`Second workspace ${unique} · Second main branch`),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByLabel('องค์กรที่ใช้งาน', { exact: true }),
    ).toHaveValue(second.organization.id);
    await expect(page.getByLabel('สาขาที่ใช้งาน', { exact: true })).toHaveValue(
      second.branches[0].id,
    );
    await page.goto('/login');
    await expect(page).toHaveURL(/\/dashboard$/);
    await page.goto('/account');
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.goto('/products?search=coffee');
    await expect(
      page.getByRole('heading', { name: 'Welcome back.' }),
    ).toBeVisible();
    await signIn();
    await expect(page).toHaveURL(/\/products\?search=coffee$/);
    await page.reload();
    await expect(page).toHaveURL(/\/products\?search=coffee$/);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    source.close();
  }
});
