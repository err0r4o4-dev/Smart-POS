import { expect, test } from '@playwright/test';

for (const {
  width,
  branchless,
  english,
  incomplete,
  conflict,
  mfa,
  dashboard,
  lateSave,
} of [
  { width: 360, branchless: true },
  { width: 390, english: true },
  { width: 768 },
  { width: 1280 },
  { width: 360, branchless: true, incomplete: true },
  { width: 360, branchless: true, conflict: true },
  { width: 360, branchless: true, mfa: true },
  { width: 360, branchless: true, dashboard: true },
  { width: 1280, branchless: true, english: true, lateSave: true },
]) {
  test(
    incomplete
      ? 'incomplete branchless setup still redirects to setup'
      : conflict
        ? 'owner keeps stale edits until explicitly reloading'
        : mfa
          ? 'owner keeps edits when the server requires MFA'
          : dashboard
            ? 'completed branchless dashboard entry reaches settings'
            : lateSave
              ? 'late hours save does not restore settings after sign-out'
              : `owner edits ordering hours at ${width}px`,
    async ({ page, context, baseURL }, testInfo) => {
      const org = {
        id: 'org',
        name: 'Test restaurant',
        code: 'SHOP',
        business_type: 'RESTAURANT',
        status: 'ACTIVE',
      };
      const owner = {
        id: 'owner',
        email: 'owner@example.test',
        display_name: 'Owner',
        status: 'ACTIVE',
        email_verified: true,
      };
      const branch = {
        id: 'branch',
        organization_id: org.id,
        name: 'Main',
        code: 'MAIN',
        status: 'ACTIVE',
        is_main: true,
      };
      const permissions = [
        'organization.read',
        'organization.update',
        'storefront.manage',
        'online_orders.read',
      ];
      let settings = {
        timezone: 'Asia/Bangkok',
        weekly_windows: [],
        global_pause: false,
        dine_in_paused: false,
        takeaway_paused: false,
        pickup_paused: false,
        delivery_paused: false,
        revision: 2,
      };
      let attempts = 0;
      let sessionVerified = !mfa;
      let signedIn = true;
      let signIns = 0;
      const saveGate = Promise.withResolvers<void>();
      const readGate = Promise.withResolvers<void>();
      const resumedRead = Promise.withResolvers<void>();
      await page.setViewportSize({ width, height: 900 });
      if (english) {
        await page.addInitScript(() =>
          localStorage.setItem('smartpos.language', 'en'),
        );
      }
      await context.route('**/*', async (route) => {
        const req = route.request();
        const url = new URL(req.url());
        if (url.origin !== new URL(baseURL!).origin) return route.abort();
        if (!url.pathname.startsWith('/api/')) return route.continue();
        let data: unknown;
        switch (url.pathname) {
          case '/api/v1/auth/me':
            if (!signedIn)
              return route.fulfill({
                status: 401,
                json: { error: { code: 'UNAUTHENTICATED' } },
              });
            data = { user: owner, csrf_token: 'synthetic-csrf' };
            break;
          case '/api/v1/auth/logout':
            expect(lateSave && signedIn && req.method() === 'POST').toBe(true);
            signedIn = false;
            data = { revoked: true };
            break;
          case '/api/v1/auth/login':
            expect(lateSave && !signedIn && req.method() === 'POST').toBe(true);
            signedIn = true;
            signIns += 1;
            data = { user: owner, csrf_token: 'synthetic-csrf' };
            break;
          case '/api/v1/auth/mfa':
            data = { enabled: true, session_verified: sessionVerified };
            break;
          case '/api/v1/auth/mfa/challenge':
            expect(req.method()).toBe('POST');
            expect(req.headers()['x-csrf-token']).toBe('synthetic-csrf');
            expect(req.postDataJSON()).toEqual({ code: '001234' });
            sessionVerified = true;
            data = { session_verified: true };
            break;
          case '/api/v1/organizations':
            data = [org];
            break;
          case '/api/v1/organizations/org/context':
            data = {
              organization: org,
              membership: {
                role: 'OWNER',
                status: 'ACTIVE',
                branch_ids: branchless ? [] : [branch.id],
                permissions,
              },
              permissions,
              branches: branchless ? [] : [branch],
            };
            break;
          case '/api/v1/organizations/org/restaurant/setup':
            data = {
              completed: !incomplete,
              ready: !incomplete,
              steps: [],
              readiness: { ready: !incomplete, incomplete: [] },
            };
            break;
          case '/api/v1/organizations/org/restaurant/availability':
            if (req.method() === 'PUT') {
              attempts += 1;
              expect(req.headers()['x-csrf-token']).toBe('synthetic-csrf');
              const input = req.postDataJSON();
              expect(input).toEqual({
                ...settings,
                weekly_windows: [{ weekday: 1, start: '09:00', end: '24:00' }],
                pickup_paused: true,
              });
              if (conflict && settings.revision === 2) {
                settings = { ...settings, revision: 3, global_pause: true };
                return route.fulfill({
                  status: 409,
                  json: { error: { code: 'CONFLICT', message: 'Conflict' } },
                });
              }
              if (!sessionVerified) {
                return route.fulfill({
                  status: 403,
                  json: {
                    error: { code: 'MFA_REQUIRED', message: 'Verify MFA' },
                  },
                });
              }
              settings = { ...input, revision: settings.revision + 1 };
              if (lateSave) await saveGate.promise;
            } else if (lateSave && signIns > 0) {
              resumedRead.resolve();
              await readGate.promise;
            }
            data = settings;
            break;
          default:
            return route.fulfill({
              status: 404,
              json: { error: { code: 'NOT_FOUND' } },
            });
        }
        return route.fulfill({ json: { data } });
      });
      await page.goto(dashboard ? '/dashboard' : '/settings');
      if (dashboard) {
        await expect(page).toHaveURL(/\/settings$/, { timeout: 2_000 });
        await expect(
          page.getByRole('region', { name: 'เวลาเปิดรับออเดอร์' }),
        ).toBeVisible();
        return;
      }
      if (incomplete) {
        await expect(page).toHaveURL(/\/setup(?:\?|$)/);
        return;
      }
      if (english) {
        await page.addStyleTag({ content: 'html { font-size: 125%; }' });
      }
      const label = (th: string, en: string) => (english ? en : th);
      const panel = page.getByRole('region', {
        name: label('เวลาเปิดรับออเดอร์', 'Ordering hours'),
      });
      await expect(
        panel.getByText(
          label('ยังไม่มีช่วงเวลาเปิดรับออเดอร์', 'No ordering windows set'),
        ),
      ).toBeVisible();
      const addWindow = panel.getByRole('button', {
        name: label('เพิ่มช่วงเวลา', 'Add window'),
      });
      await addWindow.click();
      if (!conflict && !mfa) {
        const removeWindow = panel.getByRole('button', {
          name: label('ลบช่วงที่ 1', 'Remove window 1'),
        });
        await removeWindow.press('Enter');
        await expect(removeWindow).toHaveCount(0);
        await expect(addWindow).toBeFocused();
        await page.keyboard.press('Enter');
      }
      await panel
        .getByRole('textbox', { name: label('เวลาเปิด', 'Opens at') })
        .fill('09:00');
      await panel
        .getByRole('textbox', { name: label('เวลาปิด', 'Closes at') })
        .fill('24:00');
      const pickup = panel.getByRole('checkbox', {
        name: label('สั่งล่วงหน้าแล้วมารับ', 'Order ahead for pickup'),
      });
      await pickup.focus();
      await page.keyboard.press('Space');
      await expect(pickup).toBeChecked();
      const bounds = await panel.boundingBox();
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      await panel.screenshot({ path: testInfo.outputPath('availability.png') });
      const save = panel.getByRole('button', {
        name: label('บันทึกเวลาและการพัก', 'Save hours and pauses'),
      });
      if (lateSave) {
        const browserDocument = await page.evaluate(() => performance.timeOrigin);
        const completion = page.waitForResponse(
          (response) =>
            response.url().endsWith('/restaurant/availability') &&
            response.request().method() === 'PUT',
        );
        try {
          await save.click();
          await expect.poll(() => attempts).toBe(1);
          await page.getByRole('button', { name: 'Your account' }).click();
          await page.getByRole('menuitem', { name: 'Sign out' }).click();
          await expect(page).toHaveURL(/\/login\?returnTo=%2Fsettings$/);
          await expect(panel).toHaveCount(0);
          saveGate.resolve();
          expect(await (await completion).finished()).toBeNull();

          await page.getByLabel('Email address').fill(owner.email);
          await page.getByLabel('Password', { exact: true }).fill('synthetic-fixture-password');
          await page.getByRole('button', { name: 'Sign in', exact: true }).click();
          await expect(page).toHaveURL(/\/settings$/);
          await expect(panel.getByRole('status')).toHaveText(/loading/i);
          await resumedRead.promise;
          await expect(pickup).toHaveCount(0);
          expect(await page.evaluate(() => performance.timeOrigin)).toBe(browserDocument);
          readGate.resolve();
          await expect(pickup).toBeChecked();
          expect(attempts).toBe(1);
        } finally {
          saveGate.resolve();
          readGate.resolve();
        }
        return;
      }
      await save.click();
      if (mfa) {
        const security = panel.getByRole('link', {
          name: /เปิดความปลอดภัยของบัญชี/,
        });
        await expect(security).toHaveAttribute('target', '_blank');
        await expect(security).toHaveAttribute('href', '/security');
        const [securityTab] = await Promise.all([
          page.waitForEvent('popup'),
          security.click(),
        ]);
        await expect(securityTab).toHaveURL(/\/security$/);
        await expect(
          securityTab.getByRole('heading', { name: 'ความปลอดภัยของบัญชี' }),
        ).toBeVisible();
        await securityTab
          .getByLabel('รหัส 6 หลัก', { exact: true })
          .fill('001234');
        await securityTab
          .getByRole('button', { name: 'ยืนยันรหัส', exact: true })
          .click();
        await expect(
          securityTab.getByText('ยืนยัน MFA สำหรับเซสชันนี้แล้ว', {
            exact: true,
          }),
        ).toBeVisible();
        await securityTab.close();
        await expect(page).toHaveURL(/\/settings$/);
        await expect(
          panel.getByRole('textbox', { name: 'เวลาเปิด' }),
        ).toHaveValue('09:00');
        await expect(pickup).toBeChecked();
        expect(attempts).toBe(1);
        await save.click();
      }
      if (conflict) {
        await expect(panel.getByRole('alert')).toContainText(
          'ค่าที่คุณแก้ยังอยู่',
        );
        await expect(
          panel.getByRole('textbox', { name: 'เวลาเปิด' }),
        ).toHaveValue('09:00');
        await expect(pickup).toBeChecked();
        await expect(save).toBeDisabled();
        await panel
          .getByRole('button', { name: 'ทิ้งค่าที่แก้และโหลดค่าล่าสุด' })
          .click();
        await expect(
          panel.getByRole('checkbox', { name: 'ทุกช่องทาง' }),
        ).toBeChecked();
        await expect(pickup).not.toBeChecked();
        await expect(
          panel.getByRole('textbox', { name: 'เวลาเปิด' }),
        ).toHaveCount(0);
        return;
      }
      await expect(panel.getByRole('status')).toHaveText(
        label('บันทึกข้อมูลแล้ว', 'Saved.'),
      );
    },
  );
}
