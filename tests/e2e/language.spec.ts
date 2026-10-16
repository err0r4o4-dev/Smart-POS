import { expect, test, type Page } from '@playwright/test';

test.use({ channel: process.env.E2E_BROWSER_CHANNEL });

async function mockUI(page: Page, role: 'OWNER' | 'CASHIER' | null = null) {
  const writes: string[] = [];
  const organization = {
    id: 'language-shop',
    name: 'ร้านทดสอบภาษา',
    code: 'LANG',
    status: 'ACTIVE',
    currency: 'THB',
  };
  const permissions = [
    'organization.read',
    'catalog.read',
    'inventory.read',
    'customers.read',
    'pos.access',
    'pos.register.open',
  ];
  await page.route('**/api/**', async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname;
    if (request.method() !== 'GET') {
      writes.push(request.method() + ' ' + path);
      return route.fulfill({
        status: 405,
        json: { error: { message: 'UI fixture is read-only' } },
      });
    }
    if (path.endsWith('/auth/me')) {
      return route.fulfill(
        role
          ? {
              json: {
                data: {
                  user: {
                    id: 'language-user',
                    display_name: 'Language user',
                    email: 'language@example.test',
                    status: 'ACTIVE',
                  },
                  csrf_token: 'synthetic-ui-only',
                },
              },
            }
          : { status: 401, json: { error: { code: 'UNAUTHORIZED' } } },
      );
    }
    let data: unknown = { items: [], total: 0, page: 1, page_size: 20 };
    if (path === '/api/v1/organizations') data = [organization];
    else if (path.endsWith('/context'))
      data = {
        organization,
        membership: {
          id: 'membership',
          role,
          status: 'ACTIVE',
          branch_ids: ['main'],
          permissions,
        },
        branches: [
          {
            id: 'main',
            organization_id: organization.id,
            name: 'สาขาทดสอบ',
            code: 'MAIN',
            status: 'ACTIVE',
            is_main: true,
          },
        ],
        permissions,
      };
    else if (path === '/api/v1/storefront/shops') data = [];
    return route.fulfill({ json: { data } });
  });
  return writes;
}

for (const width of [320, 375, 768, 1440]) {
  test(`public language switch and form retention at ${width}px`, async ({
    page,
  }, testInfo) => {
    const writes = await mockUI(page);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const english = page.getByRole('button', { name: 'English', exact: true });
    await expect(english).toBeVisible();
    await english.click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Simplify your store',
    );
    await expect(
      page.getByRole('link', { name: 'Sign in', exact: true }),
    ).toBeVisible();
    const signInBounds = await page
      .getByRole('link', { name: 'Sign in', exact: true })
      .boundingBox();
    expect(signInBounds?.width).toBeGreaterThan(50);
    expect(signInBounds?.height).toBeLessThan(60);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width + 1);
    await page.screenshot({
      path: testInfo.outputPath(`landing-en-${width}.png`),
    });
    await page.getByRole('link', { name: 'Sign in', exact: true }).click();
    await page
      .getByLabel('Email address', { exact: true })
      .fill('draft@example.test');
    await page
      .getByLabel('Password', { exact: true })
      .fill('synthetic-password');
    await page.getByRole('button', { name: 'ไทย', exact: true }).click();
    await expect(page.getByLabel('ที่อยู่อีเมล', { exact: true })).toHaveValue(
      'draft@example.test',
    );
    await expect(page.getByLabel('รหัสผ่าน', { exact: true })).toHaveValue(
      'synthetic-password',
    );
    await page.getByRole('button', { name: 'English', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('button', { name: 'English', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width + 1);
    await page.screenshot({
      path: testInfo.outputPath(`auth-en-${width}.png`),
    });
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Welcome back.' }),
    ).toBeVisible();
    await page.goto('/shop');
    await expect(
      page.getByRole('button', { name: 'English', exact: true }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.getByRole('heading', { name: 'Online storefront', exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`shop-en-${width}.png`),
    });
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
  });
}

for (const role of ['OWNER', 'CASHIER'] as const) {
  for (const width of [375, 1440]) {
    test(`${role} workspace shares language with POS at ${width}px`, async ({
      page,
    }, testInfo) => {
      const writes = await mockUI(page, role);
      await page.setViewportSize({ width, height: 900 });
      await page.goto('/workspace');
      await expect(
        page.getByRole('heading', {
          name: role === 'OWNER' ? 'ภาพรวมร้าน' : 'งานของฉัน',
          exact: true,
        }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'English', exact: true }).click();
      await expect(
        page.getByRole('heading', {
          name: role === 'OWNER' ? 'Store overview' : 'My work',
          exact: true,
        }),
      ).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(width + 1);
      await page.screenshot({
        path: testInfo.outputPath(`${role}-en-${width}.png`),
      });
      if (width < 900) {
        await page
          .getByRole('button', { name: 'Open navigation', exact: true })
          .click();
        await expect(page.getByRole('dialog')).toBeVisible();
        if (role === 'OWNER')
          await page
            .getByRole('dialog')
            .getByRole('button', { name: 'Settings and users' })
            .click();
        await expect(
          page
            .getByRole('navigation', { name: 'Mobile navigation' })
            .getByRole('link', { name: 'My account' }),
        ).toBeVisible();
        await page.keyboard.press('Escape');
      }
      await page.goto(role === 'OWNER' ? '/manage/pos' : '/work/pos');
      await expect(
        page.getByRole('heading', { name: 'Sell products', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'English', exact: true }),
      ).toHaveAttribute('aria-pressed', 'true');
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(width + 1);
      await page.screenshot({
        path: testInfo.outputPath(`pos-${role}-en-${width}.png`),
      });
      expect(writes).toEqual([]);
    });
  }
}
