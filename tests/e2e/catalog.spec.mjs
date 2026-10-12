import { expect, test } from '@playwright/test';

test.use({ trace: 'off' });
const drink = '22222222-2222-4222-8222-222222222222';
const food = '33333333-3333-4333-8333-333333333333';

async function catalogFixture(
  page,
  {
    count = 3,
    accepting = true,
    unavailable = false,
    brokenImage = false,
  } = {},
) {
  const requests = [];
  const writes = [];
  const items = Array.from({ length: count }, (_, index) => ({
    variant_id: `11111111-1111-4111-8111-${String(index + 1).padStart(12, '0')}`,
    product_name:
      [
        'นม UHT 250 มล. (ตัวอย่าง)',
        'น้ำดื่ม 600 มล. (ตัวอย่าง)',
        'บะหมี่กึ่งสำเร็จรูป 60 กรัม (ตัวอย่าง)',
      ][index] ?? `สินค้าตัวอย่าง ${String(index + 1).padStart(2, '0')}`,
    variant_name: 'Default',
    sku: `DEMO-${index + 1}`,
    unit: 'ชิ้น',
    unit_type: 'COUNT',
    unit_price: ['15.00', '10.00', '8.00'][index] ?? `${index + 1}.00`,
    available: unavailable ? '0.000' : '10.000',
    saleable: true,
    published: true,
    category_id: index === 2 ? food : drink,
    category_name: index === 2 ? 'อาหารสำเร็จรูป' : 'เครื่องดื่ม',
    ...(brokenImage && index === 0
      ? { image_url: '/catalog-fixture-missing.png' }
      : {}),
  }));
  await page.route('**/catalog-fixture-missing.png', (route) =>
    route.fulfill({ status: 404, body: '' }),
  );
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() !== 'GET') writes.push(url.pathname);
    if (url.pathname === '/api/v1/storefronts')
      return route.fulfill({
        json: {
          data: [
            {
              slug: 'catalog-fixture',
              name: 'ร้านค้าของเรา',
              accepting_orders: accepting,
            },
          ],
        },
      });
    if (url.pathname === '/api/v1/storefronts/catalog-fixture')
      return route.fulfill({
        json: {
          data: {
            slug: 'catalog-fixture',
            name: 'ร้านค้าของเรา',
            description: 'เลือกสินค้าที่ต้องการ แล้วมารับที่ร้าน',
            contact_phone: '',
            pickup_instructions: 'รับที่เคาน์เตอร์',
            published: true,
            accepting_orders: accepting,
            revision: 1,
          },
        },
      });
    if (url.pathname === '/api/v1/storefronts/catalog-fixture/products') {
      requests.push(Object.fromEntries(url.searchParams));
      const params = url.searchParams;
      const search = params.get('search')?.toLowerCase() ?? '';
      let filtered = items.filter((item) =>
        `${item.product_name} ${item.variant_name} ${item.sku}`
          .toLowerCase()
          .includes(search),
      );
      if (params.has('min_price'))
        filtered = filtered.filter(
          (item) => Number(item.unit_price) >= Number(params.get('min_price')),
        );
      if (params.has('max_price'))
        filtered = filtered.filter(
          (item) => Number(item.unit_price) <= Number(params.get('max_price')),
        );
      if (params.get('availability'))
        filtered = filtered.filter(
          (item) =>
            (item.saleable && Number(item.available) >= 1) ===
            (params.get('availability') === 'available'),
        );
      const categories = [drink, food]
        .map((id) => ({
          id,
          name: id === drink ? 'เครื่องดื่ม' : 'อาหารสำเร็จรูป',
          count: filtered.filter((item) => item.category_id === id).length,
        }))
        .filter((category) => category.count > 0);
      if (params.get('category_id'))
        filtered = filtered.filter(
          (item) => item.category_id === params.get('category_id'),
        );
      const sort = params.get('sort');
      filtered.sort((first, second) =>
        sort === 'price_asc'
          ? Number(first.unit_price) - Number(second.unit_price)
          : sort === 'price_desc'
            ? Number(second.unit_price) - Number(first.unit_price)
            : first.product_name.localeCompare(second.product_name),
      );
      const number = Number(params.get('page') ?? 1);
      return route.fulfill({
        json: {
          data: {
            items: filtered.slice((number - 1) * 24, number * 24),
            total: filtered.length,
            page: number,
            page_size: 24,
            categories,
          },
        },
      });
    }
    return route.fulfill({
      status: 404,
      json: { error: { message: 'Unmocked catalog fixture endpoint' } },
    });
  });
  return { requests, writes };
}

