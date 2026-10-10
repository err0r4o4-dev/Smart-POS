import { expect, test } from '@playwright/test';
import { adjustmentsFixture } from '../integration/adjustments-fixtures.mjs';
import { authSQL } from '../integration/auth-fixtures.mjs';
import {
  inventoryAccount,
  inventoryCall,
  inventoryMembership,
} from '../integration/inventory-fixtures.mjs';

test.skip(
  process.env.AUTH_E2E !== '1',
  'Requires isolated smartpos-auth-test stack',
);
test('Phase 5.2 real insufficient-stock rejection and uncommitted checkout cancellation', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const fixture = await adjustmentsFixture();
  const context = await browser.newContext({
    baseURL: 'http://localhost:18088',
    proxy: { server: fixture.owner.source.proxy },
  });
  try {
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
      {
        userID: fixture.owner.id,
        orgID: fixture.org,
        branchID: fixture.branch,
      },
    );
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    const original = await fixture.sale([[fixture.variant, '1']]);
    await page.goto(`/pos/exchanges?sale_id=${original.id}`);
    await page.getByLabel('เหตุผล / ผลตรวจสินค้า').fill('Stock rejection');
    await page.getByLabel('จำนวนรับคืน INV-ONE', { exact: true }).fill('1');
    await page
      .getByLabel('เครื่องขายสินค้าทดแทน')
      .selectOption(fixture.terminal.id);
    await page
      .getByRole('button', { name: 'เพิ่มสินค้าทดแทน INV-TWO', exact: true })
      .click();
    await page.getByLabel('จำนวนทดแทน INV-TWO', { exact: true }).fill('999');
    const quote = page.waitForResponse((response) =>
      response.url().endsWith('/exchanges/quote'),
    );
    await page
      .getByRole('button', { name: 'คำนวณโดยเซิร์ฟเวอร์', exact: true })
      .click();
    expect((await quote).status()).toBe(409);
    await expect(
      page.getByRole('button', { name: 'บันทึกฉบับร่าง', exact: true }),
    ).toBeDisabled();
    expect((await fixture.ok('/exchanges')).total).toBe(0);
    const beforeSales = (await fixture.ok('/sales')).total;
    await page.goto('/pos');
    await page
      .getByRole('button', { name: 'เพิ่ม INV-ONE', exact: true })
      .click();
    await page.getByRole('link', { name: 'ชำระเงิน', exact: true }).click();
    await expect(
      page
        .getByRole('combobox', { name: 'วิธีชำระเงิน' })
        .locator('option[value="EXCHANGE_CREDIT"]'),
    ).toHaveCount(0);
    await page
      .getByRole('textbox', { name: 'เงินรับ', exact: true })
      .fill('2.00');
    const prepared = page.waitForResponse(
      (response) =>
        response.url().endsWith('/pos/checkout') &&
        response.request().method() === 'POST',
    );
    await page
      .getByRole('button', { name: 'ตรวจสอบยอดและเตรียมชำระเงิน', exact: true })
      .click();
    const checkout = (await (await prepared).json()).data;
    const cancelled = page.waitForResponse((response) =>
      response.url().endsWith(`/pos/checkouts/${checkout.id}/cancel`),
    );
    await page
      .getByRole('button', { name: 'ยกเลิกก่อนรับเงิน', exact: true })
      .click();
    expect((await cancelled).status()).toBe(200);
    expect((await fixture.ok(`/pos/checkouts/${checkout.id}`)).status).toBe(
      'CANCELLED',
    );
    expect((await fixture.ok('/sales')).total).toBe(beforeSales);
  } finally {
    await context.close();
    fixture.close();
  }
});
test('Phase 5.2 real exchange directions, multi-item, reversal, recovery and responsive evidence', async ({
  browser,
}, testInfo) => {
  test.setTimeout(480_000);
  const fixture = await adjustmentsFixture();
  const context = await browser.newContext({
    baseURL: 'http://localhost:18088',
    proxy: { server: fixture.owner.source.proxy },
    viewport: { width: 1440, height: 1000 },
  });
  try {
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
      {
        userID: fixture.owner.id,
        orgID: fixture.org,
        branchID: fixture.branch,
      },
    );
    const page = await context.newPage(),
      errors: string[] = [];
    page.setDefaultTimeout(30_000);
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('dialog', (dialog) => void dialog.accept());
    async function command(name: string, suffix: string) {
      const pending = page.waitForResponse(
        (response) =>
          response.url().endsWith(suffix) &&
          ['POST', 'PATCH'].includes(response.request().method()),
      );
      await page.getByRole('button', { name, exact: true }).click();
      const response = await pending;
      expect(response.status()).toBeLessThan(300);
      return { doc: (await response.json()).data, response };
    }
    async function create(
      original: any,
      quantity: string,
      replacementQuantity: string,
      reversal = false,
    ) {
      await page.goto(
        `${reversal ? '/sales/voids' : '/pos/exchanges'}?sale_id=${original.id}`,
      );
      await expect(
        page.getByRole('heading', {
          name: reversal ? 'กลับรายการขายที่สำเร็จแล้ว' : 'เปลี่ยนสินค้าลูกค้า',
          exact: true,
        }),
      ).toBeVisible();
      await page
        .getByLabel('เหตุผล / ผลตรวจสินค้า')
        .fill('Real browser inspected goods');
      if (!reversal) {
        for (const item of original.items)
          await page
            .getByLabel(`จำนวนรับคืน ${item.sku}`, { exact: true })
            .fill(quantity);
        await page
          .getByLabel('เครื่องขายสินค้าทดแทน')
          .selectOption(fixture.terminal.id);
        await page.getByLabel('ค้นหาสินค้าทดแทน / SKU').fill('INV-TWO');
        await page
          .getByRole('button', {
            name: 'เพิ่มสินค้าทดแทน INV-TWO',
            exact: true,
          })
          .click();
        await page
          .getByLabel('จำนวนทดแทน INV-TWO', { exact: true })
          .fill(replacementQuantity);
      }
      for (const item of original.items)
        await page
          .getByLabel(`ตำแหน่งรับคืน ${item.sku}`)
          .selectOption(fixture.warehouse.id);
      await command('คำนวณโดยเซิร์ฟเวอร์', '/quote');
      return (
        await command(
          'บันทึกฉบับร่าง',
          reversal ? '/sales/voids' : '/exchanges',
        )
      ).doc;
    }
    async function finish(
      doc: any,
      method: string,
      beforePosting?: () => Promise<void>,
    ) {
      const base = `${doc.kind === 'REVERSAL' ? '/sales/voids' : '/exchanges'}/${doc.id}`;
      await command('ส่งอนุมัติ', base + '/submit');
      await command('อนุมัติ', base + '/approve');
      await page.getByLabel('วิธีชำระส่วนต่าง').selectOption(method);
      if (['CASH', 'CASH_REFUND'].includes(method))
        await page
          .getByLabel('กะเงินสดของตนที่เปิดอยู่')
          .selectOption(fixture.shift.id);
      if (method.includes('MANUAL'))
        await page
          .getByLabel('เลขอ้างอิงด้วยตนเอง', { exact: true })
          .fill('BROWSER-MANUAL-EVIDENCE');
      await page
        .getByLabel('หลักฐาน / บันทึกชำระเงิน', { exact: true })
        .fill('Exact amount and direction reviewed');
      await page
        .getByRole('checkbox', { name: /รับทราบจำนวนและทิศทาง/ })
        .check();
      await command('บันทึกการรับทราบส่วนต่าง', base + '/confirm-settlement');
      if (beforePosting) await beforePosting();
      return command('ลงรายการจริง', base + '/complete');
    }
    const equalSale = await fixture.sale([[fixture.variant, '1']]);
    let equalDoc = await create(equalSale, '1', '1');
    await page
      .getByRole('button', { name: 'แก้ไขฉบับร่าง', exact: true })
      .click();
    await page.screenshot({
      path: testInfo.outputPath('editing-draft.png'),
      fullPage: true,
    });
    await page.getByLabel('เหตุผล / ผลตรวจสินค้า').fill('Edited browser draft');
    await command('คำนวณโดยเซิร์ฟเวอร์', '/quote');
    equalDoc = (await command('บันทึกฉบับร่าง', `/exchanges/${equalDoc.id}`))
      .doc;
    const equalPosted = await finish(equalDoc, 'NONE');
    expect(equalPosted.doc.status).toBe('COMPLETED');
    expect(equalPosted.doc.net_difference).toBe('0.00');
    const replay = await fixture.call(
      `/exchanges/${equalDoc.id}/complete`,
      'POST',
      equalPosted.response.request().postDataJSON(),
      equalPosted.response.request().headers()['idempotency-key'],
    );
    expect(replay.data.replacement_sale_id).toBe(
      equalPosted.doc.replacement_sale_id,
    );
    await expect(
      page.getByRole('link', { name: 'เปิดรายการขายทดแทน', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('link', { name: 'เปิดรายการขายทดแทน', exact: true })
      .click();
    await expect(
      page.getByRole('article', { name: 'ใบเสร็จขาย' }),
    ).toContainText('เงินใหม่ 0.00');
    const positiveSale = await fixture.sale([[fixture.variant, '1']]);
    const positive = await create(positiveSale, '1', '2');
    async function adjust(quantity: string, type: string) {
      let doc = await fixture.ok('/inventory/adjustments', 'POST', {
        location_id: fixture.shelf.id,
        adjustment_type: type,
        reason_code: 'BROWSER_RECOVERY',
        notes: 'Synthetic real availability',
        items: [{ variant_id: fixture.variant2.id, quantity }],
      });
      for (const action of ['submit', 'approve', 'post'])
        doc = await fixture.ok(
          `/inventory/adjustments/${doc.id}/${action}`,
          'POST',
          { revision: doc.revision },
          undefined,
          fixture.owner,
          200,
        );
    }
    const available = authSQL(
      `SELECT quantity::text FROM stock_balances WHERE organization_id='${fixture.org}' AND location_id='${fixture.shelf.id}' AND variant_id='${fixture.variant2.id}'`,
    );
    const beforeCash = await fixture.ok(`/pos/shifts/${fixture.shift.id}`);
    const failedPositive = await finish(positive, 'CASH', () =>
      adjust(available, 'DECREASE'),
    );
    expect(failedPositive.doc.status).toBe('RECONCILIATION_REQUIRED');
    expect(
      (await fixture.ok(`/pos/shifts/${fixture.shift.id}`)).cash_sales,
    ).toBe(beforeCash.cash_sales);
    await expect(page.getByRole('alert')).toContainText(
      'ห้ามรับหรือคืนเงินซ้ำ',
    );
    await adjust(available, 'INCREASE');
    const positivePosted = await command(
      'ลองลงรายการภายในใหม่ — ไม่รับหรือจ่ายเงินซ้ำ',
      `/exchanges/${positive.id}/complete`,
    );
    expect(positivePosted.doc.status).toBe('COMPLETED');
    expect(positivePosted.doc.net_difference).toBe('2.00');
    expect(
      (await fixture.ok(`/sales/${positivePosted.doc.replacement_sale_id}`))
        .payment.amount,
    ).toBe('2.00');
    const negativeSale = await fixture.sale([[fixture.variant, '2']]);
    const negative = await create(negativeSale, '2', '1');
    const negativePosted = await finish(negative, 'MANUAL_BANK_REFUND');
    expect(negativePosted.doc.net_difference).toBe('-2.00');
    expect(
      (
        await fixture.ok(
          `/refunds/${negativePosted.doc.return_document.refund_id}`,
        )
      ).amount,
    ).toBe('2.00');
    const multiSale = await fixture.sale([
      [fixture.variant, '1'],
      [fixture.weightVariant, '1.125'],
    ]);
    const multi = await create(multiSale, '1', '1');
    await page
      .getByRole('button', { name: 'แก้ไขฉบับร่าง', exact: true })
      .click();
    await page
      .getByLabel('จำนวนรับคืน INV-WEIGHT', { exact: true })
      .fill('1.125');
    await page
      .getByRole('button', { name: 'เพิ่มสินค้าทดแทน INV-WEIGHT', exact: true })
      .click();
    await page
      .getByLabel('จำนวนทดแทน INV-WEIGHT', { exact: true })
      .fill('1.125');
    await command('คำนวณโดยเซิร์ฟเวอร์', '/quote');
    const savedMulti = (
      await command('บันทึกฉบับร่าง', `/exchanges/${multi.id}`)
    ).doc;
    const multiPosted = await finish(savedMulti, 'NONE');
    expect(multiPosted.doc.return_credit).toBe('4.25');
    const reversibleSale = await fixture.sale([[fixture.variant, '1']]);
    const reversal = await create(reversibleSale, '1', '', true);
    const reversed = await finish(reversal, 'CASH_REFUND');
    expect(reversed.doc.status).toBe('COMPLETED');
    expect(reversed.doc.replacement_sale_id).toBeNull();
    expect(
      (
        await fixture.call(
          '/sales/voids',
          'POST',
          fixture.input(reversibleSale, [], '1'),
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await fixture.call(
          '/sales/voids',
          'POST',
          fixture.input(equalSale, [], '1'),
        )
      ).status,
    ).toBe(409);
    const immutable = await fixture.ok(`/sales/${equalSale.id}`);
    expect(immutable.grand_total).toBe(equalSale.grand_total);
    expect(immutable.items[0].quantity).toBe('1.000');
    expect(
      authSQL(
        `SELECT count(*) FROM stock_balances balance WHERE organization_id='${fixture.org}' AND quantity<>(SELECT COALESCE(sum(quantity_delta),0) FROM stock_movements WHERE organization_id=balance.organization_id AND location_id=balance.location_id AND variant_id=balance.variant_id)`,
      ),
    ).toBe('0');
    for (const [route, doc] of [
      ['/pos/exchanges', multiPosted.doc],
      ['/sales/voids', reversed.doc],
    ] as const) {
      await page.goto(`${route}?document_id=${doc.id}`);
      await expect(
        page.getByRole('heading', { name: 'รายละเอียดเอกสาร', exact: true }),
      ).toBeVisible();
      for (const width of [320, 375, 640, 768, 1024, 1440, 1920]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
        if ([320, 768, 1440].includes(width))
          await page.screenshot({
            path: testInfo.outputPath(
              `${route.replaceAll('/', '-')}-${width}.png`,
            ),
            fullPage: true,
          });
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.returns-print-document')).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' }),
    ).toBeHidden();
    await page.screenshot({
      path: testInfo.outputPath('reversal-acknowledgement-print.png'),
      fullPage: true,
    });
    await page.emulateMedia({ media: 'screen' });
    await page.evaluate(() => {
      window.print = () => {
        throw new Error('Printer unavailable');
      };
    });
    await page
      .getByRole('button', { name: 'พิมพ์ / พิมพ์ซ้ำ', exact: true })
      .click();
    await expect(page.getByRole('alert')).toContainText(
      'รายการที่บันทึกแล้วไม่เปลี่ยนแปลง',
    );
    await page.getByLabel('ภาษา').selectOption('en');
    await expect(
      page.getByRole('heading', {
        name: 'Completed-sale reversals',
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole('combobox', { name: 'สาขาที่ใช้งาน', exact: true })
      .selectOption(fixture.secondBranch);
    await expect(
      page.getByRole('heading', { name: 'Document details', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText(reversed.doc.number, { exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole('combobox', { name: 'สาขาที่ใช้งาน', exact: true })
      .selectOption(fixture.branch);
    const otherOrg = await inventoryCall(
      fixture.owner,
      '/organizations',
      'POST',
      {
        name: 'Browser second tenant',
        code: 'E2E-' + Date.now(),
        business_type: 'RETAIL',
        contact_email: '',
        contact_phone: '',
        address: '',
        branch: {
          name: 'Other',
          code: 'OTHER',
          address: '',
          phone: '',
          email: '',
          status: 'ACTIVE',
        },
      },
    );
    expect(otherOrg.status).toBe(201);
    await page.reload();
    await page
      .getByRole('combobox', { name: 'องค์กรที่ใช้งาน', exact: true })
      .selectOption(otherOrg.data.organization.id);
    await expect(
      page.getByRole('heading', { name: 'รายละเอียดเอกสาร', exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByText(reversed.doc.number, { exact: true }),
    ).toHaveCount(0);
    const deniedStatus = await page.evaluate(
      async ({ org, id }) =>
        (await fetch(`/api/v1/organizations/${org}/exchanges/${id}`)).status,
      { org: otherOrg.data.organization.id, id: equalDoc.id },
    );
    expect(deniedStatus).toBe(404);
    const cashier = await inventoryAccount(fixture.clients);
    inventoryMembership(fixture.org, cashier, 'CASHIER', [fixture.branch]);
    const deniedContext = await browser.newContext({
      baseURL: 'http://localhost:18088',
      proxy: { server: cashier.source.proxy },
    });
    try {
      const separator = cashier.cookie.indexOf('=');
      await deniedContext.addCookies([
        {
          name: cashier.cookie.slice(0, separator),
          value: cashier.cookie.slice(separator + 1),
          url: 'http://localhost:18088',
          httpOnly: true,
          sameSite: 'Lax',
        },
      ]);
      await deniedContext.addInitScript(
        ({ userID, orgID, branchID }) =>
          sessionStorage.setItem(
            `smartpos-context:${userID}`,
            JSON.stringify({ userID, orgID, branchID }),
          ),
        { userID: cashier.id, orgID: fixture.org, branchID: fixture.branch },
      );
      const deniedPage = await deniedContext.newPage();
      await deniedPage.goto(`/sales/voids?document_id=${reversal.id}`);
      await expect(
        deniedPage.getByRole('button', { name: 'อนุมัติ', exact: true }),
      ).toHaveCount(0);
      await expect(
        deniedPage.getByRole('heading', {
          name: 'รายละเอียดเอกสาร',
          exact: true,
        }),
      ).toHaveCount(0);
      expect(
        await deniedPage.evaluate(
          async ({ org, id, csrf }) =>
            (
              await fetch(
                `/api/v1/organizations/${org}/sales/voids/${id}/complete`,
                {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrf,
                    'Idempotency-Key': crypto.randomUUID(),
                  },
                  body: JSON.stringify({ revision: 1 }),
                },
              )
            ).status,
          { org: fixture.org, id: reversal.id, csrf: cashier.csrf },
        ),
      ).toBe(403);
    } finally {
      await deniedContext.close();
    }
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    fixture.close();
  }
});
