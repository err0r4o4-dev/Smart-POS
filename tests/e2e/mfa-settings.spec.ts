import { expect, test, type Page } from '@playwright/test';

const session = {
  user: {
    id: '43000000-0000-4000-8000-000000000001',
    email: 'synthetic-mfa@example.test',
    display_name: 'Synthetic MFA account',
    status: 'ACTIVE',
    email_verified: true,
    onboarding: 'PENDING_ORGANIZATION',
  },
  csrf_token: 'synthetic-mfa-csrf',
};
const recoveryCodes = Array.from(
  { length: 10 },
  (_, i) => String.fromCharCode(65 + i) + 'A'.repeat(25),
);

async function fixture(
  page: Page,
  failStatus = false,
  lostConfirmation = false,
  confirmationGate?: Promise<void>,
) {
  let enabled = false;
  const requests: string[] = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    requests.push(path);
    if (path === '/api/v1/auth/me')
      return route.fulfill({ json: { data: session } });
    if (path === '/api/v1/auth/google/config')
      return route.fulfill({ json: { data: { enabled: false } } });
    if (path === '/api/v1/auth/mfa') {
      if (failStatus) {
        failStatus = false;
        return route.fulfill({
          status: 503,
          json: { error: { message: 'Synthetic unavailable' } },
        });
      }
      return route.fulfill({
        json: { data: { enabled, session_verified: enabled } },
      });
    }
    if (path === '/api/v1/auth/mfa/enrollment') {
      expect(request.method()).toBe('POST');
      expect(request.headers()['x-csrf-token']).toBe(session.csrf_token);
      expect(request.postDataJSON()).toEqual({});
      return route.fulfill({
        json: {
          data: {
            factor_id: '43000000-0000-4000-8000-000000000002',
            secret: 'A'.repeat(32),
            expires_at: new Date(Date.now() + 300000).toISOString(),
          },
        },
      });
    }
    if (path === '/api/v1/auth/mfa/enrollment/confirm') {
      expect(request.postDataJSON()).toEqual({ code: '001234' });
      enabled = true;
      await confirmationGate;
      if (lostConfirmation) return route.abort('failed');
      return route.fulfill({
        json: { data: { recovery_codes: recoveryCodes } },
      });
    }
    // Unexpected requests never reach a live API, provider or database.
    return route.fulfill({
      status: 503,
      json: { error: { message: 'Unconfigured synthetic boundary' } },
    });
  });
  return requests;
}

