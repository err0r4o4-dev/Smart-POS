import { expect, test, type Browser, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { customersFixture } from '../integration/customers-fixtures.mjs';
import {
  inventoryAccount,
  inventoryMembership,
  inventoryCall,
} from '../integration/inventory-fixtures.mjs';
import { authSQL } from '../integration/auth-fixtures.mjs';

test.skip(
  process.env.AUTH_E2E !== '1',
  'Requires isolated smartpos-auth-test stack',
);
type Fixture = Awaited<ReturnType<typeof customersFixture>>;
async function session(
  browser: Browser,
  fixture: Fixture,
  user = fixture.owner,
) {
  const context = await browser.newContext({
    baseURL: 'http://localhost:18088',
    proxy: { server: user.source.proxy },
    viewport: { width: 1280, height: 1000 },
  });
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
      const key = `smartpos-context:${userID}`;
      if (!sessionStorage.getItem(key))
        sessionStorage.setItem(
          key,
          JSON.stringify({ userID, orgID, branchID }),
        );
    },
    { userID: user.id, orgID: fixture.org, branchID: fixture.branch },
  );
  context.setDefaultTimeout(15_000);
  return context;
}
async function settle(page: Page) {
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
  await page
    .getByRole('link', { name: 'ดูรายการขายและพิมพ์ใบเสร็จ', exact: true })
    .click();
}
test('Phase 5.4 real CRUD, groups, POS, history, archive and responsive layouts', async ({
  browser,
}, testInfo) => {
  test.setTimeout(240_000);
  const fixture = await customersFixture();
  const context = await session(browser, fixture);
  try {
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/customers');
    await expect(
      page.getByText('ไม่พบลูกค้า ลองเปลี่ยนคำค้นหาหรือเพิ่มลูกค้า', {
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'เพิ่มลูกค้า', exact: true })
      .click();
    await page.getByLabel('รหัสลูกค้า', { exact: true }).fill('E2E-CUSTOMER');
    await page
      .getByLabel('ชื่อ', { exact: true })
      .fill('Synthetic private customer');
    await page.getByLabel('โทรศัพท์', { exact: true }).fill('0812345678');
    await expect(
      page.getByRole('checkbox', { name: 'ลูกค้ายินยอมรับการตลาดอย่างชัดเจน' }),
    ).not.toBeChecked();
    await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
    await page
      .getByRole('link', { name: /Synthetic private customer.*E2E-CUSTOMER/ })
      .click();
    const detail = new URL(page.url()).pathname;
    const customerID = detail.split('/').at(-1)!;
    await page
      .getByLabel('ชื่อ', { exact: true })
      .fill('Updated synthetic customer');
    await page.getByRole('button', { name: 'บันทึก', exact: true }).click();
    await expect(
      page.getByRole('heading', {
        name: 'E2E-CUSTOMER · Updated synthetic customer',
      }),
    ).toBeVisible();
    await page.goto('/customers/groups');
    await page.getByLabel('รหัสกลุ่ม', { exact: true }).fill('E2E-GROUP');
    await page.getByLabel('ชื่อกลุ่ม', { exact: true }).fill('Synthetic group');
    await page
      .getByRole('button', { name: 'บันทึกกลุ่ม', exact: true })
      .click();
    const groupCard = page
      .locator('.customer-record')
      .filter({ hasText: 'E2E-GROUP' });
    await expect(groupCard).toContainText('0 สมาชิก');
    await groupCard.getByRole('button', { name: 'แก้ไขกลุ่ม' }).click();
    await page.getByLabel('ชื่อกลุ่ม', { exact: true }).fill('Updated group');
    await page
      .getByRole('button', { name: 'บันทึกกลุ่ม', exact: true })
      .click();
    await expect(groupCard).toContainText('Updated group');
    await page.goto(detail);
    await page
      .getByRole('button', {
        name: 'เพิ่มเข้ากลุ่ม Updated group',
        exact: true,
      })
      .click();
    await expect(page.locator('.customer-membership')).toContainText(
      'Updated group',
    );
    await page.goto('/customers/groups');
    await expect(groupCard).toContainText('1 สมาชิก');
    await groupCard
      .getByRole('link', { name: '1 สมาชิก', exact: true })
      .click();
    await expect(page.locator('table.record-table tbody tr')).toHaveCount(1);
    await expect(page.locator('table.record-table tbody tr')).toContainText(
      'E2E-CUSTOMER',
    );
    await page.goto('/pos');
    await page
      .getByRole('button', { name: 'เพิ่ม INV-ONE', exact: true })
      .click();
    const picker = page.getByRole('region', {
      name: 'ลูกค้า / Customer',
      exact: true,
    });
    await expect(picker).toContainText('Walk-in');
    async function selectCustomer() {
      await picker
        .getByLabel('ค้นหาลูกค้า / Find customer')
        .fill('E2E-CUSTOMER');
      await picker
        .getByRole('button', { name: 'ค้นหา / Search', exact: true })
        .click();
      await picker
        .getByRole('button', { name: /E2E-CUSTOMER · Updated/ })
        .click();
      await expect(
        picker.getByRole('button', {
          name: 'นำลูกค้าออก / Remove',
          exact: true,
        }),
      ).toBeVisible();
    }
    await selectCustomer();
    await picker
      .getByRole('button', { name: 'นำลูกค้าออก / Remove', exact: true })
      .click();
    await expect(picker).toContainText('Walk-in');
    await selectCustomer();
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
          path: testInfo.outputPath(`customer-picker-${width}.png`),
          fullPage: true,
        });
    }
    await settle(page);
    await expect(page.locator('.pos-receipt')).toContainText('E2E-CUSTOMER');
    await expect(page.locator('.pos-receipt')).not.toContainText('0812345678');
    expect(
      authSQL(
        `SELECT count(*) FROM sales WHERE organization_id='${fixture.org}' AND customer_id='${customerID}'`,
      ),
    ).toBe('1');
    await page.goto(detail);
    await expect(page.locator('.customer-summary')).toContainText('2.00');
    await expect(
      page.locator('.customer-record').filter({ hasText: 'SALE' }),
    ).toBeVisible();
    await page
      .locator('.customer-membership')
      .getByRole('button', { name: 'นำออก', exact: true })
      .click();
    await expect(
      page.getByRole('button', {
        name: 'เพิ่มเข้ากลุ่ม Updated group',
        exact: true,
      }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'เก็บถาวร', exact: true }).click();
    await page
      .getByRole('button', { name: 'ยืนยันเก็บถาวร', exact: true })
      .click();
    await expect(page.getByText('ARCHIVED', { exact: true })).toBeVisible();
    await expect(
      page.locator('.customer-record').filter({ hasText: 'SALE' }),
    ).toBeVisible();
    await page.goto('/customers/groups');
    await groupCard.getByRole('button', { name: 'แก้ไขกลุ่ม' }).click();
    await page.getByRole('button', { name: 'เก็บถาวร', exact: true }).click();
    await page
      .getByRole('button', { name: 'ยืนยันเก็บถาวร', exact: true })
      .click();
    await expect(groupCard).toContainText('ARCHIVED');
    for (const [index, route] of [
      '/customers',
      detail,
      '/customers/groups',
    ].entries()) {
      await page.goto(route);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
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
            path: testInfo.outputPath(`customers-route-${index}-${width}.png`),
            fullPage: true,
          });
      }
    }
    await page
      .getByRole('combobox', { name: 'Language', exact: true })
      .selectOption('en');
    await expect(
      page.getByRole('heading', { name: 'Customer groups', exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    fixture.close();
  }
});

