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

for (const [width, path] of [
  [390, '/setup'],
  [1440, '/workspace'],
  [1280, '/login'],
] as const) {
  test(`required MFA opens the code form directly from ${path} at ${width}px`, async ({
    page,
  }, testInfo) => {
    let signedIn = path !== '/login';
    let verified = false;
    await page.setViewportSize({ width, height: 900 });
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      switch (new URL(request.url()).pathname) {
        case '/api/v1/auth/me':
          return signedIn
            ? route.fulfill({ json: { data: session } })
            : route.fulfill({ status: 401, json: {} });
        case '/api/v1/auth/login':
          signedIn = true;
          return route.fulfill({ json: { data: session } });
        case '/api/v1/organizations':
          return verified
            ? route.fulfill({ json: { data: [] } })
            : route.fulfill({
                status: 403,
                json: {
                  error: { code: 'MFA_REQUIRED', message: 'Verify MFA' },
                },
              });
        case '/api/v1/auth/mfa':
          return route.fulfill({
            json: { data: { enabled: true, session_verified: verified } },
          });
        case '/api/v1/auth/mfa/challenge':
          if (request.postDataJSON().code !== '123456')
            return route.fulfill({ status: 400, json: {} });
          verified = true;
          return route.fulfill({ json: { data: { session_verified: true } } });
        default:
          return route.fulfill({ status: 503, json: {} });
      }
    });
    await page.goto(path);
    if (path === '/login') {
      await page.getByRole('button', { name: 'English', exact: true }).click();
      await page.getByLabel('Email address').fill(session.user.email);
      await page.getByLabel('Password', { exact: true }).fill('test-password');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    }
    await expect(page).toHaveURL(/\/security$/);
    const banner = page.getByRole('banner');
    await banner.getByRole('button', { name: 'English', exact: true }).click();
    await expect(banner.getByRole('link')).toHaveAttribute('href', '/');
    await expect(banner.getByRole('navigation')).toHaveCount(0);
    await expect(page.getByRole('main')).toHaveCount(1);
    const code = page.getByRole('textbox', { name: 'Six-digit code' });
    const verify = page.getByRole('button', { name: 'Verify code' });
    await expect(code).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'MFA verification required' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'Back to workspace' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('link', { name: 'Back to home' }),
    ).toHaveAttribute('href', '/');
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
    await page.screenshot({
      path: testInfo.outputPath('mfa-required.png'),
      fullPage: true,
    });
    await code.fill('000000');
    await code.press('Enter');
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/security$/);
    await code.fill('123456');
    await verify.click();
    await expect(page).toHaveURL(/\/setup$/);
    expect(verified).toBe(true);
  });
}

