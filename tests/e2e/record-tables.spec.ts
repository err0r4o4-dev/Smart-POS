import { expect, test, type Locator, type Page } from '@playwright/test';

// UI-only fixtures: intercept every API request; never write to the running DB.
const refundID = '00000000-0000-4000-8000-000000000001';
const refundCode = 'RET-UI-001';
async function expectActionGap(first: Locator, second: Locator) {
  await expect(first).toBeVisible();
  await expect(second).toBeVisible();
  const a = (await first.boundingBox())!;
  const b = (await second.boundingBox())!;
  expect(
    Math.max(b.x - a.x - a.width, b.y - a.y - a.height),
  ).toBeGreaterThanOrEqual(11.5);
}
async function recordsAPI(
  page: Page,
  role = 'OWNER',
  refundStatus = 'CONFIRMED',
) {
  const requests: { path: string; method: string; search: string }[] = [];
  const permissions = [
    'sales.read',
    'receipts.read',
    'receipts.print',
    'refunds.read',
    'customers.read',
    'customers.manage',
    'customers.groups.read',
    'customers.groups.manage',
    'loyalty.read',
    'loyalty.manage',
    'loyalty.adjust',
    'loyalty.enroll',
    'refunds.settlement.report',
    'refunds.settlement.confirm',
  ];
  const organization = {
    id: 'org',
    name: 'ร้านทดสอบตาราง',
    code: 'UI',
    status: 'ACTIVE',
    currency: 'THB',
  };
  const branch = {
    id: 'main',
    organization_id: 'org',
    name: 'สาขาทดสอบ',
    code: 'MAIN',
    status: 'ACTIVE',
    is_main: true,
  };
  const refund = {
    id: refundID,
    return_number: refundCode,
    return_id: 'return',
    branch_id: 'main',
    amount: '617.25',
    method: 'MANUAL_BANK_REFUND',
    status: refundStatus,
    revision: 3,
    reference: 'UI-REFUND',
    settlement_note: 'ข้อมูลจำลองสำหรับตรวจหน้าจอ',
    cash_disbursement_id: null,
    reported_at: '2026-10-12T08:00:00Z',
    reported_by: 'user',
    confirmed_at: '2026-10-12T09:00:00Z',
    confirmed_by: 'user',
    events: [
      {
        id: 'event',
        action: 'CONFIRMED',
        created_at: '2026-10-12T09:00:00Z',
        note: 'ตรวจสอบแล้ว',
      },
    ],
  };
  const summary = {
    id: 'sale',
    sale_number: 'SAL-UI-001',
    receipt_number: 'RCP-UI-001',
    branch_name: branch.name,
    terminal_name: 'เครื่องขายทดสอบ',
    cashier_name: 'พนักงานทดสอบ',
    grand_total: '1234.50',
    completed_at: '2026-10-12T08:00:00Z',
    method: 'CASH',
    payment_status: 'CONFIRMED',
    status: 'COMPLETED',
  };
  const sale = {
    ...summary,
    branch_id: 'main',
    customer_id: 'customer',
    customer_code_snapshot: 'C-UI-001',
    store_name: organization.name,
    store_address: 'ที่อยู่ทดสอบ',
    currency: 'THB',
    subtotal: '1234.50',
    discount_total: '0.00',
    receipt: { id: 'receipt', receipt_number: summary.receipt_number },
    items: [
      {
        variant_id: 'variant',
        product_name: 'สินค้าทดสอบชื่อยาวสำหรับตรวจการตัดบรรทัด',
        variant_name: 'ขนาดปกติ',
        sku: 'SKU-UI-001',
        quantity: '2.000',
        unit: 'ชิ้น',
        unit_price: '617.25',
        line_total: '1234.50',
      },
    ],
    payment: {
      method: 'CASH',
      status: 'CONFIRMED',
      amount: '1234.50',
      received: '1500.00',
      change: '265.50',
      reference: '',
      confirmed_by: 'user',
      confirmed_at: summary.completed_at,
    },
    inventory_operation_id: 'operation',
    movements: [
      {
        id: 'movement',
        location_id: 'location',
        quantity_before: '20.000',
        quantity_delta: '-2.000',
        quantity_after: '18.000',
      },
    ],
    audit: [
      {
        event_type: 'pos.sale.completed',
        actor_id: 'user',
        created_at: summary.completed_at,
      },
    ],
    returns: [],
    adjustments: [],
  };
  const program = {
    id: 'program',
    name: 'โปรแกรมทดสอบ',
    status: 'ACTIVE',
    spend: '10.00',
    earn_points: 1,
    point_value: '1.00',
    revision: 1,
  };
  const customer = {
    id: 'customer',
    code: 'C-UI-001',
    name: 'ลูกค้าทดสอบตาราง',
    phone: '',
    email: '',
    status: 'ACTIVE',
    groups: [],
    notes: '',
    marketing_consent: false,
    revision: 1,
    created_at: summary.completed_at,
    updated_at: summary.completed_at,
  };
  const pageData = (items: unknown[]) => ({
    items,
    page: 1,
    page_size: 25,
    total: items.length,
  });
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url()),
      path = url.pathname,
      method = route.request().method();
    requests.push({ path, method, search: url.search });
    if (method !== 'GET' && !path.endsWith('/customers/search'))
      return route.fulfill({
        status: 405,
        json: { error: { message: 'Writes forbidden in UI test' } },
      });
    let data: unknown;
    if (path === '/api/v1/auth/me')
      data = {
        user: {
          id: 'user',
          display_name: 'ผู้ใช้ทดสอบ',
          email: 'ui@example.test',
          status: 'ACTIVE',
        },
        csrf_token: 'ui-only',
      };
    else if (path === '/api/v1/organizations') data = [organization];
    else if (path.endsWith('/context'))
      data = {
        organization,
        membership: {
          id: 'membership',
          user_id: 'user',
          display_name: 'ผู้ใช้ทดสอบ',
          email: 'ui@example.test',
          role,
          status: 'ACTIVE',
          branch_ids: ['main'],
          permissions,
        },
        branches: [branch],
        permissions,
      };
    else if (path.endsWith('/sales/sale')) data = sale;
    else if (path.endsWith('/sales') || path.endsWith('/receipts'))
      data = pageData([summary]);
    else if (path.endsWith('/refunds/' + refundID)) data = refund;
    else if (path.endsWith('/refunds'))
      data = pageData(
        !url.searchParams.get('search') ||
          url.searchParams.get('search') === refundCode
          ? [refund]
          : [],
      );
    else if (path.endsWith('/customers/search')) data = pageData([customer]);
    else if (path.endsWith('/customers/customer')) data = customer;
    else if (path.endsWith('/customers/groups'))
      data = pageData(
        ['ลูกค้าประจำ', 'ลูกค้าทั่วไป'].map((name, i) => ({
          id: 'group-' + i,
          code: 'GROUP-' + i,
          name,
          status: 'ACTIVE',
          revision: 1,
          member_count: 0,
        })),
      );
    else if (path.endsWith('/loyalty/programs')) data = pageData([program]);
    else if (path.endsWith('/loyalty/accounts'))
      data = pageData(
        ['ACTIVE', 'SUSPENDED'].map((status, i) => ({
          id: 'account-' + i,
          customer_id: customer.id,
          customer_code: customer.code + '-' + i,
          customer_name: customer.name,
          program_id: program.id,
          program_name: program.name,
          program_status: 'ACTIVE',
          status,
          revision: 1,
          balance: '1200',
          available: '1200',
        })),
      );
    else if (path.endsWith('/loyalty/history'))
      data = pageData([
        {
          id: 'earn',
          kind: 'EARN',
          points: '20',
          reason: 'จากยอดซื้อ',
          sale_id: 'sale',
          return_id: null,
          snapshot: {},
          created_at: summary.completed_at,
        },
        {
          id: 'redeem',
          kind: 'REDEEM',
          points: '-10',
          reason: 'ใช้เป็นส่วนลด',
          sale_id: 'sale',
          return_id: null,
          snapshot: {},
          created_at: summary.completed_at,
        },
      ]);
    else data = pageData([]);
    return route.fulfill({ json: { data } });
  });
  return requests;
}

