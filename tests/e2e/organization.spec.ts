import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import {
  mailpit,
  mailIds,
  startAuthClient,
} from '../integration/auth-fixtures.mjs';

test.skip(
  process.env.AUTH_E2E !== '1',
  'Requires isolated smartpos-auth-test stack',
);
test('Phase 1B: real onboarding, invitation, branch/RBAC isolation, switching and revocation', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const clients: Awaited<ReturnType<typeof startAuthClient>>[] = [];
  const contexts: BrowserContext[] = [];
  const base = 'http://localhost:18088';
  const unique = randomUUID().slice(0, 8).toUpperCase();
  const ownerEmail = `e2e-owner-${randomUUID()}@example.test`;
  const employeeEmail = `e2e-employee-${randomUUID()}@example.test`;
  const password = `E2E-password-${randomUUID()}`;
  async function client() {
    const proxy = await startAuthClient();
    clients.push(proxy);
    const context = await browser.newContext({
      baseURL: base,
      proxy: { server: proxy.proxy },
      viewport: { width: 1440, height: 1000 },
    });
    context.setDefaultTimeout(15_000);
    contexts.push(context);
    return context.newPage();
  }
  async function register(page: Page, email: string, name: string) {
    await page.goto('/register');
    await page.getByLabel('Display name').fill(name);
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
    await expect(page).toHaveURL(/\/settings\/store/);
    await expect(page.getByLabel('ชื่อองค์กร', { exact: true })).toHaveValue(
      name,
    );
  }
  async function api(page: Page, path: string, method = 'GET', data?: object) {
    const me = await page.context().request.get('/api/v1/auth/me');
    const session = (await me.json()).data;
    return page.context().request.fetch(`/api/v1${path}`, {
      method,
      headers: { Origin: base, 'X-CSRF-Token': session.csrf_token },
      ...(data ? { data } : {}),
    });
  }
  try {
    const owner = await client();
    const employee = await client();
    await test.step('E2E 01/02: register and create organization/main branch', async () => {
      await register(owner, ownerEmail, 'E2E Owner');
      await setup(owner, `ร้าน A ${unique}`, `E2EA-${unique}`);
    });
    const orgA = (await (await api(owner, '/organizations')).json()).data.find(
      (item: { code: string }) => item.code === `E2EA-${unique}`,
    );
    const initial = (
      await (await api(owner, `/organizations/${orgA.id}/context`)).json()
    ).data;
    expect(initial.membership.role).toBe('OWNER');
    expect(initial.branches).toHaveLength(1);
    const mainID = initial.branches[0].id;
    await test.step('E2E 03: create additional branch', async () => {
      await owner.goto('/settings/branches');
      await owner
        .getByRole('button', { name: 'เพิ่มสาขา', exact: true })
        .click();
      await owner.getByLabel('ชื่อสาขา', { exact: true }).fill('สาขารอง');
      await owner.getByLabel('รหัสสาขา', { exact: true }).fill('SECOND');
      await owner
        .getByRole('button', { name: 'บันทึกสาขา', exact: true })
        .click();
      await expect(
        owner.getByRole('heading', { name: 'สาขารอง', exact: true }),
      ).toBeVisible();
    });
    const secondary = (
      await (await api(owner, `/organizations/${orgA.id}/branches`)).json()
    ).data.find((item: { code: string }) => item.code === 'SECOND');
    const previous = mailIds(employeeEmail);
    await test.step('E2E 04: invite a new employee', async () => {
      await owner.goto('/employees');
      await owner
        .getByLabel('อีเมลพนักงาน', { exact: true })
        .fill(employeeEmail);
      await owner.getByLabel('บทบาท', { exact: true }).selectOption('CASHIER');
      await owner.getByLabel('สาขาหลัก', { exact: true }).check();
      await owner
        .getByRole('button', { name: 'ส่งคำเชิญ', exact: true })
        .click();
      await expect(
        owner.getByText('ส่งคำเชิญแล้ว · อายุ 48 ชั่วโมง'),
      ).toBeVisible();
    });
    const message = mailpit('/api/v1/messages').messages.find(
      (item: { ID: string; To?: { Address: string }[] }) =>
        !previous.includes(item.ID) &&
        item.To?.some((recipient) => recipient.Address === employeeEmail),
    );
    const token = mailpit(
      `/api/v1/message/${encodeURIComponent(message.ID)}`,
    ).Text.match(/#invitation=([A-Za-z0-9_-]+)/)?.[1];
    expect(token).toBeTruthy();
    await test.step('E2E 05: register invited account and accept recipient-bound invitation', async () => {
      await register(employee, employeeEmail, 'E2E Employee');
      await employee.goto(`/setup#invitation=${token}`);
      await expect(employee).toHaveURL(/\/setup$/);
      await employee
        .getByRole('button', { name: 'รับคำเชิญ', exact: true })
        .click();
      await expect(employee).toHaveURL(/\/settings\/store/);
      await expect(
        employee.getByLabel('ชื่อองค์กร', { exact: true }),
      ).toHaveValue(`ร้าน A ${unique}`);
      await expect(
        employee.getByLabel('ชื่อองค์กร', { exact: true }),
      ).toBeDisabled();
      expect(
        (
          await api(employee, '/invitations/accept', 'POST', { token })
        ).status(),
      ).toBe(404);
    });
    const employeeMembership = (
      await (await api(employee, `/organizations/${orgA.id}/context`)).json()
    ).data.membership;
    await test.step('E2E 06/07: update role and branch; permissions refresh', async () => {
      await owner.goto(`/employees/${employeeMembership.id}`);
      await owner
        .getByLabel('บทบาท', { exact: true })
        .selectOption('INVENTORY_STAFF');
      await owner.getByLabel('สาขาหลัก', { exact: true }).uncheck();
      await owner.getByLabel('สาขารอง', { exact: true }).check();
      await owner
        .getByRole('button', { name: 'บันทึกสมาชิก', exact: true })
        .click();
      await expect(
        owner.getByText('INVENTORY_STAFF ·', { exact: false }),
      ).toBeVisible();
      await employee.goto('/settings/branches');
      await expect(
        employee.getByRole('heading', { name: 'สาขารอง', exact: true }),
      ).toBeVisible();
      await expect(
        employee.getByRole('heading', { name: 'สาขาหลัก', exact: true }),
      ).toHaveCount(0);
      expect(
        (
          await api(employee, `/organizations/${orgA.id}/branches/${mainID}`)
        ).status(),
      ).toBe(404);
    });
    let orgB: { id: string };
    await test.step('E2E 08/09: independent tenant and cross-tenant denial', async () => {
      await setup(owner, `ร้าน B ${unique}`, `E2EB-${unique}`);
      orgB = (await (await api(owner, '/organizations')).json()).data.find(
        (item: { code: string }) => item.code === `E2EB-${unique}`,
      );
      expect(
        (await api(employee, `/organizations/${orgB.id}/members`)).status(),
      ).toBe(404);
      expect(
        (
          await api(employee, `/organizations/${orgB.id}/branches`, 'POST', {
            name: 'Forged',
            code: 'NO',
          })
        ).status(),
      ).toBe(404);
    });
    await test.step('E2E 10/11: escalation and final-owner denial', async () => {
      expect(
        (
          await api(
            employee,
            `/organizations/${orgA.id}/members/${employeeMembership.id}`,
            'PATCH',
            { role: 'OWNER', status: 'ACTIVE', branch_ids: [secondary.id] },
          )
        ).status(),
      ).toBe(403);
      expect(
        (
          await api(
            owner,
            `/organizations/${orgA.id}/members/${initial.membership.id}`,
            'DELETE',
          )
        ).status(),
      ).toBe(409);
    });
    await test.step('E2E 12/14: organization and branch switch persist on refresh', async () => {
      await owner
        .getByLabel('องค์กรที่ใช้งาน', { exact: true })
        .selectOption(orgA.id);
      await expect(owner.getByLabel('ชื่อองค์กร', { exact: true })).toHaveValue(
        `ร้าน A ${unique}`,
      );
      await owner
        .getByLabel('สาขาที่ใช้งาน', { exact: true })
        .selectOption(secondary.id);
      await owner.reload();
      await expect(
        owner.getByLabel('องค์กรที่ใช้งาน', { exact: true }),
      ).toHaveValue(orgA.id);
      await expect(
        owner.getByLabel('สาขาที่ใช้งาน', { exact: true }),
      ).toHaveValue(secondary.id);
    });
    await test.step('responsive pages, keyboard focus and no overflow', async () => {
      for (const width of [320, 375, 640, 768, 1024, 1440, 1920]) {
        await owner.setViewportSize({ width, height: 1000 });
        for (const route of [
          '/setup',
          '/settings/store',
          '/settings/branches',
          '/employees',
          `/employees/${employeeMembership.id}`,
          '/roles',
        ]) {
          await owner.goto(route);
          await expect(owner.getByRole('heading', { level: 1 })).toBeVisible();
          const overflow = await owner.evaluate(
            () => document.documentElement.scrollWidth > window.innerWidth + 1,
          );
          expect(overflow, `${route} at ${width}`).toBe(false);
        }
      }
      await owner.setViewportSize({ width: 320, height: 900 });
      await owner.goto('/settings/branches');
      await expect(owner.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(
        owner.getByRole('heading', {
          name: secondary.name,
          exact: true,
          level: 3,
        }),
      ).toBeVisible();
      await owner.screenshot({
        path: 'test-results/organization-branches-mobile.png',
        fullPage: true,
      });
      await owner.setViewportSize({ width: 1440, height: 1000 });
      await owner.goto('/roles');
      await expect(owner.getByRole('table')).toBeVisible();
      await expect(
        owner.getByRole('columnheader', { name: 'OWNER', exact: true }),
      ).toBeVisible();
      await owner.screenshot({
        path: 'test-results/organization-roles-desktop.png',
        fullPage: true,
      });
      await owner.keyboard.press('Tab');
      expect(
        await owner.evaluate(() => document.activeElement?.tagName),
      ).not.toBe('BODY');
    });
    await test.step('E2E 13: suspended/removed employee loses access without logout', async () => {
      await owner.goto(`/employees/${employeeMembership.id}`);
      await owner
        .getByLabel('สถานะสมาชิก', { exact: true })
        .selectOption('SUSPENDED');
      await owner
        .getByRole('button', { name: 'บันทึกสมาชิก', exact: true })
        .click();
      await expect(
        owner.getByText('SUSPENDED', { exact: true }).first(),
      ).toBeVisible();
      expect(
        (await api(employee, `/organizations/${orgA.id}/context`)).status(),
      ).toBe(404);
      await owner
        .getByLabel('สถานะสมาชิก', { exact: true })
        .selectOption('ACTIVE');
      await owner
        .getByRole('button', { name: 'บันทึกสมาชิก', exact: true })
        .click();
      await expect(
        owner.getByText('ACTIVE', { exact: true }).first(),
      ).toBeVisible();
      await owner
        .getByRole('button', { name: 'ถอนสมาชิก', exact: true })
        .click();
      await owner
        .getByRole('button', { name: 'ยืนยันถอนสมาชิก', exact: true })
        .click();
      await expect(
        owner.getByText('REMOVED', { exact: true }).first(),
      ).toBeVisible();
      expect(
        (await api(employee, `/organizations/${orgA.id}/context`)).status(),
      ).toBe(404);
      await employee.reload();
      await expect(employee).toHaveURL(/\/setup/);
    });
    await test.step('E2E 15: logout and login maintain identity and tenant authorization', async () => {
      await owner.goto('/account');
      await owner
        .getByRole('button', { name: 'Sign out', exact: true })
        .click();
      await expect(owner).toHaveURL(/\/login/);
      expect(
        await owner.evaluate(() =>
          Object.keys(sessionStorage).filter((key) =>
            key.startsWith('smartpos-context:'),
          ),
        ),
      ).toHaveLength(0);
      await owner.getByLabel('Email address').fill(ownerEmail);
      await owner.getByLabel('Password', { exact: true }).fill(password);
      await owner.getByRole('button', { name: 'Sign in', exact: true }).click();
      await expect(
        owner.getByRole('heading', { name: 'Your account' }),
      ).toBeVisible();
      expect(
        (await api(owner, `/organizations/${orgA.id}/context`)).status(),
      ).toBe(200);
    });
  } finally {
    try {
      for (const context of contexts) await context.close();
    } finally {
      for (const proxy of clients) proxy.close();
    }
  }
});
