import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { startAuthClient } from '../integration/auth-fixtures.mjs';

test('mobile grouped navigation remains available after real login and setup', async ({
  browser,
}) => {
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
    await expect(page).toHaveURL(/\/account$/);
    await page.goto('/setup');
    await page
      .getByLabel('ชื่อองค์กร', { exact: true })
      .fill(`Workspace ${unique}`);
    await page.getByLabel('รหัสองค์กร', { exact: true }).fill(`WS-${unique}`);
    await page.getByRole('button', { name: 'ถัดไป', exact: true }).click();
    await page.getByRole('button', { name: 'ถัดไป', exact: true }).click();
    await page.getByRole('button', { name: 'สร้างร้าน', exact: true }).click();
    await expect(page).toHaveURL(/\/settings\/store$/);
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByRole('button', { name: 'Open navigation' }).click();
    const inventoryGroup = page
      .getByRole('navigation', { name: 'Mobile navigation', exact: true })
      .getByRole('button', { name: 'สินค้าและสต็อก', exact: true });
    await inventoryGroup.click();
    await expect(inventoryGroup).toHaveAttribute('aria-expanded', 'true');
    await page
      .getByRole('navigation', { name: 'Mobile navigation' })
      .getByRole('link', { name: 'สินค้า / แค็ตตาล็อก', exact: true })
      .click();
    await expect(page).toHaveURL(/\/products$/);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    source.close();
  }
});