for (const width of [375, 768, 1440]) {
  test(`record tables retain readable rows and contain scrolling at ${width}px`, async ({
    page,
  }, info) => {
    const requests = await recordsAPI(page);
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    for (const [path, sample] of [
      ['sales', 'SAL-UI-001'],
      ['receipts', 'RCP-UI-001'],
      ['sales/refunds', refundCode],
      ['customers', 'ลูกค้าทดสอบตาราง'],
      ['loyalty', 'C-UI-001-0'],
      ['loyalty/history', 'ได้รับแต้มจากการซื้อ'],
    ]) {
      await page.goto('/manage/' + path);
      await expect(
        page.locator('table.record-table tbody tr').filter({ hasText: sample }),
      ).toBeVisible();
      await expect
        .poll(() =>
          page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        )
        .toBe(true);
      const cells = page.locator('table.record-table tbody td');
      await expect(page.locator('table.record-table').first()).toHaveCSS(
        'border-collapse',
        'separate',
      );
      expect(
        await cells
          .first()
          .evaluate((cell) => getComputedStyle(cell).borderTopWidth),
      ).toBe('0px');
      await page.screenshot({
        path: info.outputPath(path.replaceAll('/', '-') + '.png'),
        fullPage: true,
      });
    }
    expect(errors).toEqual([]);
    expect(
      requests.filter(
        (request) =>
          request.method !== 'GET' &&
          !request.path.endsWith('/customers/search'),
      ),
    ).toEqual([]);
  });
}

