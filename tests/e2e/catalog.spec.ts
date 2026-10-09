import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { authSQL, startAuthClient } from '../integration/auth-fixtures.mjs';
import { xlsxFixture } from '../integration/catalog-fixtures.mjs';
import type {
  Product,
  Taxonomy,
  CatalogPage,
} from '../../apps/web/src/lib/catalog-api';

test.skip(
  process.env.AUTH_E2E !== '1',
  'Requires isolated smartpos-auth-test stack',
);
test('Phase 1C: catalog workflows, imports, labels, tenant/RBAC and nine responsive pages', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const clients: Awaited<ReturnType<typeof startAuthClient>>[] = [];
  const contexts: BrowserContext[] = [];
  const unique = randomUUID().slice(0, 8).toUpperCase();
  const password = `Catalog-${randomUUID()}`;
  const base = 'http://localhost:18088';
  const pageErrors: string[] = [];
  async function client() {
    const proxy = await startAuthClient();
    clients.push(proxy);
    const context = await browser.newContext({
      baseURL: base,
      proxy: { server: proxy.proxy },
      viewport: { width: 1440, height: 1000 },
    });
    contexts.push(context);
    context.setDefaultTimeout(15_000);
    const page = await context.newPage();
    page.on('pageerror', (error) => pageErrors.push(error.message));
    return page;
  }
  async function register(page: Page, prefix: string) {
    const email = `${prefix}-${randomUUID()}@example.test`;
    await page.goto('/register');
    await page.getByLabel('Display name').fill(prefix);
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByLabel('Confirm password').fill(password);
    await page
      .getByRole('button', { name: 'Create account', exact: true })
      .click();
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel('Email address').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(
      page.getByRole('heading', { name: 'Your account' }),
    ).toBeVisible();
  }
  async function api(page: Page, path: string, method = 'GET', data?: object) {
    const session = (
      await (await page.context().request.get('/api/v1/auth/me')).json()
    ).data;
    return page.context().request.fetch(`/api/v1${path}`, {
      method,
      headers: { Origin: base, 'X-CSRF-Token': session.csrf_token },
      ...(data ? { data } : {}),
    });
  }
  async function read<Result>(page: Page, path: string): Promise<Result> {
    const response = await api(page, path);
    expect(response.status()).toBe(200);
    return (await response.json()).data as Result;
  }
  async function setup(page: Page, suffix: string) {
    await page.goto('/setup');
    await page
      .getByLabel('ชื่อองค์กร', { exact: true })
      .fill(`Catalog ${suffix} ${unique}`);
    await page
      .getByLabel('รหัสองค์กร', { exact: true })
      .fill(`CAT-${suffix}-${unique}`);
    await page.getByRole('button', { name: 'ถัดไป', exact: true }).click();
    await page.getByRole('button', { name: 'ถัดไป', exact: true }).click();
    await page.getByRole('button', { name: 'สร้างร้าน', exact: true }).click();
    await expect(page).toHaveURL(/\/settings\/store/);
    await expect(page.getByLabel('ชื่อองค์กร', { exact: true })).toHaveValue(
      `Catalog ${suffix} ${unique}`,
    );
    return page.getByLabel('องค์กรที่ใช้งาน', { exact: true }).inputValue();
  }
  async function importFile(
    page: Page,
    name: string,
    buffer: Buffer,
    mimeType: string,
  ) {
    await page.goto('/products/import');
    await page
      .getByLabel('ไฟล์สินค้า')
      .setInputFiles({ name, mimeType, buffer });
    await page.getByRole('button', { name: 'ตรวจและแสดง Preview' }).click();
    await expect(
      page.getByRole('heading', { name: '3. ผลตรวจและยืนยัน' }),
    ).toBeVisible();
  }
  async function confirmImport(page: Page) {
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'ยืนยันนำเข้า' }).click();
    await expect(
      page.getByRole('status').filter({ hasText: 'นำเข้าเสร็จ' }),
    ).toBeVisible();
  }
  try {
    const owner = await client();
    const reader = await client();
    await register(owner, 'CatalogOwner');
    const orgA = await setup(owner, 'A');
    const scope = `/organizations/${orgA}`;
    let unit!: Taxonomy;
    let category!: Taxonomy;
    let brand!: Taxonomy;
    let product!: Product;
    const title = `Soda ${unique}`;
    const sku = `SODA-${unique}`;
    await test.step('E2E 03/04/05: real categories, brands and units with conversion metadata', async () => {
      await owner.goto('/units');
      await owner.getByLabel('ชื่อหน่วยนับ', { exact: true }).fill('Can');
      await owner.getByLabel('รหัสหน่วยนับ').fill('CAN');
      await owner.getByRole('button', { name: 'บันทึกหน่วยนับ' }).click();
      await expect(owner.getByRole('status')).toHaveText('บันทึกแล้ว');
      unit = (await read<CatalogPage<Taxonomy>>(owner, `${scope}/units`))
        .items[0];
      await owner.getByLabel('ชื่อหน่วยนับ', { exact: true }).fill('Pack');
      await owner.getByLabel('รหัสหน่วยนับ').fill('PACK');
      await owner.getByLabel('ประเภทหน่วยนับ').selectOption('PACKAGING');
      await owner.getByLabel('หน่วยฐาน', { exact: true }).selectOption(unit.id);
      await owner.getByLabel('จำนวนหน่วยฐานต่อ 1 หน่วย').fill('6');
      await owner.getByRole('button', { name: 'บันทึกหน่วยนับ' }).click();
      await expect(
        owner.getByRole('cell').filter({ hasText: '6.000000' }),
      ).toBeVisible();
      await owner.goto('/categories');
      await owner.getByLabel('ชื่อหมวดหมู่', { exact: true }).fill('Beverages');
      await owner.getByRole('button', { name: 'บันทึกหมวดหมู่' }).click();
      await expect(owner.getByRole('status')).toHaveText('บันทึกแล้ว');
      await owner.getByRole('button', { name: 'แก้ไข Beverages' }).click();
      await owner.getByLabel('ชื่อหมวดหมู่', { exact: true }).fill('Drinks');
      await owner.getByRole('button', { name: 'บันทึกหมวดหมู่' }).click();
      await expect(
        owner.getByRole('button', { name: 'แก้ไข Drinks' }),
      ).toBeVisible();
      category = (
        await read<CatalogPage<Taxonomy>>(owner, `${scope}/categories`)
      ).items[0];
      await owner.goto('/brands');
      await owner.getByLabel('ชื่อแบรนด์', { exact: true }).fill('Retail');
      await owner.getByRole('button', { name: 'บันทึกแบรนด์' }).click();
      await expect(owner.getByRole('status')).toHaveText('บันทึกแล้ว');
      brand = (await read<CatalogPage<Taxonomy>>(owner, `${scope}/brands`))
        .items[0];
      await owner.getByLabel('ชื่อแบรนด์', { exact: true }).fill('Temporary');
      await owner.getByRole('button', { name: 'บันทึกแบรนด์' }).click();
      await owner.getByRole('button', { name: 'แก้ไข Temporary' }).click();
      await owner.getByLabel('สถานะ', { exact: true }).selectOption('ARCHIVED');
      await owner.getByRole('button', { name: 'บันทึกแบรนด์' }).click();
      await expect(
        owner.getByRole('button', { name: 'แก้ไข Temporary' }),
      ).toHaveCount(0);
      await owner.getByLabel('กรองสถานะ').selectOption('ARCHIVED');
      await expect(
        owner.getByRole('button', { name: 'แก้ไข Temporary' }),
      ).toBeVisible();
    });
    await test.step('E2E 01/06: create product, default variant, exact prices and second variant', async () => {
      await owner.goto('/products/new');
      await owner.getByLabel('ชื่อสินค้า', { exact: true }).fill(title);
      await owner.getByLabel('หมวดหมู่สินค้า').selectOption(category.id);
      await owner.getByLabel('แบรนด์สินค้า').selectOption(brand.id);
      await owner.getByLabel('SKU', { exact: true }).fill(sku);
      await owner.getByLabel('หน่วยนับ Variant').selectOption(unit.id);
      await owner.getByLabel('ราคาทุน', { exact: true }).fill('12.00');
      await owner.getByLabel('ราคาขาย', { exact: true }).fill('0.00');
      await owner
        .getByRole('button', { name: 'บันทึกสินค้า', exact: true })
        .click();
      await expect(owner.getByRole('alert')).toContainText(
        'ราคาขายต้องมากกว่า 0',
      );
      await owner.getByLabel('ราคาขาย', { exact: true }).fill('18.00');
      await owner
        .getByRole('button', { name: 'บันทึกสินค้า', exact: true })
        .click();
      await expect(owner).toHaveURL(/\/products\/[a-f0-9-]+$/);
      product = await read<Product>(
        owner,
        `${scope}${new URL(owner.url()).pathname}`,
      );
      expect(product.variants).toHaveLength(1);
      expect(product.variants[0].selling_price).toBe('18.00');
      await owner
        .getByRole('link', { name: 'แก้ไขสินค้า', exact: true })
        .click();
      const form = owner
        .getByRole('heading', { name: 'เพิ่ม Variant', exact: true })
        .locator('..')
        .locator('form');
      await form.getByLabel('SKU', { exact: true }).fill(`${sku}-PACK`);
      await form.getByLabel('ชื่อ Variant').fill('Six-pack');
      await form.getByLabel('หน่วยนับ Variant').selectOption(unit.id);
      await form.getByLabel('ราคาขาย').fill('100.00');
      await form.getByLabel('คุณลักษณะ Variant').fill('packaging=6 cans');
      await form.getByRole('button', { name: 'บันทึก Variant' }).click();
      await expect(form.getByRole('status')).toHaveText('บันทึก Variant แล้ว');
      product = await read<Product>(owner, `${scope}/products/${product.id}`);
      expect(product.variants).toHaveLength(2);
    });
    await test.step('E2E 02: edit product and existing variant', async () => {
      await owner
        .getByLabel('ชื่อสินค้า', { exact: true })
        .fill(`${title} edited`);
      await owner
        .getByRole('button', { name: 'บันทึกสินค้า', exact: true })
        .click();
      await expect(
        owner.getByRole('status').filter({ hasText: 'บันทึกสินค้าแล้ว' }),
      ).toBeVisible();
      const editor = owner
        .getByRole('heading', { name: `แก้ไข ${sku}`, exact: true })
        .locator('..')
        .locator('form');
      await expect(editor.getByLabel('SKU', { exact: true })).toBeDisabled();
      await editor.getByLabel('ราคาขาย').fill('19.25');
      await editor.getByRole('button', { name: 'บันทึก Variant' }).click();
      await expect(editor.getByRole('status')).toHaveText(
        'บันทึก Variant แล้ว',
      );
      product = await read<Product>(owner, `${scope}/products/${product.id}`);
      expect(product.name).toBe(`${title} edited`);
      expect(
        product.variants.find((variant) => variant.sku === sku)?.selling_price,
      ).toBe('19.25');
    });
    await test.step('E2E 07/08/09: barcode assignment, internal generation, lookup and conflict', async () => {
      await owner.goto(`/products/${product.id}`);
      await owner
        .getByLabel(`บาร์โค้ด ${sku}`, { exact: true })
        .fill('036000291452');
      await owner
        .getByLabel('มาตรฐาน', { exact: true })
        .first()
        .selectOption('UPCA');
      await owner
        .getByRole('button', { name: 'ผูกบาร์โค้ด', exact: true })
        .first()
        .click();
      await expect(
        owner.locator('code').filter({ hasText: /^036000291452$/ }),
      ).toBeVisible();
      await owner
        .getByRole('button', { name: 'สร้าง Internal Code 128', exact: true })
        .first()
        .click();
      await expect(
        owner.locator('code').filter({ hasText: /^SP-[A-F0-9]{32}$/ }),
      ).toBeVisible();
      await owner
        .getByLabel(`บาร์โค้ด ${sku}-PACK`, { exact: true })
        .fill('036000291452');
      await owner
        .getByLabel('มาตรฐาน', { exact: true })
        .nth(1)
        .selectOption('UPCA');
      await owner
        .getByRole('button', { name: 'ผูกบาร์โค้ด', exact: true })
        .nth(1)
        .click();
      await expect(owner.getByRole('alert')).toBeVisible();
      await owner.goto('/products');
      await owner.getByLabel('บาร์โค้ด', { exact: true }).fill('036000291452');
      await owner.getByLabel('บาร์โค้ด', { exact: true }).press('Enter');
      await expect(owner.getByRole('status')).toContainText(`${title} edited`);
      await expect(owner.getByLabel('บาร์โค้ด', { exact: true })).toBeFocused();
      await owner
        .getByLabel('บาร์โค้ด', { exact: true })
        .fill(`UNKNOWN-${unique}`);
      await owner.getByLabel('บาร์โค้ด', { exact: true }).press('Enter');
      await expect(owner.getByRole('alert')).toContainText('ไม่พบบาร์โค้ด');
      await expect(
        owner.getByRole('link', { name: 'สร้างสินค้าใหม่' }),
      ).toBeVisible();
      await owner.getByLabel('ค้นหาชื่อ / SKU / บาร์โค้ด').fill(sku);
      await owner
        .getByRole('button', { name: 'ค้นหาสินค้า', exact: true })
        .click();
      await owner.getByLabel('กรองหมวดหมู่').selectOption(category.id);
      await owner.getByLabel('กรองแบรนด์').selectOption(brand.id);
      await owner.getByLabel('เรียงตาม').selectOption('-name');
      await expect(
        owner
          .getByRole('table')
          .getByRole('link', { name: `${title} edited`, exact: true }),
      ).toBeVisible();
    });
    await test.step('E2E 17: real label rendering and browser print layout', async () => {
      await owner.goto('/products/labels');
      await owner
        .getByLabel('สินค้าสำหรับฉลาก', { exact: true })
        .selectOption(product.id);
      await expect(
        owner.getByRole('img', { name: 'UPCA 036000291452' }),
      ).toBeVisible();
      await owner.getByLabel('จำนวนฉลาก').fill('2');
      await expect(owner.locator('.catalog-label')).toHaveCount(2);
      await owner.evaluate(() => {
        window.print = () => {
          document.documentElement.setAttribute('data-print-invoked', 'true');
        };
      });
      await owner
        .getByRole('button', { name: 'เปิด Print Preview / พิมพ์' })
        .click();
      await expect(owner.locator('html')).toHaveAttribute(
        'data-print-invoked',
        'true',
      );
      await owner.emulateMedia({ media: 'print' });
      await expect(owner.locator('.catalog-label').first()).toBeVisible();
      await owner.screenshot({
        path: 'test-results/catalog-labels-print.png',
        fullPage: true,
      });
      await owner.emulateMedia({ media: 'screen' });
    });
    const headers = [
      'product_name',
      'sku',
      'barcode',
      'symbology',
      'category',
      'brand',
      'unit',
      'cost_price',
      'selling_price',
    ];
    const csv = (name: string, importedSku: string, price: string) =>
      `${headers.join(',')}\n${name},${importedSku},,,Drinks,Retail,CAN,1.00,${price}`;
    const importedSku = `CSV-${unique}`;
    await test.step('E2E 10: CSV preview, create, skip and explicit update', async () => {
      await importFile(
        owner,
        'catalog.csv',
        Buffer.from(csv('Imported Tea', importedSku, '5.00')),
        'text/csv',
      );
      await expect(owner.getByRole('status')).toContainText('ถูกต้อง 1');
      expect(
        (
          await read<CatalogPage<Product>>(
            owner,
            `${scope}/products?search=${importedSku}`,
          )
        ).total,
      ).toBe(0);
      await confirmImport(owner);
      await importFile(
        owner,
        'catalog.csv',
        Buffer.from(csv('Imported Tea', importedSku, '6.00')),
        'text/csv',
      );
      await expect(
        owner.getByRole('button', { name: 'ยืนยันนำเข้า' }),
      ).toBeDisabled();
      await owner.getByLabel('จัดการ SKU เดิม').selectOption('SKIP');
      await confirmImport(owner);
      await expect(
        owner.getByRole('status').filter({ hasText: 'นำเข้าเสร็จ' }),
      ).toContainText('ข้าม 1');
      await importFile(
        owner,
        'catalog.csv',
        Buffer.from(csv('Tea Updated', importedSku, '6.00')),
        'text/csv',
      );
      await owner.getByLabel('จัดการ SKU เดิม').selectOption('UPDATE');
      await confirmImport(owner);
      const tea = (
        await read<CatalogPage<Product>>(
          owner,
          `${scope}/products?search=${importedSku}`,
        )
      ).items[0];
      expect(tea.name).toBe('Tea Updated');
      expect(tea.variants[0].selling_price).toBe('6.00');
    });
    await test.step('E2E 11/12: XLSX text barcode, invalid row and formula rejection', async () => {
      const workbook = xlsxFixture(headers, [
        [
          'Workbook Tea',
          `XLSX-${unique}`,
          '0012345',
          'CODE128',
          'Drinks',
          'Retail',
          'CAN',
          '1.00',
          '7.00',
        ],
      ]);
      await importFile(
        owner,
        'catalog.xlsx',
        workbook,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      );
      await expect(
        owner.getByRole('cell', { name: '0012345', exact: true }),
      ).toBeVisible();
      await confirmImport(owner);
      await importFile(
        owner,
        'invalid.csv',
        Buffer.from(csv('Invalid Tea', `INVALID-${unique}`, '0.00')),
        'text/csv',
      );
      await expect(owner.getByRole('status')).toContainText('ผิดพลาด 1');
      await expect(
        owner.getByRole('button', { name: 'ยืนยันนำเข้า' }),
      ).toBeDisabled();
      await owner.getByLabel('ไฟล์สินค้า').setInputFiles({
        name: 'formula.xlsx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: xlsxFixture(
          headers,
          [['Formula', 'FORMULA', '', '', '', '', 'CAN', '1', '2']],
          true,
        ),
      });
      await owner.getByRole('button', { name: 'ตรวจและแสดง Preview' }).click();
      await expect(owner.getByRole('alert')).toBeVisible();
      await expect(
        owner.getByRole('button', { name: 'ยืนยันนำเข้า' }),
      ).toHaveCount(0);
    });
    await test.step('E2E 16: all nine catalog routes, seven widths, keyboard and screenshots', async () => {
      for (const width of [320, 375, 640, 768, 1024, 1440, 1920]) {
        await owner.setViewportSize({ width, height: 1000 });
        for (const route of [
          '/products',
          '/products/new',
          `/products/${product.id}`,
          `/products/${product.id}/edit`,
          '/products/import',
          '/products/labels',
          '/categories',
          '/brands',
          '/units',
        ]) {
          await owner.goto(route);
          await expect(owner.getByRole('heading', { level: 1 })).toBeVisible();
          await expect(owner.locator('.catalog-page')).toBeVisible();
          if (
            ['/products', '/categories', '/brands', '/units'].includes(route)
          ) {
            await expect(owner.getByRole('table')).toBeVisible();
          }
          if (route === `/products/${product.id}`) {
            await expect(
              owner.getByRole('heading', {
                name: `${title} edited`,
                exact: true,
              }),
            ).toBeVisible();
          }
          if (route === `/products/${product.id}/edit`) {
            await expect(
              owner.getByLabel('ชื่อสินค้า', { exact: true }),
            ).toHaveValue(`${title} edited`);
          }
          if (route === '/products/labels') {
            await owner
              .getByLabel('สินค้าสำหรับฉลาก', { exact: true })
              .selectOption(product.id);
            await expect(
              owner.getByRole('img', { name: 'UPCA 036000291452' }),
            ).toBeVisible();
          }
          expect(
            await owner.evaluate(
              () => document.documentElement.scrollWidth > innerWidth + 1,
            ),
            `${route} at ${width}`,
          ).toBe(false);
        }
      }
      await owner.setViewportSize({ width: 320, height: 900 });
      await owner.goto('/products');
      await expect(owner.getByRole('table')).toBeVisible();
      await owner.screenshot({
        path: 'test-results/catalog-products-mobile.png',
        fullPage: true,
      });
      await owner.setViewportSize({ width: 1440, height: 1000 });
      await owner.goto(`/products/${product.id}`);
      await expect(
        owner.getByRole('heading', { name: `${title} edited`, exact: true }),
      ).toBeVisible();
      await expect(
        owner.locator('code').filter({ hasText: /^036000291452$/ }),
      ).toBeVisible();
      await owner.screenshot({
        path: 'test-results/catalog-product-desktop.png',
        fullPage: true,
      });
      await owner.keyboard.press('Tab');
      expect(
        await owner.evaluate(() => document.activeElement?.tagName),
      ).not.toBe('BODY');
    });
    await test.step('archive and restore preserve variant/barcode identities', async () => {
      await owner.goto(`/products/${product.id}/edit`);
      await owner.getByLabel('สถานะ', { exact: true }).selectOption('ARCHIVED');
      await owner
        .getByRole('button', { name: 'บันทึกสินค้า', exact: true })
        .click();
      await expect(owner.getByRole('status')).toContainText('บันทึกสินค้าแล้ว');
      expect(
        (
          await read<CatalogPage<Product>>(
            owner,
            `${scope}/products?search=${sku}`,
          )
        ).total,
      ).toBe(0);
      const archived = await read<Product>(
        owner,
        `${scope}/products/${product.id}`,
      );
      expect(archived.variants.map((variant) => variant.id)).toEqual(
        product.variants.map((variant) => variant.id),
      );
      await owner.getByLabel('สถานะ', { exact: true }).selectOption('ACTIVE');
      await owner
        .getByRole('button', { name: 'บันทึกสินค้า', exact: true })
        .click();
      await expect(owner.getByRole('status')).toContainText('บันทึกสินค้าแล้ว');
    });
    await test.step('E2E 13/15: organization switch removes old catalog and cross-tenant IDs deny', async () => {
      const orgB = await setup(owner, 'B');
      await owner.goto('/products');
      await expect(owner.getByText(/ไม่พบสินค้า เริ่มด้วย/)).toBeVisible();
      expect(
        (
          await api(owner, `/organizations/${orgB}/products/${product.id}`)
        ).status(),
      ).toBe(404);
      await owner
        .getByLabel('องค์กรที่ใช้งาน', { exact: true })
        .selectOption(orgA);
      await expect(
        owner
          .getByRole('table')
          .getByRole('link', { name: `${title} edited`, exact: true }),
      ).toBeVisible();
      await owner.reload();
      await expect(
        owner.getByLabel('องค์กรที่ใช้งาน', { exact: true }),
      ).toHaveValue(orgA);
    });
    await test.step('E2E 14: cashier read-only and inventory non-archive permissions enforced by UI/API', async () => {
      await register(reader, 'CatalogReader');
      const session = (
        await (await reader.context().request.get('/api/v1/auth/me')).json()
      ).data;
      const context = await read<{ branches: { id: string }[] }>(
        owner,
        `${scope}/context`,
      );
      authSQL(
        `INSERT INTO organization_memberships(organization_id,user_id,role) VALUES('${orgA}','${session.user.id}','CASHIER'); INSERT INTO branch_memberships(organization_id,membership_id,branch_id) SELECT organization_id,id,'${context.branches[0].id}' FROM organization_memberships WHERE organization_id='${orgA}' AND user_id='${session.user.id}';`,
      );
      await reader.goto('/products');
      await expect(
        reader
          .getByRole('table')
          .getByRole('link', { name: `${title} edited`, exact: true }),
      ).toBeVisible();
      await expect(
        reader.getByRole('link', { name: 'เพิ่มสินค้า', exact: true }),
      ).toHaveCount(0);
      await reader.goto('/products/import');
      await expect(reader).toHaveURL(/\/403/);
      expect(
        (await api(reader, `${scope}/products`, 'POST', {})).status(),
      ).toBe(403);
      authSQL(
        `UPDATE organization_memberships SET role='INVENTORY_STAFF' WHERE organization_id='${orgA}' AND user_id='${session.user.id}';`,
      );
      await reader.goto('/products/new');
      await expect(
        reader.getByRole('heading', { name: 'เพิ่มสินค้า', exact: true }),
      ).toBeVisible();
      await reader.goto('/categories');
      await expect(
        reader.getByRole('button', { name: 'บันทึกหมวดหมู่' }),
      ).toHaveCount(0);
      const current = await read<Product>(
        owner,
        `${scope}/products/${product.id}`,
      );
      expect(
        (
          await api(reader, `${scope}/products/${product.id}`, 'PATCH', {
            name: current.name,
            description: current.description,
            category_id: current.category_id,
            brand_id: current.brand_id,
            status: 'ARCHIVED',
            revision: current.revision,
          })
        ).status(),
      ).toBe(403);
    });
    expect(pageErrors).toEqual([]);
  } finally {
    try {
      for (const context of contexts) await context.close();
    } finally {
      for (const proxy of clients.reverse()) proxy.close();
    }
  }
});
