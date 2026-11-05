import { expect, test } from '@playwright/test';

test.use({ trace: 'off' });

const token = 'c'.repeat(64);
const variant = '11111111-1111-4111-8111-111111111111';
const shop = {
  slug: 'restaurant-fixture',
  name: 'ร้านทดสอบ',
  description: '',
  contact_phone: '',
  pickup_instructions: 'รับที่ร้าน',
  published: true,
  accepting_orders: true,
  delivery_enabled: true,
  shipping_fee: '5.00',
  revision: 1,
};
const product = {
  variant_id: variant,
  product_name: 'อาหารทดสอบ',
  variant_name: 'จาน',
  sku: 'FOOD',
  unit: 'จาน',
  unit_type: 'COUNT',
  unit_price: '10.00',
  available: '2.000',
  saleable: true,
  published: true,
};
const quote = {
  quote_id: 'a'.repeat(64),
  table_code: 'T01',
  items: [{ ...product, quantity: '1.000', line_total: '10.00' }],
  estimated_total: '10.00',
  currency: 'THB',
};

async function fixture(page) {
  const calls = [];
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/v1/auth/me') {
      await route.fulfill({
        status: 401,
        json: { error: { code: 'UNAUTHENTICATED' } },
      });
      return;
    }
    let data;
    if (path === '/api/v1/storefronts/restaurant-fixture') data = shop;
    else if (path === '/api/v1/storefronts/restaurant-fixture/products')
      data = { items: [product], total: 1, page: 1, page_size: 24 };
    else if (path.endsWith('/quote')) {
      const body = request.postDataJSON();
      calls.push({ endpoint: 'quote', body });
      data =
        body.fulfillment === 'DELIVERY'
          ? {
              ...quote,
              table_code: undefined,
              fulfillment: 'DELIVERY',
              subtotal: '10.00',
              shipping_fee: '5.00',
              estimated_total: '15.00',
            }
          : body.table_token
            ? quote
            : { ...quote, table_code: undefined };
    } else if (path.endsWith('/orders') || path.endsWith('/track')) {
      if (path.endsWith('/orders'))
        calls.push({
          endpoint: 'orders',
          body: request.postDataJSON(),
          key: request.headers()['idempotency-key'],
        });
      data = {
        id: '22222222-2222-4222-8222-222222222222',
        number: 'WEB-FIXTURE',
        status: 'PENDING',
        payment_status: 'UNPAID',
        table_code: 'T01',
        store_name: shop.name,
        store_phone: '',
        pickup_instructions: shop.pickup_instructions,
        estimated_total: '10.00',
        final_total: null,
        receipt_number: null,
        revision: 1,
        created_at: '2026-10-12T00:00:00Z',
        expires_at: '2026-10-14T00:00:00Z',
        items: quote.items,
        events: [],
      };
    } else {
      throw new Error(`Unexpected fixture API: ${request.method()} ${path}`);
    }
    await route.fulfill({ json: { data } });
  });
  return calls;
}

test('table QR survives browser quote and order submission (API fixtures)', async ({
  page,
}) => {
  const calls = await fixture(page);
  await page.goto(`/shop/restaurant-fixture?table=${token}`);
  await page.getByRole('button', { name: 'เพิ่มลงตะกร้า' }).click();
  const cart = page.getByRole('link', { name: 'ตะกร้า (1)' });
  await expect(cart).toHaveAttribute(
    'href',
    `/shop/restaurant-fixture/cart?table=${token}`,
  );
  await cart.click();
  await page.getByRole('button', { name: 'ตรวจรายการและยอดล่าสุด' }).click();
  await expect(page.getByText('โต๊ะ T01')).toBeVisible();
  await page.getByLabel('ชื่อผู้รับสินค้า').fill('Synthetic guest');
  await page.getByLabel('เบอร์ติดต่อ').fill('0800000000');
  await page.getByRole('checkbox').check();
  await page
    .getByRole('button', { name: 'ส่งออเดอร์ · ยังไม่ชำระเงิน' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'ติดตามออเดอร์' }),
  ).toBeVisible();
  await expect(page.getByText('โต๊ะ T01')).toBeVisible();
  expect(calls.map(({ endpoint }) => endpoint)).toEqual(['quote', 'orders']);
  for (const { body } of calls) {
    expect(body).toMatchObject({
      fulfillment: 'PICKUP',
      table_token: token,
      items: [{ variant_id: variant, quantity: '1.000' }],
    });
  }
});

