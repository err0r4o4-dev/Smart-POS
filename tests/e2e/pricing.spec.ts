import { expect, test, type Browser } from '@playwright/test';
import { adjustmentsFixture } from '../integration/adjustments-fixtures.mjs';
import { authSQL } from '../integration/auth-fixtures.mjs';

test.skip(
  process.env.AUTH_E2E !== '1',
  'Requires isolated smartpos-auth-test stack',
);
async function session(
  browser: Browser,
  fixture: Awaited<ReturnType<typeof adjustmentsFixture>>,
) {
  const context = await browser.newContext({
    baseURL: 'http://localhost:18088',
    proxy: { server: fixture.owner.source.proxy },
    viewport: { width: 1440, height: 1000 },
  });
  const separator = fixture.owner.cookie.indexOf('=');
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
    ({ userID, orgID, branchID }) =>
      sessionStorage.setItem(
        `smartpos-context:${userID}`,
        JSON.stringify({ userID, orgID, branchID }),
      ),
    { userID: fixture.owner.id, orgID: fixture.org, branchID: fixture.branch },
  );
  return context;
}
test('Phase 5.3 real price list, promotion, approval, checkout and responsive routes', async ({
  browser,
}, testInfo) => {
  test.setTimeout(240_000);
  const fixture = await adjustmentsFixture();
  const context = await session(browser, fixture);
  context.setDefaultTimeout(15_000);
  try {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/pricing/lists');
    await expect(
      page
        .getByRole('combobox', { name: 'สินค้า', exact: true })
        .locator('option'),
    ).toHaveCount(4);
    await page
      .getByRole('combobox', { name: 'Language', exact: true })
      .selectOption('en');
    await page.getByLabel('Name', { exact: true }).fill('E2E branch prices');
    await page
      .getByRole('combobox', { name: 'Branch', exact: true })
      .selectOption(fixture.branch);
    await page
      .getByRole('combobox', { name: 'Product', exact: true })
      .selectOption(fixture.variant.product_id);
    await page
      .getByRole('combobox', { name: 'Variant / SKU', exact: true })
      .selectOption(fixture.variant.id);
    await page.getByLabel('Price THB', { exact: true }).fill('100.00');
    await page
      .getByRole('button', { name: 'Add variant', exact: true })
      .click();
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await page
      .getByRole('button', { name: 'E2E branch prices', exact: true })
      .click();
    for (const action of ['submit', 'approve', 'activate'])
      await page.getByRole('button', { name: action, exact: true }).click();
    await expect(page.getByText('ACTIVE', { exact: true })).toBeVisible();
    await page.goto('/promotions');
    await page
      .getByRole('combobox', { name: 'Language', exact: true })
      .selectOption('en');
    await page.getByLabel('Name', { exact: true }).fill('E2E fixed discount');
    await page
      .getByRole('combobox', { name: 'Branch', exact: true })
      .selectOption(fixture.branch);
    await page
      .getByRole('combobox', { name: 'Type', exact: true })
      .selectOption('FIXED');
    await page.getByLabel('Discount THB', { exact: true }).fill('10.00');
    await page.getByRole('button', { name: 'Save draft', exact: true }).click();
    await page
      .getByRole('button', { name: 'E2E fixed discount', exact: true })
      .click();
    for (const action of ['submit', 'approve', 'activate'])
      await page.getByRole('button', { name: action, exact: true }).click();
    await expect(page.getByText('ACTIVE', { exact: true })).toBeVisible();
    await page.getByRole('link', { name: 'Details', exact: true }).click();
    const detailPath = new URL(page.url()).pathname;
    await expect(
      page.getByRole('heading', { name: 'E2E fixed discount', exact: true }),
    ).toBeVisible();
    await page.goto('/pos');
    await page
      .getByRole('button', { name: 'เพิ่ม INV-ONE', exact: true })
      .click();
    await page.getByRole('link', { name: 'ชำระเงิน', exact: true }).click();
    await expect(page.locator('.pos-total')).toContainText('90.00');
    await page.getByLabel('ส่วนลดที่ขอ (THB)', { exact: true }).fill('5.00');
    await page
      .getByLabel('เหตุผล / Reason', { exact: true })
      .fill('E2E inspected manual discount');
    const requested = page.waitForResponse(
      (response) =>
        response.url().endsWith('/discount-approvals') &&
        response.request().method() === 'POST',
    );
    await page
      .getByRole('button', { name: 'ขอส่วนลด / Request discount', exact: true })
      .click();
    const approval = (await (await requested).json()).data;
    await page.goto('/discount-approvals');
    await page.getByRole('button', { name: 'approve', exact: true }).click();
    await expect(page.getByText('APPROVED', { exact: true })).toBeVisible();
    await page.goto('/pos/checkout');
    await page
      .getByRole('combobox', {
        name: 'ส่วนลดที่อนุมัติ / Approved discount',
        exact: true,
      })
      .selectOption(approval.id);
    await expect(page.locator('.pos-total')).toContainText('85.00');
    await page.getByLabel('เงินรับ', { exact: true }).fill('85.00');
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
    await page
      .getByRole('link', { name: 'ดูรายการขายและพิมพ์ใบเสร็จ', exact: true })
      .click();
    await expect(page.locator('.receipt-total')).toContainText('15.00');
    await expect(page.locator('.receipt-total')).toContainText('85.00');
    expect(
      authSQL(
        `SELECT status FROM discount_approvals WHERE id='${approval.id}'`,
      ),
    ).toBe('CONSUMED');
    for (const [index, route] of [
      '/pricing',
      '/pricing/lists',
      '/promotions',
      detailPath,
      '/discount-approvals',
    ].entries()) {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      for (const width of [360, 390, 768, 1024, 1280, 1440, 1920]) {
        await page.setViewportSize({ width, height: 1000 });
        await expect
          .poll(() =>
            page.evaluate(
              () =>
                document.documentElement.scrollWidth <= window.innerWidth + 1,
            ),
          )
          .toBe(true);
        if (width === 360 || width === 1440)
          await page.screenshot({
            path: testInfo.outputPath(`pricing-route-${index}-${width}.png`),
            fullPage: true,
          });
      }
    }
    await page
      .getByRole('combobox', { name: 'Language', exact: true })
      .selectOption('en');
    await expect(
      page.getByRole('heading', { name: 'Discount approvals', exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    fixture.close();
  }
});
test('Phase 5.3 zero-payable checkout never fabricates payments', async ({
  browser,
}, testInfo) => {
  test.setTimeout(120_000);
  const fixture = await adjustmentsFixture();
  const context = await session(browser, fixture);
  context.setDefaultTimeout(15_000);
  try {
    let promotion = (
      await fixture.call('/promotions', 'POST', {
        name: 'Zero-payable E2E',
        branch_id: fixture.branch,
        priority: 0,
        starts_at: null,
        ends_at: null,
        rule: {
          type: 'FIXED',
          policy: 'EXCLUSIVE',
          amount: '2.00',
          minimum_spend: '0.00',
          basis_points: 0,
          buy: 0,
          get: 0,
          variant_ids: [fixture.variant.id],
          category_ids: [],
          usage_limit: 1,
        },
      })
    ).data;
    for (const action of ['submit', 'approve', 'activate'])
      promotion = (
        await fixture.call(`/promotions/${promotion.id}/${action}`, 'POST', {
          revision: promotion.revision,
        })
      ).data;
    const page = await context.newPage();
    await page.goto('/pos');
    await page
      .getByRole('button', { name: 'เพิ่ม INV-ONE', exact: true })
      .click();
    await page.getByRole('link', { name: 'ชำระเงิน', exact: true }).click();
    await expect(page.locator('.pos-total')).toContainText('0.00');
    await page
      .getByRole('button', { name: 'ตรวจสอบยอดและเตรียมชำระเงิน', exact: true })
      .click();
    await expect(
      page.getByText('ยอดสุทธิศูนย์ — ไม่มีการรับเงิน', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'ยืนยันรับเงินจริง', exact: true }),
    ).toHaveCount(0);
    const completed = page.waitForResponse(
      (response) =>
        response.url().endsWith('/complete') &&
        response.request().method() === 'POST',
    );
    await page
      .getByRole('button', { name: 'บันทึกขายและตัดสต็อก', exact: true })
      .click();
    const checkout = (await (await completed).json()).data;
    expect(checkout.status).toBe('COMPLETED');
    expect(
      authSQL(
        `SELECT count(*) FROM sale_payments WHERE sale_id='${checkout.sale_id}' AND (method<>'NONE' OR amount<>0 OR received<>0 OR change<>0 OR credit_amount<>0)`,
      ),
    ).toBe('0');
    expect(
      authSQL(
        `SELECT method||'|'||amount::text||'|'||received::text||'|'||change::text FROM sale_payments WHERE sale_id='${checkout.sale_id}'`,
      ),
    ).toBe('NONE|0.00|0.00|0.00');
    expect(
      authSQL(`SELECT used FROM promotions WHERE id='${promotion.id}'`),
    ).toBe('1');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({
      path: testInfo.outputPath('zero-payable-mobile.png'),
      fullPage: true,
    });
  } finally {
    await context.close();
    fixture.close();
  }
});
