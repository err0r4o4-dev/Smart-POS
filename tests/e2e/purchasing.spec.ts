import { expect, test, type BrowserContext } from '@playwright/test';
import { purchasingFixture } from '../integration/purchasing-fixtures.mjs';
import {
  inventoryAccount,
  inventoryMembership,
} from '../integration/inventory-fixtures.mjs';

test.skip(
  process.env.AUTH_E2E !== '1',
  'Requires isolated smartpos-auth-test stack',
);
test('Phase 4: real purchasing UI, shelf workflows, permissions and responsive views', async ({
  browser,
}, testInfo) => {
  test.setTimeout(360_000);
  const fixture = await purchasingFixture(),
    contexts: BrowserContext[] = [],
    errors: string[] = [];
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
        sessionStorage.setItem(
          `smartpos-context:${userID}`,
          JSON.stringify({ userID, orgID, branchID }),
        );
      },
      { userID: user.id, orgID: fixture.org, branchID: fixture.branch },
    );
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', (error) => errors.push(error.message));
    return page;
  }
  try {
    const page = await client();
    await page.goto('/suppliers');
    await expect(
      page.getByRole('heading', { name: 'Supplier', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByText('Phase 4 Supplier', { exact: true }),
    ).toBeVisible();
    await page
      .getByRole('textbox', { name: 'code', exact: true })
      .fill('UI-SUP');
    await page
      .getByRole('textbox', { name: 'name', exact: true })
      .fill('UI supplier');
    await page
      .getByRole('button', { name: 'บันทึก Supplier', exact: true })
      .click();
    await expect(page.getByText('UI supplier', { exact: true })).toBeVisible();
    await page.goto('/purchasing/orders/new');
    await page
      .getByRole('combobox', { name: 'Supplier', exact: true })
      .selectOption(fixture.supplier.id);
    await page
      .getByRole('combobox', { name: 'Supplier Product 1', exact: true })
      .selectOption(fixture.variant.id);
    await page
      .getByRole('textbox', { name: 'Quantity 1', exact: true })
      .fill('10');
    await page
      .getByRole('button', { name: 'บันทึก PO Draft', exact: true })
      .click();
    await expect(page).toHaveURL(/\/purchasing\/orders\/[a-f0-9-]+$/);
    const orderID = page.url().split('/').at(-1)!;
    for (const action of ['submit', 'approve', 'issue']) {
      if (action === 'issue')
        await page
          .getByRole('textbox', {
            name: 'Action reason / issuing evidence',
            exact: true,
          })
          .fill('Local UI issuing evidence');
      await page.getByRole('button', { name: action, exact: true }).click();
      await expect(
        page.getByRole('button', { name: action, exact: true }),
      ).toHaveCount(0);
    }
    await expect(
      page.getByRole('heading', { name: /· ORDERED$/ }),
    ).toBeVisible();
    await page.goto('/purchasing/receipts');
    await page
      .getByRole('combobox', { name: 'Outstanding PO', exact: true })
      .selectOption(orderID);
    await page
      .getByRole('combobox', { name: 'Destination Warehouse', exact: true })
      .selectOption(fixture.warehouse.id);
    await page
      .getByRole('textbox', { name: 'Accepted 1', exact: true })
      .fill('10');
    await page
      .getByRole('textbox', { name: 'delivered_quantity 1', exact: true })
      .fill('10');
    await page
      .getByRole('button', { name: 'บันทึก Receipt Draft', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'submit', exact: true }),
    ).toBeVisible();
    for (const action of ['submit', 'approve', 'post']) {
      await page.getByRole('button', { name: action, exact: true }).click();
      await expect(
        page.getByRole('button', { name: action, exact: true }),
      ).toHaveCount(0);
    }
    const receipts = await fixture.call(
      `/purchasing/receipts?branch_id=${fixture.branch}`,
    );
    const receipt = receipts.data.items[0];
    expect(receipt.status).toBe('POSTED');
    await page.goto('/purchasing/returns');
    await page
      .getByRole('combobox', { name: 'Posted Receipt', exact: true })
      .selectOption(receipt.id);
    await page
      .getByRole('combobox', { name: 'Return Source Location', exact: true })
      .selectOption(fixture.warehouse.id);
    await page
      .getByRole('textbox', { name: 'Return quantity 1', exact: true })
      .fill('1');
    await page
      .getByRole('textbox', { name: 'Variance / return reason 1', exact: true })
      .fill('UI return test');
    await page
      .getByRole('button', {
        name: 'บันทึก Supplier Return Draft',
        exact: true,
      })
      .click();
    for (const action of ['submit', 'approve', 'dispatch']) {
      await page.getByRole('button', { name: action, exact: true }).click();
      await expect(
        page.getByRole('button', { name: action, exact: true }),
      ).toHaveCount(0);
    }
    await page.goto('/shelves/new');
    await page
      .getByRole('textbox', { name: 'Shelf Code', exact: true })
      .fill('UI-SHELF');
    await page
      .getByRole('textbox', { name: 'Shelf Name', exact: true })
      .fill('UI shelf');
    await page
      .getByRole('combobox', { name: 'Inventory Shelf Location', exact: true })
      .selectOption(fixture.shelf.id);
    await page
      .getByRole('button', { name: 'บันทึกชั้นวาง', exact: true })
      .click();
    await expect(page).toHaveURL(/\/shelves\/[a-f0-9-]+$/);
    const shelfID = page.url().split('/').at(-1)!;
    await page
      .getByRole('textbox', { name: 'Slot Code', exact: true })
      .fill('UI1');
    await page.getByRole('button', { name: 'เพิ่ม Slot', exact: true }).click();
    const shelfResult = await fixture.call('/shelves/' + shelfID);
    await page
      .getByRole('combobox', { name: 'Slot', exact: true })
      .selectOption(shelfResult.data.slots[0].id);
    await page
      .getByRole('combobox', { name: 'Product Variant', exact: true })
      .selectOption(fixture.variant.id);
    await page
      .getByRole('textbox', { name: 'Minimum quantity', exact: true })
      .fill('10');
    await page
      .getByRole('textbox', { name: 'Target quantity', exact: true })
      .fill('20');
    await page
      .getByRole('textbox', { name: 'Capacity quantity', exact: true })
      .fill('24');
    await page
      .getByRole('button', { name: 'บันทึก Assignment', exact: true })
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'แก้ไข Assignment · INV-ONE',
        exact: true,
      }),
    ).toBeVisible();
    await page.goto('/shelves/replenishments');
    await page.getByRole('button', { name: 'สร้าง Task', exact: true }).click();
    await page
      .getByRole('combobox', { name: 'ผู้รับผิดชอบ Task', exact: true })
      .selectOption(fixture.owner.id);
    await page
      .getByRole('button', { name: 'มอบหมาย Task', exact: true })
      .click();
    await page.getByRole('button', { name: 'เริ่ม Task', exact: true }).click();
    await expect(
      page.getByRole('button', {
        name: 'Complete Task / Post Transfer',
        exact: true,
      }),
    ).toBeDisabled();
    await page
      .getByRole('checkbox', { name: 'ยืนยันย้ายสินค้าจริง', exact: false })
      .check();
    await page
      .getByRole('button', {
        name: 'Complete Task / Post Transfer',
        exact: true,
      })
      .click();
    await expect(
      page.getByRole('link', {
        name: 'เปิด Native Inventory Transfer',
        exact: true,
      }),
    ).toBeVisible();
    const routes = [
      '/suppliers',
      '/suppliers/' + fixture.supplier.id,
      '/purchasing/orders',
      '/purchasing/orders/new',
      '/purchasing/orders/' + orderID,
      '/purchasing/receipts',
      '/purchasing/returns',
      '/purchasing/suggestions',
      '/shelves',
      '/shelves/new',
      '/shelves/' + shelfID,
      '/shelves/layout',
      '/shelves/replenishments',
      '/shelves/counts',
      '/shelves/discrepancies',
    ];
    for (const width of [320, 375, 640, 768, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const route of routes) {
        await page.goto(route);
        await expect(page.locator('main h1').first()).toBeVisible();
        await expect(
          page.getByText('Checking service readiness...', { exact: true }),
        ).toHaveCount(0);
        await expect(page.getByRole('alert')).toHaveCount(0);
        await expect
          .poll(() =>
            page.evaluate(
              () =>
                document.documentElement.scrollWidth <= window.innerWidth + 1,
            ),
          )
          .toBe(true);
      }
      if ([320, 768, 1440].includes(width)) {
        await page.goto('/shelves/' + shelfID);
        await expect(
          page.getByRole('heading', {
            name: 'แก้ไข Assignment · INV-ONE',
            exact: true,
          }),
        ).toBeVisible();
        await page.screenshot({
          path: testInfo.outputPath(`shelf-${width}.png`),
          fullPage: true,
        });
        await page.goto('/purchasing/orders/' + orderID);
        await expect(
          page.getByRole('heading', { name: /· RECEIVED$/ }),
        ).toBeVisible();
        await page.screenshot({
          path: testInfo.outputPath(`order-${width}.png`),
          fullPage: true,
        });
      }
    }
    const cashier = await inventoryAccount(fixture.clients);
    inventoryMembership(fixture.org, cashier, 'CASHIER', [fixture.branch]);
    const denied = await client(cashier);
    await denied.goto('/purchasing/orders');
    await expect(
      denied.getByText('403 · ACCESS DENIED', { exact: true }),
    ).toBeVisible();
    await denied.goto('/shelves');
    await expect(
      denied.getByText('403 · ACCESS DENIED', { exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    fixture.close();
  }
});
