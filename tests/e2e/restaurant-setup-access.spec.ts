import { expect, test } from '@playwright/test';

for (const width of [320, 768, 1440]) {
  test(`setup saves prerequisites inline and waits for committed completion at ${width}px`, async ({
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
    const stockLocation = {
      id: 'stock',
      branch_id: 'branch',
      name: 'Main stock',
      code: 'MAIN',
      type: 'WAREHOUSE',
      status: 'ACTIVE',
      is_system: false,
    };
    let hasLocation = false;
    let hasTerminal = false;
    let completed = false;
    let completionRequests = 0;
    const writes: Array<{ path: string; body: Record<string, unknown> }> = [];
    let menu = {
      categories: [] as Array<{ name: string }>,
      items: [] as Array<{ name: string; price: string; category: string }>,
    };
    let finishCompletion!: () => void;
    const heldCompletion = new Promise<void>((resolve) => {
      finishCompletion = resolve;
    });
    function setupState() {
      return {
        organization_id: 'org',
        branch_id: 'branch',
        current_step: menu.items.length ? 'review' : 'menu',
        completed,
        ready: hasTerminal,
        readiness: {
          ready: hasTerminal,
          incomplete: hasTerminal
            ? []
            : [
                {
                  key: 'pos_source',
                  label: 'POS source',
                  reason: 'Configure a source',
                },
              ],
        },
        steps: [],
        menu,
        profile: {
          organization,
          service_modes: { dine_in: false, takeaway: true, delivery: false },
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
          csrf_token: 'mock-csrf',
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
      else if (path.endsWith('/restaurant/setup/complete')) {
        completionRequests += 1;
        if (completionRequests === 1)
          return route.fulfill({
            status: 503,
            json: {
              error: { code: 'UNAVAILABLE', message: 'Completion save failed' },
            },
          });
        if (completionRequests === 3) await heldCompletion;
        data = setupState();
      } else if (path.endsWith('/restaurant/setup')) data = setupState();
      else if (/\/restaurant\/setup\/(menu|payments|orders)$/.test(path)) {
        if (path.endsWith('/menu')) menu = request.postDataJSON();
        data = setupState();
      } else if (path.endsWith('/inventory/locations')) {
        if (request.method() === 'POST') {
          hasLocation = true;
          data = stockLocation;
        } else
          data = {
            items: hasLocation ? [stockLocation] : [],
            total: hasLocation ? 1 : 0,
          };
      } else if (
        path.endsWith('/pos/terminals') &&
        request.method() === 'POST'
      ) {
        hasTerminal = true;
        data = { id: 'terminal', ...request.postDataJSON() };
      } else
        return route.fulfill({
          status: 404,
          json: { error: { message: 'Unexpected mock request' } },
        });
      return route.fulfill({ json: { data } });
    });

    await page.goto('/pos/checkout');
    await expect(page).toHaveURL(/\/setup$/);
    await page.getByLabel('หมวดหมู่เมนูแรก', { exact: true }).fill('อาหาร');
    await page.getByLabel('ชื่อเมนูแรก', { exact: true }).fill('ข้าว');
    await page.getByLabel('ราคาเมนูแรก (บาท)', { exact: true }).fill('45.00');
    await page.getByLabel('รับออเดอร์ผ่าน QR', { exact: true }).uncheck();
    await page.screenshot({
      path: testInfo.outputPath(`menu-${width}.png`),
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .getByRole('button', { name: 'บันทึกและถัดไป', exact: true })
      .click();
    const activate = page.getByRole('button', {
      name: 'เปิดใช้งานร้าน',
      exact: true,
    });
    await expect(activate).toBeDisabled();
    await page
      .getByRole('button', { name: 'ตั้งค่าจุดขายและสต็อก', exact: true })
      .click();
    await page.getByLabel('รหัสสถานที่เก็บ', { exact: true }).fill('MAIN');
    await page
      .getByLabel('ชื่อสถานที่เก็บ', { exact: true })
      .fill('Main stock');
    await page
      .getByRole('button', { name: 'บันทึก Location', exact: true })
      .click();
    await page.getByLabel('รหัสเครื่อง', { exact: true }).fill('POS');
    await page.getByLabel('ชื่อเครื่อง', { exact: true }).fill('Counter');
    await page
      .getByRole('combobox', { name: 'ตำแหน่งสต็อกขาย', exact: true })
      .selectOption('stock');
    await page
      .getByRole('button', { name: 'สร้างเครื่องขาย', exact: true })
      .click();
    await expect(
      page.getByText('บันทึกจุดขายแล้ว กรุณาตรวจสอบความพร้อมอีกครั้ง'),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'กลับไปตรวจสอบความพร้อม', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'ตรวจสอบความพร้อมอีกครั้ง', exact: true })
      .click();
    await expect(activate).toBeEnabled();
    expect(completionRequests).toBe(0);
    expect(completed).toBe(false);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/setup$/);
    await expect(activate).toBeEnabled();

    await activate.click();
    await expect(page.getByText('Completion save failed')).toBeVisible();
    await expect(page).toHaveURL(/\/setup$/);
    await activate.click();
    await expect.poll(() => completionRequests).toBe(2);
    await expect(activate).toBeEnabled();
    await expect(page).toHaveURL(/\/setup$/);
    await activate.click();
    await expect.poll(() => completionRequests).toBe(3);
    await expect(
      page.getByRole('button', { name: 'กำลังบันทึก…', exact: true }),
    ).toBeDisabled();
    await expect(page).toHaveURL(/\/setup$/);
    expect(completed).toBe(false);
    completed = true;
    finishCompletion();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(
      page.getByRole('heading', { name: 'ภาพรวม', exact: true }),
    ).toBeVisible();

    expect(
      writes.find((write) => write.path.endsWith('/setup/menu'))?.body,
    ).toMatchObject({
      branch_id: 'branch',
      categories: [{ name: 'อาหาร' }],
      items: [{ name: 'ข้าว', price: '45.00', category: 'อาหาร' }],
    });
    expect(
      writes.find((write) => write.path.endsWith('/pos/terminals'))?.body,
    ).toMatchObject({
      branch_id: 'branch',
      stock_location_id: 'stock',
      code: 'POS',
      status: 'ACTIVE',
    });
    expect(
      writes.filter((write) => write.path.includes('/opening-balances')),
    ).toHaveLength(0);
  });
}
