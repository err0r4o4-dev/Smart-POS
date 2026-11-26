import { expect, test } from '@playwright/test';
import { purchasingFixture } from '../integration/purchasing-fixtures.mjs';

test.skip(process.env.AUTH_E2E !== '1', 'Requires isolated Phase56 stack');
test('Quality real receiving, verified POS and return, write-off, recall and responsive routes', async ({
  browser,
}, testInfo) => {
  test.setTimeout(360_000);
  const fixture = await purchasingFixture();
  const { owner, org, branch, variant, supplier, warehouse, shelf, terminal } =
    fixture;
  const context = await browser.newContext({
    baseURL: 'http://localhost:18088',
    proxy: { server: owner.source.proxy },
    viewport: { width: 1280, height: 1000 },
  });
  async function ok(path: string, method = 'GET', body?: object, status = 200) {
    const result = await fixture.call(path, method, body);
    expect(result.status, path + ': ' + JSON.stringify(result.error)).toBe(
      status,
    );
    return result.data;
  }
  try {
    const separator = owner.cookie.indexOf('=');
    await context.addCookies([
      {
        name: owner.cookie.slice(0, separator),
        value: owner.cookie.slice(separator + 1),
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
      { userID: owner.id, orgID: org, branchID: branch },
    );
    const page = await context.newPage(),
      errors: string[] = [];
    page.setDefaultTimeout(15_000);
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/inventory/batches');
    await expect(
      page.getByRole('heading', {
        name: 'Batch/Lot · รุ่นสินค้า',
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole('combobox', { name: 'Product Variant', exact: true })
      .nth(1)
      .selectOption(variant.id);
    await page
      .getByLabel('Lot number / เลข lot', { exact: true })
      .fill('UI-OBSERVED-LOT');
    await page
      .getByLabel('Expires on / วันหมดอายุ', { exact: true })
      .fill('2099-01-01');
    await page
      .getByLabel('เหตุผล / Batch reason', { exact: true })
      .fill('Physically inspected synthetic receiving label');
    await page
      .getByRole('button', { name: 'บันทึก lot / Save batch', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'UI-OBSERVED-LOT', exact: true }),
    ).toBeVisible();
    const batch = (
      await ok(`/quality/lots?branch_id=${branch}&variant_id=${variant.id}`)
    ).find(
      (value: { lot_number: string }) => value.lot_number === 'UI-OBSERVED-LOT',
    );
    expect(batch.manufactured_on).toBeNull();
    let order = await ok(
      '/purchasing/orders',
      'POST',
      {
        branch_id: branch,
        supplier_id: supplier.id,
        notes: 'UI receiving fixture',
        items: [
          {
            variant_id: variant.id,
            purchase_unit_id: variant.unit_id,
            quantity: '4',
            unit_cost: '12.00',
          },
        ],
      },
      201,
    );
    for (const action of ['submit', 'approve', 'issue'])
      order = await ok(`/purchasing/orders/${order.id}/${action}`, 'POST', {
        revision: order.revision,
        reason: 'Synthetic inspection',
      });
    await page.goto('/purchasing/receipts');
    await page
      .getByRole('combobox', { name: 'Outstanding PO', exact: true })
      .selectOption(order.id);
    await page
      .getByRole('combobox', { name: 'Destination Warehouse', exact: true })
      .selectOption(warehouse.id);
    await page
      .getByRole('combobox', { name: 'Batch/Lot 1', exact: true })
      .selectOption(batch.id);
    await expect(
      page.getByRole('checkbox', { name: /Physically verified selected lot/ }),
    ).not.toBeChecked();
    await page
      .getByRole('checkbox', { name: /Physically verified selected lot/ })
      .check();
    await page
      .getByRole('button', { name: 'บันทึก Receipt Draft', exact: true })
      .click();
    for (const action of ['submit', 'approve', 'post']) {
      await page.getByRole('button', { name: action, exact: true }).click();
      await expect(
        page.getByRole('button', { name: action, exact: true }),
      ).toHaveCount(0);
    }
    const receipts = await ok(`/purchasing/receipts?branch_id=${branch}`);
    expect(
      (await ok(`/purchasing/receipts/${receipts.items[0].id}`)).items[0]
        .batch_id,
    ).toBe(batch.id);
    let transfer = await ok(
      '/inventory/transfers',
      'POST',
      {
        location_id: warehouse.id,
        destination_location_id: shelf.id,
        reason_code: 'PHYSICAL_LOT',
        notes: '',
        items: [
          {
            variant_id: variant.id,
            quantity: '2',
            batch_id: batch.id,
            batch_verified: true,
          },
        ],
      },
      201,
    );
    for (const action of ['submit', 'approve', 'dispatch'])
      transfer = await ok(
        `/inventory/transfers/${transfer.id}/${action}`,
        'POST',
        { revision: transfer.revision },
      );
    await ok(
      '/pos/shifts/open',
      'POST',
      { terminal_id: terminal.id, opening_cash: '100.00' },
      201,
    );
    await page.goto('/pos');
    await page
      .getByRole('button', { name: 'เพิ่ม INV-ONE', exact: true })
      .click();
    await page
      .getByRole('combobox', { name: 'Batch/Lot INV-ONE', exact: true })
      .selectOption(batch.id);
    await expect(
      page.getByRole('button', { name: /Apply lot/ }),
    ).toBeDisabled();
    await page
      .getByRole('checkbox', { name: /Physically verified selected lot/ })
      .check();
    await page.getByRole('button', { name: /Apply lot/ }).click();
    await expect(
      page.getByRole('combobox', { name: 'Batch/Lot INV-ONE', exact: true }),
    ).toHaveValue(batch.id);
    await page
      .getByRole('button', { name: 'เพิ่มจำนวน INV-ONE', exact: true })
      .click();
    await expect(
      page.getByRole('textbox', { name: 'จำนวน INV-ONE', exact: true }),
    ).toHaveValue('2.000');
    await expect(
      page.getByRole('combobox', { name: 'Batch/Lot INV-ONE', exact: true }),
    ).toHaveValue(batch.id);
    await page.getByRole('button', { name: 'ลด INV-ONE', exact: true }).click();
    await expect(
      page.getByRole('textbox', { name: 'จำนวน INV-ONE', exact: true }),
    ).toHaveValue('1.000');
    await page.getByRole('link', { name: 'ชำระเงิน', exact: true }).click();
    await page.getByLabel('เงินรับ', { exact: true }).fill('2.00');
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
    const sale = (await ok(`/sales?branch_id=${branch}`)).items[0];
    expect((await ok(`/sales/${sale.id}`)).items[0].batch_id).toBe(batch.id);
    await page.goto('/pos/returns');
    await page
      .getByRole('combobox', { name: 'เลือก', exact: true })
      .selectOption(sale.id);
    await page.getByLabel('จำนวนคืน INV-ONE', { exact: true }).fill('1');
    await page
      .getByRole('combobox', { name: 'Return Batch/Lot INV-ONE', exact: true })
      .selectOption(batch.id);
    await page
      .getByRole('checkbox', { name: /Physically verified selected lot/ })
      .check();
    await page
      .getByLabel('เหตุผลคืนสินค้า / หลักฐานตรวจสภาพ')
      .fill('Inspected physical original batch');
    await page
      .getByRole('button', { name: 'บันทึกฉบับร่างคืนสินค้า', exact: true })
      .click();
    await page
      .getByRole('button', { name: 'ส่งขออนุมัติ', exact: true })
      .click();
    await page.getByRole('button', { name: 'อนุมัติ', exact: true }).click();
    await page
      .getByRole('button', { name: 'ลงบัญชีคืนสินค้าที่อนุมัติ' })
      .click();
    await expect(
      page.getByText('COMPLETED', { exact: true }).first(),
    ).toBeVisible();
    await page.goto('/inventory/write-offs');
    const balances = await ok(
      `/quality/batches?branch_id=${branch}&variant_id=${variant.id}&location_id=${warehouse.id}`,
    );
    const balance = balances.find(
      (value: { batch_id: string }) => value.batch_id === batch.id,
    );
    await page
      .getByRole('combobox', { name: 'Stock / สต็อกที่ตรวจพบ', exact: true })
      .selectOption(balance.id);
    await page
      .getByLabel('เหตุผล / Write-off reason', { exact: true })
      .fill('Observed synthetic loss');
    await page.getByRole('checkbox', { name: /สินค้า\/location\/lot/ }).check();
    await page
      .getByRole('button', {
        name: 'ส่งขออนุมัติ / Request approval',
        exact: true,
      })
      .click();
    await page
      .getByRole('button', { name: 'อนุมัติ / Approve', exact: true })
      .click();
    await page
      .getByRole('button', {
        name: 'ยืนยันตัดสต็อก / Post write-off',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('heading', { name: /^POSTED ·/ }),
    ).toBeVisible();
    await page.goto('/inventory/recalls');
    await page
      .getByRole('combobox', { name: 'Product Variant', exact: true })
      .nth(1)
      .selectOption(variant.id);
    await page
      .getByRole('combobox', { name: 'Recall scope / ขอบเขต', exact: true })
      .selectOption(batch.id);
    await page
      .getByLabel('เหตุผล / Recall reason', { exact: true })
      .fill('Observed synthetic recall');
    await page
      .getByRole('checkbox', { name: /Confirm immediate sale block/ })
      .check();
    await page
      .getByRole('button', {
        name: 'เปิดเรียกคืน / Activate recall',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('heading', { name: /^ACTIVE RECALL/ }),
    ).toBeVisible();
    const expired = await ok(
      '/quality/batches',
      'POST',
      {
        variant_id: variant.id,
        lot_number: 'UI-EXPIRED-LOT',
        expires_on: '2000-01-01',
        manufactured_on: null,
        reason: 'Synthetic expired receiving label',
      },
      201,
    );
    let lossStock = await ok(
      '/inventory/adjustments',
      'POST',
      {
        location_id: warehouse.id,
        adjustment_type: 'INCREASE',
        reason_code: 'OBSERVED_EXPIRED',
        notes: '',
        items: [
          {
            variant_id: variant.id,
            quantity: '1',
            batch_id: expired.id,
            batch_verified: true,
          },
        ],
      },
      201,
    );
    for (const action of ['submit', 'approve', 'post'])
      lossStock = await ok(
        `/inventory/adjustments/${lossStock.id}/${action}`,
        'POST',
        { revision: lossStock.revision },
      );
    for (const view of ['batches', 'expiry', 'write-offs', 'recalls']) {
      await page.goto('/inventory/' + view);
      await expect(page.locator('.quality-page h1')).toBeVisible();
      if (view === 'expiry')
        await expect(
          page.getByRole('heading', { name: 'UI-EXPIRED-LOT', exact: true }),
        ).toBeVisible();
      for (const width of [320, 375, 768, 1280, 1920]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        ).toBe(true);
        if (width === 320 || width === 1280)
          await page.screenshot({
            path: testInfo.outputPath(`quality-${view}-${width}.png`),
            fullPage: true,
          });
      }
      await page.keyboard.press('Tab');
      expect(await page.locator(':focus').count()).toBe(1);
    }
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    fixture.close();
  }
});