test('pickup quote and order retain quantity and order identity (API fixtures)', async ({
  page,
}) => {
  const calls = await fixture(page);
  await page.goto('/shop/restaurant-fixture');
  await page.getByRole('button', { name: 'เพิ่มลงตะกร้า' }).click();
  await page.getByRole('link', { name: 'ตะกร้า (1)' }).click();
  await page.getByRole('button', { name: 'ตรวจรายการและยอดล่าสุด' }).click();
  await expect(page.getByLabel('ชื่อผู้รับสินค้า')).toBeVisible();
  await page.getByLabel('ชื่อผู้รับสินค้า').fill('Synthetic pickup guest');
  await page.getByLabel('เบอร์ติดต่อ').fill('0800000000');
  await page.getByRole('checkbox').check();
  await page
    .getByRole('button', { name: 'ส่งออเดอร์ · ยังไม่ชำระเงิน' })
    .click();
  await expect(
    page.getByRole('heading', { name: 'ติดตามออเดอร์' }),
  ).toBeVisible();
  expect(calls.map(({ endpoint }) => endpoint)).toEqual(['quote', 'orders']);
  const [review, order] = calls;
  for (const { body } of calls) {
    expect(body.items).toEqual([{ variant_id: variant, quantity: '1.000' }]);
    expect(body.table_token).toBeUndefined();
    expect(body.fulfillment ?? 'PICKUP').toBe('PICKUP');
  }
  expect(order.body.quote_id).toBe(quote.quote_id);
  expect(order.key).toMatch(/^[a-f0-9-]{36}$/);
  expect(order.body.access_token).toMatch(/^[a-f0-9]{64}$/);
  expect(review.body.delivery_address).toBeUndefined();
  expect(order.body.delivery_address).toBeUndefined();
  expect(new URL(page.url()).search).not.toContain(order.body.access_token);
});

test('delivery requires an address and displays the quoted shipping fee (API fixtures)', async ({
  page,
}) => {
  const calls = await fixture(page);
  await page.goto('/shop/restaurant-fixture');
  await page.getByRole('button', { name: 'เพิ่มลงตะกร้า' }).click();
  await page.getByRole('link', { name: 'ตะกร้า (1)' }).click();
  await page.getByRole('button', { name: 'จัดส่ง', exact: true }).click();
  await page.getByRole('button', { name: 'ตรวจรายการและยอดล่าสุด' }).click();
  await expect(page.getByText('ค่าจัดส่ง ฿5.00')).toBeVisible();
  await expect(page.getByRole('heading', { name: /15\.00/ })).toBeVisible();
  await page.getByLabel('ชื่อผู้รับสินค้า').fill('Synthetic delivery guest');
  await page.getByLabel('เบอร์ติดต่อ').fill('0800000000');
  await page.getByRole('checkbox').check();
  const submit = page.getByRole('button', {
    name: 'ส่งออเดอร์ · ยังไม่ชำระเงิน',
  });
  await expect(submit).toBeDisabled();
  expect(calls.map(({ endpoint }) => endpoint)).toEqual(['quote']);
  await page.getByLabel('ที่อยู่จัดส่ง').fill('  Synthetic delivery address  ');
  await submit.click();
  await expect(
    page.getByRole('heading', { name: 'ติดตามออเดอร์' }),
  ).toBeVisible();
  expect(calls.map(({ endpoint }) => endpoint)).toEqual(['quote', 'orders']);
  expect(calls[0].body).toMatchObject({
    fulfillment: 'DELIVERY',
    items: [{ variant_id: variant, quantity: '1.000' }],
  });
  expect(calls[1].body).toMatchObject({
    fulfillment: 'DELIVERY',
    delivery_address: 'Synthetic delivery address',
    quote_id: quote.quote_id,
  });
  expect(calls[1].body.table_token).toBeUndefined();
});

test('customer payment UI waits for server confirmation (API fixtures)', async ({
  page,
}) => {
  await fixture(page);
  let paid = false;
  const paymentCalls = [];
  const url = 'https://checkout.stripe.com/c/pay/cs_test_synthetic';
  await page.route(
    '**/api/v1/storefronts/restaurant-fixture/payment/*',
    async (route) => {
      const action = new URL(route.request().url()).pathname.split('/').at(-1);
      paymentCalls.push(action);
      const attempt = {
        state: paid ? 'PAID' : 'OPEN',
        amount_minor: 1000,
        currency: 'thb',
      };
      await route.fulfill({
        json: {
          data:
            action === 'status' ? attempt : { attempt, url: paid ? '' : url },
        },
      });
    },
  );
  await page.goto(
    `/shop/restaurant-fixture/track/22222222-2222-4222-8222-222222222222#access=${token}`,
  );
  await page.getByRole('button', { name: 'เริ่มชำระเงิน' }).click();
  await expect(
    page.getByRole('link', { name: 'ไปหน้าชำระเงิน' }),
  ).toHaveAttribute('href', url);
  await expect(page.getByText('สถานะชำระเงิน: OPEN')).toBeVisible();
  await expect(page.getByText('ยืนยันการชำระเงินแล้ว')).toHaveCount(0);
  paid = true;
  await page.getByRole('button', { name: 'ตรวจสอบสถานะชำระเงิน' }).click();
  await expect(page.getByText('ยืนยันการชำระเงินแล้ว')).toBeVisible();
  await expect(page.getByRole('link', { name: 'ไปหน้าชำระเงิน' })).toHaveCount(
    0,
  );
  expect(paymentCalls).toEqual(['checkout', 'status']);
});

