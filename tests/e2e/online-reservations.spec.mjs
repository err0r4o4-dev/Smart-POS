import { expect, test } from '@playwright/test';

test.use({ trace: 'off' });

test('reservation notice and consent remain readable before guest submission (API fixtures)', async ({
  page,
}, testInfo) => {
  const variant = '11111111-1111-4111-8111-111111111111';
  const shop = {
    slug: 'reservation-fixture',
    name: 'ร้านทดสอบกันสินค้า',
    description: 'Synthetic reservation fixture',
    contact_phone: '',
    pickup_instructions: 'รอร้านแจ้งพร้อมรับสินค้า',
    published: true,
    accepting_orders: true,
    revision: 1,
  };
  const product = {
    variant_id: variant,
    product_name: 'สินค้าทดสอบ',
    variant_name: 'แบบมาตรฐาน',
    sku: 'RESERVE',
    unit: 'ชิ้น',
    unit_type: 'COUNT',
    unit_price: '10.00',
    available: '1.000',
    saleable: true,
    published: true,
  };
  const quote = {
    quote_id: 'a'.repeat(64),
    items: [{ ...product, quantity: '1.000', line_total: '10.00' }],
    estimated_total: '10.00',
    currency: 'THB',
  };
  let submissions = 0;
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/v1/auth/me') {
      await route.fulfill({
        status: 401,
        json: {
          error: {
            code: 'UNAUTHENTICATED',
            message: 'Synthetic anonymous visitor',
          },
        },
      });
      return;
    }
    let data;
    if (path.endsWith('/products'))
      data = { items: [product], total: 1, page: 1, page_size: 24 };
    else if (path.endsWith('/quote')) data = quote;
    else if (path.endsWith('/orders') || path.endsWith('/track')) {
      if (path.endsWith('/orders')) submissions++;
      data = {
        id: '22222222-2222-4222-8222-222222222222',
        number: 'WEB-SYNTHETIC',
        status: 'PENDING',
        payment_status: 'UNPAID',
        store_name: shop.name,
        store_phone: '',
        pickup_instructions: shop.pickup_instructions,
        estimated_total: quote.estimated_total,
        final_total: null,
        receipt_number: null,
        revision: 1,
        created_at: '2026-10-12T00:00:00Z',
        expires_at: '2026-10-14T00:00:00Z',
        items: quote.items,
        events: [],
      };
    } else if (path.endsWith('/reservation-fixture')) data = shop;
    else throw new Error(`Unexpected fixture API: ${request.method()} ${path}`);
    await route.fulfill({ json: { data } });
  });
  await page.goto('/shop/reservation-fixture');
  await expect(
    page.getByText(/ระบบกันสินค้าหลังส่งออเดอร์สำเร็จ/),
  ).toBeVisible();
  await page.getByRole('button', { name: 'เพิ่มลงตะกร้า' }).click();
  await page.getByRole('link', { name: 'ตะกร้า (1)' }).click();
  await page.getByRole('button', { name: 'ตรวจรายการและยอดล่าสุด' }).click();
  await expect(page.getByLabel('ชื่อผู้รับสินค้า')).toBeVisible();
  const consent = page.getByRole('checkbox', {
    name: /ฉันเข้าใจว่าระบบกันสินค้าหลังส่งออเดอร์สำเร็จ/,
  });
  await expect(consent).toBeVisible();
  await expect(consent).toHaveAttribute('required', '');
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(consent).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`reservation-consent-${width}.png`),
      fullPage: true,
    });
  }
  expect(submissions).toBe(0);
  await page.getByLabel('ชื่อผู้รับสินค้า').fill('Synthetic buyer');
  await page.getByLabel('เบอร์ติดต่อ').fill('0800000000');
  await consent.check();
  await page
    .getByRole('button', { name: 'ส่งออเดอร์ · ยังไม่ชำระเงิน' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'ติดตามออเดอร์' }),
  ).toBeVisible();
  expect(submissions).toBe(1);
  await expect(
    page.getByText(/กรุณารอร้านยืนยันพร้อมรับก่อนเดินทาง/),
  ).toBeVisible();
});