for (const area of ['manage', 'work']) {
  test(`refund codes navigate, reload, and return inside ${area}`, async ({
    page,
  }) => {
    const requests = await recordsAPI(page);
    await page.goto(`/${area}/sales/refunds`);
    const link = page.getByRole('link', { name: refundCode, exact: true });
    await expect(link).toHaveAttribute(
      'href',
      `/${area}/sales/refunds/${refundCode}`,
    );
    await link.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(
      new RegExp(`/${area}/sales/refunds/${refundCode}$`),
    );
    await expect(page.locator('.returns-print-document')).toContainText(
      '617.25',
    );
    await expect(page.locator('.returns-history')).toHaveCount(0);
    await page.reload();
    await expect(page.locator('.returns-print-document')).toContainText(
      'UI-REFUND',
    );
    const lookup = requests.find(
      (request) =>
        request.path.endsWith('/refunds') &&
        new URLSearchParams(request.search).get('search') === refundCode,
    );
    expect(new URLSearchParams(lookup?.search).get('branch_id')).toBe('main');
    await page
      .getByRole('link', { name: 'ประวัติคืนเงิน', exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(`/${area}/sales/refunds$`));
  });
}

test('unknown refund codes show an empty result without opening another record', async ({
  page,
}) => {
  const requests = await recordsAPI(page);
  await page.goto('/manage/sales/refunds/RET-NOT-FOUND');
  await expect(page.getByRole('alert')).toHaveText('ไม่พบรายการ');
  await expect(page.locator('.returns-print-document')).toHaveCount(0);
  expect(
    requests.some((request) => request.path.endsWith('/refunds/' + refundID)),
  ).toBe(false);
});

test('sale details retain original amounts, receipt paper controls and audit data', async ({
  page,
}, info) => {
  await recordsAPI(page);
  await page.goto('/manage/sales/sale');
  await expect(
    page.getByRole('heading', { name: 'รายละเอียดการขาย', level: 1 }),
  ).toBeVisible();
  await expect(page.locator('.page-heading')).toContainText(
    'COMMITTED TRANSACTION DETAILS',
  );
  await expect(page.locator('.sale-information')).toContainText('1,234.50');
  await page.getByRole('combobox', { name: /^กระดาษ/ }).selectOption('58');
  await expect(page.locator('.pos-receipt')).toHaveClass(/paper-58/);
  await expect(page.locator('.receipt-total > strong')).toHaveText(
    '1,234.50 THB',
  );
  await page.locator('.sale-technical-details > summary').click();
  await expect(
    page.getByRole('cell', { name: 'pos.sale.completed', exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: info.outputPath('sale-details.png'),
    fullPage: true,
  });
});

for (const width of [320, 375, 768, 1440]) {
  test(`customer, loyalty and receipt actions have room at ${width}px`, async ({
    page,
  }, info) => {
    const requests = await recordsAPI(page, 'OWNER', 'RECONCILIATION_REQUIRED');
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/manage/customers/customer');
    await expectActionGap(
      page.getByRole('button', {
        name: 'เพิ่มเข้ากลุ่ม ลูกค้าประจำ',
        exact: true,
      }),
      page.getByRole('button', {
        name: 'เพิ่มเข้ากลุ่ม ลูกค้าทั่วไป',
        exact: true,
      }),
    );
    await page.getByRole('button', { name: 'เก็บถาวร', exact: true }).click();
    await expectActionGap(
      page.getByRole('button', { name: 'ยืนยันเก็บถาวร', exact: true }),
      page.getByRole('button', { name: 'ยกเลิก', exact: true }),
    );
    await page.screenshot({
      path: info.outputPath('customer-actions.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'ยกเลิก', exact: true }).click();
    await page.goto('/manage/customers/groups');
    await page
      .getByRole('button', { name: 'แก้ไขกลุ่ม', exact: true })
      .first()
      .click();
    await expectActionGap(
      page.getByRole('button', { name: 'กลุ่มใหม่', exact: true }),
      page.getByRole('button', { name: 'เก็บถาวร', exact: true }),
    );
    await page.goto('/manage/loyalty');
    const account = page.locator('tr.loyalty-account').first();
    await expectActionGap(
      account.getByRole('link', { name: 'ลูกค้า / Customer', exact: true }),
      account.getByRole('button', {
        name: 'ระงับบัญชี / Suspend account',
        exact: true,
      }),
    );
    await account.locator('.loyalty-adjustment > summary').click();
    await expectActionGap(
      account.getByLabel('เหตุผล (จำเป็น) / Reason (required)', {
        exact: true,
      }),
      account.getByRole('button', {
        name: 'ปรับแต้ม / Adjust points',
        exact: true,
      }),
    );
    await page.screenshot({
      path: info.outputPath('loyalty-actions.png'),
      fullPage: true,
    });
    await page.goto('/manage/sales/sale');
    await expectActionGap(
      page.getByRole('combobox', { name: /^กระดาษ/ }),
      page.getByRole('button', { name: 'พิมพ์ใบเสร็จ', exact: true }),
    );
    await page.screenshot({
      path: info.outputPath('receipt-actions.png'),
      fullPage: true,
    });
    await page.goto('/manage/sales/refunds/' + refundCode);
    const actions = page.locator(
      '.returns-print-document form .catalog-actions .button',
    );
    await expect(actions).toHaveCount(2);
    await expectActionGap(actions.nth(0), actions.nth(1));
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
      )
      .toBe(true);
    expect(
      requests.filter(
        (request) =>
          request.method !== 'GET' &&
          !request.path.endsWith('/customers/search'),
      ),
    ).toEqual([]);
  });
}