for (const width of [360, 1280]) {
  test.describe(`Pending confirmation at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, hasTouch: width < 768 });
    test('keeps the pending response until the user decides to leave', async ({
      page,
    }, info) => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      await fixture(page, false, false, gate);
      await page.goto('/security');
      await page.getByRole('button', { name: 'English', exact: true }).click();
      await page
        .getByRole('button', { name: 'Set up authenticator', exact: true })
        .click();
      await page.getByLabel('Six-digit code', { exact: true }).fill('001234');
      await page
        .getByRole('button', { name: 'Enable MFA', exact: true })
        .click();
      await page
        .getByRole('link', { name: 'Back to workspace', exact: true })
        .click();
      await expect(
        page.getByText('Confirmation may still complete', { exact: true }),
      ).toBeVisible();
      await expect(page).toHaveURL(/\/security$/);
      await noOverflow(page);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: info.outputPath(`mfa-pending-${width}.png`),
        fullPage: true,
      });
      release();
      await expect(
        page.getByText('Keep your recovery codes before leaving', {
          exact: true,
        }),
      ).toBeVisible();
      await page
        .getByRole('button', { name: 'Stay here', exact: true })
        .click();
      await expect(
        page.getByText(/Using recovery codes is not available yet/),
      ).toBeVisible();
      await expect(page.locator('.mfa-recovery-codes li')).toHaveCount(10);
      await expect(page).toHaveURL(/\/security$/);
    });
  });
}

async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
  const panel = page.locator('.mfa-panel');
  expect(
    await panel.evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1,
    ),
  ).toBe(true);
}

for (const width of [360, 390, 768, 1280]) {
  test.describe(`MFA at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, hasTouch: width < 768 });
    test('renders bilingual setup and protects one-time codes', async ({
      page,
    }, info) => {
      const requests = await fixture(page);
      await page.goto('/security');
      await expect(
        page.getByRole('heading', { name: 'ความปลอดภัยของบัญชี', exact: true }),
      ).toBeVisible();
      await noOverflow(page);
      await page.screenshot({
        path: info.outputPath(`mfa-thai-${width}.png`),
        fullPage: true,
      });
      await page.getByRole('button', { name: 'English', exact: true }).click();
      const begin = page.getByRole('button', {
        name: 'Set up authenticator',
        exact: true,
      });
      await begin.focus();
      await expect(begin).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(
        page.getByLabel('Authenticator setup key', { exact: true }),
      ).toHaveValue('A'.repeat(32));
      await noOverflow(page);
      await page.getByLabel('Six-digit code', { exact: true }).fill('001234');
      await page
        .getByRole('button', { name: 'Enable MFA', exact: true })
        .click();
      await expect(
        page.getByRole('heading', {
          name: 'Keep your recovery codes',
          exact: true,
        }),
      ).toBeFocused();
      await expect(page.locator('.mfa-recovery-codes li')).toHaveCount(10);
      await noOverflow(page);
      expect(
        await page
          .locator('.skip-link')
          .evaluate((element) => element.getBoundingClientRect().bottom <= 0),
      ).toBe(true);
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({
        path: info.outputPath(`mfa-codes-${width}.png`),
        fullPage: true,
      });
      // Enlarge text only, including controls, without shrinking the layout.
      await page.addStyleTag({
        content:
          '.mfa-panel { font-size: 200%; } .mfa-panel p, .mfa-panel label, .mfa-panel h3, .mfa-panel code, .mfa-panel .button { font-size: inherit; }',
      });
      await noOverflow(page);
      await page
        .getByRole('link', { name: 'Back to workspace', exact: true })
        .click();
      await expect(
        page.getByText('Keep your recovery codes before leaving', {
          exact: true,
        }),
      ).toBeVisible();
      await page
        .getByRole('button', { name: 'Stay here', exact: true })
        .click();
      await page
        .getByRole('checkbox', {
          name: 'I have stored these codes somewhere safe',
          exact: true,
        })
        .check();
      await page.getByRole('button', { name: 'Done', exact: true }).click();
      await expect(page.locator('.mfa-recovery-codes')).toHaveCount(0);
      await expect(
        page.getByText('MFA is enabled', { exact: true }),
      ).toBeVisible();
      expect(requests.some((path) => path.includes('/organizations'))).toBe(
        false,
      );
    });
  });
}

test('recovers dependency failure and a lost successful confirmation without retrying the mutation', async ({
  page,
}, info) => {
  const requests = await fixture(page, true, true);
  await page.goto('/security');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.screenshot({
    path: info.outputPath('mfa-unavailable.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Check status again', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Set up authenticator', exact: true })
    .click();
  await page.getByLabel('Six-digit code', { exact: true }).fill('001234');
  await page.getByRole('button', { name: 'Enable MFA', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(
    'operation outcome is unknown',
  );
  await noOverflow(page);
  await page.screenshot({
    path: info.outputPath('mfa-uncertain.png'),
    fullPage: true,
  });
  await page
    .getByRole('button', { name: 'Check status again', exact: true })
    .click();
  await expect(page.getByText('MFA is enabled', { exact: true })).toBeVisible();
  await expect(
    page.getByText(
      /Code regeneration and administrator recovery are not available yet/,
    ),
  ).toBeVisible();
  expect(
    requests.filter((path) => path.endsWith('/enrollment/confirm')),
  ).toHaveLength(1);
  await page.getByRole('link', { name: 'Sign in again', exact: true }).click();
  await expect(page.getByLabel('Password', { exact: true })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Sign in', exact: true }),
  ).toBeEnabled();
});
