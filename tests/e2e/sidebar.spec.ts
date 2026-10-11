import { expect, test } from '@playwright/test';
import { navigation } from '../../apps/web/src/app/routes';

test.beforeEach(async ({ page }) => {
  const organization = { id: 'sidebar-shop', name: 'Sidebar test store' };
  const permissions = navigation.flatMap((item) =>
    item.permission ? [item.permission] : [],
  );
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/v1/auth/me') {
      await route.fulfill({
        json: { data: { user: { id: 'sidebar-user', display_name: 'Owner' } } },
      });
    } else if (path === '/api/v1/organizations') {
      await route.fulfill({ json: { data: [organization] } });
    } else if (path === '/api/v1/organizations/sidebar-shop/context') {
      await route.fulfill({
        json: {
          data: {
            organization,
            branches: [{ id: 'main', name: 'Main branch' }],
            membership: { role: 'OWNER' },
            permissions,
          },
        },
      });
    } else {
      await route.fulfill({
        status: 404,
        json: { error: { message: 'Not mocked' } },
      });
    }
  });
});

for (const width of [1024, 1440]) {
  for (const height of [480, 720, 1000]) {
    test(
      'desktop sidebar contains long menu at ' + width + 'x' + height,
      async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height });
        await page.goto('/manage/dashboard');
        const sidebar = page.locator('.sidebar');
        const menu = page.getByRole('navigation', {
          name: 'Main navigation',
          exact: true,
        });
        const note = sidebar.locator('.sidebar-note');
        await expect(menu.getByRole('button')).toHaveCount(7);
        await page.screenshot({
          path: testInfo.outputPath('sidebar-categories.png'),
        });
        for (const button of await menu.getByRole('button').all()) {
          await expect(button).toHaveAttribute('aria-expanded', 'false');
          await button.click();
        }
        await expect(menu.getByRole('link')).toHaveCount(navigation.length);
        await expect(menu.locator('a[href^="/preview/"]')).toHaveCount(0);
        await expect(
          menu.locator('a[href="/manage/dashboard"]'),
        ).toHaveAttribute('aria-current', 'page');
        const sidebarBefore = await sidebar.boundingBox();
        const contextBefore = await sidebar
          .locator('.workspace-context')
          .boundingBox();
        const noteBefore = await note.boundingBox();
        const menuBounds = await menu.boundingBox();
        expect(sidebarBefore!.height).toBe(height);
        expect(menuBounds!.height).toBeGreaterThan(0);
        expect(menuBounds!.y + menuBounds!.height).toBeLessThanOrEqual(
          noteBefore!.y,
        );
        expect(noteBefore!.y + noteBefore!.height).toBeLessThanOrEqual(height);
        expect(
          await menu.evaluate(
            (element) => element.scrollHeight > element.clientHeight,
          ),
        ).toBe(true);
        await menu.getByRole('link').last().focus();
        await expect(menu.getByRole('link').last()).toBeInViewport();
        expect(
          await menu.evaluate((element) => element.scrollTop),
        ).toBeGreaterThan(0);
        expect(await sidebar.boundingBox()).toEqual(sidebarBefore);
        expect(
          await sidebar.locator('.workspace-context').boundingBox(),
        ).toEqual(contextBefore);
        expect(await note.boundingBox()).toEqual(noteBefore);
        await expect(page.locator('body')).toHaveJSProperty(
          'scrollWidth',
          width,
        );
        await page.screenshot({
          path: testInfo.outputPath('sidebar-bottom.png'),
        });
        await page.evaluate(() =>
          window.scrollTo(0, document.body.scrollHeight),
        );
        const sidebarAfterScroll = await sidebar.boundingBox();
        expect(sidebarAfterScroll!.y).toBeCloseTo(sidebarBefore!.y, 1);
        expect(sidebarAfterScroll!.height).toBe(sidebarBefore!.height);
      },
    );
  }
}

test('anonymous foundation navigation excludes tenant modules', async ({
  page,
}) => {
  await page.route('**/api/v1/auth/me', (route) =>
    route.fulfill({ status: 401, json: { error: { code: 'UNAUTHORIZED' } } }),
  );
  await page.setViewportSize({ width: 1440, height: 720 });
  await page.goto('/help/system');
  const menu = page.getByRole('navigation', {
    name: 'Main navigation',
    exact: true,
  });
  await expect(
    menu.getByRole('link', { name: 'สถานะระบบ', exact: true }),
  ).toBeVisible();
  await expect(
    menu.getByRole('link', { name: 'คู่มือการใช้งาน', exact: true }),
  ).toBeVisible();
  await expect(menu.getByRole('link')).toHaveCount(4);
  await expect(menu.locator('a[href^="/preview/"]')).toHaveCount(0);
  await expect(menu.locator('a[href="/manage/customers"]')).toHaveCount(0);
  await expect(page.locator('.sidebar-note')).toContainText(
    'บัญชีและการเข้าใช้งาน',
  );
});

test('mobile navigation still opens, navigates and dismisses', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto('/manage/dashboard');
  await expect(page.locator('.sidebar-navigation a')).toHaveCount(
    navigation.length,
  );
  await expect(page.locator('.sidebar')).toBeHidden();
  const button = page.getByRole('button', { name: 'Open navigation' });
  await button.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const menu = page.getByRole('navigation', {
    name: 'Mobile navigation',
    exact: true,
  });
  await expect(menu.locator('a[href^="/preview/"]')).toHaveCount(0);
  await expect(menu.getByRole('button')).toHaveCount(7);
  await page.keyboard.press('Shift+Tab');
  await expect(
    menu.getByRole('link', { name: 'คู่มือการใช้งาน', exact: true }),
  ).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', { name: 'Close navigation' }),
  ).toBeFocused();
  const firstGroup = menu.getByRole('button').first();
  await firstGroup.focus();
  await page.keyboard.press('Enter');
  await expect(firstGroup).toHaveAttribute('aria-expanded', 'true');
  await expect(menu.locator('a[href="/manage/pos"]')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('mobile-categories.png') });
  await page.keyboard.press('Space');
  await expect(firstGroup).toHaveAttribute('aria-expanded', 'false');
  await expect(menu.locator('a[href="/manage/pos"]')).toBeHidden();
  await menu
    .getByRole('link', { name: 'คู่มือการใช้งาน', exact: true })
    .click();
  await expect(page).toHaveURL(/\/help$/);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await button.click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(button).toBeFocused();
  await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 375);
});

test('deep links open the destination group and highlight only its menu', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 720 });
  for (const path of ['/manage/sales/voids', '/manage/products/item-1']) {
    await page.goto(path);
    const menu = page.getByRole('navigation', {
      name: 'Main navigation',
      exact: true,
    });
    const group = path.startsWith('/manage/sales/')
      ? 'คืนสินค้าและคืนเงิน'
      : 'สินค้าและสต็อก';
    await expect(
      menu.getByRole('button', { name: group, exact: true }),
    ).toHaveAttribute('aria-expanded', 'true');
    await expect(menu.locator('a[aria-current="page"]')).toHaveCount(1);
    await expect(menu.locator('a[aria-current="page"]')).toBeVisible();
    await expect(menu.locator('a[aria-current="page"]')).toHaveAttribute(
      'href',
      path.startsWith('/manage/sales/')
        ? '/manage/sales/voids'
        : '/manage/products',
    );
    await expect(
      menu.getByRole('button', { name: 'การขาย', exact: true }),
    ).toHaveAttribute('aria-expanded', 'false');
  }
});
