import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { navigation } from '../../apps/web/src/app/routes';

const organization = {
  id: 'theme-org',
  name: 'ร้านตัวอย่าง',
  code: 'THEME',
  business_type: 'RESTAURANT',
  status: 'ACTIVE',
  contact_email: 'owner@example.test',
  contact_phone: '020000000',
  address: 'Synthetic Bangkok address',
};
const branch = {
  id: 'theme-branch',
  organization_id: organization.id,
  name: 'สาขาหลัก',
  code: 'MAIN',
  status: 'ACTIVE',
  is_main: true,
  address: '',
  phone: '',
  email: '',
};
const permissions = navigation.flatMap((item) =>
  item.permission ? [item.permission] : [],
);
const widths = [320, 768, 901, 1024, 1440];
const networkViolations = new WeakMap<Page, string[]>();

async function mockNetwork(
  page: Page,
  baseURL: string,
  authenticated: boolean,
) {
  const origin = new URL(baseURL).origin;
  const violations: string[] = [];
  networkViolations.set(page, violations);
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== 'GET') {
      violations.push(`${request.method()} ${url.pathname}`);
      return route.abort();
    }
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    if (url.pathname === '/api/v1/auth/me') {
      if (!authenticated)
        return route.fulfill({
          status: 401,
          json: { error: { code: 'UNAUTHORIZED' } },
        });
      return route.fulfill({
        json: {
          data: {
            user: {
              id: 'theme-user',
              email: 'owner@example.test',
              display_name: 'Owner',
              status: 'ACTIVE',
              email_verified: true,
            },
            csrf_token: 'synthetic',
          },
        },
      });
    }
    let data: unknown;
    if (url.pathname === '/api/v1/organizations') data = [organization];
    else if (url.pathname === '/api/v1/organizations/theme-org/context')
      data = {
        organization,
        branches: [branch],
        membership: {
          role: 'OWNER',
          status: 'ACTIVE',
          branch_ids: [branch.id],
          permissions,
        },
        permissions,
      };
    else if (
      url.pathname === '/api/v1/organizations/theme-org/restaurant/setup'
    )
      data = {
        organization_id: organization.id,
        branch_id: branch.id,
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
          branch,
          service_modes: { dine_in: true, takeaway: true, delivery: false },
        },
      };
    else if (url.pathname === '/api/v1/storefronts') data = [];
    else if (
      /^\/api\/v1\/organizations\/theme-org\/(products|categories|pos\/products|pos\/shifts|pos\/carts)$/.test(
        url.pathname,
      )
    )
      data = { items: [], total: 0, page: 1, page_size: 100 };
    else if (
      url.pathname === '/api/v1/organizations/theme-org/restaurant/queue'
    )
      data = [];
    else if (url.pathname === '/api/v1/organizations/theme-org/pos/terminals')
      data = {
        items: [
          {
            id: 'theme-terminal',
            branch_id: branch.id,
            code: 'THEME-POS',
            name: 'Synthetic terminal',
            stock_location_id: 'theme-location',
            status: 'ACTIVE',
            revision: 1,
          },
        ],
        total: 1,
        page: 1,
        page_size: 100,
      };
    else {
      violations.push(`Unmocked GET ${url.pathname}`);
      return route.fulfill({
        status: 404,
        json: { error: { message: 'Unexpected mock request' } },
      });
    }
    return route.fulfill({ json: { data } });
  });
}

async function expectNoOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    )
    .toBeLessThanOrEqual(0);
}

async function expectManagementHeader(page: Page, width: number) {
  await expect(page.locator('.topbar')).toBeVisible();
  await expect(page.locator('.breadcrumb strong')).toBeVisible();
  await expect(page.locator('.topbar .language-switcher')).toBeVisible();
  if (width <= 900)
    await expect(
      page.getByRole('button', { name: /^(เปิดเมนู|Open navigation)$/ }),
    ).toBeVisible();
  else
    await expect(
      page.getByRole('navigation', { name: /^(เมนูหลัก|Main navigation)$/ }),
    ).toBeVisible();
}

async function expectWarmTokens(page: Page) {
  const tokens = await page.evaluate(() => {
    const styles = getComputedStyle(document.documentElement);
    return {
      primary: styles.getPropertyValue('--primary').trim().toLowerCase(),
      canvas: styles.getPropertyValue('--canvas').trim().toLowerCase(),
    };
  });
  expect.soft(tokens.primary).toBe('#ffc52f');
  expect.soft(tokens.canvas).toBe('#fffbf5');
}

