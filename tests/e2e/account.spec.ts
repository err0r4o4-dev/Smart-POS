import { expect, test, type Page } from '@playwright/test';

// Account UI fixtures intercept all API calls, including logout. No real sessions,
// accounts, organizations or retail data are changed by these tests.
async function accountFixture(
  page: Page,
  role: 'OWNER' | 'CASHIER' | null = 'OWNER',
) {
  const writes: string[] = [];
  const organization = {
    id: 'account-ui-store',
    name: 'ร้านตัวอย่างสำหรับตรวจหน้าบัญชี',
    code: 'ACCOUNT',
    currency: 'THB',
    status: 'ACTIVE',
  };
  const permissions = ['organization.read', 'catalog.read', 'pos.access'];
  await page.route('**/health/**', (route) =>
    route.fulfill({ json: { status: 'ready' } }),
  );
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== 'GET') {
      writes.push(path);
      return route.fulfill({
        status: 405,
        json: { error: { message: 'Read-only UI fixture' } },
      });
    }
    let data: unknown = [];
    if (path === '/api/v1/auth/me') {
      data = {
        user: {
          id: 'account-ui-user',
          display_name: 'ผู้ทดสอบหน้าบัญชี',
          status: 'ACTIVE',
          email: 'long.account.address.for.responsive.check@example.test',
        },
        csrf_token: 'synthetic-account-ui',
      };
    } else if (path === '/api/v1/organizations')
      data = role ? [organization] : [];
    else if (path.endsWith('/context'))
      data = {
        organization,
        membership: {
          role,
          status: 'ACTIVE',
          permissions,
          branch_ids: ['account-ui-branch'],
        },
        permissions,
        branches: [
          {
            id: 'account-ui-branch',
            name: 'สาขาหลัก',
            code: 'MAIN',
            organization_id: organization.id,
            status: 'ACTIVE',
            is_main: true,
          },
        ],
      };
    return route.fulfill({ json: { data } });
  });
  return writes;
}

for (const width of [320, 375, 768, 1024, 1440]) {
  test(`account uses available space and retains readable content at ${width}px`, async ({
    page,
  }, info) => {
    const writes = await accountFixture(page);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    if (width >= 1024) {
      await page.goto('/manage/dashboard');
      await expect(
        page.getByRole('heading', { name: 'ภาพรวมร้าน', exact: true }),
      ).toBeVisible();
      await page
        .locator('.topbar')
        .getByRole('link', { name: 'บัญชีของคุณ', exact: true })
        .click();
      await expect(page).toHaveURL(/\/account$/);
    } else await page.goto('/account');
    await expect(
      page.getByRole('heading', { name: 'บัญชีของคุณ', exact: true }),
    ).toBeVisible();
    const details = page.getByRole('region', {
      name: 'บัญชีของคุณ',
      exact: true,
    });
    await expect(details).toContainText(
      'long.account.address.for.responsive.check@example.test',
    );
    await expect(
      details.getByRole('link', {
        name: 'เข้าสู่พื้นที่ทำงานตามบทบาท',
        exact: true,
      }),
    ).toHaveAttribute('href', '/workspace');
    await expect(details.getByRole('link')).toHaveCount(3);
    await expect(details).not.toContainText('ร้านตัวอย่างสำหรับตรวจหน้าบัญชี');
    await expect(details).not.toContainText('สาขาหลัก');
    await expect(
      page.getByRole('region', { name: 'พื้นที่ทำงานของคุณ', exact: true }),
    ).toHaveCount(0);
    if (width === 1440) {
      const bounds = (await details.boundingBox())!;
      expect(bounds.width).toBeGreaterThanOrEqual(900);
      expect(bounds.width).toBeLessThanOrEqual(961);
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: info.outputPath(`account-${width}.png`),
      fullPage: true,
    });
    expect(errors).toEqual([]);
    expect(writes).toEqual([]);
  });
}

test('cashier account retains work access without a store administration shortcut', async ({
  page,
}) => {
  const writes = await accountFixture(page, 'CASHIER');
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/account');
  const account = page.getByRole('region', {
    name: 'บัญชีของคุณ',
    exact: true,
  });
  await expect(
    account.getByRole('link', {
      name: 'เข้าสู่พื้นที่ทำงานตามบทบาท',
      exact: true,
    }),
  ).toBeVisible();
  await expect(account.locator('a[href="/manage/settings/store"]')).toHaveCount(
    0,
  );
  await expect(account.getByRole('link')).toHaveCount(2);
  expect(writes).toEqual([]);
});

test('an account without a store retains the original setup link without extra panels', async ({
  page,
}) => {
  const writes = await accountFixture(page, null);
  await page.goto('/account');
  const account = page.getByRole('region', {
    name: 'บัญชีของคุณ',
    exact: true,
  });
  await expect(account.locator('a[href="/setup"]')).toBeVisible();
  await expect(account.locator('a[href="/workspace"]')).toBeVisible();
  await expect(account.locator('a[href="/manage/settings/store"]')).toHaveCount(
    0,
  );
  await expect(account.getByRole('link')).toHaveCount(2);
  expect(writes).toEqual([]);
});

test('the account remains readable when switching to English on a narrow screen', async ({
  page,
}, info) => {
  const writes = await accountFixture(page);
  await page.setViewportSize({ width: 375, height: 1000 });
  await page.goto('/account');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Your account', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('region', { name: 'Your account', exact: true }),
  ).toContainText('long.account.address.for.responsive.check@example.test');
  await expect(
    page.getByRole('button', { name: 'Sign out', exact: true }),
  ).toBeEnabled();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(375);
  await page.screenshot({
    path: info.outputPath('account-english-375.png'),
    fullPage: true,
  });
  expect(writes).toEqual([]);
});