test('rejected table quote can be retried without submitting an order (API fixtures)', async ({
  page,
}) => {
  const calls = await fixture(page);
  let rejectQuote = true;
  await page.route(
    '**/api/v1/storefronts/restaurant-fixture/quote',
    async (route) => {
      if (!rejectQuote) return route.fallback();
      expect(route.request().postDataJSON()).toMatchObject({
        fulfillment: 'PICKUP',
        table_token: token,
      });
      await route.fulfill({
        status: 409,
        json: {
          error: {
            code: 'CONFLICT',
            message: 'Synthetic table quote rejected',
          },
        },
      });
    },
  );
  await page.goto(`/shop/restaurant-fixture?table=${token}`);
  await page.getByRole('button', { name: 'เพิ่มลงตะกร้า' }).click();
  await page.getByRole('link', { name: 'ตะกร้า (1)' }).click();
  const review = page.getByRole('button', { name: 'ตรวจรายการและยอดล่าสุด' });
  await review.click();
  await expect(page.getByRole('alert')).toContainText(
    'Synthetic table quote rejected',
  );
  await expect(
    page.getByRole('button', { name: 'ส่งออเดอร์ · ยังไม่ชำระเงิน' }),
  ).toHaveCount(0);
  expect(calls).toEqual([]);
  rejectQuote = false;
  await review.click();
  await expect(page.getByText('โต๊ะ T01')).toBeVisible();
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({
    endpoint: 'quote',
    body: { table_token: token, fulfillment: 'PICKUP' },
  });
});

for (const search of [
  'table=invalid',
  `table=${token}&table=${'b'.repeat(64)}`,
]) {
  test(`invalid QR cannot silently become pickup: ${search.slice(0, 20)} (API fixtures)`, async ({
    page,
  }) => {
    const calls = await fixture(page);
    await page.addInitScript(
      ({ item }) => {
        localStorage.setItem(
          'shop-cart:restaurant-fixture',
          JSON.stringify([{ ...item, quantity: '1.000' }]),
        );
      },
      { item: product },
    );
    await page.goto(`/shop/restaurant-fixture/cart?${search}`);
    await expect(page.getByRole('alert')).toContainText('ลิงก์โต๊ะไม่ถูกต้อง');
    await expect(
      page.getByRole('button', { name: 'ตรวจรายการและยอดล่าสุด' }),
    ).toBeDisabled();
    expect(calls).toEqual([]);
  });
}