for (const width of [360, 390, 768, 1280]) {
  test.describe(`Authenticator replacement at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, hasTouch: width < 768 });
    test('uses one recovery confirmation and requires a new sign-in', async ({
      page,
    }) => {
      const lost = width === 390;
      let starts = 0;
      let confirms = 0;
      let signedInAgain = false;
      const newCsrf = 'synthetic-renewed-csrf';
      const factorId = '43000000-0000-4000-8000-000000000002';
      await page.route('**/api/**', async (route) => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        if (path === '/api/v1/auth/me')
          return route.fulfill({ json: { data: session } });
        if (path === '/api/v1/auth/login') {
          signedInAgain = true;
          return route.fulfill({
            json: { data: { ...session, csrf_token: newCsrf } },
          });
        }
        if (path === '/api/v1/auth/mfa')
          return route.fulfill({
            json: { data: { enabled: true, session_verified: false } },
          });
        if (path === '/api/v1/auth/google/config')
          return route.fulfill({ json: { data: { enabled: false } } });
        if (path === '/api/v1/auth/mfa/recovery') {
          starts++;
          expect(request.headers()['x-csrf-token']).toBe(session.csrf_token);
          expect(request.postDataJSON()).toEqual({
            recovery_code: recoveryCodes[0],
          });
          return route.fulfill({
            json: {
              data: {
                factor_id: factorId,
                secret: 'A'.repeat(32),
                expires_at: new Date(Date.now() + 300000).toISOString(),
              },
            },
          });
        }
        if (path === '/api/v1/auth/mfa/recovery/confirm') {
          confirms++;
          expect(request.headers()['x-csrf-token']).toBe(session.csrf_token);
          expect(request.postDataJSON()).toEqual({
            factor_id: factorId,
            code: '001234',
          });
          if (lost) return route.abort('failed');
          return route.fulfill({
            json: { data: { recovery_codes: recoveryCodes } },
          });
        }
        if (path === '/api/v1/auth/mfa/challenge') {
          expect(signedInAgain).toBe(true);
          expect(request.headers()['x-csrf-token']).toBe(newCsrf);
          expect(request.postDataJSON()).toEqual({ code: '567890' });
          return route.fulfill({ json: { data: { session_verified: true } } });
        }
        if (path === '/api/v1/organizations')
          return route.fulfill({ json: { data: [] } });
        return route.fulfill({
          status: 503,
          json: { error: { message: 'Unconfigured synthetic boundary' } },
        });
      });
      await page.goto('/security');
      await page.getByRole('button', { name: 'English', exact: true }).click();
      const recovery = page.getByRole('button', {
        name: 'Use a recovery code',
      });
      const verify = page.getByRole('button', { name: 'Verify code' });
      await expect(verify).toBeVisible();
      expect((await verify.boundingBox())!.y).toBeLessThan(
        (await recovery.boundingBox())!.y,
      );
      await recovery.press('Enter');
      const recoveryInput = page.getByRole('textbox', {
        name: 'Recovery code',
        exact: true,
      });
      await expect(recoveryInput).toHaveAccessibleDescription(
        /unused recovery code within five minutes/,
      );
      await recoveryInput.fill('INVALID!');
      await recoveryInput.press('Enter');
      await expect(recoveryInput).toBeFocused();
      await expect(recoveryInput).toHaveValue('INVALID!');
      expect(starts).toBe(0);
      await recoveryInput.fill(recoveryCodes[0]);
      await page.getByRole('button', { name: 'Set up replacement' }).click();
      await expect(
        page.getByRole('img', {
          name: 'QR code for setting up your authenticator app',
        }),
      ).toBeVisible();
      const setupKey = page.getByRole('textbox', {
        name: 'Authenticator setup key',
      });
      await expect(setupKey).toBeHidden();
      await page
        .getByText("Can't scan? Enter the key manually", { exact: true })
        .click();
      await expect(setupKey).toBeVisible();
      await expect(setupKey).toHaveAccessibleDescription(
        /Keep this key private/,
      );
      expect(starts).toBe(1);
      if (width <= 390) {
        await page.getByRole('button', { name: 'ไทย', exact: true }).click();
        await expect(page.getByText(/แอปเดิมยังใช้ได้/)).toBeVisible();
        await page.evaluate(() => {
          document.documentElement.style.fontSize = '125%';
        });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        await page
          .getByRole('button', { name: 'English', exact: true })
          .click();
      }
      await page.getByLabel('Six-digit code').fill('001234');
      await page.getByRole('button', { name: 'Replace authenticator' }).click();
      if (lost) {
        await expect(page.getByRole('alert')).toContainText(
          'could not confirm whether your authenticator changed',
        );
        await expect(page.getByLabel('Authenticator setup key')).toHaveCount(0);
      } else {
        await expect(
          page.getByRole('heading', { name: 'Keep your recovery codes' }),
        ).toBeFocused();
        await expect(page.getByRole('button', { name: 'Done' })).toBeDisabled();
        await page
          .getByRole('checkbox', {
            name: 'I have stored these codes somewhere safe',
          })
          .check();
        await page.getByRole('button', { name: 'Done' }).click();
      }
      await expect(page.locator('.mfa-recovery-codes')).toHaveCount(0);
      await page.getByRole('link', { name: 'Sign in again' }).click();
      await expect(page).toHaveURL(/\/login\?returnTo=%2Fsecurity$/);
      await page.getByLabel('Email address').fill(session.user.email);
      await page
        .getByLabel('Password', { exact: true })
        .fill('synthetic-fixture-password');
      await page.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(page).toHaveURL(/\/security$/);
      await page.getByLabel('Six-digit code').fill('567890');
      await page.getByRole('button', { name: 'Verify code' }).click();
      await expect(page).toHaveURL(/\/setup$/);
      expect(confirms).toBe(1);
    });
  });
}

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
    if (path === '/api/v1/organizations' && enabled)
      return route.fulfill({ json: { data: [] } });
    // Unexpected requests never reach a live API, provider or database.
    return route.fulfill({
      status: 503,
      json: { error: { message: 'Unconfigured synthetic boundary' } },
    });
  });
  return {
    requests,
    restoreStatus: () => {
      failStatus = false;
    },
  };
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
      await expect(page.getByText(/Codes are shown only now/)).toBeVisible();
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
      const { requests } = await fixture(page);
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
      expect(requests.some((path) => path.includes('/organizations'))).toBe(
        false,
      );
      await page.getByRole('button', { name: 'Done', exact: true }).click();
      await expect(page).toHaveURL(/\/setup$/);
      await expect(page.locator('.mfa-recovery-codes')).toHaveCount(0);
    });
  });
}

test('recovers dependency failure and a lost successful confirmation without retrying the mutation', async ({
  page,
}, info) => {
  const { requests, restoreStatus } = await fixture(page, true, true);
  await page.goto('/security');
  await page.getByRole('button', { name: 'English', exact: true }).click();
  const retry = page.getByRole('button', {
    name: 'Check status again',
    exact: true,
  });
  await expect(retry).toBeVisible();
  await page.screenshot({
    path: info.outputPath('mfa-unavailable.png'),
    fullPage: true,
  });
  restoreStatus();
  await retry.click();
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