test('yellow catalog supports desktop tablet mobile and a shared exact-quantity cart (API fixtures)', async ({
  page,
}, testInfo) => {
  const { writes } = await catalogFixture(page);
  await page.goto('/shop');
  await expect(page).toHaveURL(/\/shop\/catalog-fixture$/);
  await expect(
    page.getByRole('searchbox', { name: 'ค้นหาสินค้า' }),
  ).toBeVisible();
  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(
      page.getByRole('button', { name: 'แสดงแบบตาราง' }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByLabel('สถานะสินค้า')).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: testInfo.outputPath(`catalog-grid-${width}.png`),
      fullPage: true,
    });
  }
  await page.getByRole('button', { name: 'หมวดหมู่', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'เครื่องดื่ม 2' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'เครื่องดื่ม 2' }).click();
  await expect(
    page.getByRole('button', { name: 'หมวดหมู่', exact: true }),
  ).toHaveAttribute('aria-expanded', 'false');
  const card = page.getByRole('article', { name: 'นม UHT 250 มล. (ตัวอย่าง)' });
  await card.getByRole('spinbutton').fill('2');
  await card.getByRole('button', { name: 'เพิ่มลงตะกร้า' }).click();
  await expect(
    page.getByRole('link', { name: 'ตะกร้า (1)', exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem('shop-cart:catalog-fixture'))[0]
          .quantity,
    ),
  ).toBe('2.000');
  await page.getByRole('button', { name: 'แสดงแบบรายการ' }).click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath('catalog-list-390.png'),
    fullPage: true,
  });
  await page.getByRole('link', { name: 'ตะกร้า (1)', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'ตะกร้าสินค้า', exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole('spinbutton', { name: 'จำนวน นม UHT 250 มล. (ตัวอย่าง)' }),
  ).toHaveValue('2.000');
  await page
    .getByRole('button', { name: 'นำ นม UHT 250 มล. (ตัวอย่าง) ออก' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'ตะกร้ายังว่าง' }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'ตะกร้า (0)', exact: true }),
  ).toBeVisible();
  expect(writes).toEqual([]);
});

test('global catalog filters reset pagination and sorting before rendering (API fixtures)', async ({
  page,
}) => {
  const { requests, writes } = await catalogFixture(page, { count: 27 });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/shop/catalog-fixture');
  await page.getByRole('button', { name: 'ถัดไป' }).click();
  await expect(page.getByText('หน้า 2 · 27 รายการ')).toBeVisible();
  await page.getByRole('button', { name: 'เครื่องดื่ม 26' }).click();
  await expect(page.getByText('หน้า 1 · 26 รายการ')).toBeVisible();
  await page.getByText('ช่วงราคา', { exact: true }).click();
  await page.getByLabel('ราคาต่ำสุด').fill('10');
  await page.getByLabel('ราคาสูงสุด').fill('20');
  await page.getByRole('button', { name: 'ใช้ช่วงราคา' }).click();
  await expect(page.getByLabel('สถานะสินค้า')).toHaveCount(0);
  await page.getByLabel('เรียงสินค้า').selectOption('price_desc');
  await expect
    .poll(() => requests.at(-1))
    .toMatchObject({
      page: '1',
      category_id: drink,
      min_price: '10',
      max_price: '20',
      sort: 'price_desc',
    });
  await page.getByRole('button', { name: 'ล้างตัวกรอง' }).click();
  await expect(page.getByText('หน้า 1 · 27 รายการ')).toBeVisible();
  await page.getByRole('searchbox', { name: 'ค้นหาสินค้า' }).fill('not-found');
  await page.getByRole('searchbox', { name: 'ค้นหาสินค้า' }).press('Enter');
  await expect(
    page.getByRole('heading', { name: 'ไม่พบสินค้า' }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'แสดงสินค้าทั้งหมด' }).click();
  await expect(page.getByText('หน้า 1 · 27 รายการ')).toBeVisible();
  expect(writes).toEqual([]);
});

test('catalog rejects invalid quantities and recovers from missing product images (API fixtures)', async ({
  page,
}) => {
  await catalogFixture(page, { brokenImage: true });
  await page.goto('/shop/catalog-fixture');
  const card = page.getByRole('article', { name: 'นม UHT 250 มล. (ตัวอย่าง)' });
  await expect(card.getByText('ยังไม่มีรูปสินค้า')).toBeVisible();
  for (const quantity of ['0', '0.5', '11']) {
    await card.getByRole('spinbutton').fill(quantity);
    await expect(
      card.getByRole('button', { name: 'เพิ่มลงตะกร้า' }),
    ).toBeDisabled();
  }
  await card.getByRole('spinbutton').fill('1');
  await card
    .getByRole('button', { name: 'เพิ่มจำนวน นม UHT 250 มล. (ตัวอย่าง)' })
    .click();
  await expect(card.getByRole('spinbutton')).toHaveValue('2');
  await card
    .getByRole('button', { name: 'ลดจำนวน นม UHT 250 มล. (ตัวอย่าง)' })
    .click();
  await expect(card.getByRole('spinbutton')).toHaveValue('1');
});

for (const state of [{ accepting: false }, { unavailable: true }]) {
  test(`catalog disables adding when ${state.accepting === false ? 'closed' : 'unavailable'} (API fixtures)`, async ({
    page,
  }) => {
    const { writes } = await catalogFixture(page, state);
    await page.goto('/shop/catalog-fixture');
    await expect(page.getByRole('article')).toHaveCount(3);
    for (const button of await page
      .getByRole('button', { name: 'เพิ่มลงตะกร้า' })
      .all())
      await expect(button).toBeDisabled();
    expect(writes).toEqual([]);
  });
}
