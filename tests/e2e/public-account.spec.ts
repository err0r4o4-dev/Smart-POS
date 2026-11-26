import { expect, test, type Page } from '@playwright/test';

const session = {
  user: {
    id: 'public-fixture',
    display_name: 'Example Customer',
    email: 'person@example.test',
    status: 'ACTIVE',
    email_verified: true,
  },
  csrf_token: 'fixture-token',
};

async function mockAccount(
  page: Page,
  baseURL: string,
  access: 'owner' | 'customer' | 'mfa',
  displayName = session.user.display_name,
) {
  const origin = new URL(baseURL).origin;
  const currentSession = {
    ...session,
    user: { ...session.user, display_name: displayName },
  };
  let signedIn = false;
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    switch (url.pathname) {
      case '/api/v1/auth/login':
        signedIn = true;
        return route.fulfill({ json: { data: currentSession } });
      case '/api/v1/auth/me':
        if (signedIn) return route.fulfill({ json: { data: currentSession } });
        return route.fulfill({
          status: 401,
          json: { error: { code: 'UNAUTHORIZED' } },
        });
      case '/api/v1/auth/google/config':
        return route.fulfill({ json: { data: { enabled: true } } });
      case '/api/v1/auth/google/start':
        signedIn = true;
        return route.fulfill({
          status: 302,
          headers: { location: '/workspace' },
        });
      case '/api/v1/auth/logout':
        signedIn = false;
        return route.fulfill({ json: { data: { revoked: true } } });
      case '/api/v1/organizations':
        return access === 'mfa'
          ? route.fulfill({
              status: 403,
              json: { error: { code: 'MFA_REQUIRED' } },
            })
          : route.fulfill({
              json: {
                data:
                  access === 'owner'
                    ? [{ id: 'store-fixture', status: 'ACTIVE' }]
                    : [],
              },
            });
      case '/api/v1/storefronts':
        return route.fulfill({ json: { data: [] } });
      default:
        return route.abort();
    }
  });
}

for (const { width, access, enlarged } of [
  { width: 360, access: 'owner', enlarged: true },
  { width: 390, access: 'customer', enlarged: false },
  { width: 1280, access: 'owner', enlarged: false },
  { width: 1280, access: 'mfa', enlarged: false },
] as const) {
  test(`public sign-in keeps the current page and checks ${access} access (${width})`, async ({
    page,
    baseURL,
  }, testInfo) => {
    const displayName = enlarged
      ? 'สมชาย เจ้าของร้านอาหารตามสั่งประจำชุมชนสายลม'
      : session.user.display_name;
    await mockAccount(page, baseURL!, access, displayName);
    await page.setViewportSize({ width, height: 900 });
    const directory = '/shop?q=noodles&filter=open&filter=delivery';
    await page.goto(directory);
    await page
      .getByRole('banner')
      .getByRole('link', { name: 'เข้าสู่ระบบ', exact: true })
      .click();
    await page
      .getByLabel('ที่อยู่อีเมล', { exact: true })
      .fill('person@example.test');
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill('fixture-password');
    await page
      .getByRole('button', { name: 'เข้าสู่ระบบ', exact: true })
      .click();
    await expect(page).toHaveURL(directory);
    const account = page.getByRole('button', {
      name: displayName,
      exact: true,
    });
    if (enlarged)
      await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    const storeAccess = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/v1/organizations',
    );
    await account.click();
    await storeAccess;
    await expect(
      page.getByRole('link', { name: 'บัญชีของฉัน' }),
    ).toHaveAttribute('href', '/account');
    const manage = page.getByRole('link', { name: 'จัดการร้าน', exact: true });
    if (access === 'owner')
      await expect(manage).toHaveAttribute('href', '/workspace');
    else await expect(manage).toHaveCount(0);
    const panel = page.locator('.public-account-panel');
    await expect(panel).toBeInViewport();
    if (enlarged) await expect(panel).toHaveCSS('font-size', '32px');
    const bounds = (await panel.boundingBox())!;
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
      .toBeLessThanOrEqual(width);
    await page.screenshot({
      path: testInfo.outputPath(`account-menu-${width}.png`),
    });
    await page.keyboard.press('Escape');
    await expect(account).toBeFocused();
    await expect(account).toHaveAttribute('aria-expanded', 'false');
    await account.click();
    await page.getByRole('button', { name: 'ออกจากระบบ', exact: true }).click();
    await expect(account).toHaveCount(0);
    await expect(page).toHaveURL(directory);
  });
}

test('public Google return stays in the directory without opening the workspace', async ({
  page,
  baseURL,
}) => {
  await mockAccount(page, baseURL!, 'owner');
  await page.goto('/shop?q=noodles');
  await page.getByRole('link', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await page.getByRole('button', { name: /Google/ }).click();
  await expect(page).toHaveURL('/shop?q=noodles');
  await expect(
    page.getByRole('button', { name: 'Example Customer' }),
  ).toBeVisible();
});

test('store enrollment keeps the setup destination for an existing account', async ({
  page,
  baseURL,
}) => {
  await mockAccount(page, baseURL!, 'customer');
  await page.goto('/');
  await page.getByRole('link', { name: 'เริ่มร้านค้า', exact: true }).click();
  await expect(page).toHaveURL('/register?returnTo=%2Fsetup');
  await page.getByRole('link', { name: /มีบัญชีแล้ว/ }).click();
  await expect(page).toHaveURL('/login?returnTo=%2Fsetup');
});

test('home sign-in opens the account page from the account menu', async ({
  page,
  baseURL,
}) => {
  await mockAccount(page, baseURL!, 'customer');
  await page.goto('/');
  await page
    .getByRole('banner')
    .getByRole('link', { name: 'เข้าสู่ระบบ', exact: true })
    .click();
  await page
    .getByLabel('ที่อยู่อีเมล', { exact: true })
    .fill('person@example.test');
  await page.getByLabel('รหัสผ่าน', { exact: true }).fill('fixture-password');
  await page.getByRole('button', { name: 'เข้าสู่ระบบ', exact: true }).click();
  await expect(page).toHaveURL('/');
  await page.getByRole('button', { name: session.user.display_name }).click();
  await page.getByRole('link', { name: 'บัญชีของฉัน', exact: true }).click();
  await expect(page).toHaveURL('/account');
  await expect(
    page.getByRole('heading', { name: 'บัญชีของฉัน' }),
  ).toBeVisible();
  await expect(
    page.getByText('person@example.test', { exact: true }),
  ).toBeVisible();
});
