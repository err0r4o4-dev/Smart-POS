import { expect, test } from '@playwright/test';

for (const width of [320, 768, 1440]) {
  test(`required setup fields with optional description at ${width}px`, async ({
    page,
    baseURL,
  }, testInfo) => {
    const origin = new URL(baseURL!).origin;
    const organization = {
      id: 'org',
      name: 'Test restaurant',
      business_type: 'RESTAURANT',
      status: 'ACTIVE',
      contact_phone: '',
      address: '',
    };
    const branch = {
      id: 'branch',
      organization_id: 'org',
      name: 'Main',
      code: 'MAIN',
      status: 'ACTIVE',
      is_main: true,
    };
    const writes: Array<{ path: string; body: Record<string, unknown> }> = [];
    let currentStep = 'profile';
    const state = () => ({
      organization_id: 'org',
      branch_id: 'branch',
      current_step: currentStep,
      ready: true,
      completed: false,
      readiness: { ready: true, incomplete: [] },
      steps: [],
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
    });
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      const path = url.pathname;
      let data: unknown;
      if (request.method() !== 'GET')
        writes.push({ path, body: request.postDataJSON() });
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
      else if (path.endsWith('/restaurant/setup/profile')) {
        Object.assign(organization, request.postDataJSON().organization);
        currentStep = 'payments';
        data = state();
      } else if (
        path.endsWith('/restaurant/setup/services') ||
        path.endsWith('/restaurant/setup/tables') ||
        path.endsWith('/restaurant/setup/orders')
      )
        data = state();
      else if (path.endsWith('/restaurant/setup')) data = state();
      else
        return route.fulfill({
          status: 404,
          json: { error: { message: 'Unexpected mock request' } },
        });
      return route.fulfill({ json: { data } });
    });
    await page.goto('/setup');
    const save = page.getByRole('button', {
      name: 'บันทึกและถัดไป',
      exact: true,
    });
    await expect(page.getByLabel('ชื่อร้าน', { exact: true })).toHaveValue(
      'Test restaurant',
    );
    await expect(save).toBeEnabled();
    await expect(
      page.getByLabel('คำอธิบายร้าน', { exact: true }),
    ).not.toHaveAttribute('required');
    await expect(page.getByLabel('อีเมลร้าน', { exact: true })).toHaveCount(0);
    await expect(page.getByText('OpenStreetMap', { exact: false })).toHaveCount(
      0,
    );
    await save.click();
    for (const label of [
      'โทรศัพท์ร้าน',
      'บ้านเลขที่ / เลขที่ตั้งร้าน',
      'จังหวัด',
      'อำเภอ / เขต',
      'ตำบล / แขวง',
      'รหัสไปรษณีย์',
    ]) {
      await expect(page.getByLabel(label, { exact: true })).toHaveAttribute(
        'aria-invalid',
        'true',
      );
      await expect(
        page.getByLabel(label, { exact: true }),
      ).toHaveAccessibleDescription(/.+/);
    }
    expect(writes).toHaveLength(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath('required-field-errors.png'),
      fullPage: true,
    });
    await page.getByLabel('โทรศัพท์ร้าน', { exact: true }).fill('123');
    await save.click();
    await expect(
      page.getByLabel('โทรศัพท์ร้าน', { exact: true }),
    ).toHaveAccessibleDescription(/0812345678/);
    expect(writes).toHaveLength(0);
    await page.getByLabel('โทรศัพท์ร้าน', { exact: true }).fill('0812345678');
    await page
      .getByLabel('บ้านเลขที่ / เลขที่ตั้งร้าน', { exact: true })
      .fill('99/9');
    await page
      .getByLabel('จังหวัด', { exact: true })
      .selectOption({ label: 'กรุงเทพมหานคร' });
    await page
      .getByLabel('อำเภอ / เขต', { exact: true })
      .selectOption({ label: 'พระนคร' });
    await page
      .getByLabel('ตำบล / แขวง', { exact: true })
      .selectOption({ label: 'พระบรมมหาราชวัง' });
    await expect(page.getByLabel('รหัสไปรษณีย์', { exact: true })).toHaveValue(
      '10200',
    );
    await expect(page.getByLabel('คำอธิบายร้าน', { exact: true })).toHaveValue(
      '',
    );
    await save.focus();
    await page.keyboard.press('Enter');
    await expect(
      page.getByRole('heading', { level: 2, name: 'การชำระเงิน', exact: true }),
    ).toBeVisible();
    const profile = writes.find((entry) => entry.path.endsWith('/profile'));
    expect(profile?.body.organization).toMatchObject({
      contact_phone: '0812345678',
      address:
        '99/9, แขวง พระบรมมหาราชวัง, เขต พระนคร, จังหวัด กรุงเทพมหานคร, รหัสไปรษณีย์ 10200',
    });
    await page.getByRole('button', { name: /ย้อนกลับ/ }).click();
    await expect(page.getByLabel('จังหวัด', { exact: true })).toHaveValue(
      'กรุงเทพมหานคร',
    );
    await expect(page.getByLabel('คำอธิบายร้าน', { exact: true })).toHaveValue(
      '',
    );
    await page.screenshot({
      path: testInfo.outputPath('required-fields-complete.png'),
      fullPage: true,
    });
    console.log(
      `Browser ${page.context().browser()?.version()} / Windows / ${width}px viewport emulation / mocked API`,
    );
  });
}