test('Phase 5.4 branch and organization switching, masked role and logout isolation', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const fixture = await customersFixture();
  const context = await session(browser, fixture);
  try {
    const created = await fixture.call('/customers', 'POST', {
      code: 'PRIVATE-A',
      name: 'Private tenant A',
      phone: '0812345678',
      email: 'private@example.test',
      notes: 'private notes',
    });
    expect(created.status).toBe(200);
    const secondOrg = await inventoryCall(
      fixture.owner,
      '/organizations',
      'POST',
      {
        name: 'Customer isolation B',
        code: 'ISOLATION-' + randomUUID().slice(0, 8).toUpperCase(),
        business_type: 'RETAIL',
        contact_email: '',
        contact_phone: '',
        address: '',
        branch: {
          name: 'B',
          code: 'MAIN',
          address: '',
          phone: '',
          email: '',
          status: 'ACTIVE',
        },
      },
    );
    expect(secondOrg.status).toBe(201);
    const page = await context.newPage();
    await page.goto('/customers');
    await expect(page.getByText(/Private tenant A/)).toBeVisible();
    await page
      .getByRole('button', { name: 'เพิ่มลูกค้า', exact: true })
      .click();
    await page
      .getByLabel('ชื่อ', { exact: true })
      .fill('Unsaved sensitive draft');
    await page
      .getByRole('combobox', { name: 'สาขาที่ใช้งาน', exact: true })
      .selectOption(fixture.secondBranch);
    await expect(page.getByLabel('ชื่อ', { exact: true })).toHaveCount(0);
    await expect(page.getByText(/Private tenant A/)).toBeVisible();
    await page
      .getByRole('combobox', { name: 'สาขาที่ใช้งาน', exact: true })
      .selectOption(fixture.branch);
    await page.goto('/pos');
    await page
      .getByRole('button', { name: 'เพิ่ม INV-ONE', exact: true })
      .click();
    const picker = page.getByRole('region', {
      name: 'ลูกค้า / Customer',
      exact: true,
    });
    await picker.getByLabel('ค้นหาลูกค้า / Find customer').fill('PRIVATE-A');
    await picker
      .getByRole('button', { name: 'ค้นหา / Search', exact: true })
      .click();
    await picker
      .getByRole('button', { name: /PRIVATE-A · Private tenant A/ })
      .click();
    await expect(picker).toContainText('PRIVATE-A');
    await page
      .getByRole('combobox', { name: 'สาขาที่ใช้งาน', exact: true })
      .selectOption(fixture.secondBranch);
    await expect(page.locator('.customer-picker')).toHaveCount(0);
    await expect(page.getByText(/Private tenant A/)).toHaveCount(0);
    await page
      .getByRole('combobox', { name: 'องค์กรที่ใช้งาน', exact: true })
      .selectOption(secondOrg.data.organization.id);
    await expect(page.locator('.customer-picker')).toHaveCount(0);
    await page.goto('/customers');
    await expect(
      page.getByText('ไม่พบลูกค้า ลองเปลี่ยนคำค้นหาหรือเพิ่มลูกค้า', {
        exact: true,
      }),
    ).toBeVisible();
    await expect(page.getByText(/Private tenant A/)).toHaveCount(0);
    await page.goto(`/customers/${created.data.id}`);
    await expect(
      page.getByRole('combobox', { name: 'องค์กรที่ใช้งาน', exact: true }),
    ).toHaveValue(secondOrg.data.organization.id);
    await expect(page.getByRole('alert')).toContainText('not found');
    await expect(page.getByText('0812345678', { exact: true })).toHaveCount(0);
    await page
      .getByRole('combobox', { name: 'องค์กรที่ใช้งาน', exact: true })
      .selectOption(fixture.org);
    await page.goto('/customers');
    await expect(page.getByText(/Private tenant A/)).toBeVisible();
    await page.goto('/account');
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() =>
          Object.keys(sessionStorage).some((key) =>
            key.startsWith('smartpos-context:'),
          ),
        ),
      )
      .toBe(false);
    await page.goto('/customers');
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/Private tenant A/)).toHaveCount(0);
    const cashier = await inventoryAccount(fixture.clients);
    inventoryMembership(fixture.org, cashier, 'CASHIER', [fixture.branch]);
    const maskedContext = await session(browser, fixture, cashier);
    try {
      const maskedPage = await maskedContext.newPage();
      await maskedPage.goto('/customers');
      await expect(maskedPage.getByText(/••••5678/)).toBeVisible();
      await expect(
        maskedPage.getByRole('button', { name: 'เพิ่มลูกค้า', exact: true }),
      ).toHaveCount(0);
      await maskedPage.goto(`/customers/${created.data.id}`);
      await expect(
        maskedPage.getByText('ไม่มีสิทธิ์ดูประวัติธุรกรรมลูกค้า', {
          exact: true,
        }),
      ).toBeVisible();
      await expect(maskedPage.locator('body')).not.toContainText(
        'private@example.test',
      );
      await expect(maskedPage.locator('body')).not.toContainText(
        'private notes',
      );
    } finally {
      await maskedContext.close();
    }
  } finally {
    await context.close();
    fixture.close();
  }
});
