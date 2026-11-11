import { expect, test } from '@playwright/test';

for (const width of [320, 768, 1440]) {
  test(`new restaurant profile and resume at ${width}px with mocked API`, async ({
    page,
    baseURL,
  }, testInfo) => {
    const origin = new URL(baseURL!).origin;
    const fields = {
      name: 'ร้านใหม่',
      business_type: 'RESTAURANT',
      contact_email: 'owner@example.test',
      contact_phone: '123456789',
      address: 'Bangkok',
    };
    const modes = { dine_in: true, takeaway: true, delivery: false };
    const organization = {
      ...fields,
      id: 'org',
      code: 'GENERATED',
      status: 'ACTIVE',
    };
    const branch = {
      id: 'branch',
      organization_id: 'org',
      name: 'สาขาหลัก',
      code: 'MAIN',
      status: 'ACTIVE',
      is_main: true,
      address: '',
      phone: '',
      email: '',
    };
    const context = {
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
    let created = false;
    let saved = false;
    let savedFields = fields;
    const creates: unknown[] = [];
    const profiles: unknown[] = [];
    const tableSaves: unknown[] = [];
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      let data: unknown;
      if (url.pathname === '/api/v1/auth/me')
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
      else if (
        url.pathname === '/api/v1/organizations' &&
        request.method() === 'POST'
      ) {
        creates.push(request.postDataJSON());
        created = true;
        data = context;
      } else if (url.pathname === '/api/v1/organizations')
        data = created ? [organization] : [];
      else if (url.pathname === '/api/v1/organizations/org/context')
        data = context;
      else if (
        url.pathname === '/api/v1/organizations/org/restaurant/setup/profile' &&
        request.method() === 'PUT'
      ) {
        const body = request.postDataJSON();
        profiles.push(body);
        savedFields = body.organization;
        saved = true;
        data = {
          organization_id: 'org',
          branch_id: 'branch',
          current_step: 'menu',
          ready: false,
          completed: false,
          steps: [],
          readiness: { ready: false, incomplete: [] },
          profile: {
            organization: { ...organization, ...savedFields },
            branch,
            service_modes: modes,
          },
        };
      } else if (
        request.method() === 'PUT' &&
        /\/restaurant\/setup\/(services|tables|orders)$/.test(url.pathname)
      ) {
        if (url.pathname.endsWith('/tables'))
          tableSaves.push(request.postDataJSON());
        data = {
          organization_id: 'org',
          branch_id: 'branch',
          current_step: 'menu',
          ready: false,
          completed: false,
          steps: [],
          readiness: { ready: false, incomplete: [] },
        };
      } else if (url.pathname === '/api/v1/organizations/org/restaurant/setup')
        data = {
          organization_id: 'org',
          branch_id: 'branch',
          current_step: saved ? 'menu' : 'profile',
          ready: false,
          completed: false,
          steps: [],
          readiness: { ready: false, incomplete: [] },
          tables: {
            zones: [{ name: 'โซนหลัก' }],
            tables: [{ name: 'โต๊ะ 1', zone: 'โซนหลัก', seats: 4 }],
            qr_enabled: true,
          },
          profile: {
            organization: { ...organization, ...savedFields },
            branch,
            service_modes: modes,
          },
        };
      else
        return route.fulfill({
          status: 404,
          json: { error: { message: 'Unexpected mock request' } },
        });
      return route.fulfill({ json: { data } });
    });

    await page.goto('/setup');
    await expect(page.getByLabel('ชื่อร้าน')).toBeEnabled();
    await page.screenshot({
      path: testInfo.outputPath(`new-profile-${width}.png`),
      fullPage: true,
    });
    for (const label of ['รหัสร้าน', 'ชื่อสาขาหลัก', 'รหัสสาขาหลัก'])
      await expect(page.getByLabel(label, { exact: true })).toHaveCount(0);
    await page.getByLabel('ชื่อร้าน').fill(fields.name);
    await page.getByLabel('ประเภทร้าน').fill(fields.business_type);
    await page.getByLabel('อีเมลร้าน').fill(fields.contact_email);
    await page.getByLabel('โทรศัพท์ร้าน').fill(fields.contact_phone);
    await page.getByLabel('ที่อยู่ร้าน').fill(fields.address);
    await expect(
      page.getByLabel('จำนวนที่นั่ง 1', { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByLabel('โซนของโต๊ะ 1', { exact: true })).toHaveCount(
      0,
    );
    await expect(
      page.getByLabel('รับออเดอร์ผ่าน QR', { exact: true }),
    ).toHaveCount(0);
    await expect(page.getByLabel('ใช้คิวครัว', { exact: true })).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: 'เพิ่มโซน', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByLabel('เปิดใช้ QR สำหรับโต๊ะ', { exact: true }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'เพิ่มโต๊ะ', exact: true }).click();
    await expect(
      page.getByLabel('ชื่อ/เลขโต๊ะ 2', { exact: true }),
    ).toBeFocused();
    await page.getByLabel('ชื่อ/เลขโต๊ะ 2', { exact: true }).fill('A2');
    await page.getByLabel('ทานที่ร้าน', { exact: true }).uncheck();
    await expect(
      page.getByRole('table', { name: 'พื้นที่และโต๊ะ' }),
    ).toHaveCount(0);
    await page.getByLabel('ทานที่ร้าน', { exact: true }).check();
    await expect(
      page.getByLabel('ชื่อ/เลขโต๊ะ 2', { exact: true }),
    ).toHaveValue('A2');
    await page.getByRole('button', { name: 'เพิ่มโต๊ะ', exact: true }).click();
    await page.getByRole('button', { name: 'ลบโต๊ะ 3', exact: true }).click();
    await expect(
      page.getByRole('button', { name: 'เพิ่มโต๊ะ', exact: true }),
    ).toBeFocused();
    await page.screenshot({
      path: testInfo.outputPath(`table-editor-${width}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole('button', { name: /บันทึกและถัดไป/ }).click();
    await expect(
      page.getByRole('heading', { name: 'ตำแหน่งร้าน', exact: true }),
    ).toBeVisible();
    expect(tableSaves[0]).toEqual(
      expect.objectContaining({
        generate_qr: true,
        tables: [
          expect.objectContaining({ name: 'โต๊ะ 1', seats: 2 }),
          expect.objectContaining({ name: 'A2', seats: 2 }),
        ],
      }),
    );
    expect(creates).toEqual([fields]);
    expect(profiles).toEqual([
      {
        branch_id: 'branch',
        organization: fields,
        ...fields,
        service_modes: modes,
      },
    ]);

    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'ตำแหน่งร้าน', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: /ย้อนกลับ/ }).click();
    await expect(page.getByLabel('ชื่อร้าน')).toHaveValue(fields.name);
    for (const label of ['รหัสร้าน', 'ชื่อสาขาหลัก', 'รหัสสาขาหลัก'])
      await expect(page.getByLabel(label, { exact: true })).toHaveCount(0);
    await page.getByLabel('ชื่อร้าน').fill('ร้านแก้ไข');
    await page.screenshot({
      path: testInfo.outputPath(`resumed-profile-${width}.png`),
      fullPage: true,
    });
    await page.getByRole('button', { name: /บันทึกและถัดไป/ }).click();
    await expect(
      page.getByRole('heading', { name: 'ตำแหน่งร้าน', exact: true }),
    ).toBeVisible();
    const updated = { ...fields, name: 'ร้านแก้ไข' };
    expect(creates).toHaveLength(1);
    expect(profiles).toEqual([
      {
        branch_id: 'branch',
        organization: fields,
        ...fields,
        service_modes: modes,
      },
      {
        branch_id: 'branch',
        organization: updated,
        ...updated,
        service_modes: modes,
      },
    ]);
  });
}

for (const width of [320, 640, 641, 768, 1024, 1440]) {
  test(`restaurant setup layout at ${width}px with mocked API`, async ({
    page,
    baseURL,
  }, testInfo) => {
    const origin = new URL(baseURL!).origin;
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      const organization = {
        id: 'org',
        name: 'ร้านตัวอย่าง',
        code: 'SHOP',
        business_type: 'RESTAURANT',
        status: 'ACTIVE',
      };
      let data: unknown;
      if (url.pathname === '/api/v1/auth/me')
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
      else if (url.pathname === '/api/v1/organizations') data = [organization];
      else if (url.pathname === '/api/v1/organizations/org/context')
        data = {
          organization,
          membership: {
            role: 'OWNER',
            status: 'ACTIVE',
            branch_ids: ['branch'],
            permissions: [],
          },
          branches: [
            {
              id: 'branch',
              organization_id: 'org',
              name: 'สาขาหลัก',
              code: 'MAIN',
              status: 'ACTIVE',
              is_main: true,
            },
          ],
          permissions: [],
        };
      else if (url.pathname === '/api/v1/organizations/org/restaurant/setup')
        data = {
          organization_id: 'org',
          branch_id: 'branch',
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
            branch: {
              name: 'สาขาหลัก',
              code: 'MAIN',
              address: '',
              phone: '',
              email: '',
            },
            service_modes: { dine_in: true, takeaway: true, delivery: false },
          },
        };
      else
        return route.fulfill({
          status: 404,
          json: { error: { message: 'Unexpected mock request' } },
        });
      return route.fulfill({ json: { data } });
    });
    await page.goto('/setup');
    await expect(page.getByLabel('ชื่อร้าน')).toHaveValue('ร้านตัวอย่าง');
    await expect(page.locator('aside.sidebar')).toHaveCount(0);
    await expect(
      page.locator('.setup-topbar .workspace-area-link'),
    ).toHaveCount(0);
    await expect(page.locator('.setup-topbar .tag')).toHaveCount(0);
    await expect(
      page.locator('.setup-topbar .language-switcher'),
    ).toBeVisible();
    const header = page.locator('.setup-topbar');
    await expect(header).toHaveCSS('min-height', '66px');
    await expect(header.locator('.brand-mark')).toHaveCSS(
      'height',
      width < 768 ? '32px' : '36px',
    );
    const headerBox = await header.boundingBox();
    expect(headerBox?.height).toBe(66);
    const brandBox = await header.locator('.setup-topbar-brand').boundingBox();
    const actionsBox = await header
      .locator('.setup-topbar-actions')
      .boundingBox();
    expect(brandBox!.x + brandBox!.width).toBeLessThan(actionsBox!.x);
    expect(actionsBox!.x + actionsBox!.width).toBeLessThanOrEqual(width - 16);
    await expect(
      page.getByRole('heading', { level: 1, name: 'เริ่มต้นใช้งานร้านอาหาร' }),
    ).toHaveCount(1);
    await expect(page.locator('.setup-page-wrapper')).toHaveCSS(
      'background-image',
      /radial-gradient/,
    );
    await expect(page.locator('.setup-card')).toHaveCSS(
      'background-color',
      'rgb(255, 255, 255)',
    );
    const progress = page.getByRole('complementary', {
      name: 'ความคืบหน้าการตั้งค่า',
    });
    await expect(progress).toHaveClass(/setup-top-stepper/);
    await expect(progress.getByRole('listitem')).toHaveCount(4);
    expect(
      await progress.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    const progressBox = await progress.boundingBox();
    const layoutBox = await page.locator('.setup-layout').boundingBox();
    expect(progressBox?.y ?? 0).toBeLessThan(layoutBox?.y ?? 0);
    if (width <= 768) {
      expect(progressBox?.height).toBeLessThan(300);
    }
    await progress.getByRole('button', { name: /1 ร้านและบริการ/ }).focus();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('ชื่อร้าน')).toBeFocused();
    await expect(page.getByLabel('ชื่อร้าน')).toHaveCSS(
      'outline-style',
      'solid',
    );
    await expect(
      page.getByRole('button', { name: /บันทึกและถัดไป/ }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`setup-${width}.png`),
      fullPage: true,
    });
  });
}

test('issued table secrets can be copied and downloaded from the mocked response', async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  const origin = new URL(baseURL!).origin;
  await page.setViewportSize({ width: 320, height: 900 });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const organization = {
    id: 'org',
    name: 'ร้านตัวอย่าง',
    code: 'SHOP',
    business_type: 'RESTAURANT',
    status: 'ACTIVE',
  };
  const setup = {
    organization_id: 'org',
    branch_id: 'branch',
    current_step: 'tables',
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
      service_modes: { dine_in: true, takeaway: true, delivery: false },
    },
    tables: {
      zones: [{ code: 'Z1', name: 'โซน' }],
      tables: [{ code: 'T1', name: 'โต๊ะ', zone: 'โซน', seats: 4 }],
      qr_enabled: true,
    },
  };
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    let data: unknown;
    if (url.pathname === '/api/v1/auth/me')
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
    else if (url.pathname === '/api/v1/organizations') data = [organization];
    else if (url.pathname === '/api/v1/organizations/org/context')
      data = {
        organization,
        membership: {
          role: 'OWNER',
          status: 'ACTIVE',
          branch_ids: ['branch'],
          permissions: [],
        },
        branches: [
          {
            id: 'branch',
            organization_id: 'org',
            name: 'สาขาหลัก',
            code: 'MAIN',
            status: 'ACTIVE',
            is_main: true,
          },
        ],
        permissions: [],
      };
    else if (url.pathname === '/api/v1/organizations/org/restaurant/setup')
      data = setup;
    else if (
      url.pathname === '/api/v1/organizations/org/restaurant/setup/tables' &&
      route.request().method() === 'PUT'
    )
      data = {
        ...setup,
        issued_table_qr_tokens: [
          { table_id: 'table-1', code: 'T1', qr_token: 'synthetic-secret' },
        ],
      };
    else if (
      route.request().method() === 'PUT' &&
      /\/restaurant\/setup\/(profile|services|orders)$/.test(url.pathname)
    )
      data = setup;
    else
      return route.fulfill({
        status: 404,
        json: { error: { message: 'Unexpected mock request' } },
      });
    return route.fulfill({ json: { data } });
  });
  await page.goto('/setup');
  await expect(page.getByLabel('ชื่อ/เลขโต๊ะ 1')).toHaveValue('โต๊ะ');
  await page.getByRole('button', { name: /บันทึกและถัดไป/ }).click();
  await expect(page.getByLabel('รหัสลับโต๊ะ')).toHaveValue(/synthetic-secret/);
  await page.getByRole('button', { name: /คัดลอกรหัสลับ/ }).click();
  await expect(page.getByText('คัดลอกแล้ว', { exact: true })).toHaveAttribute(
    'role',
    'status',
  );
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    'synthetic-secret',
  );
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: /ดาวน์โหลดรหัสลับ/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('table-qr-secrets.json');
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  expect(JSON.parse(Buffer.concat(chunks).toString('utf8'))).toEqual([
    { table_id: 'table-1', code: 'T1', qr_token: 'synthetic-secret' },
  ]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('issued-secret-320.png'),
    fullPage: true,
  });
});
