import { expect, test } from '@playwright/test';

for (const [width, english, editTable] of [
  [360, false, false],
  [390, true, false],
  [768, false, false],
  [1280, true, false],
  [390, true, true],
  [1280, true, true],
] as const) {
  test(`${editTable ? 'Existing table edit' : 'Pickup-only setup'} at ${width}px`, async ({
    page,
    baseURL,
  }, testInfo) => {
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
    const services = {
      dine_in: editTable,
      takeaway: true,
      pickup: false,
      delivery: false,
    };
    const writes = new Map<string, Record<string, unknown>>();
    const setup = {
      organization_id: 'org',
      current_step: 'services',
      completed: false,
      readiness: { ready: false, incomplete: [] },
      steps: [],
      services,
      profile: { organization, service_modes: services },
      ...(editTable
        ? {
            tables: {
              zones: [{ code: 'MAIN', name: 'Main room' }],
              tables: [{ code: 'T1', name: 'Original table', zone: 'Main room', seats: 4 }],
              qr_enabled: true,
            },
          }
        : {}),
      location: {
        latitude: 13.75,
        longitude: 100.5,
        address: organization.address,
        details: '',
        confirmed: true,
      },
    };
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== new URL(baseURL!).origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      const path = url.pathname;
      if (path.includes('/restaurant/setup/') && request.method() !== 'GET')
        writes.set(path.split('/').at(-1)!, request.postDataJSON());
      let data: unknown;
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
            branch_ids: [],
            permissions: [],
          },
          branches: [],
          permissions: [],
        };
      else if (path.endsWith('/restaurant/setup')) data = setup;
      else if (
        /\/restaurant\/setup\/(profile|services|tables|orders)$/.test(path) &&
        request.method() === 'PUT'
      ) {
        data = setup;
      } else
        return route.fulfill({
          status: 404,
          json: { error: { message: 'Unexpected mock request' } },
        });
      return route.fulfill({ json: { data } });
    });

    await page.goto('/setup');
    if (english)
      await page.getByRole('button', { name: 'English', exact: true }).click();
    if (editTable) {
      const name = page.getByRole('textbox', { name: 'Table name / number 1' });
      await expect(name).toHaveValue('Original table');
      const renamed = 'Window table with an extended name';
      await name.fill(renamed);
      const bounds = await name.boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      const save = page.getByRole('button', { name: 'Save and continue', exact: true });
      await save.focus();
      await expect(save).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('heading', { name: 'Payments', exact: true })).toBeVisible();
      expect(writes.get('tables')).toMatchObject({
        qr_enabled: true,
        tables: [{ code: 'T1', name: renamed }],
      });
      expect(writes.get('tables')).not.toHaveProperty('generate_qr');
      expect(writes.get('tables')).not.toHaveProperty('branch_id');
      await expect(page.getByRole('heading', { name: 'Issued table QR secrets' })).toHaveCount(0);
      return;
    }
    const pickup = page.getByRole('checkbox', {
      name: english ? 'Pickup' : 'สั่งล่วงหน้าแล้วมารับ',
      exact: true,
    });
    await expect(pickup).not.toBeChecked();
    await expect(pickup).toHaveAccessibleDescription(
      english ? /does not open ordering/ : /ยังไม่เปิดรับออเดอร์/,
    );
    await page
      .getByRole('checkbox', {
        name: english ? 'Takeaway' : 'ซื้อกลับบ้าน',
        exact: true,
      })
      .uncheck();
    await pickup.focus();
    await expect(pickup).toBeFocused();
    await page.keyboard.press('Space');
    await expect(pickup).toBeChecked();
    const group = page.getByRole('group', {
      name: english ? 'Service modes' : 'รูปแบบบริการ',
    });
    await expect(group.getByRole('checkbox')).toHaveCount(4);
    const bounds = await group.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await group.screenshot({ path: testInfo.outputPath('service-modes.png') });
    await page
      .getByRole('button', {
        name: english ? 'Save and continue' : 'บันทึกและถัดไป',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('heading', {
        name: english ? 'Payments' : 'การชำระเงิน',
        exact: true,
      }),
    ).toBeVisible();
    for (const step of ['profile', 'services']) {
      expect(writes.get(step)?.service_modes).toEqual({
        ...services,
        takeaway: false,
        pickup: true,
      });
      expect(writes.get(step)).not.toHaveProperty('branch_id');
    }
    expect(writes.has('complete')).toBe(false);
  });
}
