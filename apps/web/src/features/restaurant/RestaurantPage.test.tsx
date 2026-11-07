import { render } from '../../test/render';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import { RestaurantPage } from './RestaurantPage';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  canWrite: true,
  canStorefront: true,
  branch: 'branch',
}));
vi.mock('../../app/AuthProvider', () => ({
  useAuth: () => ({
    state: { session: { user: { id: 'user' }, csrf_token: 'csrf' } },
  }),
}));
vi.mock('../../app/OrganizationProvider', () => ({
  useOrganization: () => ({
    context: { organization: { id: 'org' } },
    branchID: mocks.branch,
    can: (permission: string) =>
      permission === 'storefront.manage'
        ? mocks.canStorefront
        : permission.endsWith('.read') || mocks.canWrite,
  }),
}));
vi.mock('../../lib/pos-api', async (original) => ({
  ...(await original<typeof import('../../lib/pos-api')>()),
  posRequest: mocks.request,
}));

const settings = {
  branch_id: 'branch',
  closing_time: '22:00',
  timezone: 'Asia/Bangkok',
  revision: 1,
  period: {
    start: '2026-11-02T22:00:00+07:00',
    end: '2026-11-03T22:00:00+07:00',
  },
};
function view(page: Parameters<typeof RestaurantPage>[0]['view']) {
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
      <MemoryRouter>
        <RestaurantPage view={page} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
beforeEach(() => {
  mocks.request.mockReset();
  mocks.canWrite = true;
  mocks.canStorefront = true;
  mocks.branch = 'branch';
});

it('saves the configured closing time with the current revision and no stock reset', async () => {
  mocks.request.mockResolvedValue(settings);
  view('settings');
  const input = await screen.findByLabelText('เวลาปิดรอบวัน');
  expect(input).toHaveValue('22:00');
  expect(screen.getByText(/ไม่ล้างสต็อก/)).toBeInTheDocument();
  fireEvent.change(input, { target: { value: '23:30' } });
  fireEvent.click(screen.getByRole('button', { name: 'บันทึกเวลาปิดร้าน' }));
  await waitFor(() =>
    expect(mocks.request).toHaveBeenCalledWith(
      'org',
      '/restaurant/settings',
      expect.objectContaining({
        method: 'PATCH',
        csrf: 'csrf',
        body: {
          branch_id: 'branch',
          closing_time: '23:30',
          timezone: 'Asia/Bangkok',
          revision: 1,
        },
      }),
    ),
  );
});

it('shows a retry without fabricating settings after an API error', async () => {
  mocks.request.mockRejectedValue(new ApiError(503, 'บริการไม่พร้อม'));
  view('settings');
  expect(await screen.findByRole('alert')).toHaveTextContent('บริการไม่พร้อม');
  expect(
    screen.queryByRole('button', { name: 'บันทึกเวลาปิดร้าน' }),
  ).not.toBeInTheDocument();
  mocks.request.mockResolvedValue(settings);
  fireEvent.click(screen.getByRole('button', { name: 'ลองอีกครั้ง' }));
  expect(await screen.findByLabelText('เวลาปิดรอบวัน')).toHaveValue('22:00');
});

it('requires a branch before requesting restaurant data', () => {
  mocks.branch = '';
  view('settings');
  expect(screen.getByText('เลือกสาขาก่อนจัดการร้านอาหาร')).toBeInTheDocument();
  expect(mocks.request).not.toHaveBeenCalled();
});

it('renders tables without a fake QR link and paid queue items without customer names', async () => {
  mocks.request
    .mockResolvedValueOnce([
      {
        id: 't1',
        code: 'T01',
        name: 'ริมหน้าต่าง',
        seats: 4,
        status: 'ACTIVE',
        revision: 1,
      },
    ])
    .mockResolvedValueOnce([
      {
        order_id: 'o1',
        queue_number: 'WEB-101',
        channel: 'PICKUP',
        status: 'PREPARING',
        created_at: '2026-11-03T10:00:00Z',
      },
    ]);
  const first = view('tables');
  expect(await screen.findByText('T01')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /QR/i })).not.toBeInTheDocument();
  first.unmount();
  view('queue');
  expect(await screen.findByText('WEB-101')).toBeInTheDocument();
  expect(screen.getByText('กำลังทำ')).toBeInTheDocument();
  expect(screen.queryByText(/ลูกค้า/)).not.toBeInTheDocument();
});

function tableCreationResponses(shopBranch = 'branch') {
  mocks.request.mockImplementation(
    (_org: string, path: string, options?: { method?: string }) => {
      if (path === '/storefront')
        return Promise.resolve({
          slug: 'baan-thai',
          branch_id: shopBranch,
          published: true,
        });
      if (options?.method === 'POST')
        return Promise.resolve({
          id: 't1',
          branch_id: 'branch',
          code: 'T01',
          name: 'ริมหน้าต่าง',
          seats: 2,
          status: 'ACTIVE',
          revision: 1,
          qr_token: 'a'.repeat(64),
        });
      return Promise.resolve([]);
    },
  );
}

