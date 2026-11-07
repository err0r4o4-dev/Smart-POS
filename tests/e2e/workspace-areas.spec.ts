import { expect, test, type Page } from '@playwright/test';
import { navigation } from '../../apps/web/src/app/routes';
import type { Role } from '../../apps/web/src/app/access';

const allPermissions = [
  ...new Set(
    navigation.flatMap((item) => (item.permission ? [item.permission] : [])),
  ),
];
const rolePermissions: Record<Role, string[]> = {
  OWNER: allPermissions,
  MANAGER: ['organization.read', 'catalog.read', 'inventory.read'],
  CASHIER: [
    'pos.access',
    'pos.register.open',
    'pos.register.close',
    'sales.read',
    'receipts.read',
  ],
  INVENTORY_STAFF: [
    'catalog.read',
    'inventory.read',
    'shelf.read',
    'quality.read',
  ],
  PURCHASING_STAFF: ['catalog.read', 'supplier.read', 'purchasing.read'],
};

async function mockTeam(page: Page, role: Role | null, permissions?: string[]) {
  const requests: string[] = [];
  const organization = {
    id: 'workspace-shop',
    name: 'ร้านทดสอบพื้นที่',
    code: 'WORKSPACE',
    business_type: 'restaurant',
    contact_email: '',
    contact_phone: '',
    address: '',
    currency: 'THB',
    status: 'ACTIVE',
  };
  const session = {
    user: {
      id: 'workspace-user',
      display_name: 'Workspace user',
      email: 'workspace@example.test',
      status: 'ACTIVE',
    },
    csrf_token: 'test-csrf',
  };
  const granted = permissions ?? (role ? rolePermissions[role] : []);
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    requests.push(path);
    if (path === '/api/v1/auth/me') {
      await route.fulfill(
        role
          ? { json: { data: session } }
          : { status: 401, json: { error: { code: 'UNAUTHORIZED' } } },
      );
    } else if (path === '/api/v1/organizations') {
      await route.fulfill({ json: { data: [organization] } });
    } else if (path === '/api/v1/organizations/workspace-shop/context') {
      await route.fulfill({
        json: {
          data: {
            organization,
            membership: {
              id: 'member',
              user_id: session.user.id,
              email: session.user.email,
              display_name: session.user.display_name,
              role,
              status: 'ACTIVE',
              branch_ids: ['main'],
              permissions: granted,
            },
            branches: [
              {
                id: 'main',
                organization_id: organization.id,
                name: 'สาขาทดสอบ',
                code: 'MAIN',
                address: '',
                phone: '',
                email: '',
                status: 'ACTIVE',
                is_main: true,
              },
            ],
            permissions: granted,
          },
        },
      });
    } else if (path === '/api/v1/storefronts') {
      await route.fulfill({
        json: {
          data: [
            { slug: 'fixture', name: 'ร้านทดสอบ', accepting_orders: true },
          ],
        },
      });
    } else if (path === '/api/v1/storefronts/fixture') {
      await route.fulfill({
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
    } else if (path === '/api/v1/storefronts/fixture/products') {
      await route.fulfill({
        json: { data: { items: [], total: 0, page: 1, page_size: 24 } },
      });
    } else if (
      ['products', 'pos/terminals', 'pos/shifts', 'pos/carts'].some(
        (resource) =>
          path === '/api/v1/organizations/workspace-shop/' + resource,
      )
    ) {
      await route.fulfill({
        json: { data: { items: [], total: 0, page: 1, page_size: 20 } },
      });
    } else if (
      ['categories', 'brands', 'units'].some(
        (resource) =>
          path === '/api/v1/organizations/workspace-shop/' + resource,
      )
    ) {
      await route.fulfill({
        json: { data: { items: [], total: 0, page: 1, page_size: 20 } },
      });
    } else {
      await route.fulfill({
        status: 404,
        json: { error: { message: 'No fixture for this operation' } },
      });
    }
  });
  return requests;
}

