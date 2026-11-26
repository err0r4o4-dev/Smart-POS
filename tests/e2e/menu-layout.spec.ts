import { expect, test } from '@playwright/test';

for (const width of [320, 768, 1150, 1151, 1440]) {
  test(`menu uses standard page sizing at ${width}px`, async ({
    page,
    baseURL,
  }, testInfo) => {
    const origin = new URL(baseURL!).origin;
    const organization = {
      id: 'org',
      name: 'Test restaurant',
      code: 'SHOP',
      business_type: 'RESTAURANT',
      status: 'ACTIVE',
    };
    const branch = {
      id: 'branch',
      organization_id: 'org',
      name: 'Main',
      code: 'MAIN',
      status: 'ACTIVE',
      is_main: true,
    };
    const unexpectedRequests: string[] = [];
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== origin) return route.abort();
      if (!url.pathname.startsWith('/api/')) return route.continue();
      const path = url.pathname;
      let data: unknown;
      if (request.method() !== 'GET') {
        unexpectedRequests.push(`${request.method()} ${path}`);
        return route.abort();
      }
      if (path === '/api/v1/auth/me')
        data = {
          user: {
            id: 'owner',
            email: 'owner@example.test',
            display_name: 'Owner',
            status: 'ACTIVE',
            email_verified: true,
          },
          csrf_token: 'synthetic-csrf',
        };
      else if (path === '/api/v1/organizations') data = [organization];
      else if (path === '/api/v1/organizations/org/context')
        data = {
          organization,
          membership: {
            role: 'OWNER',
            status: 'ACTIVE',
            branch_ids: ['branch'],
            permissions: ['catalog.read'],
          },
          branches: [branch],
          permissions: ['catalog.read'],
        };
      else if (path.endsWith('/restaurant/setup'))
        data = {
          completed: true,
          steps: [],
          ready: true,
          readiness: { ready: true, incomplete: [] },
        };
      else if (path.endsWith('/products') || path.endsWith('/categories'))
        data = { items: [], total: 0, page: 1, page_size: 20 };
      else {
        unexpectedRequests.push(path);
        return route.abort();
      }
      return route.fulfill({ json: { data } });
    });
    await page.goto('/menu');
    const menu = page.locator('.catalog-page');
    await expect(menu.locator('.sales-filter-card')).toBeVisible();
    if (width > 1150) {
      const grid = await menu.locator('.sales-kpi-grid').boundingBox();
      const lastCard = await menu
        .locator('.sales-kpi-card')
        .last()
        .boundingBox();
      expect(grid).not.toBeNull();
      expect(lastCard).not.toBeNull();
      expect(
        Math.abs(lastCard!.x + lastCard!.width - grid!.x - grid!.width),
      ).toBeLessThan(1);
      const value = menu.locator('.sales-kpi-value').first();
      const metrics = await value.evaluate((element) => ({
        height: element.getBoundingClientRect().height,
        lineHeight: Number.parseFloat(getComputedStyle(element).lineHeight),
      }));
      expect(metrics.height).toBeLessThanOrEqual(metrics.lineHeight + 1);
    }
    await expect(menu.locator('.sales-kpi-card').first()).toHaveCSS(
      'border-radius',
      '22px',
    );
    await expect(menu.locator('.sales-filter-card')).toHaveCSS(
      'border-radius',
      '22px',
    );
    await expect(menu.locator('.sales-table-card')).toHaveCSS(
      'border-radius',
      '22px',
    );
    const search = menu.locator('.sales-input-with-icon input');
    await expect(search).toHaveCSS('padding-left', '34px');
    await search.fill('test');
    await expect(search).toHaveValue('test');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(overflow).toBe(false);
    expect(unexpectedRequests).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(`menu-${width}.png`),
      fullPage: true,
    });
  });
}
