import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { startAuthClient } from '../integration/auth-fixtures.mjs';

test.skip(
  process.env.AUTH_E2E !== '1',
  'Requires isolated smartpos-auth-test stack',
);

test('real owner onboarding, branch management, tenant isolation and retired employee routes', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  // This guard follows the existing real storefront suite. The caller must also
  // verify that the API actually uses this disposable database before running.
  expect(process.env.AUTH_TEST_DATABASE).toMatch(
    /^smartpos_phase53_[a-z0-9_]+$/,
  );
  expect(process.env.E2E_BASE_URL).toBe('http://localhost:18088');
  const base = 'http://localhost:18088';
  const clients: Awaited<ReturnType<typeof startAuthClient>>[] = [];
  const contexts: BrowserContext[] = [];
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const password = `E2E-password-${randomUUID()}`;
  async function client() {
    const source = await startAuthClient();
    clients.push(source);
    const context = await browser.newContext({
      baseURL: base,
      proxy: { server: source.proxy },
      viewport: { width: 1440, height: 1000 },
    });
    contexts.push(context);
    context.setDefaultTimeout(15_000);
    return context.newPage();
  }
  async function register(page: Page, email: string) {
    await page.goto('/register');
    await page.getByLabel('ชื่อที่แสดง').fill('Synthetic owner');
    await page.getByLabel('ที่อยู่อีเมล').fill(email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(password);
    await page.getByLabel('ยืนยันรหัสผ่าน').fill(password);
    await page.getByRole('button', { name: 'สร้างบัญชี', exact: true }).click();
    await expect(page).toHaveURL(/\/login\?registered=1$/);
    await page.getByLabel('ที่อยู่อีเมล').fill(email);
    await page.getByLabel('รหัสผ่าน', { exact: true }).fill(password);
    await page
      .getByRole('button', { name: 'เข้าสู่ระบบ', exact: true })
      .click();
    await expect(
      page.getByRole('heading', { name: 'บัญชีของคุณ' }),
    ).toBeVisible();
  }
  async function setup(page: Page, name: string, code: string) {
    await page.goto('/setup');
    await page.getByLabel('ชื่อองค์กร', { exact: true }).fill(name);
    await page.getByLabel('รหัสองค์กร', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'ถัดไป', exact: true }).click();
    await expect(page.getByLabel('ชื่อสาขา', { exact: true })).toHaveValue(
      'สาขาหลัก',
    );
    await page.getByRole('button', { name: 'ถัดไป', exact: true }).click();
    await page.getByRole('button', { name: 'สร้างร้าน', exact: true }).click();
    await expect(page).toHaveURL(/\/manage\/settings\/store$/);
    await expect(page.getByLabel('ชื่อองค์กร', { exact: true })).toHaveValue(
      name,
    );
  }
  async function api(page: Page, path: string, method = 'GET', data?: object) {
    const me = await page.context().request.get('/api/v1/auth/me');
    expect(me.status()).toBe(200);
    const session = (await me.json()).data;
    return page.context().request.fetch(`/api/v1${path}`, {
      method,
      headers: { Origin: base, 'X-CSRF-Token': session.csrf_token },
      ...(data ? { data } : {}),
    });
  }
  try {
    const owner = await client();
    const other = await client();
    await register(owner, `owner-${randomUUID()}@example.test`);
    await setup(owner, `ร้าน A ${suffix}`, `E2EA-${suffix}`);
    const firstList = await api(owner, '/organizations');
    expect(firstList.status()).toBe(200);
    const orgA = (await firstList.json()).data.find(
      (item: { code: string }) => item.code === `E2EA-${suffix}`,
    );
    expect(orgA).toBeTruthy();
    const contextA = await api(owner, `/organizations/${orgA.id}/context`);
    expect(contextA.status()).toBe(200);
    const initial = (await contextA.json()).data;
    expect(initial.membership.role).toBe('OWNER');
    expect(initial.branches).toHaveLength(1);

    await owner.goto('/manage/settings/branches');
    await owner.getByRole('button', { name: 'เพิ่มสาขา', exact: true }).click();
    await owner.getByLabel('ชื่อสาขา', { exact: true }).fill('สาขารอง');
    await owner.getByLabel('รหัสสาขา', { exact: true }).fill('SECOND');
    await owner
      .getByRole('button', { name: 'บันทึกสาขา', exact: true })
      .click();
    await expect(
      owner.getByRole('heading', { name: 'สาขารอง', exact: true }),
    ).toBeVisible();
    const branches = await api(owner, `/organizations/${orgA.id}/branches`);
    expect(branches.status()).toBe(200);
    expect(
      (await branches.json()).data.some(
        (item: { code: string }) => item.code === 'SECOND',
      ),
    ).toBe(true);

    await register(other, `other-${randomUUID()}@example.test`);
    await setup(other, `ร้าน B ${suffix}`, `E2EB-${suffix}`);
    const otherList = await api(other, '/organizations');
    expect(otherList.status()).toBe(200);
    const otherOrgs = (await otherList.json()).data;
    const orgB = otherOrgs.find(
      (item: { code: string }) => item.code === `E2EB-${suffix}`,
    );
    expect(orgB).toBeTruthy();
    expect(otherOrgs.some((item: { id: string }) => item.id === orgA.id)).toBe(
      false,
    );
    expect(
      (await api(owner, `/organizations/${orgB.id}/context`)).status(),
    ).toBe(404);
    expect(
      (await api(other, `/organizations/${orgA.id}/context`)).status(),
    ).toBe(404);
    expect(
      (await api(other, `/organizations/${orgA.id}/branches`)).status(),
    ).toBe(404);

    for (const path of [
      '/work',
      '/staff',
      '/employees',
      '/roles',
      '/manage/employees',
      '/manage/roles',
      '/manage/invitations',
    ]) {
      await owner.goto(path);
      await expect(owner.getByText('404 · NOT FOUND')).toBeVisible();
    }
    for (const [method, path, data] of [
      ['POST', '/invitations/accept', { token: 'fixture' }],
      ['GET', `/organizations/${orgA.id}/roles`, undefined],
      ['GET', `/organizations/${orgA.id}/members`, undefined],
      [
        'GET',
        `/organizations/${orgA.id}/members/${initial.membership.id}`,
        undefined,
      ],
      [
        'PATCH',
        `/organizations/${orgA.id}/members/${initial.membership.id}`,
        {
          role: 'OWNER',
          status: 'ACTIVE',
          branch_ids: [initial.branches[0].id],
        },
      ],
      [
        'DELETE',
        `/organizations/${orgA.id}/members/${initial.membership.id}`,
        undefined,
      ],
      ['GET', `/organizations/${orgA.id}/invitations`, undefined],
      [
        'POST',
        `/organizations/${orgA.id}/invitations`,
        {
          email: 'fixture@example.test',
          role: 'CASHIER',
          branch_ids: [initial.branches[0].id],
        },
      ],
      [
        'DELETE',
        `/organizations/${orgA.id}/invitations/${randomUUID()}`,
        undefined,
      ],
    ] as const)
      expect(
        (await api(owner, path, method, data)).status(),
        `${method} ${path}`,
      ).toBe(404);

    await setup(owner, `ร้าน C ${suffix}`, `E2EC-${suffix}`);
    const ownerList = await api(owner, '/organizations');
    expect(ownerList.status()).toBe(200);
    const ownerOrgs = (await ownerList.json()).data;
    const orgC = ownerOrgs.find(
      (item: { code: string }) => item.code === `E2EC-${suffix}`,
    );
    expect(orgC).toBeTruthy();
    expect(ownerOrgs.some((item: { id: string }) => item.id === orgB.id)).toBe(
      false,
    );
    await owner.goto('/setup');
    await owner
      .getByRole('button', { name: `ร้าน A ${suffix}`, exact: true })
      .click();
    await expect(owner).toHaveURL(/\/manage\/settings\/store$/);
    await expect(owner.getByLabel('ชื่อองค์กร', { exact: true })).toHaveValue(
      `ร้าน A ${suffix}`,
    );
    await owner.reload();
    await expect(owner.getByLabel('ชื่อองค์กร', { exact: true })).toHaveValue(
      `ร้าน A ${suffix}`,
    );
    await owner.goto('/setup');
    await owner
      .getByRole('button', { name: `ร้าน C ${suffix}`, exact: true })
      .click();
    await expect(owner).toHaveURL(/\/manage\/settings\/store$/);
    await expect(owner.getByLabel('ชื่อองค์กร', { exact: true })).toHaveValue(
      `ร้าน C ${suffix}`,
    );
    await owner.reload();
    await expect(owner.getByLabel('ชื่อองค์กร', { exact: true })).toHaveValue(
      `ร้าน C ${suffix}`,
    );
    await owner.goto('/account');
    await owner
      .getByRole('button', { name: 'ออกจากระบบ', exact: true })
      .click();
    await expect(owner).toHaveURL(/\/login(?:\?returnTo=%2Faccount)?$/);
    expect(
      (await owner.context().request.get('/api/v1/auth/me')).status(),
    ).toBe(401);
    await owner.goto('/manage/dashboard');
    await expect(owner).toHaveURL(/\/login\?returnTo=%2Fmanage%2Fdashboard$/);
  } finally {
    try {
      for (const context of contexts) await context.close();
    } finally {
      for (const source of clients) source.close();
    }
  }
});
