import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { posFixture } from '../integration/pos-fixtures.mjs';
import {
  inventoryAccount,
  inventoryMembership,
} from '../integration/inventory-fixtures.mjs';
import type {
  POSPage,
  POSSale,
  SaleSummary,
} from '../../apps/web/src/lib/pos-api';

test.skip(
  process.env.AUTH_E2E !== '1',
  'Requires isolated smartpos-auth-test stack',
);
test('Phase 3: real POS, funds confirmation, receipts, register and responsive boundaries', async ({
  browser,
}, testInfo) => {
  test.setTimeout(360_000);
  const fixture = await posFixture();
  const contexts: BrowserContext[] = [];
  const errors: string[] = [];
  async function client(user = fixture.owner) {
    const context = await browser.newContext({
      baseURL: 'http://localhost:18088',
      proxy: { server: user.source.proxy },
      viewport: { width: 1440, height: 1000 },
    });
    contexts.push(context);
    const separator = user.cookie.indexOf('=');
    await context.addCookies([
      {
        name: user.cookie.slice(0, separator),
        value: user.cookie.slice(separator + 1),
        url: 'http://localhost:18088',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    await context.addInitScript(
      ({ userID, orgID, branchID }) => {
        if (!sessionStorage.getItem(`smartpos-context:${userID}`))
          sessionStorage.setItem(
            `smartpos-context:${userID}`,
            JSON.stringify({ userID, orgID, branchID }),
          );
      },
      { userID: user.id, orgID: fixture.org, branchID: fixture.branch },
    );
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    page.setDefaultTimeout(15_000);
    return page;
  }
  async function scan(page: Page, code = 'POS-TEST-001') {
    await page
      .getByRole('textbox', { name: 'สแกนบาร์โค้ด', exact: true })
      .fill(code);
    await page
      .getByRole('button', { name: 'เพิ่มจากบาร์โค้ด', exact: true })
      .click();
  }
  async function checkout(page: Page, method: string) {
    await page.getByRole('link', { name: 'ชำระเงิน', exact: true }).click();
    await page
      .getByRole('combobox', { name: 'วิธีชำระเงิน', exact: true })
      .selectOption(method);
    if (method === 'CASH')
      await page
        .getByRole('textbox', { name: 'เงินรับ', exact: true })
        .fill('10.00');
    await page
      .getByRole('button', { name: 'ตรวจสอบยอดและเตรียมชำระเงิน', exact: true })
      .click();
    await expect(
      page.getByText('AWAITING_PAYMENT', { exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'ยืนยันรับเงินจริง', exact: true }),
    ).toBeDisabled();
    if (method !== 'CASH')
      await page
        .getByRole('textbox', { name: 'อ้างอิงการชำระเงิน', exact: true })
        .fill('E2E-MANUAL-REFERENCE');
    await page
      .getByRole('checkbox', {
        name: 'ฉันตรวจสอบแล้วว่าได้รับเงินจริง',
        exact: true,
      })
      .check();
    await page
      .getByRole('button', { name: 'ยืนยันรับเงินจริง', exact: true })
      .click();
    await expect(page.getByText('CONFIRMED', { exact: true })).toBeVisible();
    await page
      .getByRole('button', { name: 'บันทึกขายและตัดสต็อก', exact: true })
      .click();
    await expect(page.getByText('COMPLETED', { exact: true })).toBeVisible();
    const result = await fixture.call('/sales');
    expect(result.status).toBe(200);
    return (result.data as POSPage<SaleSummary>).items[0];
  }
  try {
    const page = await client();
    await test.step('open shift and scanner unknown/quantity/hold/resume through UI', async () => {
      await page.goto('/pos/register/open');
      await page
        .getByRole('textbox', { name: 'เงินเปิดกะ', exact: true })
        .fill('100.00');
      await page
        .getByRole('button', { name: 'เปิดกะขาย', exact: true })
        .click();
      await expect(page.getByText(/กะเปิดอยู่/)).toBeVisible();
      await page.getByRole('link', { name: 'ขายสินค้า', exact: true }).click();
      await scan(page, 'UNKNOWN');
      await expect(
        page.getByRole('status').filter({ hasText: 'ไม่พบบาร์โค้ด' }),
      ).toBeVisible();
      await scan(page);
      const quantity = page.getByRole('textbox', {
        name: `จำนวน ${fixture.variant.sku}`,
        exact: true,
      });
      await expect(quantity).toHaveValue('1.000');
      await quantity.fill('2');
      await quantity.press('Enter');
      await expect(quantity).toHaveValue('2.000');
      await page
        .getByRole('button', { name: 'พักตะกร้า', exact: true })
        .click();
      await page.getByRole('link', { name: 'ตะกร้าพัก', exact: true }).click();
      await page
        .getByRole('button', { name: 'กลับมาขาย', exact: true })
        .click();
      await expect(quantity).toHaveValue('2.000');
    });
    const cash = await checkout(page, 'CASH');
    await page
      .getByRole('link', { name: 'ดูรายการขายและพิมพ์ใบเสร็จ', exact: true })
      .click();
    await expect(
      page.getByRole('article', { name: 'ใบเสร็จขาย' }),
    ).toContainText(cash.receipt_number);
    await page
      .getByRole('combobox', { name: 'กระดาษ', exact: true })
      .selectOption('58');
    await page.evaluate(() => {
      window.print = () => {
        throw new Error('Simulated unavailable printer');
      };
    });
    await page
      .getByRole('button', { name: 'พิมพ์ใบเสร็จ', exact: true })
      .click();
    await expect(page.getByRole('alert')).toContainText('รายการขายยังสำเร็จ');
    await page.emulateMedia({ media: 'print' });
    await page
      .getByRole('article', { name: 'ใบเสร็จขาย' })
      .screenshot({ path: testInfo.outputPath('receipt-58mm.png') });
    await page.emulateMedia({ media: 'screen' });
    expect((await fixture.call('/sales')).data.total).toBe(1);
    for (const method of ['QR_MANUAL', 'BANK_TRANSFER_MANUAL']) {
      await page.goto('/pos');
      await page
        .getByRole('button', {
          name: `เพิ่ม ${fixture.variant2.sku}`,
          exact: true,
        })
        .click();
      await expect(
        page.getByRole('textbox', {
          name: `จำนวน ${fixture.variant2.sku}`,
          exact: true,
        }),
      ).toHaveValue('1.000');
      await checkout(page, method);
    }
    const sales = await fixture.call('/sales');
    expect(sales.data.total).toBe(3);
    const saved = (await fixture.call('/sales/' + cash.id)).data as POSSale;
    expect(saved.grand_total).toBe('4.00');
    expect(saved.payment.change).toBe('6.00');
    const beforeReprint = saved.movements.length;
    await page.goto('/sales/' + cash.id);
    await page.evaluate(() => {
      window.print = () => {};
    });
    await page
      .getByRole('button', { name: 'พิมพ์ใบเสร็จ', exact: true })
      .click();
    expect(
      (await fixture.call('/sales/' + cash.id)).data.movements.length,
    ).toBe(beforeReprint);
    await page
      .getByRole('combobox', { name: 'กระดาษ', exact: true })
      .selectOption('80');
    await page.emulateMedia({ media: 'print' });
    await page
      .getByRole('article', { name: 'ใบเสร็จขาย' })
      .screenshot({ path: testInfo.outputPath('receipt-80mm.png') });
    await page.emulateMedia({ media: 'screen' });
    await page.goto('/pos/register/close');
    await page
      .getByRole('textbox', { name: 'เงินนับจริง', exact: true })
      .fill('104.00');
    await page
      .getByRole('button', { name: 'ยืนยันปิดกะ', exact: true })
      .click();
    await expect(page.getByRole('status')).toContainText('ส่วนต่าง 0.00');
    await page.goto('/pos');
    await page
      .getByRole('combobox', { name: 'สาขาที่ใช้งาน', exact: true })
      .selectOption(fixture.secondBranch);
    await expect(
      page
        .getByRole('combobox', { name: 'เครื่องขายที่ใช้งาน', exact: true })
        .locator('option'),
    ).toHaveCount(1);
    await expect(
      page.getByRole('textbox', {
        name: `จำนวน ${fixture.variant.sku}`,
        exact: true,
      }),
    ).toHaveCount(0);
    await page
      .getByRole('combobox', { name: 'สาขาที่ใช้งาน', exact: true })
      .selectOption(fixture.branch);
    const staff = await inventoryAccount(fixture.clients);
    inventoryMembership(fixture.org, staff, 'INVENTORY_STAFF', [
      fixture.branch,
    ]);
    const denied = await client(staff);
    await denied.goto('/pos');
    await expect(denied).toHaveURL(/\/403$/);
    await expect(
      denied.getByRole('textbox', { name: 'สแกนบาร์โค้ด', exact: true }),
    ).toHaveCount(0);
    const routes = [
      '/pos',
      '/pos/held-carts',
      '/pos/checkout',
      '/pos/register/open',
      '/pos/register/close',
      '/pos/register/history',
      '/pos/shifts',
      '/sales',
      '/receipts',
      '/sales/' + cash.id,
    ];
    for (const width of [320, 375, 640, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const route of routes) {
        await page.goto(route);
        await expect(page.locator('h1').first()).toBeVisible();
        await expect
          .poll(() =>
            page.evaluate(
              () =>
                document.documentElement.scrollWidth <= window.innerWidth + 1,
            ),
          )
          .toBe(true);
      }
      if ([375, 1440].includes(width)) {
        await page.goto('/pos');
        await expect(
          page.getByRole('button', {
            name: `เพิ่ม ${fixture.variant.sku}`,
            exact: true,
          }),
        ).toBeVisible();
        await page.screenshot({
          path: testInfo.outputPath(`pos-${width}.png`),
          fullPage: true,
        });
      }
    }
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    fixture.close();
  }
});
