import { expect, test, type Page } from '@playwright/test';

const organization = {
  id: 'owner-fixture',
  name: 'ร้านทดสอบ',
  code: 'OWNER',
  business_type: 'restaurant',
  status: 'ACTIVE',
  currency: 'THB',
};
const permissions = [
  'organization.read',
  'organization.update',
  'branch.read',
  'catalog.read',
  'pos.access',
];

async function mockAPI(page: Page, role: string | null) {
  const requests: string[] = [];
  let authenticated = role !== null;
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    requests.push(path);
    if (path === '/api/v1/auth/me') {
      return route.fulfill(
        authenticated
          ? {
              json: {
                data: {
                  user: {
                    id: 'user',
                    display_name: 'Synthetic user',
                    email: 'fixture@example.test',
                    status: 'ACTIVE',
                  },
                  csrf_token: 'fixture',
                },
              },
            }
          : { status: 401, json: { error: { code: 'UNAUTHORIZED' } } },
      );
    }
    if (path === '/api/v1/auth/logout') {
      authenticated = false;
      return route.fulfill({ json: { data: {} } });
    }
    if (path === '/api/v1/organizations')
      return route.fulfill({ json: { data: [organization] } });
    if (path === '/api/v1/organizations/owner-fixture/context')
      return route.fulfill({
        json: {
          data: {
            organization,
            membership: {
              id: 'member',
              user_id: 'user',
              role,
              status: 'ACTIVE',
              branch_ids: ['main'],
            },
            branches: [
              {
                id: 'main',
                organization_id: organization.id,
                name: 'สาขาหลัก',
                code: 'MAIN',
                status: 'ACTIVE',
                is_main: true,
              },
            ],
            permissions,
          },
        },
      });
    if (path === '/api/v1/organizations/owner-fixture/restaurant/setup')
      return route.fulfill({
        json: {
          data: {
            completed: true,
            readiness: { ready: true, incomplete: [] },
            steps: [],
          },
        },
      });
    if (path === '/api/v1/storefronts')
      return route.fulfill({
        json: {
          data: [
            { slug: 'fixture', name: 'ร้านทดสอบ', accepting_orders: true },
          ],
        },
      });
    if (path === '/api/v1/storefronts/fixture')
      return route.fulfill({
        json: {
          data: {
            slug: 'fixture',
            name: 'ร้านทดสอบ',
            description: '',
            contact_phone: '',
            pickup_instructions: '',
            published: true,
            accepting_orders: true,
            revision: 1,
          },
        },
      });
    if (path === '/api/v1/storefronts/fixture/products')
      return route.fulfill({
        json: { data: { items: [], total: 0, page: 1, page_size: 24 } },
      });
    if (path === '/api/v1/storefronts/fixture/track')
      return route.fulfill({
        json: {
          data: {
            id: 'order',
            number: 'WEB-FIXTURE',
            status: 'COMPLETED',
            payment_status: 'PAID_AT_STORE',
            estimated_total: '10.00',
            final_total: '10.00',
            receipt_number: null,
            store_name: 'ร้านทดสอบ',
            store_phone: '',
            pickup_instructions: '',
            expires_at: '2030-01-01T00:00:00Z',
            items: [],
            events: [],
          },
        },
      });
    return route.fulfill({
      status: 404,
      json: { error: { code: 'NOT_FOUND' } },
    });
  });
  return requests;
}

test.use({ trace: 'off' });

test('owner enters management and retired staff URLs are unavailable (mock API)', async ({
  page,
}, testInfo) => {
  const requests = await mockAPI(page, 'OWNER');
  await page.goto('/dashboard');
  await expect(
    page.getByRole('heading', { level: 1, name: 'ภาพรวม' }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('owner-dashboard.png'),
    fullPage: true,
  });
  for (const path of [
    '/manage/dashboard',
    '/manage/products',
    '/account',
    '/work',
    '/work/products',
    '/work/employees',
    '/staff',
    '/employees',
    '/roles',
    '/manage/employees',
    '/manage/roles',
    '/manage/invitations',
  ]) {
    await page.goto(path);
    await expect(page.getByText('404 · NOT FOUND')).toBeVisible();
  }
  expect(
    requests.filter((path) => /\/(members|roles|invitations)(\/|$)/.test(path)),
  ).toEqual([]);
});

