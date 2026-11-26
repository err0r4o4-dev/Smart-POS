import { expect, test } from '@playwright/test';

test.use({ trace: 'off' });
const org = '11111111-1111-4111-8111-111111111111';
const user = '22222222-2222-4222-8222-222222222222';
const prefix = `/api/v1/organizations/${org}/storefront/payment-sandbox`;
const sessionID = `cs_test_${'a'.repeat(180)}`;

async function fixture(page, role = 'OWNER') {
  const state = {
    configured: false,
    paid: false,
    refund: null,
    calls: 0,
    csrf: '',
    key: '',
  };
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const organization = {
      id: org,
      name: 'Sandbox fixture shop',
      code: 'FIXTURE',
      currency: 'THB',
      status: 'ACTIVE',
    };
    const permissions =
      role === 'OWNER'
        ? ['organization.read', 'branch.read', 'storefront.manage']
        : ['organization.read', 'branch.read'];
    let data;
    if (path === '/api/v1/auth/me')
      data = {
        user: {
          id: user,
          display_name: 'Synthetic tester',
          email: 'fixture@example.test',
          status: 'ACTIVE',
        },
        csrf_token: 'synthetic-csrf',
      };
    else if (path === '/api/v1/organizations') data = [organization];
    else if (path === `/api/v1/organizations/${org}/context`)
      data = {
        organization,
        membership: {
          id: user,
          user_id: user,
          role,
          status: 'ACTIVE',
          branch_ids: [],
        },
        branches: [],
        permissions,
      };
    else if (path.startsWith(prefix)) {
      state.calls++;
      if (path === prefix)
        data = {
          provider: 'stripe',
          mode: 'test',
          configured: state.configured,
          amount_minor: 2000,
          currency: 'thb',
          customer_checkout_enabled: false,
        };
      else if (path.endsWith('/refund')) {
        expect(request.method()).toBe('POST');
        expect(request.headers()['x-csrf-token']).toBe('synthetic-csrf');
        state.refund = {
          id: 're_fixture',
          status: 'pending',
          amount_minor: 2000,
          currency: 'thb',
        };
        data = state.refund;
      } else {
        if (request.method() === 'POST') {
          state.csrf = request.headers()['x-csrf-token'];
          state.key = request.headers()['idempotency-key'];
        }
        data = {
          id: sessionID,
          url: state.paid
            ? ''
            : `https://checkout.stripe.com/c/pay/${sessionID}`,
          status: state.paid ? 'complete' : 'open',
          payment_status: state.paid ? 'paid' : 'unpaid',
          amount_minor: 2000,
          currency: 'thb',
          refund: state.refund,
        };
      }
    } else {
      await route.fulfill({
        status: 404,
        json: { error: { message: 'Unmocked endpoint' } },
      });
      return;
    }
    await route.fulfill({ json: { data } });
  });
  return state;
}

test('sandbox management UI with stubbed API: disabled, Checkout, provider status and pending refund', async ({
  page,
}, testInfo) => {
  const state = await fixture(page);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/manage/settings/storefront/payments');
  await expect(
    page.getByRole('heading', { name: 'ทดสอบการเชื่อมต่อ Stripe' }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'สร้าง Checkout ทดสอบ 20.00 บาท' }),
  ).toBeDisabled();
  state.configured = true;
  await page.getByRole('button', { name: 'ตรวจการตั้งค่าใหม่' }).click();
  await expect(
    page.getByRole('button', { name: 'สร้าง Checkout ทดสอบ 20.00 บาท' }),
  ).toBeEnabled();
  await page
    .getByRole('button', { name: 'สร้าง Checkout ทดสอบ 20.00 บาท' })
    .focus();
  await page.keyboard.press('Enter');
  await expect(page.getByText('ยังไม่ชำระ', { exact: true })).toBeVisible();
  expect(state.csrf).toBe('synthetic-csrf');
  expect(state.key).toMatch(/^[a-f0-9-]{36}$/);
  await expect(
    page.getByRole('link', { name: 'เปิดหน้าชำระเงินทดสอบของ Stripe' }),
  ).toHaveAttribute('href', `https://checkout.stripe.com/c/pay/${sessionID}`);
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`sandbox-unpaid-${width}.png`),
      fullPage: true,
    });
  }
  state.paid = true;
  await page.getByRole('button', { name: 'ตรวจสถานะรายการใหม่' }).click();
  await expect(
    page.getByText('ชำระเงินทดสอบแล้ว', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'ขอคืนเงินทดสอบเต็มจำนวน' }),
  ).toBeDisabled();
  await page
    .getByRole('checkbox', { name: 'ยืนยันคืนเงินทดสอบ 20.00 บาท' })
    .focus();
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: 'ขอคืนเงินทดสอบเต็มจำนวน' }).click();
  await expect(
    page.getByText('คืนเงิน: รอดำเนินการ', { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test('staff cannot access management sandbox or call its API (stubbed identity)', async ({
  page,
}) => {
  const state = await fixture(page, 'CASHIER');
  await page.goto('/manage/settings/storefront/payments');
  await expect(page).toHaveURL(/\/403$/);
  expect(state.calls).toBe(0);
});
