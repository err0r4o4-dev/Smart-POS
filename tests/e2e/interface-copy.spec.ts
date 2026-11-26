import { expect, test } from '@playwright/test';

test.use({ channel: process.env.E2E_BROWSER_CHANNEL });

for (const width of [320, 375, 768, 1440]) {
  test(`store copy and language retention at ${width}px with read-only fixtures`, async ({
    page,
    baseURL,
  }, testInfo) => {
    const origin = new URL(baseURL!).origin;
    const writes: string[] = [];
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    const organization = {
      id: 'copy-org',
      name: 'ร้านทดสอบภาษา',
      code: 'COPY',
      business_type: 'RESTAURANT',
      status: 'ACTIVE',
    };
    const branch = {
      id: 'copy-branch',
      organization_id: organization.id,
      name: 'สาขาหลัก',
      code: 'MAIN',
      status: 'ACTIVE',
      is_main: true,
    };
    const permissions = [
      'organization.read',
      'organization.update',
      'storefront.manage',
      'online_orders.read',
    ];
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin) return route.abort();
      if (
        !url.pathname.startsWith('/api/') &&
        !url.pathname.startsWith('/health')
      )
        return route.continue();
      if (request.method() !== 'GET') {
        writes.push(request.method() + ' ' + url.pathname);
        return route.fulfill({
          status: 405,
          json: { error: { message: 'Read-only fixture' } },
        });
      }
      let data: unknown;
      if (url.pathname.endsWith('/auth/me'))
        data = {
          user: {
            id: 'copy-user',
            display_name: 'Test owner',
            email: 'owner@example.test',
            status: 'ACTIVE',
            email_verified: true,
          },
          csrf_token: 'synthetic-fixture',
        };
      else if (url.pathname === '/api/v1/organizations') data = [organization];
      else if (url.pathname.endsWith('/context'))
        data = {
          organization,
          membership: {
            role: 'OWNER',
            status: 'ACTIVE',
            branch_ids: [branch.id],
            permissions,
          },
          branches: [branch],
          permissions,
        };
      else if (url.pathname.endsWith('/restaurant/setup'))
        data = {
          organization_id: organization.id,
          branch_id: branch.id,
          current_step: 'profile',
          ready: false,
          completed: false,
          steps: [],
          readiness: { ready: false, incomplete: [] },
          profile: {
            organization: {
              ...organization,
              contact_email: '',
              contact_phone: '',
              address: '',
            },
            branch,
            service_modes: { dine_in: true, takeaway: true, delivery: false },
          },
        };
      else if (url.pathname.endsWith('/restaurant/queue')) data = [];
      else if (url.pathname === '/api/v1/storefronts') data = [];
      else
        return route.fulfill({
          status: 404,
          json: { error: { message: 'No fixture for this request' } },
        });
      return route.fulfill({ json: { data } });
    });

    await page.goto('/setup');
    await expect(page.getByLabel('ชื่อร้าน', { exact: true })).toHaveValue(
      organization.name,
    );
    await page
      .getByLabel('ชื่อร้าน', { exact: true })
      .fill('ร้านของฉัน My store');
    await page.getByRole('button', { name: 'English', exact: true }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByLabel('Store name', { exact: true })).toHaveValue(
      'ร้านของฉัน My store',
    );
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Set up your restaurant',
    );
    await expect(page.locator('.setup-layout')).not.toContainText(
      /[\u0e01-\u0e3a\u0e40-\u0e5b]/,
    );
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width + 1);
    await page.screenshot({
      path: testInfo.outputPath(`setup-en-${width}.png`),
      fullPage: true,
    });

    await page.goto('/settings');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Settings' }),
    ).toBeVisible();
    await page
      .getByLabel('Restaurant name', { exact: false })
      .fill('ร้านของฉัน My store');
    await expect(
      page.getByText('Closing time: 22:00', { exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'ไทย', exact: true }).click();
    await expect(
      page.getByLabel('ชื่อร้านอาหาร', { exact: false }),
    ).toHaveValue('ร้านของฉัน My store');
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width + 1);
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await page.goto('/help');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Store help' }),
    ).toBeVisible();
    await expect(page.locator('.help-grid')).not.toContainText(
      /npm|Docker|localhost|developer|[\u0e01-\u0e3a\u0e40-\u0e5b]/i,
    );
    await page.getByRole('button', { name: 'ไทย', exact: true }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'คู่มือใช้งานร้าน' }),
    ).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width + 1);
    await page.screenshot({
      path: testInfo.outputPath(`help-th-${width}.png`),
      fullPage: true,
    });
    await page.goto('/kitchen');
    await expect(
      page.getByText('ยังไม่มีออเดอร์ที่ชำระแล้วรอทำอาหาร'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await expect(
      page.getByRole('heading', { level: 1, name: 'Kitchen queue' }),
    ).toBeVisible();
    await expect(
      page.getByText('No paid orders are waiting for preparation.'),
    ).toBeVisible();
    if (width === 1440) {
      await expect(
        page.getByRole('navigation', { name: 'Main navigation', exact: true }),
      ).not.toContainText(/[\u0e01-\u0e3a\u0e40-\u0e5b]/);
    }
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width + 1);
    await page.screenshot({
      path: testInfo.outputPath(`kitchen-en-${width}.png`),
      fullPage: true,
    });
    await page.goto('/shop');
    await page
      .getByRole('button', { name: 'Open VELO Assistant chat', exact: true })
      .click();
    const chat = page.getByRole('dialog', { name: 'VELO Assistant' });
    await expect(
      chat.getByText('Ask about stores, menus, or orders'),
    ).toBeVisible();
    await chat
      .getByRole('textbox', { name: 'Type your message' })
      .fill('ข้อความของฉัน My message');
    await page.getByRole('button', { name: 'ไทย', exact: true }).click();
    await expect(
      chat.getByRole('textbox', { name: 'พิมพ์ข้อความ' }),
    ).toHaveValue('ข้อความของฉัน My message');
    await expect(
      chat.getByText('สอบถามเกี่ยวกับร้านค้า เมนู หรือคำสั่งซื้อ'),
    ).toBeVisible();
    await chat.getByRole('textbox', { name: 'พิมพ์ข้อความ' }).focus();
    await page.keyboard.press('Escape');
    await expect(chat).not.toBeVisible();
    await expect(
      page.getByRole('button', {
        name: 'เปิดผู้ช่วย VELO Assistant',
        exact: true,
      }),
    ).toBeFocused();
    expect(writes).toEqual([]);
    expect(errors).toEqual([]);
  });
}
