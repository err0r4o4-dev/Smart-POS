import { expect, test } from '@playwright/test';

test.use({ trace: 'off' });
const organizationID = '11111111-1111-4111-8111-111111111111';
const userID = '22222222-2222-4222-8222-222222222222';
const branchID = '33333333-3333-4333-8333-333333333333';

async function fixture(page, { member = true, mode = 'single' } = {}) {
  const writes = [];
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
    else {
      await route.fulfill({
        status: 404,
        json: { error: { message: 'Unmocked fixture endpoint' } },
      });
      return;
    }
    await route.fulfill({
      headers: { 'X-SmartPOS-Store-Mode': mode },
      json: { data },
    });
  });
  return writes;
}

test('single-store catalog opens directly and remains usable at three viewport widths (API fixtures)', async ({
  page,
}, testInfo) => {
  const writes = await fixture(page);
  await page.goto('/shop');
  await expect(page).toHaveURL(/\/shop\/single-fixture$/);
  await expect(
    page.getByRole('heading', { name: 'ร้านทดสอบร้านเดียว', exact: true }),
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
  await page
    .getByRole('link', { name: 'สถานะการเปิดขาย', exact: true })
    .click();
  await expect(page).toHaveURL(/\/shop\/single-fixture#online-status$/);
});

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

test('legacy multi-store mode retains the published-store directory (API fixtures)', async ({
  page,
}) => {
  await fixture(page, { mode: 'multi' });
  await page.goto('/shop');
  await expect(
    page.getByRole('link', { name: 'ดูสินค้า', exact: true }),
  ).toBeVisible();
  await expect(page).toHaveURL(/\/shop$/);
});
