import { expect, test } from '@playwright/test';

for (const { width, english } of [
  { width: 320, english: false },
  { width: 768, english: false },
  { width: 1440, english: false },
  { width: 1440, english: true },
]) {
  test(`setup without menu at ${width}px (${english ? 'en' : 'th'}) with mocked API`, async ({
    page,
    baseURL,
  }, testInfo) => {
    const origin = new URL(baseURL!).origin;
    const organization = {
      id: 'org',
      name: 'Test restaurant',
      code: 'SHOP',
      business_type: 'RESTAURANT',
      status: 'ACTIVE',
      contact_phone: '0812345678',
      address:
        '99/9, แขวง พระบรมมหาราชวัง, เขต พระนคร, จังหวัด กรุงเทพมหานคร, รหัสไปรษณีย์ 10200',
    };
    const branch = {
      id: 'branch',
      organization_id: 'org',
      name: 'Main',
      code: 'MAIN',
      status: 'ACTIVE',
      is_main: true,
    };
    let completed = false;
    let currentStep = 'menu';
    let paymentAttempts = 0;
    const writes: Array<{
      path: string;
      key: string | undefined;
      body: unknown;
    }> = [];
    let releaseCompletion!: () => void;
    const completionHeld = new Promise<void>((resolve) => {
      releaseCompletion = resolve;
    });
    function setupState() {
      return {
        organization_id: 'org',
        branch_id: 'branch',
        current_step: currentStep,
        completed,
        ready: true,
        readiness: { ready: true, incomplete: [] },
        steps: [
          {
            key: 'menu',
            status: 'PENDING',
            complete: false,
            ready: false,
            reasons: [],
          },
        ],
        menu: { categories: [], items: [] },
        profile: {
          organization,
          service_modes: { dine_in: false, takeaway: true, delivery: false },
        },
        services: { dine_in: false, takeaway: true, delivery: false },
        tables: { zones: [], tables: [], qr_enabled: false },
        payments: {
          cash: true,
          bank_transfer: false,
          promptpay: false,
          card: false,
        },
        orders: {
          qr_ordering: false,
          kitchen_queue: true,
          auto_confirm: false,
          vat_percent: '0',
          service_charge_percent: '0',
        },
        location: {
          latitude: 13.75,
          longitude: 100.5,
          address: 'Bangkok',
          details: '',
          confirmed: true,
        },
      };
    }
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      const path = url.pathname;
      let data: unknown;
      if (request.method() !== 'GET')
        writes.push({
          path,
          key: request.headers()['idempotency-key'],
          body: request.postDataJSON(),
        });
      if (path === '/api/v1/auth/me')
        data = {
          user: {
            id: 'owner',
            email: 'owner@example.test',
            display_name: 'Owner',
            status: 'ACTIVE',
            email_verified: true,
          },
          csrf_token: 'synthetic-csrf',
        };
      else if (path === '/api/v1/organizations') data = [organization];
      else if (path === '/api/v1/organizations/org/context')
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
      else if (path.endsWith('/restaurant/setup/payments')) {
        paymentAttempts += 1;
        if (paymentAttempts === 1)
          return route.fulfill({
            status: 503,
            json: {
              error: {
                code: 'UNAVAILABLE',
                message: 'Payment save unavailable',
              },
            },
          });
        data = setupState();
      } else if (path.endsWith('/restaurant/setup/orders')) {
        currentStep = 'review';
        data = setupState();
      } else if (path.endsWith('/restaurant/setup/complete')) {
        await completionHeld;
        completed = true;
        data = setupState();
      } else if (path.endsWith('/restaurant/setup')) data = setupState();
      else
        return route.fulfill({
          status: 404,
          json: { error: { message: 'Unexpected mock request' } },
        });
      return route.fulfill({ json: { data } });
    });

    await page.goto('/setup');
    if (english)
      await page.getByRole('button', { name: 'English', exact: true }).click();
    const heading = page.getByRole('heading', {
      level: 2,
      name: english ? 'Payments' : 'การชำระเงิน',
      exact: true,
    });
    await expect(heading).toBeVisible();
    await expect(page.getByLabel('ชื่อเมนูแรก', { exact: true })).toHaveCount(
      0,
    );
    await expect(
      page.getByLabel('First menu item', { exact: true }),
    ).toHaveCount(0);
    const cash = page.getByRole('checkbox', {
      name: english ? /Cash/ : /เงินสด/,
    });
    await cash.uncheck();
    const save = page.getByRole('button', {
      name: english ? 'Save and continue' : 'บันทึกและถัดไป',
      exact: true,
    });
    await save.click();
    await expect(page.getByRole('alert')).toBeVisible();
    expect(paymentAttempts).toBe(0);
    await cash.check();
    await save.click();
    await expect(page.getByRole('alert')).toContainText(
      'Payment save unavailable',
    );
    await expect(cash).toBeChecked();
    await page.screenshot({
      path: testInfo.outputPath('payments-retry.png'),
      fullPage: true,
    });
    await save.focus();
    await page.keyboard.press('Enter');
    const activate = page.getByRole('button', {
      name: english ? 'Open store' : 'เปิดใช้งานร้าน',
      exact: true,
    });
    await expect(activate).toBeEnabled();
    await expect(page.getByRole('heading', { level: 2 })).toBeFocused();
    await expect(
      page.getByRole('button', {
        name: english ? 'Manage menu' : 'จัดการเมนู',
        exact: true,
      }),
    ).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath('review-without-menu.png'),
      fullPage: true,
    });
    const paymentWrites = writes.filter((entry) =>
      entry.path.endsWith('/payments'),
    );
    expect(paymentWrites).toHaveLength(2);
    expect(paymentWrites[0].key).toBeTruthy();
    expect(paymentWrites[1].key).toBe(paymentWrites[0].key);
    expect(paymentWrites[1].body).toMatchObject({
      branch_id: 'branch',
      cash: true,
      bank_transfer: false,
    });
    expect(writes.some((entry) => entry.path.endsWith('/menu'))).toBe(false);
    await activate.focus();
    await page.keyboard.press('Enter');
    await expect
      .poll(
        () => writes.filter((entry) => entry.path.endsWith('/complete')).length,
      )
      .toBe(1);
    await expect(page).toHaveURL(/\/setup$/);
    await expect(page.locator('button[type="submit"]')).toBeDisabled();
    await expect(page.locator('button[type="submit"]')).toHaveAttribute(
      'aria-busy',
      'true',
    );
    releaseCompletion();
    await expect(page).toHaveURL(/\/dashboard$/);
    expect(
      writes.filter((entry) => entry.path.endsWith('/complete')),
    ).toHaveLength(1);
    expect(writes.some((entry) => entry.path.endsWith('/menu'))).toBe(false);
  });
}
