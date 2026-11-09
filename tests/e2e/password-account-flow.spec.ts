import { expect, test, type Page } from '@playwright/test';

const user = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'account@example.test',
  display_name: 'Account fixture',
  status: 'ACTIVE',
  email_verified: false,
  onboarding: 'PENDING_ORGANIZATION',
};
const password = 'synthetic-account-password';

async function mockAuth(page: Page) {
  const state = {
    signedIn: false,
    verified: false,
    otherUser: false,
    sessionError: false,
    invalidVerification: false,
    invalidReset: false,
    forgotError: false,
    posts: [] as string[],
  };
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== new URL(test.info().project.use.baseURL!).origin)
      return route.abort();
    if (
      !url.pathname.startsWith('/api/') &&
      !url.pathname.startsWith('/health/')
    )
      return route.continue();
    const path = url.pathname.replace('/api/v1/auth/', '');
    if (request.method() === 'POST') state.posts.push(path);
    const session = () => ({
      user: {
        ...user,
        id: state.otherUser ? '22222222-2222-4222-8222-222222222222' : user.id,
        email_verified: state.verified,
      },
      csrf_token: 'synthetic-csrf',
    });
    const ok = (data: unknown) => route.fulfill({ json: { data } });
    const error = (status: number, message: string) =>
      route.fulfill({ status, json: { error: { message } } });
    if (path === 'google/config') return ok({ enabled: false });
    if (path === 'me') {
      if (state.sessionError) return error(503, 'Session unavailable');
      return state.signedIn ? ok(session()) : error(401, 'Anonymous');
    }
    if (path === 'login') {
      state.signedIn = true;
      return ok(session());
    }
    if (path === 'register')
      return ok({ ...user, verification_email_sent: false });
    if (path === 'email/resend')
      return ok({
        message: 'If an eligible account exists, check your email.',
      });
    if (path === 'email/verify') {
      if (state.invalidVerification)
        return error(400, 'Invalid or expired link');
      state.verified = true;
      return ok({ verified: true, user: { ...user, email_verified: true } });
    }
    if (path === 'forgot-password') {
      if (state.forgotError) return error(503, 'Reset request unavailable');
      return ok({
        message:
          'If an eligible account exists, check your email for reset instructions.',
      });
    }
    if (path === 'reset-password') {
      if (state.invalidReset)
        return error(400, 'Reset link is invalid or expired');
      state.signedIn = false;
      return ok({ reset: true });
    }
    if (url.pathname === '/api/v1/organizations') return ok([]);
    return error(401, 'Synthetic boundary: no backend access');
  });
  return state;
}

async function openEnglish(page: Page, path: string) {
  await page.goto(path);
  await page.getByRole('button', { name: 'English', exact: true }).click();
}

async function fillPassword(page: Page) {
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
}