for (const [status, button] of [
  ['PENDING', 'เริ่มเตรียมสินค้า'],
  ['PREPARING', 'พร้อมรับสินค้า'],
]) {
  test(`unpaid ${status} order cannot advance from staff UI (API fixtures)`, async ({
    page,
  }) => {
    const org = 'workspace-shop';
    const orderId = '22222222-2222-4222-8222-222222222222';
    const organization = {
      id: org,
      name: 'ร้านทดสอบ',
      code: 'TEST',
      business_type: 'restaurant',
      currency: 'THB',
      status: 'ACTIVE',
    };
    const permissions = [
      'organization.read',
      'online_orders.read',
      'online_orders.manage',
    ];
    let transitions = 0;
    await page.route('**/api/**', async (route) => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      let data;
      if (path === '/api/v1/auth/me')
        data = {
          user: {
            id: 'staff-user',
            display_name: 'Staff',
            email: 'staff@example.test',
            status: 'ACTIVE',
          },
          csrf_token: 'synthetic',
        };
      else if (path === '/api/v1/organizations') data = [organization];
      else if (path === `/api/v1/organizations/${org}/context`)
        data = {
          organization,
          membership: {
            id: 'member',
            user_id: 'staff-user',
            role: 'OWNER',
            status: 'ACTIVE',
            branch_ids: ['main'],
            permissions,
          },
          branches: [
            {
              id: 'main',
              organization_id: org,
              name: 'สาขาหลัก',
              code: 'MAIN',
              status: 'ACTIVE',
              is_main: true,
            },
          ],
          permissions,
        };
      else if (path === `/api/v1/organizations/${org}/online-orders/${orderId}`)
        data = {
          id: orderId,
          number: 'WEB-UNPAID',
          status,
          payment_status: 'UNPAID',
          customer_name: 'Synthetic guest',
          contact_phone: '0800000000',
          customer_note: '',
          store_name: shop.name,
          store_phone: '',
          pickup_instructions: '',
          estimated_total: '10.00',
          final_total: null,
          receipt_number: null,
          revision: 1,
          created_at: '2026-10-12T00:00:00Z',
          expires_at: '2026-10-14T00:00:00Z',
          items: quote.items,
          events: [],
        };
      else if (path.endsWith('/status')) {
        transitions++;
        await route.fulfill({
          status: 409,
          json: { error: { code: 'CONFLICT', message: 'Payment required' } },
        });
        return;
      } else {
        await route.fulfill({
          status: 404,
          json: { error: { message: 'Unmocked fixture endpoint' } },
        });
        return;
      }
      await route.fulfill({ json: { data } });
    });
    await page.goto(`/work/online-orders/${orderId}`);
    await expect(page.getByText('WEB-UNPAID')).toBeVisible();
    await expect(page.getByRole('button', { name: button })).toBeDisabled();
    expect(transitions).toBe(0);
  });
}

test('kitchen queue displays paid channel and status from the API (API fixtures)', async ({
  page,
}) => {
  const org = 'workspace-shop';
  const organization = {
    id: org,
    name: 'ร้านทดสอบ',
    code: 'TEST',
    business_type: 'restaurant',
    currency: 'THB',
    status: 'ACTIVE',
  };
  const permissions = ['organization.read', 'online_orders.read'];
  let showQueue = false;
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data;
    if (path === '/api/v1/auth/me')
      data = {
        user: {
          id: 'staff-user',
          display_name: 'Staff',
          email: 'staff@example.test',
          status: 'ACTIVE',
        },
        csrf_token: 'synthetic',
      };
    else if (path === '/api/v1/organizations') data = [organization];
    else if (path === `/api/v1/organizations/${org}/context`)
      data = {
        organization,
        membership: {
          id: 'member',
          user_id: 'staff-user',
          role: 'OWNER',
          status: 'ACTIVE',
          branch_ids: ['main'],
          permissions,
        },
        branches: [
          {
            id: 'main',
            organization_id: org,
            name: 'สาขาหลัก',
            code: 'MAIN',
            status: 'ACTIVE',
            is_main: true,
          },
        ],
        permissions,
      };
    else if (path === `/api/v1/organizations/${org}/restaurant/queue`) {
      expect(new URL(route.request().url()).searchParams.get('branch_id')).toBe(
        'main',
      );

      data = !showQueue
        ? []
        : [
            {
              order_id: 'one',
              queue_number: '001',
              channel: 'DINE_IN',
              table_code: 'T01',
              status: 'PENDING',
              created_at: '2026-10-12T00:00:00Z',
            },
            {
              order_id: 'two',
              queue_number: '002',
              channel: 'PICKUP',
              status: 'PREPARING',
              created_at: '2026-10-12T00:00:00Z',
            },
            {
              order_id: 'three',
              queue_number: '003',
              channel: 'DELIVERY',
              status: 'READY',
              created_at: '2026-10-12T00:00:00Z',
            },
          ];
    } else {
      await route.fulfill({
        status: 404,
        json: { error: { message: 'Unmocked fixture endpoint' } },
      });
      return;
    }
    await route.fulfill({ json: { data } });
  });
  await page.goto('/work/restaurant/queue');
  await expect(
    page.getByText('ยังไม่มีออเดอร์ที่ชำระแล้วรอทำอาหาร'),
  ).toBeVisible();
  showQueue = true;
  await page.getByRole('button', { name: 'อัปเดตคิว' }).click();
  await expect(
    page.getByRole('row', { name: /001.*ทานที่ร้าน · โต๊ะ T01.*รอทำ/ }),
  ).toBeVisible();
  await expect(
    page.getByRole('row', { name: /002.*รับที่ร้าน.*กำลังทำ/ }),
  ).toBeVisible();
  await expect(
    page.getByRole('row', { name: /003.*จัดส่ง.*พร้อมรับ/ }),
  ).toBeVisible();
});
