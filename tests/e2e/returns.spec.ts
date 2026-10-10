import { expect, test } from '@playwright/test';
import { returnsFixture } from '../integration/returns-fixtures.mjs';

test.skip(
  process.env.AUTH_E2E !== '1',
  'Requires isolated smartpos-auth-test stack',
);
test('Phase 5.1: real partial return, approval, settlement replay and responsive pages', async ({
  browser,
}, testInfo) => {
  test.setTimeout(240_000);
  const fixture = await returnsFixture();
  const context = await browser.newContext({
    baseURL: 'http://localhost:18088',
    proxy: { server: fixture.owner.source.proxy },
    viewport: { width: 1440, height: 1000 },
  });
  try {
    const original = await fixture.sale();
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
      ({ userID, orgID, branchID }) =>
        sessionStorage.setItem(
          `smartpos-context:${userID}`,
          JSON.stringify({ userID, orgID, branchID }),
        ),
      {
        userID: fixture.owner.id,
        orgID: fixture.org,
        branchID: fixture.branch,
      },
    );
    const page = await context.newPage(),
      errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/pos/returns');
    await expect(
      page.getByRole('heading', { name: 'คืนสินค้าลูกค้า', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('combobox', { name: 'เลือก', exact: true })
      .selectOption(original.id);
    await page.getByLabel('จำนวนคืน INV-ONE', { exact: true }).fill('1');
    await page
      .getByLabel('เหตุผลคืนสินค้า / หลักฐานตรวจสภาพ')
      .fill('Browser inspected return');
    const draftResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith('/returns') &&
        response.request().method() === 'POST',
    );
    await page
      .getByRole('button', { name: 'บันทึกฉบับร่างคืนสินค้า', exact: true })
      .click();
    const draft = (await (await draftResponse).json()).data;
    await expect(
      page.getByRole('heading', { name: 'รายละเอียดคืนสินค้า' }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'ส่งขออนุมัติ', exact: true })
      .click();
    await page.getByRole('button', { name: 'อนุมัติ', exact: true }).click();
    const completedResponse = page.waitForResponse((response) =>
      response.url().endsWith(`/returns/${draft.id}/complete`),
    );
    await page
      .getByRole('button', { name: 'ลงบัญชีคืนสินค้าที่อนุมัติ' })
      .click();
    const completed = (await (await completedResponse).json()).data;
    expect(completed.status).toBe('COMPLETED');
    expect(completed.amount).toBe('2.00');
    expect(completed.items[0].movement_id).toBeTruthy();
    await page.goto('/sales/refunds');
    await page.getByRole('button', { name: draft.number, exact: true }).click();
    const note = page.getByLabel('หลักฐานจ่ายคืน / บันทึกกระทบยอด');
    await page.getByLabel('เลขอ้างอิงการจ่ายคืน').fill('BROWSER-MANUAL-REFUND');
    await note.fill('Manual operator evidence; not bank verification');
    await page.getByRole('checkbox').check();
    await page
      .getByRole('button', { name: 'บันทึกหลักฐานจ่ายคืน', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'ยืนยันผลกระทบยอด', exact: true }),
    ).toBeDisabled();
    await note.fill('Manager reviewed payout evidence');
    await page.getByRole('checkbox').check();
    const confirmResponse = page.waitForResponse((response) =>
      response
        .url()
        .endsWith(`/refunds/${completed.refund_id}/confirm-settlement`),
    );
    await page
      .getByRole('button', { name: 'ยืนยันผลกระทบยอด', exact: true })
      .click();
    const response = await confirmResponse;
    expect(response.status()).toBe(200);
    const confirmed = (await response.json()).data;
    expect(confirmed.status).toBe('CONFIRMED');
    const replay = await fixture.call(
      `/refunds/${completed.refund_id}/confirm-settlement`,
      'POST',
      response.request().postDataJSON(),
      response.request().headers()['idempotency-key'],
    );
    expect(replay.status).toBe(200);
    expect(replay.data.id).toBe(confirmed.id);
    expect((await fixture.ok(`/refunds/${confirmed.id}`)).events).toHaveLength(
      2,
    );
    expect(
      (await fixture.ok(`/returns/sales/${original.id}`)).items[0]
        .returnable_quantity,
    ).toBe('2.000');
    for (const route of ['/pos/returns', '/sales/refunds']) {
      await page.goto(route);
      await expect(
        page.getByRole('heading', {
          name:
            route === '/pos/returns' ? 'คืนสินค้าลูกค้า' : 'ติดตามการคืนเงิน',
          exact: true,
        }),
      ).toBeVisible();
      await page
        .getByRole('button', { name: draft.number, exact: true })
        .click();
      for (const width of [320, 375, 640, 768, 1024, 1440, 1920]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
        if ([320, 768, 1440].includes(width))
          await page.screenshot({
            path: testInfo.outputPath(
              `${route.replaceAll('/', '-')}-${width}.png`,
            ),
            fullPage: true,
          });
      }
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ media: 'print' });
    await expect(page.locator('.returns-print-document')).toBeVisible();
    await expect(
      page.getByRole('navigation', { name: 'Main navigation' }),
    ).toBeHidden();
    await expect(page.locator('.returns-print-document button')).toHaveCount(1);
    await expect(page.locator('.returns-print-document button')).toBeHidden();
    await page.screenshot({
      path: testInfo.outputPath('refund-acknowledgement-print.png'),
      fullPage: true,
    });
    await page.emulateMedia({ media: 'screen' });
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    fixture.close();
  }
});