for (const role of [
  'OWNER',
  'MANAGER',
  'CASHIER',
  'INVENTORY_STAFF',
  'PURCHASING_STAFF',
] as Role[]) {
  for (const width of [375, 1440]) {
    test(`${role} workspace entry at ${width}px`, async ({
      page,
    }, testInfo) => {
      await mockTeam(page, role, allPermissions);
      await page.setViewportSize({ width, height: 900 });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('/workspace');
      if (role === 'OWNER') {
        await expect(page).toHaveURL(/\/manage\/dashboard$/);
        await expect(
          page.getByRole('heading', { level: 1, name: 'ภาพรวม' }),
        ).toBeVisible();
        await expect(
          page.locator('[data-workspace="management"]'),
        ).toBeVisible();
        if (width === 375) {
          const trigger = page.getByRole('button', {
            name: 'เปิดเมนู',
            exact: true,
          });
          await trigger.click();
          const dialog = page.getByRole('dialog', {
            name: 'เมนู',
            exact: true,
          });
          await expect(dialog).toBeVisible();
          await expect(
            dialog.getByRole('navigation', { name: 'เมนูบนมือถือ' }),
          ).toBeVisible();
          await page.keyboard.press('Escape');
          await expect(dialog).toHaveCount(0);
          await expect(trigger).toBeFocused();
        }
      } else {
        await expect(page).toHaveURL(/\/account$/);
        await expect(
          page.getByRole('heading', { name: 'บัญชีของคุณ' }),
        ).toBeVisible();
        await expect(page.locator('[data-workspace="management"]')).toHaveCount(
          0,
        );
      }
      await expect(page.locator('body')).toHaveJSProperty('scrollWidth', width);
      await page.screenshot({
        path: testInfo.outputPath('workspace-area.png'),
        fullPage: true,
      });
      expect(errors).toEqual([]);
    });
  }
}

for (const role of [
  'MANAGER',
  'CASHIER',
  'INVENTORY_STAFF',
  'PURCHASING_STAFF',
] as Role[]) {
  test(`${role} cannot enter management with stale permissions`, async ({
    page,
  }) => {
    await mockTeam(page, role, allPermissions);
    for (const path of [
      '/settings/store',
      '/settings/branches',
      '/manage/settings/store',
      '/manage/products',
      '/manage/pos',
    ]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/403$/);
      await expect(page.getByText('403 · ACCESS DENIED')).toBeVisible();
      await expect(page.locator('[data-workspace="management"]')).toHaveCount(
        0,
      );
    }
  });
}

for (const role of [null, 'OWNER'] as const) {
  for (const width of [320, 768, 1440]) {
    test(`customer layout is isolated for ${role ?? 'anonymous'} at ${width}px`, async ({
      page,
    }, testInfo) => {
      const requests = await mockTeam(page, role);
      await page.setViewportSize({ width, height: 900 });
      const sessionResponse = page.waitForResponse(
        (response) => new URL(response.url()).pathname === '/api/v1/auth/me',
      );
      await page.goto('/shop');
      await sessionResponse;
      await expect(page).toHaveURL(/\/shop\/fixture$/);
      await expect(
        page.getByRole('searchbox', { name: 'ค้นหาสินค้า', exact: true }),
      ).toBeVisible();
      await expect(
        page.getByRole('navigation', { name: 'เมนูหน้าร้านลูกค้า' }),
      ).toBeVisible();
      await expect(page.locator('.sidebar')).toHaveCount(0);
      await expect(
        page.getByRole('combobox', { name: 'องค์กรที่ใช้งาน' }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('combobox', { name: 'สาขาที่ใช้งาน' }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('combobox', { name: 'เรียงสินค้า' }),
      ).toBeVisible();
      await expect(page.locator('body')).toHaveJSProperty('scrollWidth', width);
      expect(requests).toContain('/api/v1/storefronts');
      expect(requests).toContain('/api/v1/storefronts/fixture/products');
      expect(
        requests.filter((path) =>
          /^\/api\/v1\/organizations(?:\/|$)/.test(path),
        ),
      ).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath('customer-area.png'),
        fullPage: true,
      });
    });
  }
}

