import { expect, test, type Page } from '@playwright/test';

async function mockFeedback(page: Page) {
  const state = { outcome: 'accepted', posts: 0 };
  const origin = new URL(test.info().project.use.baseURL!).origin;
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (
      !url.pathname.startsWith('/api/') &&
      !url.pathname.startsWith('/health/')
    )
      return route.continue();
    if (url.pathname.endsWith('/auth/me'))
      return route.fulfill({
        status: 401,
        json: { error: { message: 'Anonymous' } },
      });
    if (url.pathname.endsWith('/auth/google/config'))
      return route.fulfill({ json: { data: { enabled: false } } });
    if (
      ['/api/v1/auth/email/resend', '/api/v1/auth/forgot-password'].includes(
        url.pathname,
      )
    ) {
      state.posts++;
      if (state.outcome === 'network') return route.abort('failed');
      if (state.outcome === 'limited')
        return route.fulfill({
          status: 429,
          headers: { 'Retry-After': '3600' },
          json: { error: { message: '<b>private detail</b>' } },
        });
      return route.fulfill({
        status: 202,
        json: { data: { message: 'private detail' } },
      });
    }
    return route.fulfill({
      status: 503,
      json: { error: { message: 'Mocked boundary' } },
    });
  });
  return state;
}

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
}

for (const width of [320, 768, 1440]) {
  for (const language of ['th', 'en']) {
    const en = language === 'en';
    test.describe(`account feedback ${width}px ${language}`, () => {
      test.use({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      test.beforeEach(async ({ page }) => {
        await page.addInitScript(
          (value) => localStorage.setItem('smartpos.language', value),
          language,
        );
      });

      test('resend explains 429 and expiry never sends another request', async ({
        page,
      }, info) => {
        const state = await mockFeedback(page);
        state.outcome = 'limited';
        await page.goto('/verify-email');
        await page.clock.install();
        await page
          .getByLabel(en ? 'Email address' : 'อีเมล', { exact: true })
          .fill('person@example.test');
        await page
          .getByRole('button', {
            name: en ? 'Resend verification email' : 'ส่งอีเมลยืนยันอีกครั้ง',
            exact: true,
          })
          .click();
        await expect(page.getByRole('alert')).toContainText(
          en ? 'Too many requests' : 'ขอทำรายการถี่เกินไป',
        );
        await expect(
          page.getByRole('button', { name: /60:00/ }),
        ).toBeDisabled();
        await expect(page.getByText('private detail')).toHaveCount(0);
        await noOverflow(page);
        await page.screenshot({
          path: info.outputPath('rate-limit.png'),
          fullPage: true,
        });
        await page.clock.fastForward(3_600_000);
        await expect(
          page.getByRole('button', {
            name: en ? 'Resend verification email' : 'ส่งอีเมลยืนยันอีกครั้ง',
            exact: true,
          }),
        ).toBeEnabled();
        expect(state.posts).toBe(1);
      });

      test('success toast is non-modal and stale success disappears on network failure', async ({
        page,
      }, info) => {
        const state = await mockFeedback(page);
        await page.goto('/forgot-password');
        const email = page.getByLabel(en ? 'Email address' : 'ที่อยู่อีเมล', {
          exact: true,
        });
        await email.fill('person@example.test');
        const submit = page.getByRole('button', {
          name: en ? 'Request reset link' : 'ขอลิงก์รีเซ็ตรหัสผ่าน',
          exact: true,
        });
        await submit.click();
        await expect(page.getByRole('status')).toContainText(
          en ? 'If an eligible account' : 'หากบัญชีมีสิทธิ์',
        );
        await expect(page.getByRole('dialog')).toHaveCount(0);
        expect(
          await page
            .getByRole('status')
            .evaluate((popup) => popup.contains(document.activeElement)),
        ).toBe(false);
        await expect(page.getByText('private detail')).toHaveCount(0);
        await noOverflow(page);
        await page.screenshot({
          path: info.outputPath('success.png'),
          fullPage: true,
        });
        state.outcome = 'network';
        await submit.click();
        await expect(page.getByRole('alert')).toContainText(
          en ? 'Could not confirm the result' : 'ยังยืนยันผลรายการไม่ได้',
        );
        await expect(page.getByRole('status')).toHaveCount(0);
        await expect(email).toHaveValue('person@example.test');
        expect(state.posts).toBe(2);
      });
    });
  }

  test(`confirmation keyboard and text safety ${width}px`, async ({ page }) => {
    await mockFeedback(page);
    await page.goto('/forgot-password');
    const trigger = page.locator('input[type=email]');
    await trigger.focus();
    await page.evaluate(async () => {
      const modulePath = '/src/components/feedback/feedback.ts';
      const feedback = await import(modulePath);
      void feedback.confirmFeedback({
        title: '<img src=x onerror=alert(1)>',
        text: 'Unsaved draft changes will be lost.',
        confirmLabel: '<b>Discard draft</b>',
        cancelLabel: 'Keep editing',
      });
    });
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Keep editing' }),
    ).toBeFocused();
    await expect(
      page.getByRole('heading', { name: '<img src=x onerror=alert(1)>' }),
    ).toBeVisible();
    await expect(
      page.locator('.swal2-title img, .swal2-confirm b'),
    ).toHaveCount(0);
    await noOverflow(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(trigger).toBeFocused();
  });
}
