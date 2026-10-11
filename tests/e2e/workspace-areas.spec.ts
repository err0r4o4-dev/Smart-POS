import { expect, test, type Page } from '@playwright/test';
import { navigation, staffNavigation } from '../../apps/web/src/app/routes';
import type { Role } from '../../apps/web/src/app/access';

const allPermissions = [
  ...new Set(
    [...navigation, ...staffNavigation].flatMap((item) =>
      item.permission ? [item.permission] : [],
    ),
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
    business_type: 'retail',
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
    test(`${role} enters the correct workspace at ${width}px`, async ({
      page,
    }, testInfo) => {
      await mockTeam(page, role);
      await page.setViewportSize({ width, height: 900 });
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.goto('/workspace');
      const management = role === 'OWNER' || role === 'MANAGER';
      await expect(page).toHaveURL(
        new RegExp(management ? '/dashboard$' : '/staff$'),
      );
      await expect(
        page.getByRole('heading', {
          level: 1,
          name: management ? 'ภาพรวมร้าน' : 'งานของฉัน',
        }),
      ).toBeVisible();
      await expect(page.locator('.management-shell')).toHaveAttribute(
        'data-workspace',
        management ? 'management' : 'staff',
      );
      await expect(page.locator('body')).toHaveJSProperty('scrollWidth', width);
      if (!management) {
        for (const path of [
          '/employees',
          '/roles',
          '/settings/store',
          '/settings/branches',
          '/pricing',
        ])
          await expect(page.locator(`a[href="${path}"]`)).toHaveCount(0);
      }
      if (role === 'CASHIER')
        await expect(page.locator('a[href="/inventory"]')).toHaveCount(0);
      if (role === 'INVENTORY_STAFF' || role === 'PURCHASING_STAFF')
        await expect(page.locator('a[href="/pos"]')).toHaveCount(0);
      if (role === 'MANAGER')
        await expect(page.locator('a[href="/employees"]')).toHaveCount(0);
      await page.screenshot({
        path: testInfo.outputPath('workspace-area.png'),
        fullPage: true,
      });
      expect(errors).toEqual([]);
    });
  }
}

test('a staff member cannot select ownership from a public entrance', async ({
  page,
}) => {
  await mockTeam(page, 'CASHIER');
  await page.goto('/');
  await page
    .getByRole('link', { name: 'เข้าสู่การจัดการร้าน', exact: true })
    .click();
  await expect(page).toHaveURL(/\/staff$/);
  await expect(
    page.getByRole('heading', { name: 'งานของฉัน', exact: true }),
  ).toBeVisible();
  await expect(page.locator('a[href="/employees"]')).toHaveCount(0);
});

for (const role of [
  'CASHIER',
  'INVENTORY_STAFF',
  'PURCHASING_STAFF',
] as Role[]) {
  test(`${role} cannot enter management pages through direct URLs`, async ({
    page,
  }) => {
    await mockTeam(page, role, allPermissions);
    for (const path of [
      '/settings/store',
      '/settings/branches',
      '/employees',
      '/roles',
    ]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/403$/);
      await expect(page.getByText('403 · ACCESS DENIED')).toBeVisible();
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
      await expect(
        page.getByRole('heading', { level: 1, name: 'หน้าร้านออนไลน์' }),
      ).toBeVisible();
      await expect(
        page.getByRole('navigation', { name: 'เมนูหน้าร้านลูกค้า' }),
      ).toBeVisible();
      await expect(page.locator('.sidebar')).toHaveCount(0);
      await expect(page.getByRole('combobox')).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: 'ยังไม่เปิดรับคำสั่งซื้อ' }),
      ).toBeDisabled();
      await expect(page.locator('body')).toHaveJSProperty('scrollWidth', width);
      expect(requests.filter((path) => path !== '/api/v1/auth/me')).toEqual([]);
      await page.screenshot({
        path: testInfo.outputPath('customer-area.png'),
        fullPage: true,
      });
    });
  }
}

test('mobile staff menu navigates without exposing management links', async ({
  page,
}) => {
  await mockTeam(page, 'CASHIER');
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/staff');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  const dialog = page.getByRole('dialog', { name: 'Navigation', exact: true });
  const menu = dialog.getByRole('navigation', {
    name: 'Mobile navigation',
    exact: true,
  });
  await expect(dialog).toContainText('พื้นที่พนักงาน · แคชเชียร์');
  await expect(menu.locator('a[href="/employees"]')).toHaveCount(0);
  await menu
    .getByRole('link', { name: 'คู่มือการใช้งาน', exact: true })
    .click();
  await expect(page).toHaveURL(/\/help$/);
  await expect(dialog).toHaveCount(0);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Open navigation' }),
  ).toBeFocused();
});

test('anonymous visitors cannot enter either team workspace', async ({
  page,
}) => {
  await mockTeam(page, null);
  for (const path of ['/workspace', '/dashboard', '/staff']) {
    await page.goto(path);
    await expect(page).toHaveURL(
      new RegExp('/login\\?returnTo=' + encodeURIComponent(path) + '$'),
    );
    await expect(page.getByLabel('Email address')).toBeVisible();
    await expect(page.locator('.sidebar')).toHaveCount(0);
  }
});
