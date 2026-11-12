import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { navigation, paths } from '../../apps/web/src/app/routes';

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
    if (url.pathname === '/health/ready')
      return route.fulfill({ json: { status: 'ready' } });
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
    if (url.pathname === '/api/v1/auth/google/config')
      return route.fulfill({ json: { data: { enabled: false } } });
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
  const overflowCandidates = await page
    .locator('body *')
    .evaluateAll((elements) =>
      elements
        .filter((element) => {
          const bounds = element.getBoundingClientRect();
          return (
            bounds.width > 0 &&
            (bounds.right > innerWidth + 1 || bounds.left < -1)
          );
        })
        .slice(0, 12)
        .map((element) => ({
          tag: element.tagName,
          className: element.className,
          width: element.getBoundingClientRect().width,
        })),
    );
  await expect
    .poll(
      () =>
        page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth,
        ),
      { message: JSON.stringify(overflowCandidates) },
    )
    .toBeLessThanOrEqual(0);
}

async function expectManagementHeader(page: Page, width: number) {
  await expect(page.locator('.topbar')).toBeVisible();
  await expect(page.locator('.breadcrumb strong')).toBeVisible();
  await expect(page.locator('.topbar .language-switcher')).toBeVisible();
  if (width < 1024)
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

for (const width of [320, 390, 767, 768, 1023, 1024, 1279, 1280, 1440, 1920]) {
  for (const path of ['/', '/shop', '/login', '/setup', '/dashboard']) {
    test(`shell edges independent of content ${path} at ${width}px`, async ({
      page,
      baseURL,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await mockNetwork(
        page,
        baseURL!,
        ['/dashboard', '/setup'].includes(path),
      );
      await page.goto(path);
      const header = page
        .locator('header')
        .filter({
          has: page.locator('.language-switcher'),
        })
        .first();
      await expect(header).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const host =
        path === '/dashboard' ? page.locator('.workspace-main') : header;
      const hostBox = (await host.boundingBox())!;
      const gutter = width < 768 ? 16 : 24;
      const contentInset = Math.max(gutter, (hostBox.width - 1232) / 2);
      const shellInset =
        path === '/dashboard' ? gutter : (gutter + contentInset) / 2;
      const inner = header.locator(
        '.landing-header-inner, .storefront-header-inner',
      );
      const frame = await ((await inner.count()) ? inner : header).evaluate(
        (element) => {
          const box = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            left: box.left + parseFloat(style.paddingLeft),
            right: box.right - parseFloat(style.paddingRight),
          };
        },
      );
      expect(frame.left).toBeCloseTo(hostBox.x + shellInset, 0);
      expect(frame.right).toBeCloseTo(
        hostBox.x + hostBox.width - shellInset,
        0,
      );
      expect((await header.boundingBox())!.height).toBe(66);
      const footer = page.locator(
        '.footer, .landing-footer-inner, .shop-directory-footer',
      );
      if (await footer.count()) {
        const footerFrame = await footer.evaluate((element) => {
          const box = element.getBoundingClientRect();
          const style = getComputedStyle(element);
          return {
            left: box.left + parseFloat(style.paddingLeft),
            right: box.right - parseFloat(style.paddingRight),
          };
        });
        expect(footerFrame.left).toBeCloseTo(hostBox.x + shellInset, 0);
        const footerEndInset =
          path === '/shop' && width >= 768
            ? Math.max(shellInset, gutter + 70)
            : shellInset;
        expect(footerFrame.right).toBeCloseTo(
          hostBox.x + hostBox.width - footerEndInset,
          0,
        );
      }
      await expectNoOverflow(page);
      if ([320, 1440, 1920].includes(width)) {
        await screenshot(
          page,
          testInfo,
          `shell-${path.replaceAll('/', '') || 'landing'}-${width}.png`,
        );
      }
    });
  }
}

for (const path of ['/', '/shop', '/login', '/setup']) {
  test(`public shell accommodates doubled text ${path}`, async ({
    page,
    baseURL,
  }, testInfo) => {
    await page.setViewportSize({ width: 1920, height: 900 });
    await mockNetwork(page, baseURL!, path === '/setup');
    await page.goto(path);
    await expect(page.locator('header').first()).toBeVisible();
    await page.evaluate(() => {
      const parents = new Set<HTMLElement>();
      for (const shell of document.querySelectorAll(
        'header, .landing-footer-inner, .shop-directory-footer',
      )) {
        const walker = document.createTreeWalker(shell, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const parent = walker.currentNode.parentElement;
          if (walker.currentNode.textContent?.trim() && parent)
            parents.add(parent);
        }
      }
      const sizes = [...parents].map((element) => ({
        element,
        size: parseFloat(getComputedStyle(element).fontSize),
      }));
      for (const { element, size } of sizes)
        element.style.fontSize = `${size * 2}px`;
    });
    const header = page.locator('header').first();
    expect((await header.boundingBox())!.height).toBeGreaterThanOrEqual(66);
    for (const control of await header
      .locator('a:visible, button:visible')
      .all()) {
      const bounds = (await control.boundingBox())!;
      expect(bounds.x).toBeGreaterThanOrEqual(0);
      expect(bounds.x + bounds.width).toBeLessThanOrEqual(1920);
    }
    await expectNoOverflow(page);
    await screenshot(
      page,
      testInfo,
      `doubled-text-${path.replaceAll('/', '') || 'landing'}.png`,
    );
  });
}

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
    if (width < 768)
      await expect(page.locator('.breadcrumb strong')).toBeHidden();
    else await expect(page.locator('.breadcrumb strong')).toBeVisible();
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
  await page.goto(paths.dashboard);
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
    paths.dashboard,
    paths.settings,
    paths.menu,
    paths.kitchen,
    paths.pos,
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
      if (path === paths.pos) {
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
      if (path === paths.settings) {
        await expect(
          page.getByLabel('ชื่อร้านอาหาร', { exact: false }),
        ).toHaveValue(organization.name);
      } else if (path === paths.menu) {
        await expect(page.getByRole('table')).toBeVisible();
        await expect(page.locator('.sales-empty-message')).toBeVisible();
        await expect(
          page.getByLabel('ค้นหาชื่อเมนู / SKU', { exact: true }),
        ).toBeVisible();
      } else if (path === paths.kitchen) {
        await expect(page.getByRole('status')).toHaveText(
          'ยังไม่มีออเดอร์ที่ชำระแล้วรอทำอาหาร',
        );
        await expect(
          page.getByRole('button', { name: 'อัปเดตคิว' }),
        ).toBeEnabled();
      } else if (path === paths.pos) {
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

for (const width of [320, 640, 641, 1440]) {
  for (const path of [
    '/setup',
    '/dashboard',
    '/settings',
    '/pos',
    '/login',
    '/register',
    '/forgot-password',
    '/shop',
    '/',
  ]) {
    test(
      'shared header proportions ' + path + ' at ' + width + 'px',
      async ({ page, baseURL }, testInfo) => {
        await page.setViewportSize({ width, height: 900 });
        await mockNetwork(
          page,
          baseURL!,
          ['/setup', '/dashboard', '/settings', '/pos'].includes(path),
        );
        await page.goto(path);
        if (path === '/' && width < 1024) {
          await page.getByRole('button', { name: /^(เมนู|Menu)$/ }).focus();
          await page.keyboard.press('Enter');
        }
        const header = page
          .locator('header')
          .filter({ has: page.locator('.language-switcher') })
          .first();
        await expect(header).toBeVisible();
        await expect(header).toHaveCSS('min-height', '66px');
        const language = header.locator('.language-switcher:visible');
        await expect(language).toBeVisible();
        const mark = header.locator('.brand-mark');
        if (await mark.count()) {
          await expect(mark).toHaveCSS('width', width < 768 ? '32px' : '36px');
          await expect(mark).toHaveCSS('height', width < 768 ? '32px' : '36px');
        }
        await page.evaluate(() => document.fonts.ready);
        const headerBox = await header.boundingBox();
        const languageBox = await language.boundingBox();
        expect(languageBox!.x).toBeGreaterThanOrEqual(headerBox!.x);
        expect(languageBox!.x + languageBox!.width).toBeLessThanOrEqual(
          headerBox!.x + headerBox!.width,
        );
        const languageButton = language.locator('button').first();
        await languageButton.focus();
        await expect(languageButton).toBeFocused();
        await expect(languageButton).toHaveCSS('outline-style', 'solid');
        expect(headerBox!.height).toBe(66);
        await expectNoOverflow(page);
        await screenshot(
          page,
          testInfo,
          'shared-header-' +
            (path.replaceAll('/', '-') || 'landing') +
            '-' +
            width +
            '.png',
        );
      },
    );
  }
}

for (const width of [320, 390, 767, 768, 1023, 1024, 1279, 1280, 1440, 1920]) {
  for (const [path, selector] of [
    ['/login', '.login-shell'],
    ['/setup', '.setup-page'],
    ['/dashboard', '.content'],
    ['/settings', '.content'],
    ['/pos', '.pos-workspace'],
  ]) {
    test(`layout standards ${path} at ${width}px`, async ({
      page,
      baseURL,
    }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await mockNetwork(page, baseURL!, path !== '/login');
      await page.goto(path);
      const container = page.locator(selector);
      await expect(container).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      const geometry = await container.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const parent = element.parentElement!.getBoundingClientRect();
        const style = getComputedStyle(element);
        const left =
          parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth);
        const right =
          parseFloat(style.paddingRight) + parseFloat(style.borderRightWidth);
        return {
          x: rect.x + left,
          width: rect.width - left - right,
          availableX: parent.x,
          availableWidth: parent.width,
        };
      });
      const gutter = width < 768 ? 16 : 24;
      const expected = Math.min(1232, geometry.availableWidth - 2 * gutter);
      expect(geometry.width).toBeCloseTo(expected, 0);
      expect(geometry.x).toBeCloseTo(
        geometry.availableX + (geometry.availableWidth - expected) / 2,
        0,
      );
      const header = page
        .locator('header')
        .filter({ has: page.locator('.language-switcher') })
        .first();
      await expect(header).toBeVisible();
      expect((await header.boundingBox())!.height).toBe(66);
      for (const card of await page
        .locator('.card, .setup-card, .settings-card, .login-card')
        .all()) {
        if (!(await card.isVisible())) continue;
        for (const side of ['top', 'right', 'bottom', 'left']) {
          await expect(card).toHaveCSS(`padding-${side}`, '24px');
        }
      }
      for (const grid of await page
        .locator(
          '.catalog-page, .workspace-home, .dashboard-overview, .dashboard-kpi-grid, .settings-grid, .setup-layout',
        )
        .all()) {
        await expect(grid).toHaveCSS('column-gap', '24px');
        await expect(grid).toHaveCSS('row-gap', '24px');
      }
      for (const field of await page
        .locator('.auth-field-group, .setup-field, .settings-field-group')
        .all()) {
        await expect(field).toHaveCSS('gap', '8px');
      }
      await expectNoOverflow(page);
      if ([320, 1024, 1920].includes(width)) {
        await screenshot(
          page,
          testInfo,
          `layout-${path.slice(1)}-${width}.png`,
        );
      }
    });
  }
}

