import { expect, test, type BrowserContext, type Page } from '@playwright/test';

test.beforeAll(async ({ browser }) => {
  console.log(
    `Browser evidence: ${browser.browserType().name()} ${browser.version()}, ${process.platform}; emulated viewports`,
  );
});

const userID = '53000000-0000-4000-8000-000000000001';
const orgID = '53000000-0000-4000-8000-000000000002';
const session = {
  user: {
    id: userID,
    email: 'synthetic-owner@example.test',
    display_name: 'Synthetic Owner',
    status: 'ACTIVE',
    email_verified: true,
    onboarding: 'PENDING_ORGANIZATION',
  },
  csrf_token: 'synthetic-csrf',
};
const setup = {
  current_step: 'profile',
  completed: false,
  readiness: { ready: false, incomplete: [] },
  steps: [],
};

async function fixture(
  context: BrowserContext,
  existing = false,
  listDenied = false,
  completion = false,
) {
  let verified = false;
  const keys: string[] = [];
  const unexpected: string[] = [];
  await context.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.hostname !== '127.0.0.1') return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const path = url.pathname;
    if (path === '/api/v1/auth/me')
      return route.fulfill({ json: { data: session } });
    if (path === '/api/v1/auth/google/config')
      return route.fulfill({ json: { data: { enabled: false } } });
    if (path === '/api/v1/auth/mfa')
      return route.fulfill({
        json: { data: { enabled: true, session_verified: verified } },
      });
    if (path === '/api/v1/auth/mfa/challenge') {
      expect(request.postDataJSON()).toEqual({ code: '001234' });
      expect(request.headers()['x-csrf-token']).toBe(session.csrf_token);
      verified = true;
      return route.fulfill({ json: { data: { session_verified: true } } });
    }
    const organization = {
      id: orgID,
      name: 'Synthetic store',
      business_type: 'RESTAURANT',
      code: 'SYNTHETIC',
      currency: 'THB',
      status: 'ACTIVE',
      contact_email: '',
      contact_phone: '',
      address: '',
    };
    if (path === '/api/v1/organizations' && request.method() === 'GET') {
      if (listDenied && !verified)
        return route.fulfill({
          status: 403,
          json: { error: { code: 'MFA_REQUIRED', message: 'Verify MFA' } },
        });
      return route.fulfill({
        headers: { 'X-SmartPOS-Store-Mode': 'multi' },
        json: { data: existing ? [organization] : [] },
      });
    }
    if (path === `/api/v1/organizations/${orgID}/context` && completion)
      return route.fulfill({
        json: {
          data: {
            organization,
            branches: [],
            membership: { role: 'OWNER' },
            permissions: ['organization.update'],
          },
        },
      });
    if (path === `/api/v1/organizations/${orgID}/context`)
      return route.fulfill({
        status: 403,
        json: { error: { code: 'MFA_REQUIRED', message: 'Verify MFA' } },
      });
    if (path === '/api/v1/organizations' && request.method() === 'POST') {
      keys.push(request.headers()['idempotency-key']);
      expect(request.headers()['x-csrf-token']).toBe(session.csrf_token);
      if (keys.length === 1) {
        // A successful commit followed by failed Context must retain operation identity.
        verified = false;
        return route.fulfill({
          status: 403,
          json: { error: { code: 'MFA_REQUIRED', message: 'Verify MFA' } },
        });
      }
      expect(keys[1]).toBe(keys[0]);
      return route.fulfill({
        status: 201,
        json: {
          data: {
            organization,
            branches: [],
            membership: { role: 'OWNER' },
            permissions: [],
          },
        },
      });
    }
    if (completion && path.endsWith('/restaurant/setup/complete')) {
      keys.push(request.headers()['idempotency-key']);
      expect(request.headers()['x-csrf-token']).toBe(session.csrf_token);
      if (!verified)
        return route.fulfill({
          status: 403,
          json: { error: { code: 'MFA_REQUIRED', message: 'Verify MFA' } },
        });
      // Keep review open after the retry; navigation success has separate coverage.
      return route.fulfill({ json: { data: { ...setup, ready: false } } });
    }
    if (completion && path.endsWith('/restaurant/setup'))
      return route.fulfill({
        json: {
          data: {
            ...setup,
            organization_id: orgID,
            current_step: 'review',
            ready: true,
            readiness: { ready: true, incomplete: [] },
            profile: {
              organization: {
                ...organization,
                contact_phone: '0812345678',
                address:
                  '99/9, แขวง พระบรมมหาราชวัง, เขต พระนคร, จังหวัด กรุงเทพมหานคร, รหัสไปรษณีย์ 10200',
              },
              service_modes: {
                dine_in: false,
                takeaway: true,
                delivery: false,
              },
            },
            services: { dine_in: false, takeaway: true, delivery: false },
            tables: { zones: [], tables: [], qr_enabled: false },
            payments: { cash: true, bank_transfer: false },
            orders: { vat_percent: '7.00', service_charge_percent: '10.00' },
          },
        },
      });
    if (path.startsWith(`/api/v1/organizations/${orgID}/restaurant/setup`))
      return route.fulfill({ json: { data: setup } });
    unexpected.push(path);
    return route.fulfill({
      status: 503,
      json: { error: { message: 'Unconfigured synthetic boundary' } },
    });
  });
  return {
    keys,
    unexpected,
    verify: () => {
      verified = true;
    },
  };
}