for (const width of [390, 1440]) {
  test.describe(`password account flow ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });

    test('registration delivery failure remains recoverable and resend is throttled', async ({
      page,
    }, info) => {
      const state = await mockAuth(page);
      await openEnglish(page, '/register');
      await expect(
        page.getByRole('link', { name: /already registered.*verification/i }),
      ).toHaveAttribute('href', '/verify-email');
      await page.getByLabel('Display name').fill(user.display_name);
      await page.getByLabel('Email address', { exact: true }).fill(user.email);
      await fillPassword(page);
      await page.getByLabel('Confirm password').press('Enter');
      await expect(page.getByRole('alert')).toContainText(
        /account was created.*could not send/i,
      );
      await expect(
        page.getByLabel('Email address', { exact: true }),
      ).toHaveValue(user.email);
      await page.getByRole('button', { name: /resend verification/i }).click();
      await expect(page.getByRole('status')).toContainText(/eligible account/i);
      await expect(
        page.getByRole('button', { name: /wait one minute/i }),
      ).toBeDisabled();
      expect(state.posts).toEqual(['register', 'email/resend']);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath('registration-recovery.png'),
        fullPage: true,
      });
    });

    test('unverified login and direct setup stay at verification until session refresh', async ({
      page,
    }, info) => {
      const state = await mockAuth(page);
      await openEnglish(page, '/login');
      await page.getByLabel('Email address', { exact: true }).fill(user.email);
      await page.getByLabel('Password', { exact: true }).fill(password);
      await page.getByLabel('Password', { exact: true }).press('Enter');
      await expect(page).toHaveURL(/\/verify-email$/);
      await expect(
        page.getByLabel('Email address', { exact: true }),
      ).toHaveValue(user.email);
      await page.goto('/setup');
      await expect(page).toHaveURL(/\/verify-email$/);
      await page.getByLabel('Email address', { exact: true }).focus();
      await page.keyboard.press('Tab');
      const resend = page.getByRole('button', { name: /resend verification/i });
      await expect(resend).toBeFocused();
      expect(
        await resend.evaluate(
          (element) => getComputedStyle(element).outlineStyle,
        ),
      ).not.toBe('none');
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: info.outputPath('verification-gate.png'),
        fullPage: true,
      });
      state.verified = true;
      await page.getByRole('button', { name: /check again/i }).click();
      await expect(page).toHaveURL(/\/setup$/);
    });

    test('anonymous verification removes token and never creates a login session', async ({
      page,
    }) => {
      const state = await mockAuth(page);
      await openEnglish(page, '/setup#verify=synthetic-verification-token');
      await expect(page.getByRole('status')).toContainText(/email verified/i);
      expect(page.url()).not.toContain('synthetic-verification-token');
      await expect(
        page.getByRole('button', { name: 'Continue', exact: true }),
      ).toHaveCount(0);
      await page.getByRole('link', { name: 'Sign in', exact: true }).click();
      await expect(page).toHaveURL(/\/login\?verified=1&returnTo=%2Fsetup$/);
      expect(state.posts).toEqual(['email/verify']);
    });

    test('matching verified session needs explicit Continue before setup', async ({
      page,
    }) => {
      const state = await mockAuth(page);
      state.signedIn = true;
      await openEnglish(page, '/setup#verify=synthetic-matching-token');
      await expect(page.getByRole('status')).toContainText(/email verified/i);
      await page.getByRole('button', { name: 'Continue', exact: true }).click();
      await expect(
        page.getByRole('heading', { name: /verify your email/i }),
      ).toHaveCount(0);
      await expect(page).toHaveURL(/\/setup$/);
      expect(state.posts).toEqual(['email/verify']);
    });

    test('verification with another account cannot continue into that workspace', async ({
      page,
    }) => {
      const state = await mockAuth(page);
      state.signedIn = true;
      state.otherUser = true;
      await openEnglish(page, '/setup?verify=synthetic-wrong-account-token');
      await expect(page.getByRole('alert')).toContainText(
        /sign in to the verified account/i,
      );
      await expect(
        page.getByRole('button', { name: 'Continue', exact: true }),
      ).toHaveCount(0);
      await page.getByRole('button', { name: 'Retry session' }).click();
      await expect(page.getByRole('alert')).toContainText(
        /sign in to the verified account/i,
      );
      expect(state.posts).toEqual(['email/verify']);
      expect(page.url()).not.toContain('synthetic-wrong-account-token');
    });

    test('invalid verification offers resend and session errors allow retry', async ({
      page,
    }) => {
      const state = await mockAuth(page);
      state.invalidVerification = true;
      await openEnglish(page, '/setup?verify=synthetic-expired-token');
      await expect(page.getByRole('alert')).toContainText(
        /invalid or expired/i,
      );
      await expect(
        page.getByRole('button', { name: /resend verification/i }),
      ).toBeVisible();
      state.sessionError = true;
      await page.goto('/verify-email');
      await expect(page.getByRole('alert')).toBeVisible();
      state.sessionError = false;
      await page.getByRole('button', { name: /try again|retry/i }).click();
      await expect(
        page.getByRole('button', { name: /resend verification/i }),
      ).toBeVisible();
    });

    test('expired reset recovers and later request errors clear stale success', async ({
      page,
    }) => {
      const state = await mockAuth(page);
      state.invalidReset = true;
      await openEnglish(page, '/reset-password?token=synthetic-expired-reset');
      expect(page.url()).not.toContain('synthetic-expired-reset');
      await fillPassword(page);
      await page.getByRole('button', { name: 'Change password' }).click();
      await expect(page.getByRole('alert')).toContainText(
        /invalid or expired/i,
      );
      await page
        .getByRole('link', { name: 'Request a new reset link' })
        .click();
      await page.getByLabel('Email address', { exact: true }).fill(user.email);
      await page.getByRole('button', { name: 'Request reset link' }).click();
      await expect(page.getByRole('status')).toContainText(/eligible account/i);
      state.forgotError = true;
      await page.getByRole('button', { name: 'Request reset link' }).click();
      await expect(page.getByRole('alert')).toContainText(
        'Reset request unavailable',
      );
      await expect(page.getByRole('status')).toHaveCount(0);
    });

    test('accepted reset clears local session and requires sign in again', async ({
      page,
    }) => {
      const state = await mockAuth(page);
      state.signedIn = true;
      state.verified = true;
      await openEnglish(page, '/reset-password?token=synthetic-reset-token');
      await fillPassword(page);
      await page.getByRole('button', { name: 'Change password' }).click();
      await expect(page.getByRole('status')).toContainText(
        /sessions were revoked/i,
      );
      await page.getByRole('link', { name: 'Sign in again' }).click();
      await expect(page).toHaveURL(/\/login$/);
      expect(state.posts).toEqual(['reset-password']);
    });
  });
}
