import { expect, test } from '@playwright/test';

for (const width of [320, 768, 1440]) {
  test(`setup readiness follows server prerequisites at ${width}px with mocked API`, async ({
    page,
    baseURL,
  }, testInfo) => {
    const origin = new URL(baseURL!).origin;
    const organization = {
      id: 'org',
      name: 'ร้านทดสอบ',
      code: 'SHOP',
      business_type: 'RESTAURANT',
      status: 'ACTIVE',
      contact_email: '',
      contact_phone: '',
      address: 'Bangkok',
    };
    const branch = {
      id: 'branch',
      organization_id: 'org',
      name: 'Main',
      code: 'MAIN',
      status: 'ACTIVE',
      is_main: true,
    };
    let readiness = {
      ready: false,
      incomplete: [
        { key: 'menu', label: 'Menu', reason: 'Add a menu item' },
      ],
    };
    let completionRequests = 0;
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      let data: unknown;
      if (url.pathname === '/api/v1/auth/me') {
        data = {
          user: {
            id: 'user',
            email: 'owner@example.test',
            display_name: 'Owner',
            status: 'ACTIVE',
            email_verified: true,
          },
          csrf_token: 'mock-csrf',
        };
      } else if (url.pathname === '/api/v1/organizations') {
        data = [organization];
      } else if (url.pathname === '/api/v1/organizations/org/context') {
        data = {
          organization,
          membership: {
            role: 'OWNER',
            status: 'ACTIVE',
            branch_ids: ['branch'],
            permissions: [],
          },
          branches: [branch],
          permissions: [],
        };
      } else if (
        url.pathname === '/api/v1/organizations/org/restaurant/setup'
      ) {
        data = {
          organization_id: 'org',
          branch_id: 'branch',
          current_step: 'review',
          completed: false,
          ready: readiness.ready,
          readiness,
          steps: [],
          menu: {
            categories: [{ name: 'อาหาร' }],
            items: [{ name: 'ข้าว', price: '45.00', category: 'อาหาร' }],
          },
          profile: {
            organization,
            service_modes: { dine_in: true, takeaway: true, delivery: false },
          },
          location: {
            latitude: 13.75,
            longitude: 100.5,
            address: 'Bangkok',
            details: '',
            confirmed: true,
          },
        };
      } else if (url.pathname.endsWith('/storefront')) {
        data = null;
      } else if (
        url.pathname.includes('/inventory/locations') ||
        url.pathname.endsWith('/pos/terminals') ||
        url.pathname === '/api/v1/organizations/org/products'
      ) {
        data = { items: [], total: 0 };
      } else {
        if (url.pathname.endsWith('/setup/complete')) completionRequests += 1;
        return route.fulfill({
          status: 404,
          json: { error: { message: 'Unexpected mock request' } },
        });
      }
      return route.fulfill({ json: { data } });
    });

    await page.goto('/setup');
    const activate = page.getByRole('button', {
      name: 'เปิดใช้งานร้าน',
      exact: true,
    });
    await expect(activate).toBeDisabled();
    await expect(page.getByText('Menu: Add a menu item')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'จัดการเมนู', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'ตั้งค่าหน้าร้านออนไลน์', exact: true }),
    ).toBeVisible();
    await expect(
      page.locator('a[href="/menu"], a[href="/settings/storefront"]'),
    ).toHaveCount(0);
    await page.screenshot({
      path: testInfo.outputPath(`blocked-${width}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);

    for (const [button, field] of [
      ['ตั้งค่าจุดขายและสต็อก', 'รหัสเครื่อง'],
      ['บันทึกสต็อกตั้งต้น', 'Source / Count Location'],
      ['ตั้งค่าหน้าร้านออนไลน์', 'ชื่อร้านที่แสดง'],
    ]) {
      await page
        .getByRole('button', { name: button, exact: true })
        .first()
        .click();
      await expect(
        page.getByRole('heading', { name: button, exact: true }),
      ).toBeFocused();
      await expect(
        page.getByRole(
          field === 'Source / Count Location' ? 'combobox' : 'textbox',
          { name: field, exact: true },
        ),
      ).toBeVisible();
      if (field === 'รหัสเครื่อง')
        await expect(
          page.getByRole('textbox', { name: 'รหัสสถานที่เก็บ', exact: true }),
        ).toHaveCSS('border-top-style', 'solid');
      await expect(page).toHaveURL(/\/setup$/);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(await page.locator('form form').count()).toBe(0);
      await page.screenshot({
        path: testInfo.outputPath(
          `${field === 'รหัสเครื่อง' ? 'source' : field === 'ชื่อร้านที่แสดง' ? 'storefront' : 'stock'}-${width}.png`,
        ),
        fullPage: true,
      });
      await page
        .getByRole('button', { name: 'กลับไปตรวจสอบความพร้อม', exact: true })
        .click();
    }

    readiness = { ready: false, incomplete: [] };
    const emptyResponse = page.waitForResponse((response) =>
      new URL(response.url()).pathname.endsWith('/restaurant/setup'),
    );
    await page
      .getByRole('button', { name: 'ตรวจสอบความพร้อมอีกครั้ง', exact: true })
      .click();
    await emptyResponse;
    await expect(page.getByText('Menu: Add a menu item')).toHaveCount(0);
    await expect(activate).toBeDisabled();

    readiness = { ready: true, incomplete: [] };
    await page
      .getByRole('button', { name: 'ตรวจสอบความพร้อมอีกครั้ง', exact: true })
      .focus();
    await page.keyboard.press('Enter');
    await expect(activate).toBeEnabled();
    await expect(
      page.getByText('ร้านพร้อมเปิดใช้งาน', { exact: true }),
    ).toBeVisible();
    expect(completionRequests).toBe(0);
  });
}