async function createTable() {
  fireEvent.change(await screen.findByLabelText('รหัสโต๊ะ'), {
    target: { value: 'T01' },
  });
  fireEvent.change(screen.getByLabelText('ชื่อโต๊ะ'), {
    target: { value: 'ริมหน้าต่าง' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'บันทึกโต๊ะ' }));
}

it('shows a real table-order link from the creation response and matching storefront branch', async () => {
  tableCreationResponses();
  view('tables');
  expect(mocks.request).not.toHaveBeenCalledWith(
    'org',
    '/storefront',
    expect.anything(),
  );
  await createTable();
  const link = await screen.findByRole('link', {
    name: 'เปิดหน้าสั่งอาหาร โต๊ะ T01',
  });
  expect(link).toHaveAttribute(
    'href',
    `/shop/baan-thai?table=${'a'.repeat(64)}`,
  );
  expect(link).toHaveAttribute('rel', 'noreferrer');
  expect(
    screen.getByRole('heading', { name: 'ลิงก์สำหรับสร้าง QR โต๊ะ T01' }),
  ).toBeInTheDocument();
});

it('does not create a table-order link to another storefront branch', async () => {
  tableCreationResponses('other-branch');
  view('tables');
  await createTable();
  expect(
    await screen.findByText(/หน้าร้านออนไลน์ไม่ได้ผูกกับสาขาของโต๊ะนี้/),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: /เปิดหน้าสั่งอาหาร/ }),
  ).not.toBeInTheDocument();
});

it.each([
  { settings: null, message: 'ตั้งค่าหน้าร้านออนไลน์ก่อนใช้ลิงก์โต๊ะ' },
  {
    settings: { slug: 'baan-thai', branch_id: 'branch', published: false },
    message: 'เผยแพร่หน้าร้านออนไลน์ก่อนใช้ลิงก์โต๊ะ',
  },
])(
  'does not offer an unusable table link: $message',
  async ({ settings: shopSettings, message }) => {
    tableCreationResponses();
    const respond = mocks.request.getMockImplementation()!;
    mocks.request.mockImplementation(
      (org: string, path: string, options?: { method?: string }) =>
        path === '/storefront'
          ? Promise.resolve(shopSettings)
          : respond(org, path, options),
    );
    view('tables');
    await createTable();
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: /เปิดหน้าสั่งอาหาร/ }),
    ).not.toBeInTheDocument();
  },
);

it('does not fetch storefront settings without storefront management permission', async () => {
  tableCreationResponses();
  mocks.canStorefront = false;
  view('tables');
  await createTable();
  expect(
    await screen.findByText(/ต้องมีสิทธิ์จัดการหน้าร้านออนไลน์/),
  ).toBeInTheDocument();
  expect(mocks.request).not.toHaveBeenCalledWith(
    'org',
    '/storefront',
    expect.anything(),
  );
  expect(
    screen.queryByRole('link', { name: /เปิดหน้าสั่งอาหาร/ }),
  ).not.toBeInTheDocument();
});

it('retains the created table while retrying storefront settings after an error', async () => {
  tableCreationResponses();
  const respond = mocks.request.getMockImplementation()!;
  mocks.request.mockImplementation(
    (org: string, path: string, options?: { method?: string }) => {
      if (path === '/storefront')
        return Promise.reject(new ApiError(503, 'โหลดหน้าร้านไม่สำเร็จ'));
      return respond(org, path, options);
    },
  );
  view('tables');
  await createTable();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'โหลดหน้าร้านไม่สำเร็จ',
  );
  mocks.request.mockImplementation(respond);
  fireEvent.click(screen.getByRole('button', { name: 'ลองอีกครั้ง' }));
  expect(
    await screen.findByRole('link', { name: 'เปิดหน้าสั่งอาหาร โต๊ะ T01' }),
  ).toBeInTheDocument();
  expect(
    mocks.request.mock.calls.filter((call) => call[2]?.method === 'POST'),
  ).toHaveLength(1);
});

it('shows the dine-in table on the paid queue without customer details', async () => {
  mocks.request.mockResolvedValue([
    {
      order_id: 'o1',
      queue_number: '001',
      channel: 'DINE_IN',
      table_code: 'T01',
      status: 'READY',
      created_at: '2026-11-03T10:00:00Z',
    },
  ]);
  view('queue');
  expect(await screen.findByText('ทานที่ร้าน · โต๊ะ T01')).toBeInTheDocument();
  expect(screen.getByText('พร้อมรับ')).toBeInTheDocument();
  expect(screen.queryByText(/ลูกค้า/)).not.toBeInTheDocument();
});
