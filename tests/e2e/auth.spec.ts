import { expect, test } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';

test.skip(
  process.env.AUTH_E2E !== '1',
  'Run only against isolated smartpos-auth-test stack',
);

function mailpit(path: string) {
  return JSON.parse(
    execFileSync(
      'docker',
      [
        'compose',
        '-p',
        'smartpos-auth-test',
        'exec',
        '-T',
        'api',
        'wget',
        '-qO-',
        `http://mailpit:8025${path}`,
      ],
      { encoding: 'utf8' },
    ),
  );
}

function latestToken(email: string) {
  const messages = mailpit('/api/v1/messages').messages as Array<{
    ID: string;
    To: Array<{ Address: string }>;
  }>;
  const message = messages.find((item) =>
    item.To.some((recipient) => recipient.Address === email),
  );
  expect(message).toBeTruthy();
  const text = mailpit(`/api/v1/message/${encodeURIComponent(message!.ID)}`)
    .Text as string;
  const token = text.match(/reset-password\?token=([A-Za-z0-9_-]+)/)?.[1];
  expect(token).toBeTruthy();
  return token!;
}

test('real registration, login, persistence, logout, recovery and reset security', async ({
  page,
  request,
}) => {
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
    await expect(page).toHaveURL(/\/login$/);
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
    await page.getByLabel('Email address').fill(email);
    await page.getByRole('button', { name: 'Request reset link' }).click();
    await expect(page.getByRole('status')).toContainText(
      'If an eligible account exists',
    );
    const token = latestToken(email);
    await page.goto(`/reset-password?token=${encodeURIComponent(token)}`);
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
  });

  await test.step('expired reset token is rejected', async () => {
    await page.goto('/forgot-password');
    await page.getByLabel('Email address').fill(email);
    await page.getByRole('button', { name: 'Request reset link' }).click();
    await expect(page.getByRole('status')).toBeVisible();
    const token = latestToken(email);
    const hash = createHash('sha256').update(token).digest('hex');
    execFileSync(
      'docker',
      [
        'compose',
        '-p',
        'smartpos-auth-test',
        'exec',
        '-T',
        'postgres',
        'psql',
        '-U',
        'smartpos_dev',
        '-d',
        'smartpos',
        '-q',
        '-c',
        `UPDATE password_reset_tokens SET expires_at=now()-interval '1 minute' WHERE token_hash=decode('${hash}','hex')`,
      ],
      { stdio: 'ignore' },
    );
    await page.goto(`/reset-password?token=${encodeURIComponent(token)}`);
    await page.getByLabel('Password', { exact: true }).fill(oldPassword);
    await page.getByLabel('Confirm password').fill(oldPassword);
    await page.getByRole('button', { name: 'Change password' }).click();
    await expect(page.getByRole('alert')).toContainText('invalid or expired');
  });
});
