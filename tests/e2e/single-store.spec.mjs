import { expect, test } from '@playwright/test';

test.use({ trace: 'off' });
const organizationID = '11111111-1111-4111-8111-111111111111';
const userID = '22222222-2222-4222-8222-222222222222';
const branchID = '33333333-3333-4333-8333-333333333333';

async function fixture(page, { member = true, mode = 'single' } = {}) {
  const writes = [];
  let settings = {
    slug: 'single-fixture',
    name: 'ร้านทดสอบร้านเดียว',
    description: '',
    contact_phone: '',
    pickup_instructions: 'รับสินค้าที่เคาน์เตอร์',
    terminal_id: '44444444-4444-4444-8444-444444444444',
    published: true,
    accepting_orders: true,
    revision: 1,
  };
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() !== 'GET') writes.push(path);
    const organization = {
      id: organizationID,
      name: 'ร้านทดสอบร้านเดียว',
      code: 'FIXTURE',
      business_type: 'RETAIL',
      contact_email: '',
      contact_phone: '',
      address: '',
      currency: 'THB',
      status: 'ACTIVE',
    };
    const permissions = [
      'organization.read',
      'organization.update',
      'branch.read',
      'storefront.manage',
    ];
    let data;
    if (path === '/api/v1/auth/me')
      data = {
        user: {
          id: userID,
          display_name: 'Synthetic owner',
          email: 'fixture@example.test',
          status: 'ACTIVE',
        },
        csrf_token: 'synthetic-csrf',
      };
    else if (path === '/api/v1/organizations')
      data = member ? [organization] : [];
    else if (path === `/api/v1/organizations/${organizationID}/context`)
      data = {
        organization,
        membership: {
          id: userID,
          user_id: userID,
          role: 'OWNER',
          status: 'ACTIVE',
          branch_ids: [branchID],
        },
        branches: [
          {
            id: branchID,
            organization_id: organizationID,
            name: 'สาขาหลัก',
            code: 'MAIN',
            status: 'ACTIVE',
            is_main: true,
          },
        ],
        permissions,
      };
    else if (
      path ===
      `/api/v1/organizations/${organizationID}/storefront/payment-sandbox`
    )
      data = {
        provider: 'stripe',
        mode: 'test',
        configured: false,
        amount_minor: 2000,
        currency: 'thb',
        customer_checkout_enabled: false,
      };
    else if (path === '/api/v1/storefronts')
      data = [
        {
          slug: 'single-fixture',
          name: organization.name,
          accepting_orders: true,
        },
      ];
    else if (path === '/api/v1/storefronts/single-fixture')
      data = {
        slug: 'single-fixture',
        name: organization.name,
        description: 'Synthetic single-store catalog',
        contact_phone: '',
        pickup_instructions: '',
        published: true,
        accepting_orders: true,
        revision: 1,
      };
    else if (path === '/api/v1/storefronts/single-fixture/products')
      data = { items: [], total: 0, page: 1, page_size: 24 };
    else if (path === `/api/v1/organizations/${organizationID}/storefront`) {
      if (request.method() === 'PUT')
        settings = {
          ...request.postDataJSON(),
          revision: settings.revision + 1,
        };
      data = settings;
    } else if (path === `/api/v1/organizations/${organizationID}/pos/terminals`)
      data = {
        items: [
          {
            id: '44444444-4444-4444-8444-444444444444',
            branch_id: branchID,
            name: 'เครื่องขายหน้าร้าน',
            code: 'FRONT',
            stock_location_id: '66666666-6666-4666-8666-666666666666',
            status: 'ACTIVE',
          },
          {
            id: '55555555-5555-4555-8555-555555555555',
            branch_id: branchID,
            name: 'เครื่องขายคลังหลังร้าน',
            code: 'ONLINE',
            stock_location_id: '77777777-7777-4777-8777-777777777777',
            status: 'ACTIVE',
          },
        ],
        total: 2,
        page: 1,
        page_size: 100,
      };
    else if (
      path === `/api/v1/organizations/${organizationID}/storefront/products`
    )
      data = { items: [], total: 0, page: 1, page_size: 24 };
    else {
      await route.fulfill({
        status: 404,
        json: { error: { message: 'Unmocked fixture endpoint' } },
      });
      return;
    }
    await route.fulfill({
      headers: mode ? { 'X-SmartPOS-Store-Mode': mode } : {},
      json: { data },
    });
  });
  return writes;
}