async function english(page: Page) {
  const button = page.getByRole('button', { name: 'English', exact: true });
  await button.click();
}
async function fillStore(page: Page) {
  await page.getByLabel('Store name', { exact: true }).fill('Synthetic store');
  await page.getByLabel('Store phone', { exact: true }).fill('0812345678');
  await page
    .getByLabel('House number / store address', { exact: true })
    .fill('99/9');
  await page
    .getByLabel('Province', { exact: true })
    .selectOption({ label: 'กรุงเทพมหานคร' });
  await page
    .getByLabel('District', { exact: true })
    .selectOption({ label: 'พระนคร' });
  await page
    .getByLabel('Subdistrict', { exact: true })
    .selectOption({ label: 'พระบรมมหาราชวัง' });
}
async function noOverflow(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
}

for (const width of [360, 390, 768, 1280]) {
  test.describe(`Owner MFA at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 }, hasTouch: width < 768 });
    test('recovers setup completion with the same key after MFA', async ({
      page,
      context,
    }, info) => {
      const state = await fixture(context, true, false, true);
      await page.goto('/setup');
      await english(page);
      const submit = page.getByRole('button', {
        name: 'Open store',
        exact: true,
      });
      await expect(submit).toBeEnabled();
      await submit.click();
      const security = page.getByRole('link', {
        name: 'Open account security (new tab)',
        exact: true,
      });
      await expect(security).toBeVisible();
      expect(state.keys).toHaveLength(1);
      await noOverflow(page);
      await page.addStyleTag({ content: 'html { font-size: 200%; }' });
      await noOverflow(page);
      expect((await security.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      await page.screenshot({
        path: info.outputPath(`setup-complete-mfa-${width}.png`),
        fullPage: true,
      });
      const popupPromise = context.waitForEvent('page');
      await security.focus();
      await page.keyboard.press('Enter');
      const popup = await popupPromise;
      await english(popup);
      await popup.getByLabel('Six-digit code', { exact: true }).fill('001234');
      await popup
        .getByRole('button', { name: 'Verify code', exact: true })
        .click();
      // A verified session leaves account security for the workspace.
      await expect(popup).not.toHaveURL(/\/security$/);
      await popup.close();
      expect(state.keys).toHaveLength(1);
      await submit.click();
      await expect.poll(() => state.keys.length).toBe(2);
      expect(state.keys[1]).toBe(state.keys[0]);
      expect(state.unexpected).toEqual([]);
    });
    test('opens account security when List requires MFA', async ({
      page,
      context,
    }) => {
      const state = await fixture(context, false, true);
      await page.goto('/setup');
      await expect(page).toHaveURL(/\/security$/);
      await expect(
        page.getByRole('heading', {
          name: 'ความปลอดภัยของบัญชี',
          exact: true,
        }),
      ).toBeVisible();
      await expect(
        page.getByLabel('รหัส 6 หลัก', { exact: true }),
      ).toBeVisible();
      await noOverflow(page);
      expect(state.keys).toEqual([]);
      expect(state.unexpected).toEqual([]);
    });
    test('keeps fields and the original key through MFA recovery', async ({
      page,
      context,
    }, info) => {
      const state = await fixture(context);
      await page.goto('/setup');
      await english(page);
      await fillStore(page);
      const submit = page.getByRole('button', {
        name: 'Save and continue',
        exact: true,
      });
      await submit.click();
      const security = page.getByRole('link', {
        name: 'Open account security (new tab)',
        exact: true,
      });
      await expect(security).toBeVisible();
      expect(state.keys).toEqual([]);
      expect(
        await page.evaluate(
          (id) => sessionStorage.getItem(`smartpos-creation:${id}`),
          userID,
        ),
      ).toBeNull();
      await noOverflow(page);
      await page.screenshot({
        path: info.outputPath(`owner-mfa-${width}.png`),
        fullPage: true,
      });
      const enlarged = await page.addStyleTag({
        content: 'html { font-size: 200%; }',
      });
      await noOverflow(page);
      const securityBox = await security.boundingBox();
      expect(securityBox?.height).toBeGreaterThanOrEqual(44);
      await page.screenshot({
        path: info.outputPath(`owner-mfa-enlarged-${width}.png`),
        fullPage: true,
      });
      await enlarged.evaluate((element) => element.remove());
      const popupPromise = context.waitForEvent('page');
      await security.focus();
      await page.keyboard.press('Enter');
      const popup = await popupPromise;
      await english(popup);
      await popup.getByLabel('Six-digit code', { exact: true }).fill('001234');
      await popup
        .getByRole('button', { name: 'Verify code', exact: true })
        .click();
      // A verified session leaves account security for the workspace.
      await expect(popup).not.toHaveURL(/\/security$/);
      await popup.close();
      await expect(page.getByLabel('Store name', { exact: true })).toHaveValue(
        'Synthetic store',
      );
      await submit.click();
      await expect(security).toBeVisible();
      await expect.poll(() => state.keys.length).toBe(1);
      const saved = await page.evaluate(
        (id) => sessionStorage.getItem(`smartpos-creation:${id}`),
        userID,
      );
      expect(JSON.parse(saved!).key).toBe(state.keys[0]);
      // The server fixture changes assurance; this is UI simulation, not backend acceptance.
      state.verify();
      await submit.click();
      await expect.poll(() => state.keys.length).toBe(2);
      await expect
        .poll(() =>
          page.evaluate(
            (id) => sessionStorage.getItem(`smartpos-creation:${id}`),
            userID,
          ),
        )
        .toBeNull();
      expect(state.keys[1]).toBe(state.keys[0]);
      expect(state.unexpected).toEqual([]);
    });

    test('redirects the parent gate to account security with Thai and enlarged text', async ({
      page,
      context,
    }, info) => {
      const state = await fixture(context, true);
      await page.goto('/workspace');
      await expect(page).toHaveURL(/\/security$/);
      await expect(
        page.getByRole('heading', {
          name: 'ความปลอดภัยของบัญชี',
          exact: true,
        }),
      ).toBeVisible();
      const code = page.getByLabel('รหัส 6 หลัก', { exact: true });
      await expect(code).toBeVisible();
      // MFA is required here, so the page must not offer a way back into the workspace.
      await expect(
        page.getByRole('link', { name: 'กลับพื้นที่ทำงาน', exact: true }),
      ).toHaveCount(0);
      // The security page sizes text in px, so enlarged root text does not scale it;
      // only the no-overflow guarantee is asserted here.
      await page.addStyleTag({ content: 'html { font-size: 200%; }' });
      await noOverflow(page);
      await page.screenshot({
        path: info.outputPath(`owner-context-thai-zoom-${width}.png`),
        fullPage: true,
      });
      expect(state.keys).toEqual([]);
      expect(state.unexpected).toEqual([]);
    });
  });
}

test('reuses the original key after reload and blocks changed details or unavailable storage', async ({
  page,
  context,
}) => {
  const state = await fixture(context);
  state.verify();
  await page.goto('/setup');
  await english(page);
  await fillStore(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key.startsWith('smartpos-creation:'))
        throw new Error('Synthetic unavailable storage');
      return original.call(this, key, value);
    };
  });
  await page
    .getByRole('button', { name: 'Save and continue', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'no creation request was sent',
  );
  expect(state.keys).toEqual([]);
  await page.reload();
  await english(page);
  await fillStore(page);
  await page
    .getByRole('button', { name: 'Save and continue', exact: true })
    .click();
  await expect.poll(() => state.keys.length).toBe(1);
  await expect(
    page.getByRole('link', {
      name: 'Open account security (new tab)',
      exact: true,
    }),
  ).toBeVisible();
  await page.reload();
  await english(page);
  await fillStore(page);
  state.verify();
  await page.getByLabel('Store name', { exact: true }).fill('Different store');
  await page
    .getByRole('button', { name: 'Save and continue', exact: true })
    .click();
  await expect(page.getByRole('alert')).toContainText(
    'Restore the original store details',
  );
  expect(state.keys).toHaveLength(1);
  await page.getByLabel('Store name', { exact: true }).fill('Synthetic store');
  await page
    .getByRole('button', { name: 'Save and continue', exact: true })
    .click();
  await expect.poll(() => state.keys.length).toBe(2);
  expect(state.keys[1]).toBe(state.keys[0]);
});
