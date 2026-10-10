import { expect, test } from '@playwright/test';
import { customersFixture } from '../integration/customers-fixtures.mjs';
import { authSQL } from '../integration/auth-fixtures.mjs';

test.skip(process.env.AUTH_E2E !== '1', 'Requires isolated auth-test stack');
test('Loyalty real program/enrollment/adjustment, POS redemption, history and responsive layouts', async ({
  browser,
}, testInfo) => {
  test.setTimeout(240_000);
  const fixture = await customersFixture();
  const context = await browser.newContext({
    baseURL: 'http://localhost:18088',
    proxy: { server: fixture.owner.source.proxy },
    viewport: { width: 1280, height: 1000 },
  });
  const separator = fixture.owner.cookie.indexOf('=');
  context.setDefaultTimeout(15_000);
  await context.addCookies([
    {
      name: fixture.owner.cookie.slice(0, separator),
      value: fixture.owner.cookie.slice(separator + 1),
      url: 'http://localhost:18088',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
  await context.addInitScript(
    ({ userID, orgID, branchID }) => {
      sessionStorage.setItem(
        `smartpos-context:${userID}`,
        JSON.stringify({ userID, orgID, branchID }),
      );
    },
    { userID: fixture.owner.id, orgID: fixture.org, branchID: fixture.branch },
  );
  try {
    const customer = await fixture.ok(
      '/customers',
      'POST',
      { code: 'LOYALTY-E2E', name: 'Synthetic loyalty browser' },
      undefined,
      fixture.owner,
      200,
    );
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/loyalty');
    await expect(
      page.getByRole('heading', {
        name: 'สมาชิกและรางวัล / Loyalty & Rewards',
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByLabel('ชื่อโปรแกรม / Program name', { exact: true })
      .fill('Browser loyalty');
    await page
      .getByLabel(
        'ยอดซื้อสุทธิต่อหน่วยแต้ม (THB) / Net spend per earning unit',
        { exact: true },
      )
      .fill('1.00');
    await page
      .getByLabel('มูลค่าต่อแต้ม (THB) / Redemption value per point', {
        exact: true,
      })
      .fill('0.01');
    await page
      .getByRole('button', { name: 'บันทึก / Save', exact: true })
      .click();
    await expect(
      page.getByText('Browser loyalty · ACTIVE · 1.00 THB → 1 points', {
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole('combobox', { name: 'ลูกค้า / Customer', exact: true })
      .selectOption(customer.id);
    await page
      .getByRole('combobox', {
        name: 'โปรแกรมสะสมแต้ม / Loyalty program',
        exact: true,
      })
      .selectOption({ label: 'Browser loyalty' });
    await page
      .getByRole('button', { name: 'สมัครสมาชิก / Enroll', exact: true })
      .click();
    const account = page.locator('.card').filter({
      has: page.getByRole('heading', {
        name: 'LOYALTY-E2E · Synthetic loyalty browser',
        exact: true,
      }),
    });
    await expect(account).toBeVisible();
    await account
      .getByLabel('แต้มจำนวนเต็ม (+/−) / Integer points (+/−)', { exact: true })
      .fill('20');
    await account
      .getByLabel('เหตุผล (จำเป็น) / Reason (required)', { exact: true })
      .fill('Synthetic browser opening points');
    await account
      .getByRole('button', { name: 'ปรับแต้ม / Adjust points', exact: true })
      .click();
    await expect(account).toContainText('Ledger balance: 20');
    for (const width of [320, 375, 768, 1280, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        )
        .toBe(true);
      if (width === 320 || width === 1280)
        await page.screenshot({
          path: testInfo.outputPath(`loyalty-${width}.png`),
          fullPage: true,
        });
    }
    await page.setViewportSize({ width: 1280, height: 1000 });
    await page.goto('/pos');
    await page
      .getByRole('button', { name: 'เพิ่ม INV-ONE', exact: true })
      .click();
    const picker = page.getByRole('region', {
      name: 'ลูกค้า / Customer',
      exact: true,
    });
    await picker.getByLabel('ค้นหาลูกค้า / Find customer').fill('LOYALTY-E2E');
    await picker
      .getByRole('button', { name: 'ค้นหา / Search', exact: true })
      .click();
    await picker
      .getByRole('button', { name: /LOYALTY-E2E · Synthetic/ })
      .click();
    await page.getByRole('link', { name: 'ชำระเงิน', exact: true }).click();
    const reward = page.getByRole('region', {
      name: 'แต้มสมาชิก / Loyalty points',
    });
    await expect(reward).toContainText('Available: 20');
    await reward
      .getByLabel('แต้มจำนวนเต็ม / Integer points', { exact: true })
      .fill('10');
    await reward
      .getByRole('button', { name: 'ใช้แต้ม / Apply points', exact: true })
      .click();
    await page.getByLabel('เงินรับ', { exact: true }).fill('1.90');
    await page
      .getByRole('button', { name: 'ตรวจสอบยอดและเตรียมชำระเงิน', exact: true })
      .click();
    await page
      .getByLabel('ฉันตรวจสอบแล้วว่าได้รับเงินจริง', { exact: true })
      .check();
    await page
      .getByRole('button', { name: 'ยืนยันรับเงินจริง', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'บันทึกขายและตัดสต็อก', exact: true })
      .click();
    await expect(
      page.getByRole('status').filter({ hasText: /^ขายสำเร็จ$/ }),
    ).toBeVisible();
    expect(
      authSQL(
        `SELECT COALESCE(sum(points),0) FROM loyalty_ledger ledger JOIN loyalty_accounts account ON account.id=ledger.account_id AND account.organization_id=ledger.organization_id WHERE account.customer_id='${customer.id}'`,
      ),
    ).toBe('11');
    await page.goto(`/loyalty/history?customer_id=${customer.id}`);
    await expect(
      page.getByRole('heading', { name: 'EARN · 1', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'REDEEM · -10', exact: true }),
    ).toBeVisible();
    await page
      .getByText('รายละเอียดกฎ / Rule snapshot', { exact: true })
      .first()
      .click();
    await page.screenshot({
      path: testInfo.outputPath('loyalty-history-1280.png'),
      fullPage: true,
    });
    await page.keyboard.press('Tab');
    expect(await page.locator(':focus').count()).toBe(1);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    fixture.close();
  }
});