for (const mode of ['single', 'multi', null]) {
  test(`single-store catalog opens directly and remains usable at three viewport widths (API fixtures, mode: ${mode ?? 'absent'})`, async ({
    page,
  }, testInfo) => {
    const writes = await fixture(page, { mode });
    await page.goto('/shop');
    await expect(page).toHaveURL(/\/shop\/single-fixture$/);
    await expect(
      page.getByRole('searchbox', { name: 'ค้นหาสินค้า', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'ดูสินค้า', exact: true }),
    ).toHaveCount(0);
    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: testInfo.outputPath(`single-store-catalog-${width}.png`),
        fullPage: true,
      });
    }
    expect(writes).toEqual([]);
    await expect(
      page.getByRole('region', { name: 'ข้อมูลร้าน' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'สถานะการเปิดขาย', exact: true }),
    ).toHaveCount(0);
  });
}

test('single-store management hides organization selection but preserves branch context (API fixtures)', async ({
  page,
}, testInfo) => {
  const writes = await fixture(page);
  await page.goto('/manage/settings/storefront/payments');
  await expect(
    page.getByRole('heading', { name: 'ทดสอบการเชื่อมต่อ Stripe' }),
  ).toBeVisible();
  await expect(
    page.getByRole('combobox', { name: 'องค์กรที่ใช้งาน' }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('combobox', { name: 'สาขาที่ใช้งาน' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'สร้าง Checkout ทดสอบ 20.00 บาท' }),
  ).toBeDisabled();
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`single-store-management-${width}.png`),
      fullPage: true,
    });
  }
  expect(writes).toEqual([]);
});

test('an account without pinned membership cannot create or select another store (API fixtures)', async ({
  page,
}) => {
  const writes = await fixture(page, { member: false });
  await page.goto('/setup');
  await expect(
    page.getByText('ขอคำเชิญจากเจ้าของร้าน', { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel('ชื่อองค์กร')).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'สร้างร้าน', exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole('combobox', { name: 'องค์กรที่ใช้งาน' }),
  ).toHaveCount(0);
  expect(writes).toEqual([]);
});

test('multi-store directory rejects multiple shops without showing a public selector (API fixtures)', async ({
  page,
}) => {
  await fixture(page, { mode: 'multi' });
  await page.route('**/api/v1/storefronts', (route) =>
    route.fulfill({
      headers: { 'X-SmartPOS-Store-Mode': 'multi' },
      json: {
        data: [
          {
            slug: 'single-fixture',
            name: 'Synthetic first',
            accepting_orders: true,
          },
          {
            slug: 'other-fixture',
            name: 'Synthetic other',
            accepting_orders: true,
          },
        ],
      },
    }),
  );
  await page.goto('/shop');
  await expect(page.getByRole('alert')).toContainText(
    'ข้อมูลร้านเดียวไม่ถูกต้อง',
  );
  await expect(
    page.getByRole('link', { name: 'ดูสินค้า', exact: true }),
  ).toHaveCount(0);
  await expect(page).toHaveURL(/\/shop$/);
});

test('front and back source settings save independently at three widths (API fixtures)', async ({
  page,
}, testInfo) => {
  const writes = await fixture(page);
  await page.goto('/manage/settings/storefront');
  const front = page.getByRole('combobox', { name: /เครื่องขาย \/ สาขา/ });
  const back = page.getByRole('combobox', {
    name: /เครื่องขายออนไลน์จากคลังหลังร้าน/,
  });
  await expect(front).toHaveValue('44444444-4444-4444-8444-444444444444');
  await expect(back).toHaveValue('');
  await back.focus();
  await expect(back).toBeFocused();
  await back.selectOption('55555555-5555-4555-8555-555555555555');
  const saved = page.waitForRequest(
    (request) =>
      request.method() === 'PUT' &&
      new URL(request.url()).pathname ===
        `/api/v1/organizations/${organizationID}/storefront`,
  );
  await page.getByRole('button', { name: 'บันทึกการตั้งค่า' }).click();
  expect((await saved).postDataJSON()).toMatchObject({
    terminal_id: '44444444-4444-4444-8444-444444444444',
    online_terminal_id: '55555555-5555-4555-8555-555555555555',
  });
  await expect(back).toHaveValue('55555555-5555-4555-8555-555555555555');
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(back).toBeVisible();
    await expect(front).toHaveValue('44444444-4444-4444-8444-444444444444');
    await page.getByRole('heading', { name: 'ตั้งค่าหน้าร้านออนไลน์' }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`online-sources-${width}.png`),
      fullPage: true,
    });
  }
  expect(writes).toEqual([
    `/api/v1/organizations/${organizationID}/storefront`,
  ]);
});
