import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import {
  inventoryAccount,
  inventoryCall,
  inventoryFixture,
  inventoryMembership,
} from '../integration/inventory-fixtures.mjs';
import type {
  InventoryDocument,
  InventoryPageData,
  StockBalance,
  StockLocation,
} from '../../apps/web/src/lib/inventory-api';

test.skip(
  process.env.AUTH_E2E !== '1',
  'Requires isolated smartpos-auth-test stack',
);
test('Phase 2: inventory workflows, permission boundaries and ten responsive routes', async ({
  browser,
}) => {
  test.setTimeout(360_000);
  const fixture = await inventoryFixture();
  const contexts: BrowserContext[] = [];
  const errors: string[] = [];
  const base = 'http://localhost:18088';
  async function client(user = fixture.owner) {
    const context = await browser.newContext({
      baseURL: base,
      proxy: { server: user.source.proxy },
      viewport: { width: 1440, height: 1000 },
    });
    contexts.push(context);
    const separator = user.cookie.indexOf('=');
    await context.addCookies([
      {
        name: user.cookie.slice(0, separator),
        value: user.cookie.slice(separator + 1),
        url: base,
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
  async function read<Result>(suffix: string): Promise<Result> {
    const result = await inventoryCall(
      fixture.owner,
      fixture.inventory + suffix,
    );
    expect(result.status).toBe(200);
    return result.data;
  }
  async function stock(location: string) {
    const result = await read<InventoryPageData<StockBalance>>(
      `/balances?location_id=${location}&variant_id=${fixture.variant.id}`,
    );
    return result.items[0]?.quantity ?? '0.000';
  }
  async function saved(page: Page) {
    await expect(
      page.getByRole('status').filter({ hasText: 'บันทึกแล้ว' }),
    ).toBeVisible();
  }
  async function command(
    page: Page,
    resource: string,
    location: string,
    quantity?: string,
    destination?: string,
    destinationBranch?: string,
  ) {
    await page.goto('/inventory/' + resource);
    await page
      .getByRole('combobox', { name: 'Source / Count Location', exact: true })
      .selectOption(location);
    if (resource === 'transfers') {
      await page
        .getByRole('combobox', { name: 'Destination branch', exact: true })
        .selectOption(destinationBranch ?? fixture.branch);
      await page
        .getByRole('combobox', { name: 'Destination location', exact: true })
        .selectOption(destination!);
    }
    await page
      .getByRole('combobox', { name: 'Product Variant', exact: true })
      .selectOption(fixture.variant.id);
    if (quantity)
      await page.getByLabel('Quantity 1', { exact: true }).fill(quantity);
    await page
      .getByLabel('Reason / Reference', { exact: true })
      .fill('E2E-' + randomUUID().slice(0, 8));
    await page
      .getByRole('button', { name: 'สร้างเอกสาร', exact: true })
      .click();
    await saved(page);
    const list = await read<InventoryPageData<InventoryDocument>>(
      '/' + resource,
    );
    return list.items[0];
  }
  async function action(page: Page, name: string) {
    if (['post', 'dispatch', 'receive'].includes(name))
      page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('button', { name, exact: true })).toHaveCount(
      0,
    );
  }
  try {
    const owner = await client();
    let warehouse!: StockLocation;
    let shelf!: StockLocation;
    await test.step('E2E 01/02: create warehouse and shelf via real forms', async () => {
      await owner.goto('/inventory/locations');
      await owner.getByLabel('Location code', { exact: true }).fill('E2E_WH');
      await owner
        .getByLabel('Location name', { exact: true })
        .fill('E2E Warehouse');
      await owner
        .getByRole('button', { name: 'บันทึก Location', exact: true })
        .click();
      await saved(owner);
      warehouse = (
        await read<InventoryPageData<StockLocation>>('/locations?search=E2E_WH')
      ).items[0];
      await owner
        .getByLabel('Location code', { exact: true })
        .fill('E2E_SHELF');
      await owner
        .getByLabel('Location name', { exact: true })
        .fill('E2E Shelf');
      await owner
        .getByRole('combobox', { name: 'Location type', exact: true })
        .selectOption('SHELF');
      await owner
        .getByRole('combobox', {
          name: 'Parent location (navigation only)',
          exact: true,
        })
        .selectOption(warehouse.id);
      await owner
        .getByRole('button', { name: 'บันทึก Location', exact: true })
        .click();
      await expect
        .poll(
          async () =>
            (
              await read<InventoryPageData<StockLocation>>(
                '/locations?search=E2E_SHELF',
              )
            ).total,
        )
        .toBe(1);
      shelf = (
        await read<InventoryPageData<StockLocation>>(
          '/locations?search=E2E_SHELF',
        )
      ).items[0];
    });
    await test.step('E2E 03/04: opening commits exact stock and renders balance', async () => {
      await owner.goto('/inventory/balances');
      await owner
        .getByRole('combobox', { name: 'Source / Count Location', exact: true })
        .selectOption(warehouse.id);
      await owner
        .getByRole('combobox', { name: 'Product Variant', exact: true })
        .selectOption(fixture.variant.id);
      await owner.getByLabel('Quantity 1', { exact: true }).fill('10');
      await owner
        .getByLabel('Reason / Reference', { exact: true })
        .fill('INITIAL');
      owner.once('dialog', (dialog) => dialog.accept());
      await owner
        .getByRole('button', { name: 'Post Opening Balance', exact: true })
        .click();
      await saved(owner);
      expect(await stock(warehouse.id)).toBe('10.000');
      await expect(
        owner.getByRole('cell', {
          name: '10.000 PCS 0.000 / 0.000',
          exact: true,
        }),
      ).toBeVisible();
    });
    await test.step('E2E 05/06: same-branch transfer and immutable movement history', async () => {
      await command(owner, 'transfers', warehouse.id, '3', shelf.id);
      await action(owner, 'submit');
      await action(owner, 'approve');
      await action(owner, 'dispatch');
      expect(await stock(warehouse.id)).toBe('7.000');
      expect(await stock(shelf.id)).toBe('3.000');
      await owner.goto('/inventory/movements');
      await expect(
        owner.getByRole('cell', { name: 'TRANSFER_OUT', exact: true }),
      ).toBeVisible();
      await expect(
        owner.getByRole('cell', { name: 'TRANSFER_IN', exact: true }),
      ).toBeVisible();
    });
    await test.step('E2E 07: approved adjustment posts once', async () => {
      await command(owner, 'adjustments', shelf.id, '2');
      await action(owner, 'submit');
      await action(owner, 'approve');
      await action(owner, 'post');
      expect(await stock(shelf.id)).toBe('5.000');
    });
    let count!: InventoryDocument;
    await test.step('E2E 09/10: physical count does not mutate stock before reconciliation', async () => {
      count = await command(owner, 'counts', shelf.id);
      await owner
        .getByLabel(`Counted ${fixture.variant.sku}`, { exact: true })
        .fill('7');
      await owner
        .getByRole('button', { name: 'Save Physical Count', exact: true })
        .click();
      await expect(
        owner.getByRole('cell', { name: '2.000 40.00%' }),
      ).toBeVisible();
      expect(await stock(shelf.id)).toBe('5.000');
      await action(owner, 'submit');
      await action(owner, 'approve');
      await action(owner, 'post');
      expect(await stock(shelf.id)).toBe('7.000');
    });
    await test.step('E2E 11: stale count conflicts without overwriting current stock', async () => {
      const stale = await command(owner, 'counts', shelf.id);
      await owner
        .getByLabel(`Counted ${fixture.variant.sku}`, { exact: true })
        .fill('8');
      await owner
        .getByRole('button', { name: 'Save Physical Count', exact: true })
        .click();
      await expect(
        owner.getByRole('cell', { name: '1.000 14.28%' }),
      ).toBeVisible();
      await action(owner, 'submit');
      await action(owner, 'approve');
      let adjustment = await inventoryCall(
        fixture.owner,
        fixture.inventory + '/adjustments',
        'POST',
        {
          location_id: shelf.id,
          reason_code: 'STALE',
          adjustment_type: 'INCREASE',
          items: [{ variant_id: fixture.variant.id, quantity: '1' }],
        },
      );
      for (const step of ['submit', 'approve', 'post'])
        adjustment = await inventoryCall(
          fixture.owner,
          `${fixture.inventory}/adjustments/${adjustment.data.id}/${step}`,
          'POST',
          { revision: adjustment.data.revision },
        );
      expect(adjustment.status).toBe(200);
      owner.once('dialog', (dialog) => dialog.accept());
      await owner.getByRole('button', { name: 'post', exact: true }).click();
      await expect(owner.getByRole('alert')).toContainText('stale');
      expect(await stock(shelf.id)).toBe('8.000');
      expect(
        (await read<InventoryDocument>('/counts/' + stale.id)).status,
      ).toBe('APPROVED');
    });
    let transfer!: InventoryDocument;
    let receiptKey = '';
    await test.step('E2E 12/13: dispatch in-transit stock and receive in destination branch', async () => {
      transfer = await command(
        owner,
        'transfers',
        warehouse.id,
        '2',
        fixture.destination.id,
        fixture.secondBranch,
      );
      await action(owner, 'submit');
      await action(owner, 'approve');
      await action(owner, 'dispatch');
      transfer = await read<InventoryDocument>('/transfers/' + transfer.id);
      expect(transfer.status).toBe('DISPATCHED');
      expect(await stock(transfer.transit_location_id!)).toBe('2.000');
      await owner
        .getByLabel('สาขาที่ใช้งาน', { exact: true })
        .selectOption(fixture.secondBranch);
      await owner.goto('/inventory/transfers/' + transfer.id);
      const receiptRequest = owner.waitForRequest(
        (request) =>
          request.url().endsWith(`/transfers/${transfer.id}/receive`) &&
          request.method() === 'POST',
      );
      await action(owner, 'receive');
      receiptKey = (await receiptRequest).headers()['idempotency-key'];
      expect(await stock(fixture.destination.id)).toBe('2.000');
      expect(await stock(transfer.transit_location_id!)).toBe('0.000');
    });
    await test.step('E2E 14: exact duplicate receive retries do not duplicate stock', async () => {
      const input = { revision: transfer.revision };
      const retry = await inventoryCall(
        fixture.owner,
        `${fixture.inventory}/transfers/${transfer.id}/receive`,
        'POST',
        input,
        receiptKey,
      );
      expect(retry.status).toBe(200);
      expect(
        (
          await inventoryCall(
            fixture.owner,
            `${fixture.inventory}/transfers/${transfer.id}/receive`,
            'POST',
            input,
            receiptKey,
          )
        ).status,
      ).toBe(200);
      expect(await stock(fixture.destination.id)).toBe('2.000');
    });
    await test.step('E2E 15: negative-stock dispatch fails with unchanged balances', async () => {
      await owner
        .getByLabel('สาขาที่ใช้งาน', { exact: true })
        .selectOption(fixture.branch);
      await command(owner, 'transfers', warehouse.id, '1000', shelf.id);
      await action(owner, 'submit');
      await action(owner, 'approve');
      owner.once('dialog', (dialog) => dialog.accept());
      await owner
        .getByRole('button', { name: 'dispatch', exact: true })
        .click();
      await expect(owner.getByRole('alert')).toContainText('Insufficient');
      expect(await stock(warehouse.id)).toBe('5.000');
    });
    await test.step('E2E 18: reorder point persisted and live low-stock policy evaluated', async () => {
      await owner.goto('/inventory/reorder-points');
      await owner
        .getByRole('combobox', { name: 'Product Variant', exact: true })
        .selectOption(fixture.variant.id);
      await owner.getByLabel('Minimum Quantity', { exact: true }).fill('20');
      await owner.getByLabel('Target Quantity', { exact: true }).fill('30');
      await owner
        .getByRole('button', { name: 'Save Reorder Point', exact: true })
        .click();
      await saved(owner);
      await expect(
        owner.getByRole('cell', { name: 'ต่ำกว่าจุดสั่งซื้อ', exact: true }),
      ).toBeVisible();
      await owner.goto('/inventory');
      await expect(
        owner.getByRole('heading', {
          name: 'Low-stock variants (branch reorder policy)',
        }),
      ).toBeVisible();
    });
    await test.step('E2E 08/16/17: cashier sees only assigned branch and no mutation controls', async () => {
      const cashier = await inventoryAccount(fixture.clients);
      inventoryMembership(fixture.org, cashier, 'CASHIER', [fixture.branch]);
      const reader = await client(cashier);
      await reader.goto('/inventory/balances');
      await expect(
        reader.getByRole('heading', { level: 1, name: 'ยอดสต็อก' }),
      ).toBeVisible();
      await expect(
        reader.getByRole('button', {
          name: 'Post Opening Balance',
          exact: true,
        }),
      ).toHaveCount(0);
      await reader.goto('/inventory/adjustments');
      await expect(
        reader.getByRole('button', { name: 'สร้างเอกสาร', exact: true }),
      ).toHaveCount(0);
      await expect(
        reader
          .getByLabel('สาขาที่ใช้งาน', { exact: true })
          .locator('option:not(:disabled)'),
      ).toHaveCount(1);
      const denied = await inventoryCall(
        cashier,
        fixture.inventory + '/balances?branch_id=' + fixture.secondBranch,
      );
      expect(denied.status).toBe(403);
      const stranger = await inventoryAccount(fixture.clients);
      expect(
        (await inventoryCall(stranger, fixture.inventory + '/balances')).status,
      ).toBe(404);
    });
    await test.step('E2E 19: organization switching clears inventory data and form state', async () => {
      const another = await inventoryCall(
        fixture.owner,
        '/organizations',
        'POST',
        {
          name: 'Empty inventory tenant',
          code: 'EMPTY-' + randomUUID().slice(0, 8).toUpperCase(),
          business_type: 'RETAIL',
          branch: { name: 'Empty branch', code: 'MAIN', status: 'ACTIVE' },
        },
      );
      expect(another.status).toBe(201);
      await owner.reload();
      await owner
        .getByLabel('องค์กรที่ใช้งาน', { exact: true })
        .selectOption(another.data.organization.id);
      await owner.goto('/inventory/balances');
      await expect(
        owner.getByText('ยังไม่มีข้อมูลในขอบเขตนี้', { exact: false }),
      ).toBeVisible();
      await expect(
        owner.getByRole('cell', { name: new RegExp(fixture.variant.sku) }),
      ).toHaveCount(0);
      await owner
        .getByLabel('องค์กรที่ใช้งาน', { exact: true })
        .selectOption(fixture.org);
    });
    await test.step('E2E 20: ten routes at seven widths, no errors/overflow, keyboard and screenshots', async () => {
      const routes = [
        '/inventory',
        '/inventory/balances',
        '/inventory/locations',
        '/inventory/movements',
        '/inventory/adjustments',
        '/inventory/counts',
        '/inventory/counts/' + count.id,
        '/inventory/transfers',
        '/inventory/transfers/' + transfer.id,
        '/inventory/reorder-points',
      ];
      for (const width of [320, 375, 640, 768, 1024, 1440, 1920]) {
        await owner.setViewportSize({ width, height: 1000 });
        for (const route of routes) {
          await owner.goto(route);
          await expect(owner.getByRole('heading', { level: 1 })).toBeVisible();
          await expect(
            owner.getByText('กำลังโหลด', { exact: false }),
          ).toHaveCount(0);
          await expect(owner.locator('body')).toHaveJSProperty(
            'scrollWidth',
            width,
          );
          await expect(owner.getByRole('alert')).toHaveCount(0);
          if ([375, 1440].includes(width))
            await owner.screenshot({
              path: `test-results/inventory-${route.split('/').slice(2, 3).join('') || 'overview'}-${route.includes(count.id) || route.includes(transfer.id) ? 'detail-' : ''}${width}.png`,
              fullPage: true,
            });
        }
      }
      await owner.setViewportSize({ width: 375, height: 812 });
      await owner.getByRole('button', { name: 'Open navigation' }).click();
      await expect(owner.getByRole('dialog')).toBeVisible();
      await owner.keyboard.press('Escape');
      await expect(owner.getByRole('dialog')).toHaveCount(0);
      expect(errors).toEqual([]);
    });
    await test.step('E2E 21: protected inventory routes require a real session', async () => {
      const anonymous = await browser.newContext({
        baseURL: base,
        proxy: { server: fixture.owner.source.proxy },
      });
      contexts.push(anonymous);
      const page = await anonymous.newPage();
      await page.goto('/inventory');
      await expect(page).toHaveURL(/\/login\?returnTo=%2Finventory/);
      await page.goto('/inventory/valuation');
      await expect(
        page.getByRole('heading', { name: 'Nothing on this shelf.' }),
      ).toBeVisible();
    });
  } finally {
    for (const context of contexts) await context.close();
    fixture.close();
  }
});
