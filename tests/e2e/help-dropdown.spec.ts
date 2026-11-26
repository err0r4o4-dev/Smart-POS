import { expect, test } from '@playwright/test';

for (const path of ['/setup', '/help']) {
  for (const width of [320, 768, 1440]) {
    test(`inline help on ${path} at ${width}px with read-only mocked API`, async ({
      page,
      baseURL,
    }, testInfo) => {
      const origin = new URL(baseURL!).origin;
      const violations: string[] = [];
      page.on('pageerror', (error) => violations.push(error.message));
      page.on('console', (message) => {
        if (message.type() === 'error') violations.push(message.text());
      });
      const organization = {
        id: 'help-org',
        name: 'Test restaurant',
        code: 'HELP',
        business_type: 'RESTAURANT',
        status: 'ACTIVE',
        address: 'Bangkok',
        contact_email: '',
        contact_phone: '',
        description: '',
      };
      const branch = {
        id: 'help-branch',
        organization_id: organization.id,
        name: 'Main',
        code: 'MAIN',
        status: 'ACTIVE',
        is_main: true,
      };
      await page.setViewportSize({ width, height: 900 });
      await page.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (url.origin !== origin || request.method() !== 'GET') {
          violations.push(`${request.method()} ${url.pathname}`);
          return route.abort();
        }
        if (!url.pathname.startsWith('/api/')) return route.continue();
        let data: unknown;
        if (url.pathname === '/api/v1/auth/me') {
          data = {
            user: {
              id: 'help-owner',
              email: 'owner@example.test',
              display_name: 'Owner',
              status: 'ACTIVE',
              email_verified: true,
            },
            csrf_token: 'synthetic',
          };
        } else if (url.pathname === '/api/v1/organizations') {
          data = [organization];
        } else if (url.pathname.endsWith('/context')) {
          data = {
            organization,
            branches: [branch],
            permissions: [],
            membership: {
              role: 'OWNER',
              status: 'ACTIVE',
              branch_ids: [branch.id],
              permissions: [],
            },
          };
        } else if (url.pathname.endsWith('/restaurant/setup')) {
          data = {
            organization_id: organization.id,
            branch_id: branch.id,
            current_step: 'profile',
            ready: false,
            completed: false,
            steps: [],
            readiness: { ready: false, incomplete: [] },
            profile: {
              organization,
              branch,
              service_modes: { dine_in: true, takeaway: true, delivery: false },
            },
          };
        } else {
          violations.push(`Unmocked GET ${url.pathname}`);
          return route.fulfill({
            status: 404,
            json: { error: { message: 'Unexpected mock request' } },
          });
        }
        return route.fulfill({ json: { data } });
      });
      await page.goto(path);
      const trigger = page.getByRole('button', { name: 'คู่มือ', exact: true });
      await expect(trigger).toBeVisible();
      const originalURL = page.url();
      const draft = page.locator('main input:not([type="hidden"])').first();
      const hasDraft = path === '/setup';
      if (hasDraft) await draft.fill('Unsaved restaurant');
      await trigger.focus();
      await page.keyboard.press('Enter');
      const panel = page.getByRole('region', {
        name: 'คู่มือใช้งานร้าน',
        exact: true,
      });
      await expect(panel).toBeVisible();
      await page.keyboard.press('Tab');
      const topic = panel.getByRole('button', {
        name: 'เตรียมร้านให้พร้อม',
        exact: true,
      });
      await expect(topic).toBeFocused();
      await page.keyboard.press('Space');
      await expect(topic).toHaveAttribute('aria-expanded', 'true');
      await expect(
        panel.getByText(/เลือกองค์กรและสาขาที่ต้องการทำงาน/),
      ).toBeVisible();
      await expect(panel.getByRole('link')).toHaveCount(0);
      expect(page.url()).toBe(originalURL);
      if (hasDraft) await expect(draft).toHaveValue('Unsaved restaurant');
      const bounds = await panel.boundingBox();
      expect(bounds).not.toBeNull();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(900);
      const coveredPoints = await panel.evaluate((element) => {
        const rect = element.getBoundingClientRect();
        const covered: Array<{ x: number; y: number }> = [];
        for (
          let pointY = rect.top + 24;
          pointY < rect.bottom - 24;
          pointY += 24
        ) {
          const pointX = rect.left + rect.width / 2;
          if (!element.contains(document.elementFromPoint(pointX, pointY))) {
            covered.push({ x: pointX, y: pointY });
          }
        }
        return covered;
      });
      expect(coveredPoints).toEqual([]);
      await page.screenshot({ path: testInfo.outputPath('inline-help.png') });
      await page.keyboard.press('Escape');
      await expect(panel).toHaveCount(0);
      await expect(trigger).toBeFocused();
      await page.keyboard.press('Space');
      await expect(panel).toBeVisible();
      await page.keyboard.press('Shift+Tab');
      await expect(panel).toHaveCount(0);
      await trigger.click();
      await expect(panel).toBeVisible();
      await page.mouse.click(1, 890);
      await expect(panel).toHaveCount(0);
      expect(page.url()).toBe(originalURL);
      expect(violations).toEqual([]);
    });
  }
}