for (const role of [
  'MANAGER',
  'CASHIER',
  'INVENTORY_STAFF',
  'PURCHASING_STAFF',
]) {
  test(`${role} cannot enter management even with stale permissions (mock API)`, async ({
    page,
  }) => {
    await mockAPI(page, role);
    await page.goto('/menu');
    await expect(page).toHaveURL(/\/403$/);
    await expect(page.locator('[data-workspace="management"]')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'ภาพรวม' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'เมนูอาหาร' })).toHaveCount(
      0,
    );
    await page.goto('/help');
    await expect(page.locator('[data-workspace="account"]')).toBeVisible();
    await expect(page.locator('a[href="/dashboard"]')).toHaveCount(0);
    await page.getByRole('button', { name: 'บัญชีของคุณ' }).click();
    const logout = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/v1/auth/logout' &&
        response.request().method() === 'POST',
    );
    await page.getByRole('menuitem', { name: 'ออกจากระบบ' }).click();
    expect((await logout).status()).toBe(200);
    await expect(page).toHaveURL(/\/login$/);
    await expect(
      page.getByRole('textbox', { name: 'ที่อยู่อีเมล' }),
    ).toBeVisible();
    await page.goto('/menu');
    await expect(page).toHaveURL(/\/login\?returnTo=/);
  });
}

test('anonymous user is redirected from management (mock API)', async ({
  page,
}) => {
  await mockAPI(page, null);
  await page.goto('/menu');
  await expect(page).toHaveURL(/\/login\?returnTo=/);
});

for (const width of [360, 390, 768, 1280]) {
  test(`retired purchasing and returns bookmarks stay unavailable at ${width}px (mock API)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const requests = await mockAPI(page, 'OWNER');
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'จัดการร้านให้ง่ายขายได้อย่างมั่นใจ',
    );
    for (const path of [
      '/suppliers',
      '/purchasing/orders',
      '/purchasing/orders/new',
      '/purchasing/orders/00000000-0000-4000-8000-000000000001',
      '/shelves',
      '/pos/returns',
      '/pos/exchanges',
      '/sales/refunds/00000000-0000-4000-8000-000000000001',
      '/sales/voids',
    ]) {
      await page.goto(path);
      await expect(page.getByText('404 · NOT FOUND')).toBeVisible();
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        'ไม่พบหน้านี้',
      );
      await expect(
        page.getByRole('link', { name: 'กลับพื้นที่ทำงาน' }),
      ).toHaveAttribute('href', '/workspace');
      expect(new URL(page.url()).pathname).toBe(path);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    }
    expect(
      requests.filter((path) =>
        /\/organizations\/[^/]+\/(suppliers|purchasing|shelves|returns|exchanges|refunds|sales)(\/|$)/.test(
          path,
        ),
      ),
    ).toEqual([]);
  });
}

test('public shop remains available without a session (mock API)', async ({
  page,
}, testInfo) => {
  await mockAPI(page, null);
  await page.goto('/shop');
  await page.getByRole('link', { name: 'ดูหน้าร้าน', exact: true }).click();
  await expect(page).toHaveURL(/\/shop\/fixture$/);
  await expect(
    page.getByRole('searchbox', { name: 'ค้นหาสินค้า', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('public-shop.png'),
    fullPage: true,
  });
  await page.goto('/shop/fixture/cart');
  await expect(
    page.getByRole('heading', { name: 'ตะกร้ายังว่าง' }),
  ).toBeVisible();
  const tracking = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === '/api/v1/storefronts/fixture/track',
  );
  await page.goto(`/shop/fixture/track/order#access=${'a'.repeat(64)}`);
  expect((await tracking).postDataJSON()).toEqual({
    order_id: 'order',
    access_token: 'a'.repeat(64),
  });
  await expect(page.getByText('WEB-FIXTURE')).toBeVisible();
});