async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: testInfo.outputPath(name),
    fullPage: true,
    animations: 'disabled',
  });
}

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });

test.afterEach(async ({ page }) => {
  expect(
    networkViolations.get(page) ?? [],
    'No writes or unmocked API requests',
  ).toEqual([]);
});

for (const width of widths) {
  test(`setup warm gold and usable controls at ${width}px`, async ({
    page,
    baseURL,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await mockNetwork(page, baseURL!, true);
    await page.goto('/setup');
    const name = page.getByLabel('ชื่อร้าน', { exact: true });
    await expect(name).toHaveValue(organization.name);
    await expect(page.locator('aside.sidebar')).toHaveCount(0);
    await expect(page.locator('.topbar')).toBeVisible();
    await expect(page.locator('.breadcrumb strong')).toBeVisible();
    await expect(page.locator('.topbar .language-switcher')).toBeVisible();
    await expect(
      page.getByRole('button', { name: /บันทึกและถัดไป/ }),
    ).toBeVisible();
    await page
      .getByRole('complementary', { name: 'ความคืบหน้าการตั้งค่า' })
      .getByRole('button', { name: /1 ข้อมูลร้าน/ })
      .focus();
    await page.keyboard.press('Tab');
    await expect(name).toBeFocused();
    await expect(name).toHaveCSS('outline-style', 'solid');
    await expectNoOverflow(page);
    await screenshot(page, testInfo, `setup-${width}.png`);
    await expectWarmTokens(page);
    await expect
      .soft(page.locator('.setup-page-wrapper'))
      .toHaveCSS('background-image', /gradient/);
    await expect
      .soft(page.locator('.setup-card'))
      .toHaveCSS('background-color', 'rgb(255, 255, 255)');
  });
}

test('management mobile navigation opens, closes and restores keyboard focus', async ({
  page,
  baseURL,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await mockNetwork(page, baseURL!, true);
  await page.goto('/manage/dashboard');
  const open = page.getByRole('button', {
    name: /^(เปิดเมนู|Open navigation)$/,
  });
  await expect(open).toBeVisible();
  await open.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(
    page.getByRole('navigation', {
      name: /^(เมนูบนมือถือ|Mobile navigation)$/,
    }),
  ).toBeVisible();
  await screenshot(page, testInfo, 'management-mobile-menu.png');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(open).toBeFocused();
  await open.click();
  await page
    .getByRole('button', { name: /^(ปิดเมนู|Close navigation)$/ })
    .click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(open).toBeFocused();
  await expectNoOverflow(page);
});

for (const width of widths) {
  for (const path of [
    '/manage/dashboard',
    '/manage/settings',
    '/manage/products',
    '/manage/restaurant/queue',
    '/manage/pos',
  ]) {
    test(`management ${path} real read-only state at ${width}px`, async ({
      page,
      baseURL,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await mockNetwork(page, baseURL!, true);
      await page.goto(path);
      await expect(page).toHaveURL(new RegExp(`${path}$`));
      await expect(
        page.getByRole('heading', { level: 1 }).first(),
      ).toBeVisible();
      if (path === '/manage/pos') {
        await expect(page.getByRole('banner')).toBeVisible();
        await expect(
          page.locator('.pos-header .language-switcher'),
        ).toBeVisible();
        await expect(
          page.getByRole('navigation', { name: 'เมนูขาย', exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole('link', { name: 'กลับพื้นที่ทำงาน', exact: true }),
        ).toBeVisible();
      } else {
        await expectManagementHeader(page, width);
      }
      if (path === '/manage/settings') {
        await expect(
          page.getByLabel('ชื่อร้านอาหาร', { exact: false }),
        ).toHaveValue(organization.name);
      } else if (path === '/manage/products') {
        await expect(page.getByRole('table')).toBeVisible();
        await expect(page.locator('.sales-empty-message')).toBeVisible();
        await expect(
          page.getByLabel('ค้นหาชื่อเมนู / วัตถุดิบ / SKU', { exact: true }),
        ).toBeVisible();
      } else if (path === '/manage/restaurant/queue') {
        await expect(page.getByRole('status')).toHaveText(
          'ยังไม่มีออเดอร์ที่ชำระแล้วรอทำอาหาร',
        );
        await expect(
          page.getByRole('button', { name: 'อัปเดตคิว' }),
        ).toBeEnabled();
      } else if (path === '/manage/pos') {
        await expect(
          page.getByRole('combobox', { name: 'เครื่องขายที่ใช้งาน' }),
        ).toHaveValue('theme-terminal');
        await expect(
          page.getByText('ไม่พบสินค้า', { exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole('button', { name: 'ไปชำระเงิน', exact: true }),
        ).toBeDisabled();
        await expect(
          page.getByRole('textbox', { name: 'สแกนบาร์โค้ด', exact: true }),
        ).toBeVisible();
      } else {
        await expect(
          page
            .getByRole('main')
            .getByRole('link', { name: 'หน้าจอคิวอาหาร', exact: true }),
        ).toBeVisible();
      }
      await screenshot(
        page,
        testInfo,
        `${path.slice(1).replaceAll('/', '-')}-${width}.png`,
      );
      await expectNoOverflow(page);
      await expectWarmTokens(page);
    });
  }
}

for (const width of [320, 768, 1440]) {
  test(`landing keyboard skip and logo focus after readiness at ${width}px`, async ({
    page,
    baseURL,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await mockNetwork(page, baseURL!, false);
    await page.goto('/');
    const skip = page.locator('.skip-link');
    await skip.waitFor({ state: 'attached' });
    await page.keyboard.press('Tab');
    await expect(skip).toBeFocused();
    await page.keyboard.press('Tab');
    const logo = page
      .getByRole('banner')
      .getByRole('link', { name: 'VELO POS หน้าแรก' });
    await expect(logo).toBeFocused();
    await expect(logo).toHaveCSS('outline-style', 'solid');
    await expect(logo).not.toHaveCSS('outline-width', '0px');
    await screenshot(page, testInfo, `landing-logo-focus-${width}.png`);
    await page.keyboard.press('Shift+Tab');
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#landing-main')).toBeFocused();
    await expectNoOverflow(page);
  });
}

for (const width of [320, 768, 1440]) {
  for (const path of ['/register', '/forgot-password']) {
    test(`public ${path} labeled form at ${width}px`, async ({
      page,
      baseURL,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await mockNetwork(page, baseURL!, false);
      await page.goto(path);
      const email = page.getByLabel('ที่อยู่อีเมล', { exact: true });
      await expect(email).toBeVisible();
      await email.focus();
      await expect(email).toBeFocused();
      if (path === '/register') {
        await expect(
          page.getByLabel('ชื่อที่แสดง', { exact: true }),
        ).toBeVisible();
        await expect(
          page.getByLabel('ยืนยันรหัสผ่าน', { exact: true }),
        ).toBeVisible();
        await expect(
          page.getByRole('button', { name: 'สร้างบัญชี', exact: true }),
        ).toBeVisible();
      } else {
        await expect(
          page.getByRole('button', {
            name: 'ขอลิงก์รีเซ็ตรหัสผ่าน',
            exact: true,
          }),
        ).toBeVisible();
      }
      await expect(
        page.getByRole('navigation', { name: /^(เมนูหลัก|Main navigation)$/ }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: /^(เปิดเมนู|Open navigation)$/ }),
      ).toHaveCount(0);
      await expectNoOverflow(page);
      await screenshot(page, testInfo, `public-${path.slice(1)}-${width}.png`);
    });
  }
}

for (const width of [320, 768, 1440]) {
  for (const path of ['/login', '/shop', '/']) {
    test(`public ${path} layout remains separate at ${width}px`, async ({
      page,
      baseURL,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await mockNetwork(page, baseURL!, false);
      await page.goto(path);
      if (path === '/login') {
        await page
          .getByRole('button', { name: 'English', exact: true })
          .click();
        const email = page.getByLabel('Email address', { exact: true });
        await expect(email).toBeVisible();
        await email.focus();
        await expect(email).toBeFocused();
        await expect(
          page.getByRole('button', { name: 'Sign in', exact: true }),
        ).toBeVisible();
      } else if (path === '/shop') {
        await expect(
          page.getByRole('heading', {
            name: /ยังไม่มีร้านที่เปิดเผยแพร่|No published stores yet/,
          }),
        ).toBeVisible();
        await expect(page.getByRole('banner')).toBeVisible();
      } else {
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expect(page.getByRole('banner')).toBeVisible();
      }
      await expect(
        page.getByRole('navigation', { name: /^(เมนูหลัก|Main navigation)$/ }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: /^(เปิดเมนู|Open navigation)$/ }),
      ).toHaveCount(0);
      await screenshot(
        page,
        testInfo,
        `public-${path === '/' ? 'landing' : path.slice(1)}-${width}.png`,
      );
      await expectNoOverflow(page);
    });
  }
}
