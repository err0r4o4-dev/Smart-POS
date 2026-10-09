import { expect, test } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import {
  authSQL,
  latestToken,
  mailIds,
  startAuthClient,
} from '../integration/auth-fixtures.mjs';

test.skip(
  process.env.AUTH_E2E !== '1',
  'Run only against isolated smartpos-auth-test stack',
);

test('real registration, login, persistence, logout, recovery and reset security', async ({
  page,
  request,
}) => {
  test.setTimeout(60000);
  const base = process.env.E2E_BASE_URL;
  expect(base).toBe('http://localhost:18088');
  const email = `browser-${randomUUID()}@example.test`;
  const oldPassword = `Old-password-${randomUUID()}`;
  const newPassword = `New-password-${randomUUID()}`;

  await test.step('unauthorized route redirects and registration validates', async () => {
    await page.setViewportSize({ width: 320, height: 812 });
    await page.goto('/account');
    await expect(page).toHaveURL(/\/login\?returnTo=%2Faccount/);
    await page.goto('/register');
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 320);
    await page.getByLabel('Display name').fill('Browser User');
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(oldPassword);
    await page.getByLabel('Confirm password').fill('different password');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Passwords do not match',
    );
    await page.getByLabel('Confirm password').fill(oldPassword);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page).toHaveURL(/\/login\?registered=1/);
  });

  await test.step('invalid login, valid login, refresh and CSRF', async () => {
    await page.getByLabel('Email address').fill(email);
    await page
      .getByLabel('Password', { exact: true })
      .fill('incorrect password');
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Invalid email or password',
    );
    await page.getByLabel('Password', { exact: true }).fill(oldPassword);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Your account' }),
    ).toBeVisible();
    await expect(page.getByText(email)).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Your account' }),
    ).toBeVisible();
    const cookie = (await page.context().cookies()).find(
      (item) => item.name === 'smartpos_session',
    );
    expect(cookie).toBeTruthy();
    expect(cookie!.httpOnly).toBe(true);
    expect(cookie!.sameSite).toBe('Lax');
    const denied = await request.post(`${base}/api/v1/auth/logout`, {
      headers: {
        Origin: base!,
        Cookie: `${cookie!.name}=${cookie!.value}`,
        'Content-Type': 'application/json',
      },
      data: {},
    });
    expect(denied.status()).toBe(403);
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login(?:\?returnTo=%2Faccount)?$/);
    const revoked = await request.get(`${base}/api/v1/auth/me`, {
      headers: { Cookie: `${cookie!.name}=${cookie!.value}` },
    });
    expect(revoked.status()).toBe(401);
  });

  await test.step('single-use reset revokes active sessions and rejects old password', async () => {
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(oldPassword);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Your account' }),
    ).toBeVisible();
    const oldCookie = (await page.context().cookies()).find(
      (item) => item.name === 'smartpos_session',
    );
    await page.goto('/forgot-password');
    const previousIDs = mailIds(email);
    await page.getByLabel('Email address').fill(email);
    await page.getByRole('button', { name: 'Request reset link' }).click();
    await expect(page.getByRole('status')).toContainText(
      'If an eligible account exists',
    );
    const token = await latestToken(email, previousIDs);
    await page.goto(`/reset-password?token=${encodeURIComponent(token)}`);
    await expect(page).toHaveURL(/\/reset-password$/);
    await page.screenshot({
      path: 'test-results/auth-reset-mobile.png',
      fullPage: true,
    });
    await page.getByLabel('Password', { exact: true }).fill(newPassword);
    await page.getByLabel('Confirm password').fill(newPassword);
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page.getByRole('status')).toContainText('Password changed');
    expect(
      (
        await request.get(`${base}/api/v1/auth/me`, {
          headers: { Cookie: `${oldCookie!.name}=${oldCookie!.value}` },
        })
      ).status(),
    ).toBe(401);
    await page.goto(`/reset-password?token=${encodeURIComponent(token)}`);
    await page.getByLabel('Password', { exact: true }).fill(newPassword);
    await page.getByLabel('Confirm password').fill(newPassword);
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page.getByRole('alert')).toContainText('invalid or expired');
    await page.goto('/login');
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(oldPassword);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText(
      'Invalid email or password',
    );
    await page.getByLabel('Password', { exact: true }).fill(newPassword);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Your account' }),
    ).toBeVisible();
    await page.setViewportSize({ width: 1440, height: 1000 });
    await expect(page.locator('body')).toHaveJSProperty('scrollWidth', 1440);
    await page.screenshot({
      path: 'test-results/auth-account-desktop.png',
      fullPage: true,
    });
  });

  await test.step('expired reset token is rejected', async () => {
    const previousIDs = mailIds(email);
    await page.goto('/forgot-password');
    await page.getByLabel('Email address').fill(email);
    await page.getByRole('button', { name: 'Request reset link' }).click();
    await expect(page.getByRole('status')).toBeVisible();
    const token = await latestToken(email, previousIDs);
    const hash = createHash('sha256').update(token).digest('hex');
    authSQL(
      `UPDATE password_reset_tokens SET created_at=now()-interval '16 minutes',expires_at=now()-interval '1 minute' WHERE token_hash=decode('${hash}','hex')`,
    );
    await page.goto(`/reset-password?token=${encodeURIComponent(token)}`);
    await page.getByLabel('Password', { exact: true }).fill(oldPassword);
    await page.getByLabel('Confirm password').fill(oldPassword);
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page.getByRole('alert')).toContainText('invalid or expired');
  });
});

test('real clients preserve gateway and direct API rate limits despite spoofed headers', async () => {
  test.setTimeout(60000);
  const clients: Array<{ proxy: string; close: () => void }> = [];
  const createClient = async (direct = false) => {
    const client = await startAuthClient(direct);
    clients.push(client);
    return client;
  };
  const attempt = async (
    client: { proxy: string },
    headers: Record<string, string> = {},
  ) =>
    fetch(`${client.proxy}/api/v1/auth/login`, {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:18088',
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({
        email: `rate-${randomUUID()}@example.test`,
        password: 'invalid password',
      }),
    });
  try {
    const first = await createClient();
    for (let count = 0; count < 5; count++)
      expect((await attempt(first)).status).toBe(401);
    const limited = await attempt(first);
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBe('600');
    for (const headers of [
      { 'X-Forwarded-For': '198.51.100.1' },
      { 'X-Real-IP': '203.0.113.1' },
      {
        'X-Forwarded-For': '198.51.100.1, invalid',
        'X-Real-IP': '203.0.113.2',
      },
    ])
      expect((await attempt(first, headers)).status).toBe(429);
    const second = await createClient();
    expect((await attempt(second)).status).toBe(401);
    const direct = await createClient(true);
    for (let count = 0; count < 6; count++) {
      expect(
        (
          await attempt(direct, {
            'X-Forwarded-For': `198.51.100.${count + 1}`,
            'X-Real-IP': `203.0.113.${count + 1}`,
          })
        ).status,
      ).toBe(count < 5 ? 401 : 429);
    }
  } finally {
    for (const client of clients.reverse()) client.close();
  }
});
