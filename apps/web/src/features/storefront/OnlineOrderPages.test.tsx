import { render } from '../../test/render';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import { OnlineOrderPage, StorefrontSettingsPage } from './OnlineOrderPages';

const mocks = vi.hoisted(() => ({ manage: true, request: vi.fn() }));
vi.mock('../../app/AuthProvider', () => ({
  useAuth: () => ({
    state: { session: { user: { id: 'user' }, csrf_token: 'csrf' } },
  }),
}));
vi.mock('../../app/OrganizationProvider', () => ({
  useOrganization: () => ({
    context: { organization: { id: 'org', name: 'ร้านทดสอบ' } },
    branchID: 'branch',
    can: (permission: string) =>
      permission === 'online_orders.read' || mocks.manage,
  }),
}));
vi.mock('../../lib/pos-api', async (original) => ({
  ...(await original<typeof import('../../lib/pos-api')>()),
  posRequest: mocks.request,
}));
const terminal = {
  id: 'terminal',
  name: 'เครื่องขายหลัก',
  code: 'POS',
  branch_id: 'branch',
  stock_location_id: 'shelf',
  status: 'ACTIVE',
};
const order = {
  id: 'order',
  number: 'WEB-TEST',
  status: 'PENDING',
  payment_status: 'UNPAID',
  customer_name: 'ลูกค้าทดสอบ',
  contact_phone: '0812345678',
  store_name: 'ร้านทดสอบ',
  store_phone: '020000000',
  pickup_instructions: 'รับหน้าเคาน์เตอร์',
  estimated_total: '2.00',
  final_total: null,
  receipt_number: null,
  revision: 1,
  created_at: '2026-10-11T00:00:00Z',
  expires_at: '2026-10-13T00:00:00Z',
  items: [],
  events: [],
};
function view(settings = false) {
  return render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: {
            queries: { retry: false },
            mutations: { retry: false },
          },
        })
      }
    >
      <MemoryRouter
        initialEntries={[
          settings
            ? '/manage/settings/storefront'
            : '/work/online-orders/order',
        ]}
      >
        <Routes>
          <Route
            path="/manage/settings/storefront"
            element={<StorefrontSettingsPage />}
          />
          <Route
            path="/work/online-orders/:orderId"
            element={<OnlineOrderPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  mocks.manage = true;
  mocks.request.mockReset();
  mocks.request.mockImplementation(async (_org: string, path: string) =>
    path.startsWith('/pos/terminals') ? { items: [terminal] } : order,
  );
});
it('allows initial store setup when settings do not exist', async () => {
  mocks.request.mockImplementation(
    async (_org: string, path: string, options: { method?: string }) => {
      if (path.startsWith('/pos/terminals')) return { items: [terminal] };
      if (path === '/storefront' && options.method !== 'PUT')
        throw new ApiError(404, 'Not configured');
      return {};
    },
  );
  view(true);
  const save = await screen.findByRole('button', { name: 'บันทึกการตั้งค่า' });
  expect(screen.getByText(/ออเดอร์ใหม่กันจำนวนสินค้าจนหมดอายุ/)).toBeVisible();
  expect(save).toBeEnabled();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/ชื่อใน URL/), {
    target: { value: 'test-shop' },
  });
  fireEvent.change(screen.getByLabelText(/เครื่องขาย \/ สาขา/), {
    target: { value: 'terminal' },
  });
  fireEvent.click(save);
  await waitFor(() =>
    expect(mocks.request).toHaveBeenCalledWith(
      'org',
      '/storefront',
      expect.objectContaining({
        method: 'PUT',
        csrf: 'csrf',
        body: expect.objectContaining({
          slug: 'test-shop',
          terminal_id: 'terminal',
          revision: 0,
        }),
      }),
    ),
  );
});
it('does not turn settings permission failure into a create form', async () => {
  mocks.request.mockImplementation(async (_org: string, path: string) => {
    if (path === '/storefront') throw new ApiError(403, 'ไม่มีสิทธิ์');
    return { items: [terminal] };
  });
  view(true);
  expect(await screen.findByRole('alert')).toHaveTextContent('ไม่มีสิทธิ์');
  expect(
    screen.queryByRole('button', { name: 'บันทึกการตั้งค่า' }),
  ).not.toBeInTheDocument();
});
it('saves a separate online terminal without replacing the front terminal', async () => {
  const backTerminal = {
    ...terminal,
    id: 'back-terminal',
    name: 'เครื่องขายหลังร้าน',
    code: 'ONLINE',
    stock_location_id: 'warehouse',
  };
  mocks.request.mockImplementation(
    async (_org: string, path: string, options: { method?: string }) => {
      if (path.startsWith('/pos/terminals'))
        return { items: [terminal, backTerminal] };
      if (path === '/storefront' && options.method !== 'PUT')
        throw new ApiError(404, 'Not configured');
      return {};
    },
  );
  view(true);
  await screen.findByRole('button', { name: 'บันทึกการตั้งค่า' });
  fireEvent.change(screen.getByLabelText(/ชื่อใน URL/), {
    target: { value: 'test-shop' },
  });
  fireEvent.change(screen.getByLabelText(/เครื่องขาย \/ สาขา/), {
    target: { value: 'terminal' },
  });
  fireEvent.change(screen.getByLabelText(/เครื่องขายออนไลน์จากคลังหลังร้าน/), {
    target: { value: 'back-terminal' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'บันทึกการตั้งค่า' }));
  await waitFor(() =>
    expect(mocks.request).toHaveBeenCalledWith(
      'org',
      '/storefront',
      expect.objectContaining({
        method: 'PUT',
        body: expect.objectContaining({
          terminal_id: 'terminal',
          online_terminal_id: 'back-terminal',
        }),
      }),
    ),
  );
});
it('loads the stored online source and clears it when the front terminal changes', async () => {
  const backTerminal = {
    ...terminal,
    id: 'back-terminal',
    name: 'เครื่องขายหลังร้าน',
    stock_location_id: 'warehouse',
  };
  mocks.request.mockImplementation(async (_org: string, path: string) => {
    if (path.startsWith('/pos/terminals'))
      return { items: [terminal, backTerminal] };
    if (path === '/storefront')
      return {
        slug: 'test-shop',
        name: 'ร้านทดสอบ',
        terminal_id: 'terminal',
        online_terminal_id: 'back-terminal',
        revision: 2,
      };
    return { items: [] };
  });
  view(true);
  const selector = await screen.findByRole('combobox', {
    name: /เครื่องขายออนไลน์จากคลังหลังร้าน/,
  });
  expect(selector).toHaveValue('back-terminal');
  expect(
    within(selector).queryByRole('option', { name: /เครื่องขายหลัก/ }),
  ).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/เครื่องขาย \/ สาขา/), {
    target: { value: 'back-terminal' },
  });
  expect(selector).toHaveValue('');
  expect(
    within(selector).queryByRole('option', { name: /เครื่องขายหลังร้าน/ }),
  ).not.toBeInTheDocument();
});
it('sends an explicit shared source and preserves the choice after a conflict', async () => {
  const backTerminal = {
    ...terminal,
    id: 'back-terminal',
    name: 'เครื่องขายหลังร้าน',
    stock_location_id: 'warehouse',
  };
  mocks.request.mockImplementation(
    async (_org: string, path: string, options: { method?: string }) => {
      if (path.startsWith('/pos/terminals'))
        return { items: [terminal, backTerminal] };
      if (path === '/storefront' && options.method === 'PUT')
        throw new ApiError(409, 'ยังมีออเดอร์ค้างอยู่');
      if (path === '/storefront')
        return {
          slug: 'test-shop',
          name: 'ร้านทดสอบ',
          terminal_id: 'terminal',
          online_terminal_id: 'back-terminal',
          revision: 2,
        };
      return { items: [] };
    },
  );
  view(true);
  const selector = await screen.findByRole('combobox', {
    name: /เครื่องขายออนไลน์จากคลังหลังร้าน/,
  });
  fireEvent.change(selector, { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'บันทึกการตั้งค่า' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'ยังมีออเดอร์ค้างอยู่',
  );
  expect(selector).toHaveValue('');
  expect(mocks.request).toHaveBeenCalledWith(
    'org',
    '/storefront',
    expect.objectContaining({
      method: 'PUT',
      body: expect.objectContaining({
        terminal_id: 'terminal',
        online_terminal_id: '',
      }),
    }),
  );
});
it('requires a visible reason to reject and sends the current order revision', async () => {
  view();
  const reject = await screen.findByRole('button', { name: 'ปฏิเสธออเดอร์' });
  expect(reject).toBeDisabled();
  fireEvent.change(screen.getByLabelText('ข้อความถึงลูกค้า (ลูกค้ามองเห็น)'), {
    target: { value: 'สินค้าไม่พร้อม' },
  });
  fireEvent.click(reject);
  await waitFor(() =>
    expect(mocks.request).toHaveBeenCalledWith(
      'org',
      '/online-orders/order/status',
      expect.objectContaining({
        body: { status: 'REJECTED', message: 'สินค้าไม่พร้อม', revision: 1 },
      }),
    ),
  );
  expect(
    screen.queryByRole('button', { name: /สำเร็จ/ }),
  ).not.toBeInTheDocument();
});
it('keeps read-only staff without mutation controls', async () => {
  mocks.manage = false;
  view();
  expect(await screen.findByText('WEB-TEST')).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'เริ่มเตรียมสินค้า' }),
  ).not.toBeInTheDocument();
});
it('sends READY orders to POS in the current staff workspace', async () => {
  mocks.request.mockResolvedValue({ ...order, status: 'READY' });
  view();
  expect(
    await screen.findByRole('link', { name: 'ลูกค้ามารับ · เปิดเข้า POS' }),
  ).toHaveAttribute('href', '/work/pos?online_order=order');
  expect(
    screen.queryByRole('button', { name: /สำเร็จ/ }),
  ).not.toBeInTheDocument();
});