test('management account controls retain access above the original compact cutoff', async ({
  page,
  baseURL,
}) => {
  await mockNetwork(page, baseURL!, true);
  for (const width of [641, 700, 767]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(paths.dashboard);
    const account = page.locator('.topbar .account-menu-trigger');
    await expect(account).toBeVisible();
    await expect(page.locator('.topbar-help')).toBeVisible();
    await expect(page.locator('.topbar-bell')).toBeVisible();
    await account.click();
    await expect(page.locator('.account-menu-dropdown')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(account).toBeFocused();
    await expectNoOverflow(page);
    expect((await page.locator('.topbar').boundingBox())!.height).toBe(66);
  }
});

test.describe('touch layout standards', () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 320, height: 568 },
  });

  for (const path of ['/login', '/setup', '/dashboard', '/settings', '/pos']) {
    test(`single-row ${path} header keeps touch controls accessible in both languages`, async ({
      page,
      baseURL,
    }) => {
      await mockNetwork(page, baseURL!, path !== '/login');
      await page.goto(path);
      const header = page
        .locator('header')
        .filter({ has: page.locator('.language-switcher') })
        .first();
      const english = header.getByRole('button', {
        name: 'English',
        exact: true,
      });
      await expect(english).toBeVisible();
      await expect(english).toHaveCSS('min-height', '44px');
      expect((await header.boundingBox())!.height).toBe(66);
      await english.click();
      await expect(english).toHaveAttribute('aria-pressed', 'true');
      expect((await header.boundingBox())!.height).toBe(66);
      await expectNoOverflow(page);
    });
  }
});

test('management background spans the available shell outside the content cap', async ({
  page,
  baseURL,
}) => {
  await page.setViewportSize({ width: 1920, height: 900 });
  await mockNetwork(page, baseURL!, true);
  await page.goto(paths.dashboard);
  await expect(page.locator('.content')).toBeVisible();
  await expect(page.locator('.workspace-main')).not.toHaveCSS(
    'background-image',
    'none',
  );
  await expect(page.locator('.content')).toHaveCSS('background-image', 'none');
});

test('wide menu table scrolls locally without widening the mobile page', async ({
  page,
  baseURL,
}) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await mockNetwork(page, baseURL!, true);
  await page.goto(paths.menu);
  const region = page.locator('.sales-history-table');
  await expect(region).toBeVisible();
  await expect(region).toHaveCSS('overflow-x', 'auto');
  const dimensions = await region.evaluate((element) => ({
    content: element.scrollWidth,
    viewport: element.clientWidth,
  }));
  expect(dimensions.content).toBeGreaterThan(dimensions.viewport);
  await region.focus();
  await expect(region).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(() => region.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  await expectNoOverflow(page);
});

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