test('anonymous visitors cannot enter management', async ({ page }) => {
  await mockTeam(page, null);
  for (const path of [
    '/workspace',
    '/manage/dashboard',
    '/manage/products',
    '/dashboard',
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(
      new RegExp('/login\\?returnTo=' + encodeURIComponent(path) + '$'),
    );
    await expect(page.getByLabel('ที่อยู่อีเมล')).toBeVisible();
  }
});

test('owner cannot enter retired staff and administration routes', async ({
  page,
}) => {
  await mockTeam(page, 'OWNER');
  for (const path of [
    '/work',
    '/work/products',
    '/work/pos',
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
});

test('management module links stay under manage', async ({ page }) => {
  await mockTeam(page, 'OWNER');
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/manage/dashboard');
  await page
    .getByRole('main')
    .getByRole('link', { name: 'เมนูอาหาร', exact: true })
    .click();
  await expect(page).toHaveURL(/\/manage\/products$/);
  await expect(page.locator('[data-workspace="management"]')).toBeVisible();
  await page.locator('.catalog-nav a[href="/manage/categories"]').click();
  await expect(page).toHaveURL(/\/manage\/categories$/);
  await expect(page.locator('[data-workspace="management"]')).toBeVisible();
  expect(errors).toEqual([]);
});

test('owner legacy product URL preserves query and hash', async ({ page }) => {
  await mockTeam(page, 'OWNER');
  await page.goto('/products?search=abc#results');
  await expect(page).toHaveURL(/\/manage\/products\?search=abc#results$/);
  await page.goto('/products/item-1?search=abc#details');
  await expect(page).toHaveURL(
    /\/manage\/products\/item-1\?search=abc#details$/,
  );
  await page.goto('/dashboard');
  await expect(page).toHaveURL(/\/manage\/dashboard$/);
});

for (const width of [320, 768, 1440]) {
  test(`restaurant-only dashboard and menu at ${width}px`, async ({
    page,
  }, testInfo) => {
    await mockTeam(page, 'OWNER');
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/manage/dashboard');
    const main = page.getByRole('main');
    await expect(
      main.getByRole('heading', { level: 1, name: 'ภาพรวม', exact: true }),
    ).toBeVisible();
    await expect(
      main.getByRole('link', { name: 'สูตรอาหาร', exact: true }),
    ).toBeVisible();
    await expect(
      main.getByRole('link', { name: 'ออเดอร์และคิว', exact: true }),
    ).toBeVisible();
    await expect(main.getByText('SAL-28a6e1f3')).toHaveCount(0);
    for (const path of [
      '/suppliers',
      '/purchasing',
      '/customers',
      '/loyalty',
      '/pricing',
      '/inventory/balances',
    ]) {
      await expect(page.locator(`a[href^="/manage${path}"]`)).toHaveCount(0);
    }
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', width);
    await page.screenshot({
      path: testInfo.outputPath('restaurant-dashboard.png'),
      fullPage: true,
    });
    await main.getByRole('link', { name: 'เมนูอาหาร', exact: true }).click();
    await expect(page).toHaveURL(/\/manage\/products$/);
    await expect(
      page.locator('.catalog-nav a[href="/manage/restaurant/recipes"]'),
    ).toBeVisible();
    await expect(
      page.locator(
        'a[href="/manage/products/import"], a[href="/manage/products/labels"], a[href="/manage/brands"]',
      ),
    ).toHaveCount(0);
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', width);
    await page.screenshot({
      path: testInfo.outputPath('restaurant-menu.png'),
      fullPage: true,
    });
  });
}

test('restaurant-only retired direct URLs cannot fall through to item IDs', async ({
  page,
}) => {
  const requests = await mockTeam(page, 'OWNER');
  for (const prefix of ['', '/manage', '/work']) {
    for (const path of [
      '/suppliers',
      '/purchasing/orders',
      '/inventory/balances',
      '/products/import',
      '/products/labels',
      '/sales/voids',
    ]) {
      await page.goto(prefix + path);
      await expect(page.getByText('404 · NOT FOUND')).toBeVisible();
    }
  }
  expect(
    requests.filter((path) =>
      /\/(products\/(import|labels)|sales\/voids|suppliers|purchasing|inventory\/balances)/.test(
        path,
      ),
    ),
  ).toEqual([]);
});
