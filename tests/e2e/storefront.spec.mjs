import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { posFixture } from '../integration/pos-fixtures.mjs';

test.skip(
  process.env.AUTH_E2E !== '1',
  'Requires explicitly authorized isolated smartpos-auth-test',
);
test.use({ trace: 'off' });
test('guest pickup order, staff preparation, locked POS cart and actual settlement', async ({
  browser,
}, testInfo) => {
  test.setTimeout(180_000);
  expect(process.env.AUTH_TEST_DATABASE).toMatch(
    /^smartpos_phase53_[a-z0-9_]+$/,
  );
  expect(process.env.E2E_BASE_URL).toBe('http://localhost:18088');
  const fixture = await posFixture();
  const contexts = [];
  const errors = [];
  const slug = `browser-${randomUUID().slice(0, 8)}`;
  async function client(staff) {
    const context = await browser.newContext({
      baseURL: 'http://localhost:18088',
      proxy: { server: fixture.owner.source.proxy },
      viewport: { width: 1440, height: 1000 },
    });
    contexts.push(context);
    if (staff) {
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
        ({ userID, orgID, branchID }) => {
          sessionStorage.setItem(
            `smartpos-context:${userID}`,
            JSON.stringify({ userID, orgID, branchID }),
          );
        },
        {
          userID: fixture.owner.id,
          orgID: fixture.org,
          branchID: fixture.branch,
        },
      );
    }
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    page.setDefaultTimeout(15_000);
    return page;
  }
  try {
    const staff = await client(true);
    await staff.goto('/manage/settings/storefront');
    await expect(
      staff.getByRole('button', { name: 'บันทึกการตั้งค่า' }),
    ).toBeEnabled();
    await staff.getByLabel(/ชื่อใน URL/).fill(slug);
    await staff
      .getByLabel(/เครื่องขาย \/ สาขา/)
      .selectOption(fixture.terminal.id);
    await staff
      .getByLabel('สถานที่ เวลา และวิธีรับสินค้า')
      .fill('รับหน้าเคาน์เตอร์ 09:00–18:00');
    await staff.getByLabel('เผยแพร่หน้าร้าน').check();
    await staff.getByLabel('เปิดรับออเดอร์').check();
    const saved = staff.waitForResponse(
      (response) =>
        response.url().endsWith('/storefront') &&
        response.request().method() === 'PUT',
    );
    await staff.getByRole('button', { name: 'บันทึกการตั้งค่า' }).click();
    expect((await saved).status()).toBe(200);
    await expect(
      staff.getByRole('heading', { name: 'สินค้าที่เผยแพร่' }),
    ).toBeVisible();
    const settings = await fixture.call('/storefront');
    expect(settings.status).toBe(200);
    expect(
      (
        await fixture.call(
          `/storefront/products/${fixture.variant.id}`,
          'PUT',
          { published: true, revision: settings.data.revision },
        )
      ).status,
    ).toBe(200);
    const guest = await client(false);
    for (const width of [390, 768, 1440]) {
      await guest.setViewportSize({ width, height: 1000 });
      await guest.goto(`/shop/${slug}`);
      await expect(
        guest.getByRole('button', { name: 'เพิ่มลงตะกร้า' }),
      ).toBeEnabled();
      expect(
        await guest.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await guest.screenshot({
        path: testInfo.outputPath(`catalog-${width}.png`),
        fullPage: true,
      });
    }
    await guest.getByRole('button', { name: 'เพิ่มลงตะกร้า' }).click();
    await guest.getByRole('link', { name: 'ตะกร้า (1)' }).click();
    await expect(
      guest.getByRole('button', { name: 'ตรวจรายการและยอดล่าสุด' }),
    ).toBeEnabled();
    await guest.getByRole('button', { name: 'ตรวจรายการและยอดล่าสุด' }).click();
    await guest.getByLabel('ชื่อผู้รับสินค้า').fill('ลูกค้าทดสอบเบราว์เซอร์');
    await guest.getByLabel('เบอร์ติดต่อ', { exact: true }).fill('0812345678');
    await guest.getByRole('checkbox').check();
    for (const width of [390, 768, 1440]) {
      await guest.setViewportSize({ width, height: 1000 });
      expect(
        await guest.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await guest
      .getByRole('button', { name: 'ส่งออเดอร์ · ยังไม่ชำระเงิน' })
      .click();
    await expect(
      guest.getByRole('heading', { name: 'ติดตามออเดอร์' }),
    ).toBeVisible();
    await expect(
      guest.getByText('ยังไม่ชำระเงิน · รับและจ่ายที่ร้าน'),
    ).toBeVisible();
    const listed = await fixture.call(
      `/online-orders?branch_id=${fixture.branch}`,
    );
    expect(listed.status).toBe(200);
    const order = listed.data.items[0];
    await staff.goto(`/work/online-orders/${order.id}`);
    await staff.getByRole('button', { name: 'เริ่มเตรียมสินค้า' }).click();
    await staff.getByRole('button', { name: 'พร้อมรับสินค้า' }).click();
    await expect(
      staff.getByRole('link', { name: 'ลูกค้ามารับ · เปิดเข้า POS' }),
    ).toBeVisible();
    expect(
      (
        await fixture.call('/pos/shifts/open', 'POST', {
          terminal_id: fixture.terminal.id,
          opening_cash: '100.00',
        })
      ).status,
    ).toBe(201);
    await staff
      .getByRole('link', { name: 'ลูกค้ามารับ · เปิดเข้า POS' })
      .click();
    const terminal = staff.getByRole('combobox', {
      name: 'เครื่องขายที่ใช้งาน',
    });
    await expect(terminal).toBeVisible();
    await terminal.selectOption(fixture.terminal.id);
    await expect(
      staff.getByRole('button', { name: 'เปิดตะกร้าออเดอร์นี้' }),
    ).toBeEnabled();
    await staff.getByRole('button', { name: 'เปิดตะกร้าออเดอร์นี้' }).click();
    await expect(
      staff.getByRole('button', { name: 'เพิ่มจำนวน INV-ONE' }),
    ).toBeDisabled();
    await expect(
      staff.getByRole('button', { name: 'ลบ INV-ONE', exact: true }),
    ).toBeDisabled();
    await staff.getByRole('button', { name: 'ไปชำระเงิน' }).click();
    await staff
      .getByRole('textbox', { name: 'เงินรับ', exact: true })
      .fill('2.00');
    await staff
      .getByRole('button', { name: 'ตรวจสอบยอดและเตรียมชำระเงิน' })
      .click();
    await expect(
      staff.getByText('AWAITING_PAYMENT', { exact: true }),
    ).toBeVisible();
    await staff
      .getByRole('checkbox', {
        name: 'ฉันตรวจสอบแล้วว่าได้รับเงินจริง',
        exact: true,
      })
      .check();
    await staff
      .getByRole('button', { name: 'ยืนยันรับเงินจริง', exact: true })
      .click();
    await expect(staff.getByText('CONFIRMED', { exact: true })).toBeVisible();
    await staff
      .getByRole('button', { name: 'บันทึกขายและตัดสต็อก', exact: true })
      .click();
    await expect(staff.getByText('COMPLETED', { exact: true })).toBeVisible();
    await guest.getByRole('button', { name: 'อัปเดตสถานะ' }).click();
    await expect(guest.getByText('ชำระและบันทึกขายที่ร้านแล้ว')).toBeVisible();
    const balances = await fixture.call(
      `/inventory/balances?location_id=${fixture.shelf.id}&variant_id=${fixture.variant.id}`,
    );
    expect(balances.data.items[0].quantity).toBe('4.000');
    expect(errors).toEqual([]);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
    fixture.close();
  }
});
