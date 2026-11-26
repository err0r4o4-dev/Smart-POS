import { expect, test } from '@playwright/test';
import { randomUUID } from 'node:crypto';

// This suite exercises the real app, API and disposable database. Provider events
// remain simulated by the fixture; no Stripe connection is made.
test.skip(
  !process.env.SMARTPOS_RESTAURANT_LIVE_FIXTURE,
  'Requires Main’s isolated restaurant fixture',
);
test.use({ trace: 'off' });
function thousandths(value) {
  expect(value).toMatch(/^\d+\.\d{3}$/);
  const [whole, fraction] = value.split('.');
  return BigInt(whole) * 1000n + BigInt(fraction);
}
for (const mode of ['QR', 'PICKUP']) {
  test(`real ${mode} browser and API settlement with simulated provider`, async ({
    browser,
    request,
  }) => {
    test.setTimeout(120_000);
    const fixture = JSON.parse(process.env.SMARTPOS_RESTAURANT_LIVE_FIXTURE);
    const origin = new URL(process.env.E2E_BASE_URL);
    expect(['127.0.0.1', 'localhost', '[::1]']).toContain(origin.hostname);
    expect(origin.protocol).toBe('http:');
    for (const key of [
      'slug',
      'org',
      'branch',
      'menuVariant',
      'ingredientVariant',
      'tableToken',
      'ownerEmail',
      'ownerPassword',
    ]) {
      expect(typeof fixture[key], `fixture field ${key}`).toBe('string');
      expect(fixture[key].length, `fixture field ${key}`).toBeGreaterThan(0);
    }
    const originHeader = { Origin: origin.origin };
    const login = await request.post(`${origin.origin}/api/v1/auth/login`, {
      headers: originHeader,
      data: { email: fixture.ownerEmail, password: fixture.ownerPassword },
    });
    expect(login.status()).toBe(200);
    const csrf = (await login.json()).data.csrf_token;
    expect(typeof csrf).toBe('string');
    const orgPath = `/api/v1/organizations/${fixture.org}`;
    const stockResponse = await request.get(
      `${origin.origin}/__acceptance/stock`,
    );
    expect(stockResponse.status()).toBe(200);
    const baseline = await stockResponse.json();
    const baselineQuantity = thousandths(baseline.quantity);
    const baselineReserved = thousandths(baseline.reserved);
    expect(Number.isInteger(Number(baseline.sale_movements))).toBe(true);
    expect(Number.isInteger(Number(baseline.sales))).toBe(true);
    const context = await browser.newContext({ baseURL: origin.origin });
    // Block every remote resource. Local application API requests are not mocked.
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (
        route.request().isNavigationRequest() &&
        url.protocol === 'https:' &&
        url.host === 'checkout.stripe.com' &&
        /^\/c\/pay\/cs_test_[A-Za-z0-9]{1,220}$/.test(url.pathname) &&
        !url.search
      ) {
        return route.fulfill({
          status: 200,
          contentType: 'text/html',
          body: '<!doctype html><title>Synthetic checkout</title><h1>Synthetic checkout</h1>',
        });
      }
      if (url.origin !== origin.origin) return route.abort();
      return route.continue();
    });
    try {
      const page = await context.newPage();
      const query = mode === 'QR' ? `?table=${fixture.tableToken}` : '';
      await page.goto(`/shop/${fixture.slug}${query}`);
      await page.getByRole('button', { name: 'เพิ่มลงตะกร้า' }).click();
      await page.getByRole('link', { name: 'ตะกร้า (1)' }).click();
      if (mode === 'DELIVERY')
        await page.getByRole('button', { name: 'จัดส่ง', exact: true }).click();
      const quoteResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname ===
            `/api/v1/storefronts/${fixture.slug}/quote` &&
          response.request().method() === 'POST',
      );
      await page
        .getByRole('button', { name: 'ตรวจรายการและยอดล่าสุด' })
        .click();
      const quoted = await quoteResponse;
      expect(quoted.status()).toBe(200);
      const quote = (await quoted.json()).data;
      expect(quote.estimated_total).toBe(
        mode === 'DELIVERY' ? '15.00' : '10.00',
      );
      expect(quote.shipping_fee).toBe(mode === 'DELIVERY' ? '5.00' : '0.00');
      expect(quote.fulfillment).toBe(
        mode === 'DELIVERY' ? 'DELIVERY' : 'PICKUP',
      );
      if (mode === 'DELIVERY')
        await expect(page.getByText('ค่าจัดส่ง ฿5.00')).toBeVisible();
      await page
        .getByLabel('ชื่อผู้รับสินค้า')
        .fill('Synthetic restaurant guest');
      await page.getByLabel('เบอร์ติดต่อ').fill('0800000000');
      if (mode === 'DELIVERY')
        await page
          .getByLabel('ที่อยู่จัดส่ง')
          .fill('Synthetic delivery address');
      await page.getByRole('checkbox').check();
      const orderResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname ===
            `/api/v1/storefronts/${fixture.slug}/orders` &&
          response.request().method() === 'POST',
      );
      await page
        .getByRole('button', { name: 'ส่งออเดอร์ · ยังไม่ชำระเงิน' })
        .click();
      const submitted = await orderResponse;
      expect(submitted.status()).toBe(201);
      const order = (await submitted.json()).data;
      const accessToken = submitted.request().postDataJSON().access_token;
      expect(typeof accessToken).toBe('string');
      expect(order.estimated_total).toBe(
        mode === 'DELIVERY' ? '15.00' : '10.00',
      );
      expect(order.payment_status).toBe('UNPAID');
      await expect(
        page.getByRole('heading', { name: 'ติดตามออเดอร์' }),
      ).toBeVisible();
      const current = await request.get(
        `${origin.origin}${orgPath}/online-orders/${order.id}`,
      );
      expect(current.status()).toBe(200);
      const detail = (await current.json()).data;
      const advance = await request.post(
        `${origin.origin}${orgPath}/online-orders/${order.id}/status`,
        {
          headers: {
            ...originHeader,
            'X-CSRF-Token': csrf,
            'Idempotency-Key': randomUUID(),
          },
          data: { status: 'PREPARING', message: '', revision: detail.revision },
        },
      );
      expect(advance.status()).toBe(409);
      const settlePath = `${origin.origin}${orgPath}/online-orders/${order.id}/settle-prepaid`;
      const settlementHeaders = {
        ...originHeader,
        'X-CSRF-Token': csrf,
        'Idempotency-Key': randomUUID(),
      };
      const unpaidSettlement = await request.post(settlePath, {
        headers: settlementHeaders,
        data: { revision: detail.revision },
      });
      expect(unpaidSettlement.status()).toBe(409);
      const queue = await request.get(
        `${origin.origin}${orgPath}/restaurant/queue?branch_id=${encodeURIComponent(fixture.branch)}`,
      );
      expect(queue.status()).toBe(200);
      expect(
        (await queue.json()).data.some((item) => item.order_id === order.id),
      ).toBe(false);
      const stock = await request.get(`${origin.origin}/__acceptance/stock`);
      expect(stock.status()).toBe(200);
      const after = await stock.json();
      expect(after.quantity).toBe(baseline.quantity);
      expect(thousandths(after.reserved)).toBe(baselineReserved + 200n);
      expect(Number(after.sale_movements)).toBe(
        Number(baseline.sale_movements),
      );
      expect(Number(after.sales)).toBe(Number(baseline.sales));
      const checkoutResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname ===
            `/api/v1/storefronts/${fixture.slug}/payment/checkout` &&
          response.request().method() === 'POST',
      );
      await page.getByRole('button', { name: 'เริ่มชำระเงิน' }).click();
      const checkout = await checkoutResponse;
      expect([200, 201]).toContain(checkout.status());
      const checkoutData = (await checkout.json()).data;
      expect(checkoutData.attempt.amount_minor).toBe(
        mode === 'DELIVERY' ? 1500 : 1000,
      );
      expect(checkoutData.attempt.currency).toBe('thb');
      expect(checkoutData.attempt.state).not.toBe('PAID');
      const checkoutURL = new URL(checkoutData.url);
      expect(checkoutURL.protocol).toBe('https:');
      expect(checkoutURL.hostname).toBe('checkout.stripe.com');
      await expect(
        page.getByRole('link', { name: 'ไปหน้าชำระเงิน' }),
      ).toHaveAttribute('href', checkoutData.url);
      expect(checkoutData.url.includes(accessToken)).toBe(false);
      await page.getByRole('link', { name: 'ไปหน้าชำระเงิน' }).click();
      await expect(
        page.getByRole('heading', { name: 'Synthetic checkout' }),
      ).toBeVisible();
      const restoredTrack = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname ===
            `/api/v1/storefronts/${fixture.slug}/track` &&
          response.request().method() === 'POST',
      );
      await page.goto(
        `/shop/${fixture.slug}/track/${order.id}?payment_return=1`,
      );
      const restoredResponse = await restoredTrack;
      expect(restoredResponse.status()).toBe(200);
      expect(restoredResponse.request().postDataJSON().order_id).toBe(order.id);
      expect(
        restoredResponse.request().postDataJSON().access_token === accessToken,
      ).toBe(true);
      await expect
        .poll(() => {
          const restored = new URL(page.url());
          return (
            !restored.searchParams.has('payment_return') &&
            new URLSearchParams(restored.hash.slice(1)).get('access') ===
              accessToken
          );
        })
        .toBe(true);
      await expect(
        page.getByRole('heading', { name: 'ติดตามออเดอร์' }),
      ).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'ตรวจสอบสถานะชำระเงิน' }),
      ).toBeEnabled();
      const paid = await request.post(`${origin.origin}/__acceptance/pay`, {
        headers: originHeader,
        data: { order_id: order.id },
      });
      expect(paid.ok()).toBe(true);
      const statusResponse = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname ===
            `/api/v1/storefronts/${fixture.slug}/payment/status` &&
          response.request().method() === 'POST',
      );
      await page.getByRole('button', { name: 'ตรวจสอบสถานะชำระเงิน' }).click();
      const paymentStatus = await statusResponse;
      expect(paymentStatus.status()).toBe(200);
      const attempt = (await paymentStatus.json()).data;
      expect(attempt.state).toBe('PAID');
      const paidStock = await request.get(
        `${origin.origin}/__acceptance/stock`,
      );
      expect(paidStock.status()).toBe(200);
      const retained = await paidStock.json();
      expect(retained.quantity).toBe(after.quantity);
      expect(retained.reserved).toBe(after.reserved);
      expect(Number(retained.sale_movements)).toBe(
        Number(after.sale_movements),
      );
      expect(Number(retained.sales)).toBe(Number(after.sales));
      expect(paymentStatus.request().postDataJSON().order_id).toBe(order.id);
      expect(
        paymentStatus.request().postDataJSON().access_token === accessToken,
      ).toBe(true);
      const wrongToken =
        accessToken === '0'.repeat(64) ? '1'.repeat(64) : '0'.repeat(64);
      const deniedStatus = await request.post(
        `${origin.origin}/api/v1/storefronts/${fixture.slug}/payment/status`,
        {
          headers: originHeader,
          data: { order_id: order.id, access_token: wrongToken },
        },
      );
      expect(deniedStatus.status()).toBe(404);
      const paidQueue = await request.get(
        `${origin.origin}${orgPath}/restaurant/queue?branch_id=${encodeURIComponent(fixture.branch)}`,
      );
      expect(paidQueue.status()).toBe(200);
      const item = (await paidQueue.json()).data.find(
        (entry) => entry.order_id === order.id,
      );
      expect(item).toBeDefined();
      expect(item.channel).toBe(mode === 'QR' ? 'DINE_IN' : mode);
      if (mode === 'QR') expect(item.table_code).toBe(quote.table_code);
      expect(item.queue_number).toBeTruthy();
      let revision = detail.revision;
      for (const status of ['PREPARING', 'READY']) {
        const refreshed = await request.get(
          `${origin.origin}${orgPath}/online-orders/${order.id}`,
        );
        expect(refreshed.status()).toBe(200);
        revision = (await refreshed.json()).data.revision;
        const response = await request.post(
          `${origin.origin}${orgPath}/online-orders/${order.id}/status`,
          {
            headers: {
              ...originHeader,
              'X-CSRF-Token': csrf,
              'Idempotency-Key': randomUUID(),
            },
            data: { status, message: '', revision },
          },
        );
        expect(response.status()).toBe(200);
        expect((await response.json()).data.status).toBe(status);
        const nextQueue = await request.get(
          `${origin.origin}${orgPath}/restaurant/queue?branch_id=${encodeURIComponent(fixture.branch)}`,
        );
        expect(nextQueue.status()).toBe(200);
        const nextItem = (await nextQueue.json()).data.find(
          (entry) => entry.order_id === order.id,
        );
        expect(nextItem.queue_number).toBe(item.queue_number);
        expect(nextItem.status).toBe(status);
      }
      const readyResponse = await request.get(
        `${origin.origin}${orgPath}/online-orders/${order.id}`,
      );
      expect(readyResponse.status()).toBe(200);
      const ready = (await readyResponse.json()).data;
      expect(ready.status).toBe('READY');
      const settlementBody = { revision: ready.revision };
      const wrongOrg =
        fixture.org === '00000000-0000-4000-8000-000000000001'
          ? '00000000-0000-4000-8000-000000000002'
          : '00000000-0000-4000-8000-000000000001';
      const wrongTenant = await request.post(
        `${origin.origin}/api/v1/organizations/${wrongOrg}/online-orders/${order.id}/settle-prepaid`,
        {
          headers: settlementHeaders,
          data: settlementBody,
        },
      );
      expect([403, 404]).toContain(wrongTenant.status());
      const missingCsrf = await request.post(settlePath, {
        headers: { ...originHeader, 'Idempotency-Key': randomUUID() },
        data: settlementBody,
      });
      expect(missingCsrf.status()).toBe(403);
      const staffContext = await browser.newContext({
        baseURL: origin.origin,
        storageState: await request.storageState(),
      });
      let result;
      try {
        await staffContext.route('**/*', async (route) => {
          if (new URL(route.request().url()).origin !== origin.origin)
            return route.abort();
          return route.continue();
        });
        const staff = await staffContext.newPage();
        await staff.goto(`/manage/online-orders/${order.id}`);
        const settlementResponse = staff.waitForResponse(
          (response) =>
            new URL(response.url()).pathname ===
              `${orgPath}/online-orders/${order.id}/settle-prepaid` &&
            response.request().method() === 'POST',
        );
        await staff.getByRole('button', { name: 'ส่งมอบและปิดยอด' }).click();
        const settled = await settlementResponse;
        expect(settled.request().postDataJSON()).toEqual(settlementBody);
        expect(settled.status()).toBe(200);
        result = (await settled.json()).data;
      } finally {
        await staffContext.close();
      }
      expect(result.status).toBe('COMPLETED');
      expect(result.total).toBe('10.00');
      expect(result.sale_id).toBeTruthy();
      const completed = await request.get(
        `${origin.origin}${orgPath}/online-orders/${order.id}`,
      );
      expect(completed.status()).toBe(200);
      expect((await completed.json()).data.status).toBe('COMPLETED');
      const stockAfterSettlement = await request.get(
        `${origin.origin}/__acceptance/stock`,
      );
      expect(stockAfterSettlement.status()).toBe(200);
      const settledStock = await stockAfterSettlement.json();
      expect(thousandths(settledStock.quantity)).toBe(baselineQuantity - 200n);
      expect(thousandths(settledStock.reserved)).toBe(baselineReserved);
      expect(Number(settledStock.sale_movements)).toBe(
        Number(baseline.sale_movements) + 1,
      );
      expect(Number(settledStock.sales)).toBe(Number(baseline.sales) + 1);
      const replay = await request.post(settlePath, {
        headers: settlementHeaders,
        data: settlementBody,
      });
      expect(replay.status()).toBe(200);
      const replayResult = (await replay.json()).data;
      expect(replayResult.id).toBe(result.id);
      expect(replayResult.sale_id).toBe(result.sale_id);
      const replayStock = await request.get(
        `${origin.origin}/__acceptance/stock`,
      );
      expect(replayStock.status()).toBe(200);
      expect(await replayStock.json()).toEqual(settledStock);
    } finally {
      await context.close();
    }
  });
}

test.skip('delivery real lifecycle is blocked pending delivery policy decision', () => {});
