import { render, renderInEnglish } from '../../test/render';
import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SetupPage, setupKey } from './OrganizationPages';
import {
  saveSetupStep,
  type SetupProfileInput,
  type SetupServicesInput,
  type SetupMenuInput,
  type SetupPaymentsInput,
  type SetupOrdersInput,
} from './setup-api';

it('creates UUID idempotency keys when randomUUID is unavailable', () => {
  const originalCrypto = globalThis.crypto;
  vi.stubGlobal('crypto', {
    getRandomValues: (bytes: Uint8Array) => bytes.fill(0xab),
  });

  const key = setupKey();
  vi.stubGlobal('crypto', originalCrypto);

  expect(key).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
});

const setupState = {
  organization_id: 'org-1',
  branch_id: 'branch',
  current_step: 'profile',
  ready: true,
  completed: false,
  readiness: { ready: true, incomplete: [] },
  steps: [],
  profile: {
    organization: {
      name: 'ร้านเดิม',
      business_type: 'RESTAURANT',
      contact_email: '',
      contact_phone: '',
      address: 'Bangkok',
    },
    service_modes: { dine_in: true, takeaway: true, delivery: false },
  },
  location: {
    latitude: 13.75,
    longitude: 100.5,
    address: 'Bangkok',
    details: '',
    confirmed: true,
  },
  tables: {
    zones: [{ name: 'โซนหลัก' }],
    tables: [{ name: 'โต๊ะ 1', zone: 'โซนหลัก', seats: 4 }],
    qr_enabled: true,
  },
};

it('saves tables to the scoped route and assigns each table to its named zone', async () => {
  await saveSetupStep(
    'tables',
    {
      zones: [{ name: 'A' }, { name: 'B' }],
      tables: [
        { name: 'One', zone: 'B', seats: 3 },
        { name: 'Two', zone: 'B', seats: 4 },
      ],
      qr_enabled: true,
    },
    { organizationID: 'org-1', branchID: 'branch' },
    'csrf',
    'key',
  );
  expect(mocks.request).toHaveBeenCalledWith(
    '/organizations/org-1/restaurant/setup/tables',
    expect.objectContaining({
      body: expect.objectContaining({
        branch_id: 'branch',
        tables: [
          expect.objectContaining({ zone_code: 'ZONE_2' }),
          expect.objectContaining({ zone_code: 'ZONE_2' }),
        ],
      }),
    }),
  );
});

it('keeps PromptPay distinct from bank transfer in the payment payload', async () => {
  await saveSetupStep(
    'payments',
    { cash: false, bank_transfer: true, promptpay: false, card: false },
    { organizationID: 'org-1', branchID: 'branch' },
    'csrf',
    'key',
  );
  expect(mocks.request).toHaveBeenCalledWith(
    '/organizations/org-1/restaurant/setup/payments',
    expect.objectContaining({
      body: expect.objectContaining({
        cash: false,
        bank_transfer: true,
        promptpay: false,
        card: false,
      }),
    }),
  );
});

it.each([
  [
    'profile',
    {
      organization: {
        name: 'A',
        business_type: 'RESTAURANT',
        contact_email: '',
        contact_phone: '',
        address: '',
      },
      service_modes: { dine_in: true, takeaway: false, delivery: false },
    },
  ],
  [
    'services',
    { service_modes: { dine_in: true, takeaway: false, delivery: false } },
  ],
  ['menu', { categories: [], items: [] }],
  [
    'payments',
    { cash: true, bank_transfer: false, promptpay: false, card: false },
  ],
  [
    'orders',
    {
      qr_ordering: false,
      kitchen_queue: false,
      auto_confirm: false,
      vat_percent: '0',
      service_charge_percent: '0',
    },
  ],
] satisfies Array<
  [
    'profile' | 'services' | 'menu' | 'payments' | 'orders',
    (
      | SetupProfileInput
      | SetupServicesInput
      | SetupMenuInput
      | SetupPaymentsInput
      | SetupOrdersInput
    ),
  ]
>)('uses the scoped %s route and branch payload', async (step, body) => {
  await saveSetupStep(
    step,
    body,
    { organizationID: 'org-1', branchID: 'branch' },
    'csrf',
    'key',
  );
  expect(mocks.request).toHaveBeenCalledWith(
    `/organizations/org-1/restaurant/setup/${step}`,
    expect.objectContaining({
      body: expect.objectContaining({ branch_id: 'branch' }),
    }),
  );
});

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  refresh: vi.fn(),
  select: vi.fn(),
  storeMode: 'multi' as 'single' | 'multi',
  role: 'OWNER' as string | null,
  userID: 'user',
  branchID: 'branch',
  context: null as null | {
    organization: { id: string };
    membership: { role: string };
  },
}));

const nativeCreateObjectURL = URL.createObjectURL;
const nativeRevokeObjectURL = URL.revokeObjectURL;

vi.mock('../../app/AuthProvider', () => ({
  useAuth: () => ({
    state: {
      status: 'authenticated',
      session: {
        user: {
          id: mocks.userID,
          email: 'owner@example.test',
          display_name: 'Owner',
        },
        csrf_token: 'csrf',
      },
    },
  }),
}));

vi.mock('../../app/OrganizationProvider', () => ({
  useOrganization: () => ({
    storeMode: mocks.storeMode,
    organizations: [],
    context: mocks.context
      ? {
          organization: mocks.context.organization,
          membership: { role: mocks.role },
        }
      : mocks.role
        ? { membership: { role: mocks.role } }
        : null,
    branchID: mocks.branchID,
    loading: false,
    error: '',
    refresh: mocks.refresh,
    select: mocks.select,
    can: () => true,
  }),
}));

vi.mock('../../lib/organization-api', () => ({
  organizationRequest: mocks.request,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.storeMode = 'multi';
  mocks.role = 'OWNER';
  mocks.context = null;
  mocks.userID = 'user';
  mocks.branchID = 'branch';
  mocks.refresh.mockResolvedValue(undefined);
  mocks.request.mockResolvedValue({ ...setupState });
});

afterEach(() => {
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: nativeCreateObjectURL,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: nativeRevokeObjectURL,
  });
});

function renderSetup(initialEntries = ['/setup'], english = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const page = () => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        <Routes>
          <Route path="/setup" element={<SetupPage />} />
          <Route path="/dashboard" element={<h1>แดชบอร์ด</h1>} />
          <Route path="/account" element={<h1>บัญชี</h1>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
  const result = (english ? renderInEnglish : render)(page());
  return { ...result, client, refreshView: () => result.rerender(page()) };
}

it('adds and removes draft tables while preserving rows when dine-in is toggled', () => {
  renderSetup();
  fireEvent.click(screen.getByRole('button', { name: 'เพิ่มโต๊ะ' }));
  expect(screen.getByLabelText('ชื่อ/เลขโต๊ะ 2')).toHaveValue('โต๊ะ 2');
  fireEvent.change(screen.getByLabelText('ชื่อ/เลขโต๊ะ 2'), {
    target: { value: 'A2' },
  });
  fireEvent.click(screen.getByLabelText('ทานที่ร้าน'));
  expect(screen.queryByLabelText('ชื่อ/เลขโต๊ะ 2')).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('ทานที่ร้าน'));
  expect(screen.getByLabelText('ชื่อ/เลขโต๊ะ 2')).toHaveValue('A2');
  fireEvent.click(screen.getByRole('button', { name: 'ลบโต๊ะ 2' }));
  expect(screen.queryByLabelText('ชื่อ/เลขโต๊ะ 2')).not.toBeInTheDocument();
  expect(screen.getByLabelText('ชื่อ/เลขโต๊ะ 1')).toHaveValue('โต๊ะ 1');
});

it('hides ordering and charge inputs without changing hydrated settings on save', async () => {
  mocks.context = {
    organization: { id: 'org-1' },
    membership: { role: 'OWNER' },
  };
  mocks.request.mockResolvedValue({
    ...setupState,
    orders: {
      qr_ordering: false,
      kitchen_queue: true,
      auto_confirm: false,
      vat_percent: '7',
      service_charge_percent: '10',
    },
  });
  renderSetup();
  await waitFor(() =>
    expect(screen.getByLabelText('ชื่อร้าน')).toHaveValue('ร้านเดิม'),
  );
  expect(screen.queryByLabelText('รับออเดอร์ผ่าน QR')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('ใช้คิวครัว')).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText('ยืนยันออเดอร์อัตโนมัติ'),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /บันทึกและถัดไป/ }));
  await screen.findByText('ขั้นตอนที่ 2 จาก 4');
  await completeServicesAndTables();
  expect(screen.queryByLabelText('VAT (%)')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('ค่าบริการ (%)')).not.toBeInTheDocument();
  expect(mocks.request).toHaveBeenCalledWith(
    '/organizations/org-1/restaurant/setup/orders',
    expect.objectContaining({
      body: {
        branch_id: 'branch',
        qr_ordering: false,
        kitchen_queue: true,
        auto_confirm: false,
        vat_rate: '7',
        service_charge_rate: '10',
      },
    }),
  );
});

it('validates table rows and enables QR automatically', async () => {
  mocks.context = {
    organization: { id: 'org-1' },
    membership: { role: 'OWNER' },
  };
  renderSetup();
  await waitFor(() =>
    expect(screen.getByLabelText('ชื่อร้าน')).toHaveValue('ร้านเดิม'),
  );
  expect(screen.getByRole('button', { name: 'ลบโต๊ะ 1' })).toBeDisabled();
  expect(
    screen.queryByRole('button', { name: 'เพิ่มโซน' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText('เปิดใช้ QR สำหรับโต๊ะ'),
  ).not.toBeInTheDocument();
  expect(screen.queryByLabelText('จำนวนที่นั่ง 1')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('โซนของโต๊ะ 1')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'เพิ่มโต๊ะ' }));
  expect(screen.getByLabelText('ชื่อ/เลขโต๊ะ 2')).toHaveFocus();
  fireEvent.change(screen.getByLabelText('ชื่อ/เลขโต๊ะ 2'), {
    target: { value: ' ' },
  });
  fireEvent.click(screen.getByRole('button', { name: /บันทึกและถัดไป/ }));
  expect(screen.getByRole('alert')).toHaveTextContent('ชื่อโต๊ะ');
  expect(
    mocks.request.mock.calls.some(([path]) => path.endsWith('/tables')),
  ).toBe(false);
  fireEvent.change(screen.getByLabelText('ชื่อ/เลขโต๊ะ 2'), {
    target: { value: 'โต๊ะ 2' },
  });
  fireEvent.click(screen.getByRole('button', { name: /บันทึกและถัดไป/ }));
  await screen.findByText('ขั้นตอนที่ 2 จาก 4');
  expect(mocks.request).toHaveBeenCalledWith(
    '/organizations/org-1/restaurant/setup/tables',
    expect.objectContaining({
      body: expect.objectContaining({
        generate_qr: true,
        zones: [{ name: 'โซนหลัก', code: 'ZONE_1' }],
        tables: [
          { name: 'โต๊ะ 1', code: 'TABLE_1', zone_code: 'ZONE_1', seats: 4 },
          { name: 'โต๊ะ 2', code: 'TABLE_2', zone_code: 'ZONE_1', seats: 2 },
        ],
      }),
    }),
  );
});

it('requires a service mode and a table only when dine-in is selected', () => {
  renderSetup();
  fireEvent.change(screen.getByLabelText('ชื่อร้าน'), {
    target: { value: 'ร้านใหม่' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'ลบโต๊ะ 1' }));
  expect(screen.getByRole('status')).toHaveTextContent('ยังไม่มีโต๊ะ');
  fireEvent.click(screen.getByRole('button', { name: /บันทึกและถัดไป/ }));
  expect(screen.getByRole('alert')).toHaveTextContent('ชื่อโต๊ะ');
  fireEvent.click(screen.getByLabelText('ทานที่ร้าน'));
  fireEvent.click(screen.getByLabelText('ซื้อกลับบ้าน'));
  fireEvent.click(screen.getByRole('button', { name: /บันทึกและถัดไป/ }));
  expect(screen.getByRole('alert')).toHaveTextContent('อย่างน้อยหนึ่งรูปแบบ');
});

it('shows setup labels and validation in English', () => {
  mocks.role = null;
  renderSetup(['/setup'], true);
  expect(screen.getByLabelText('Store name')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Save and continue' }));
  expect(screen.getByText('Enter a store name')).toBeInTheDocument();
});

it('shows name-only tables and setup progress in English', async () => {
  mocks.context = {
    organization: { id: 'org-1' },
    membership: { role: 'OWNER' },
  };
  mocks.request.mockResolvedValue(tableSetup);
  renderSetup(['/setup'], true);
  await waitFor(() =>
    expect(screen.getByLabelText('Table name / number 1')).toHaveValue('โต๊ะ'),
  );
  expect(
    screen.getByRole('complementary', { name: 'Setup progress' }),
  ).toHaveTextContent('Store and services');
  expect(
    screen.queryByRole('combobox', { name: /Zone/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('spinbutton', { name: /Seats/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText('Enable QR for tables'),
  ).not.toBeInTheDocument();
});

it('shows the readiness review in English', async () => {
  mocks.context = {
    organization: { id: 'org-1' },
    membership: { role: 'OWNER' },
  };
  mocks.request.mockResolvedValue({ ...setupState, current_step: 'review' });
  renderSetup(['/setup'], true);
  expect(await screen.findByText('Store ready to open')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Open store' })).toBeEnabled();
});

it('explains unavailable payment methods in English and keeps them disabled', async () => {
  mocks.context = {
    organization: { id: 'org-1' },
    membership: { role: 'OWNER' },
  };
  mocks.request.mockResolvedValue({ ...setupState, current_step: 'payments' });
  renderSetup(['/setup'], true);
  expect(await screen.findByLabelText(/Credit card/)).toBeDisabled();
  expect(screen.getByLabelText(/PromptPay/)).toBeDisabled();
  expect(
    screen.getByText(/payment provider connection required/),
  ).toBeInTheDocument();
  expect(screen.getByText(/Merchant ID required/)).toBeInTheDocument();
});

it('creates and saves a profile using only visible store fields', async () => {
  mocks.role = null;
  mocks.request.mockImplementation((path: string) =>
    path === '/organizations'
      ? Promise.resolve({
          organization: { id: 'new-org' },
          branches: [{ id: 'branch' }],
        })
      : Promise.resolve({ ...setupState }),
  );
  renderSetup();
  expect(screen.queryByLabelText('รหัสร้าน')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('ชื่อสาขาหลัก')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('รหัสสาขาหลัก')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('ชื่อร้าน'), {
    target: { value: 'ร้านใหม่' },
  });
  fireEvent.change(screen.getByLabelText('ประเภทร้าน'), {
    target: { value: 'RESTAURANT' },
  });
  fireEvent.change(screen.getByLabelText('อีเมลร้าน'), {
    target: { value: 'owner@example.test' },
  });
  fireEvent.change(screen.getByLabelText('โทรศัพท์ร้าน'), {
    target: { value: '123' },
  });
  fireEvent.change(screen.getByLabelText('ที่อยู่ร้าน'), {
    target: { value: 'Bangkok' },
  });

  fireEvent.click(screen.getByRole('button', { name: /บันทึกและถัดไป/ }));
  const organization = {
    name: 'ร้านใหม่',
    business_type: 'RESTAURANT',
    contact_email: 'owner@example.test',
    contact_phone: '123',
    address: 'Bangkok',
  };
  await waitFor(() =>
    expect(mocks.request).toHaveBeenCalledWith(
      '/organizations',
      expect.objectContaining({
        body: organization,
        csrf: 'csrf',
        key: expect.any(String),
      }),
    ),
  );
  await waitFor(() =>
    expect(mocks.request).toHaveBeenCalledWith(
      '/organizations/new-org/restaurant/setup/profile',
      expect.objectContaining({
        body: {
          branch_id: 'branch',
          organization,
          ...organization,
          service_modes: { dine_in: true, takeaway: true, delivery: false },
        },
        csrf: 'csrf',
        key: expect.any(String),
      }),
    ),
  );
});

it('omits existing metadata when saving a hydrated profile', async () => {
  mocks.context = {
    organization: { id: 'org-1' },
    membership: { role: 'OWNER' },
  };
  const profile = {
    organization: {
      name: 'ร้านเดิม',
      code: 'EXISTING',
      business_type: 'RESTAURANT',
      contact_email: 'saved@example.test',
      contact_phone: '123',
      address: 'Bangkok',
    },
    branch: {
      name: 'สาขาเดิม',
      code: 'OLD',
      address: 'เดิม',
      phone: '',
      email: '',
    },
    service_modes: { dine_in: true, takeaway: true, delivery: false },
  };
  mocks.request.mockResolvedValue({ ...setupState, profile });
  renderSetup();
  await waitFor(() =>
    expect(screen.getByLabelText('ชื่อร้าน')).toHaveValue('ร้านเดิม'),
  );
  fireEvent.change(screen.getByLabelText('ชื่อร้าน'), {
    target: { value: 'ร้านแก้ไข' },
  });
  fireEvent.click(screen.getByRole('button', { name: /บันทึกและถัดไป/ }));
  const organization = {
    name: 'ร้านแก้ไข',
    business_type: 'RESTAURANT',
    contact_email: 'saved@example.test',
    contact_phone: '123',
    address: 'Bangkok',
  };
  await waitFor(() =>
    expect(mocks.request).toHaveBeenCalledWith(
      '/organizations/org-1/restaurant/setup/profile',
      expect.objectContaining({
        body: {
          branch_id: 'branch',
          organization,
          ...organization,
          service_modes: profile.service_modes,
          location: setupState.location,
        },
      }),
    ),
  );
});

const tableSetup = {
  ...setupState,
  current_step: 'tables',
  tables: {
    zones: [{ code: 'Z1', name: 'โซน' }],
    tables: [{ code: 'T1', name: 'โต๊ะ', zone: 'โซน', seats: 4 }],
    qr_enabled: true,
  },
};
const issuedTokens = [
  { table_id: 'table-1', code: 'T1', qr_token: 'test-secret-token' },
];

it('does not rotate existing completed tables when advancing without table edits', async () => {
  mocks.context = {
    organization: { id: 'org-1' },
    membership: { role: 'OWNER' },
  };
  mocks.request.mockResolvedValue({
    ...tableSetup,
    steps: [{ key: 'tables', status: 'COMPLETE', ready: true }],
  });
  renderSetup();
  await waitFor(() =>
    expect(screen.getByLabelText('ชื่อ/เลขโต๊ะ 1')).toHaveValue('โต๊ะ'),
  );
  fireEvent.click(screen.getByRole('button', { name: /บันทึกและถัดไป/ }));
  await screen.findByLabelText('แผนที่เลือกตำแหน่งร้าน');
  expect(
    mocks.request.mock.calls.filter(
      ([path, options]) =>
        path.endsWith('/tables') && options?.method === 'PUT',
    ),
  ).toHaveLength(0);
  fireEvent.click(screen.getByRole('button', { name: /ย้อนกลับ/ }));
  fireEvent.change(screen.getByLabelText('ชื่อ/เลขโต๊ะ 1'), {
    target: { value: 'โต๊ะใหม่' },
  });
  fireEvent.click(screen.getByRole('button', { name: /บันทึกและถัดไป/ }));
  await screen.findByLabelText('แผนที่เลือกตำแหน่งร้าน');
  expect(
    mocks.request.mock.calls.filter(
      ([path, options]) =>
        path.endsWith('/tables') && options?.method === 'PUT',
    ),
  ).toHaveLength(1);
});

it('requires reconfirmation after editing the address on the grouped store screen', async () => {
  mocks.context = {
    organization: { id: 'org-1' },
    membership: { role: 'OWNER' },
  };
  renderSetup();
  await waitFor(() =>
    expect(screen.getByLabelText('ชื่อร้าน')).toHaveValue('ร้านเดิม'),
  );
  fireEvent.change(screen.getByLabelText('ที่อยู่ร้าน'), {
    target: { value: 'New entrance' },
  });
  fireEvent.click(screen.getByRole('button', { name: /บันทึกและถัดไป/ }));
  await screen.findByLabelText('แผนที่เลือกตำแหน่งร้าน');
  expect(screen.getByRole('status')).not.toHaveTextContent('ยืนยันตำแหน่งแล้ว');
  fireEvent.click(screen.getByRole('button', { name: /บันทึกและถัดไป/ }));
  expect(screen.getByRole('alert')).not.toBeEmptyDOMElement();
  expect(screen.getByText('ขั้นตอนที่ 2 จาก 4')).toBeInTheDocument();
});

it('routes legacy review without location to location confirmation', async () => {
  mocks.context = {
    organization: { id: 'org-1' },
    membership: { role: 'OWNER' },
  };
  mocks.request.mockResolvedValue({
    ...setupState,
    current_step: 'review',
    location: undefined,
  });
  renderSetup();
  await screen.findByLabelText('แผนที่เลือกตำแหน่งร้าน');
  expect(
    screen.queryByRole('button', { name: /เปิดใช้งานร้าน/ }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'ยืนยันตำแหน่งร้าน' })).not.toBeInTheDocument();
});

it.each(['user', 'organization', 'branch'])(
  'shows issued secrets then clears them on %s change',
  async (scope) => {
    mocks.context = {
      organization: { id: 'org-1' },
      membership: { role: 'OWNER' },
    };
    mocks.request.mockImplementation(
      (path: string, options?: { method?: string }) =>
        Promise.resolve(
          options?.method === 'PUT' && path.endsWith('/tables')
            ? { ...tableSetup, issued_table_qr_tokens: issuedTokens }
            : tableSetup,
        ),
    );
    const view = renderSetup();
    await waitFor(() =>
      expect(screen.getByLabelText('ชื่อ/เลขโต๊ะ 1')).toHaveValue('โต๊ะ'),
    );
    expect(
      screen.queryByLabelText('เปิดใช้ QR สำหรับโต๊ะ'),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /บันทึกและถัดไป/ }));
    expect(
      await screen.findByDisplayValue(/test-secret-token/),
    ).toBeInTheDocument();
    expect(
      JSON.stringify(
        view.client
          .getQueryCache()
          .getAll()
          .map((query) => query.state.data),
      ),
    ).not.toContain('test-secret-token');
    expect(screen.getByRole('button', { name: /คัดลอก/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /ดาวน์โหลด/ })).toBeEnabled();
    if (scope === 'user') mocks.userID = 'another-user';
    if (scope === 'organization')
      mocks.context = {
        organization: { id: 'org-2' },
        membership: { role: 'OWNER' },
      };
    if (scope === 'branch') mocks.branchID = 'branch-2';
    view.refreshView();
    expect(
      screen.queryByDisplayValue(/test-secret-token/),
    ).not.toBeInTheDocument();
  },
);

it('never displays or caches a deferred table token response after the user changes', async () => {
  mocks.context = {
    organization: { id: 'org-1' },
    membership: { role: 'OWNER' },
  };
  let finishSave!: (value: unknown) => void;
  mocks.request.mockImplementation(
    (path: string, options?: { method?: string }) =>
      options?.method === 'PUT' && path.endsWith('/tables')
        ? new Promise((resolve) => {
            finishSave = resolve;
          })
        : Promise.resolve(tableSetup),
  );
  const view = renderSetup();
  await waitFor(() =>
    expect(screen.getByLabelText('ชื่อ/เลขโต๊ะ 1')).toHaveValue('โต๊ะ'),
  );
  fireEvent.click(screen.getByRole('button', { name: /บันทึกและถัดไป/ }));
  await waitFor(() => expect(finishSave).toBeDefined());
  mocks.userID = 'another-user';
  view.refreshView();
  await act(async () => {
    finishSave({ ...tableSetup, issued_table_qr_tokens: issuedTokens });
    await Promise.resolve();
  });
  await screen.findByLabelText('ชื่อ/เลขโต๊ะ 1');
  await waitFor(() =>
    expect(
      screen.queryByDisplayValue(/test-secret-token/),
    ).not.toBeInTheDocument(),
  );
  expect(
    screen.queryByRole('button', { name: /ดาวน์โหลดรหัสลับ/ }),
  ).not.toBeInTheDocument();
  expect(
    JSON.stringify(
      view.client
        .getQueryCache()
        .getAll()
        .map((query) => query.state.data),
    ),
  ).not.toContain('test-secret-token');
});

it.each(['บันทึกไม่สำเร็จ', ''])(
  'discards possibly rotated secrets after table failure %j and allows retry',
  async (message) => {
    mocks.context = {
      organization: { id: 'org-1' },
      membership: { role: 'OWNER' },
    };
    let saves = 0;
    mocks.request.mockImplementation(
      (path: string, options?: { method?: string }) => {
        if (options?.method === 'PUT' && path.endsWith('/tables')) {
          saves++;
          return saves === 2
            ? Promise.reject(new Error(message))
            : Promise.resolve({
                ...tableSetup,
                issued_table_qr_tokens: issuedTokens,
              });
        }
        return Promise.resolve(tableSetup);
      },
    );
    renderSetup();
    await waitFor(() =>
      expect(screen.getByLabelText('ชื่อ/เลขโต๊ะ 1')).toHaveValue('โต๊ะ'),
    );
    fireEvent.click(screen.getByRole('button', { name: /บันทึกและถัดไป/ }));
    await screen.findByDisplayValue(/test-secret-token/);
    fireEvent.click(screen.getByRole('button', { name: /ย้อนกลับ/ }));
    fireEvent.change(screen.getByLabelText('ชื่อ/เลขโต๊ะ 1'), {
      target: { value: 'โต๊ะใหม่' },
    });
    fireEvent.click(screen.getByRole('button', { name: /บันทึกและถัดไป/ }));
    expect(await screen.findByRole('alert')).not.toBeEmptyDOMElement();
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'The secret rotation status may be uncertain.',
    );
    expect(
      screen.queryByDisplayValue(/test-secret-token/),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Save and continue/ }));
    expect(
      await screen.findByDisplayValue(/test-secret-token/),
    ).toBeInTheDocument();
  },
);

it('displays arbitrary server readiness prerequisites without enabling activation', async () => {
  mocks.context = {
    organization: { id: 'org-1' },
    membership: { role: 'OWNER' },
  };
  mocks.request.mockResolvedValue({
    ...setupState,
    current_step: 'review',
    readiness: {
      ready: false,
      incomplete: [
        { key: 'pos_source', label: 'POS source', reason: 'Activate terminal' },
        {
          key: 'future_requirement',
          label: 'Future prerequisite',
          reason: 'Needs attention',
        },
      ],
    },
  });
  renderSetup();
  expect(
    await screen.findByText('POS source: Activate terminal'),
  ).toBeInTheDocument();
  expect(
    screen.getByText('Future prerequisite: Needs attention'),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /เปิดใช้งานร้าน/ })).toBeDisabled();
});

it('offers manual selection when copying issued secrets fails', async () => {
  mocks.context = {
    organization: { id: 'org-1' },
    membership: { role: 'OWNER' },
  };
  mocks.request.mockImplementation(
    (path: string, options?: { method?: string }) =>
      Promise.resolve(
        options?.method === 'PUT' && path.endsWith('/tables')
          ? { ...tableSetup, issued_table_qr_tokens: issuedTokens }
          : tableSetup,
      ),
  );
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: undefined,
  });
  renderSetup();
  await waitFor(() =>
    expect(screen.getByLabelText('ชื่อ/เลขโต๊ะ 1')).toHaveValue('โต๊ะ'),
  );
  fireEvent.click(screen.getByRole('button', { name: /บันทึกและถัดไป/ }));
  await screen.findByDisplayValue(/test-secret-token/);
  fireEvent.click(screen.getByRole('button', { name: /คัดลอก/ }));
  expect(await screen.findByText(/^คัดลอกไม่สำเร็จ/)).toHaveAttribute(
    'role',
    'status',
  );
  fireEvent.click(screen.getByRole('button', { name: 'English' }));
  expect(screen.getByText(/^Copy failed/)).toHaveAttribute('role', 'status');
  expect(
    (screen.getByLabelText('Table secret') as HTMLTextAreaElement).value,
  ).toContain('test-secret-token');
});

it('shows download failure when creating the local secret export fails', async () => {
  mocks.context = {
    organization: { id: 'org-1' },
    membership: { role: 'OWNER' },
  };
  mocks.request.mockImplementation(
    (path: string, options?: { method?: string }) =>
      Promise.resolve(
        options?.method === 'PUT' && path.endsWith('/tables')
          ? { ...tableSetup, issued_table_qr_tokens: issuedTokens }
          : tableSetup,
      ),
  );
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => {
      throw new Error('unsupported');
    }),
  });
  renderSetup();
  await waitFor(() =>
    expect(screen.getByLabelText('ชื่อ/เลขโต๊ะ 1')).toHaveValue('โต๊ะ'),
  );
  fireEvent.click(screen.getByRole('button', { name: /บันทึกและถัดไป/ }));
  await screen.findByDisplayValue(/test-secret-token/);
  fireEvent.click(screen.getByRole('button', { name: /ดาวน์โหลดรหัสลับ/ }));
  expect(await screen.findByText(/^ดาวน์โหลดไม่สำเร็จ/)).toHaveAttribute(
    'role',
    'status',
  );
});

it('shows download failure when revoking the local secret export URL fails', async () => {
  mocks.context = {
    organization: { id: 'org-1' },
    membership: { role: 'OWNER' },
  };
  mocks.request.mockImplementation(
    (path: string, options?: { method?: string }) =>
      Promise.resolve(
        options?.method === 'PUT' && path.endsWith('/tables')
          ? { ...tableSetup, issued_table_qr_tokens: issuedTokens }
          : tableSetup,
      ),
  );
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:issued-secrets'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(() => {
      throw new Error('revoke failed');
    }),
  });
  renderSetup();
  await waitFor(() =>
    expect(screen.getByLabelText('ชื่อ/เลขโต๊ะ 1')).toHaveValue('โต๊ะ'),
  );
  fireEvent.click(screen.getByRole('button', { name: /บันทึกและถัดไป/ }));
  await screen.findByDisplayValue(/test-secret-token/);
  fireEvent.click(screen.getByRole('button', { name: /ดาวน์โหลดรหัสลับ/ }));
  await waitFor(() =>
    expect(screen.getByText(/^ดาวน์โหลดไม่สำเร็จ/)).toHaveAttribute(
      'role',
      'status',
    ),
  );
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:issued-secrets');
});

it('does not export deferred secrets after an owner becomes a non-owner', async () => {
  mocks.context = {
    organization: { id: 'org-1' },
    membership: { role: 'OWNER' },
  };
  let finishSave!: (value: unknown) => void;
  mocks.request.mockImplementation(
    (path: string, options?: { method?: string }) =>
      options?.method === 'PUT' && path.endsWith('/tables')
        ? new Promise((resolve) => {
            finishSave = resolve;
          })
        : Promise.resolve(tableSetup),
  );
  const view = renderSetup();
  await waitFor(() =>
    expect(screen.getByLabelText('ชื่อ/เลขโต๊ะ 1')).toHaveValue('โต๊ะ'),
  );
  fireEvent.click(screen.getByRole('button', { name: /บันทึกและถัดไป/ }));
  await waitFor(() => expect(finishSave).toBeDefined());
  mocks.role = null;
  view.refreshView();
  expect(await screen.findByText('บัญชี')).toBeInTheDocument();
  await act(async () => {
    finishSave({ ...tableSetup, issued_table_qr_tokens: issuedTokens });
    await Promise.resolve();
  });
  expect(
    screen.queryByRole('button', { name: /ดาวน์โหลดรหัสลับ/ }),
  ).not.toBeInTheDocument();
});

it('saves current service modes when returning to the profile', async () => {
  mocks.context = {
    organization: { id: 'org-1' },
    membership: { role: 'OWNER' },
  };
  const profile = {
    organization: {
      name: 'ร้าน',
      code: 'SHOP',
      business_type: 'RESTAURANT',
      contact_email: '',
      contact_phone: '',
      address: '',
    },
    branch: { name: 'สาขา', code: 'MAIN', address: '', phone: '', email: '' },
    service_modes: { dine_in: true, takeaway: true, delivery: false },
  };
  mocks.request.mockResolvedValue({
    ...setupState,
    current_step: 'services',
    profile,
    services: profile.service_modes,
  });
  renderSetup();
  await waitFor(() =>
    expect(screen.getByLabelText('ชื่อร้าน')).toHaveValue(
      profile.organization.name,
    ),
  );
  fireEvent.click(screen.getByLabelText('เดลิเวอรี'));
  fireEvent.click(screen.getByRole('button', { name: /บันทึกและถัดไป/ }));
  await screen.findByLabelText('แผนที่เลือกตำแหน่งร้าน');
  fireEvent.click(screen.getByRole('button', { name: /ย้อนกลับ/ }));
  fireEvent.click(screen.getByRole('button', { name: /บันทึกและถัดไป/ }));
  await waitFor(() =>
    expect(mocks.request).toHaveBeenCalledWith(
      '/organizations/org-1/restaurant/setup/profile',
      expect.objectContaining({
        body: expect.objectContaining({
          service_modes: { dine_in: true, takeaway: true, delivery: true },
        }),
      }),
    ),
  );
});

it('prevents editing until the initial saved profile has loaded', async () => {
  mocks.context = {
    organization: { id: 'org-1' },
    membership: { role: 'OWNER' },
  };
  let resolveSetup!: (value: unknown) => void;
  mocks.request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveSetup = resolve;
      }),
  );
  renderSetup();
  expect(screen.getByLabelText('ชื่อร้าน')).toBeDisabled();
  resolveSetup({
    ...setupState,
    profile: {
      organization: {
        name: 'ร้านเดิม',
        code: 'SAVED',
        business_type: 'RESTAURANT',
        contact_email: 'saved@example.test',
        contact_phone: '',
        address: '',
      },
      branch: { name: 'สาขา', code: 'MAIN', address: '', phone: '', email: '' },
      service_modes: { dine_in: true, takeaway: true, delivery: false },
    },
  });
  await waitFor(() => expect(screen.getByLabelText('ชื่อร้าน')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('ชื่อร้าน'), {
    target: { value: 'ชื่อใหม่' },
  });
  expect(screen.getByLabelText('อีเมลร้าน')).toHaveValue('saved@example.test');
});

it.each(['user', 'organization', 'branch'])(
  'clears dirty wizard data when %s changes',
  async (scope) => {
    mocks.context = {
      organization: { id: 'org-1' },
      membership: { role: 'OWNER' },
    };
    const view = renderSetup();
    await waitFor(() => expect(mocks.request).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('ชื่อร้าน'), {
      target: { value: 'ข้อมูลเดิม' },
    });
    if (scope === 'user') mocks.userID = 'another-user';
    if (scope === 'organization')
      mocks.context = {
        organization: { id: 'org-2' },
        membership: { role: 'OWNER' },
      };
    if (scope === 'branch') mocks.branchID = 'branch-2';
    view.refreshView();
    await waitFor(() =>
      expect(screen.getByLabelText('ชื่อร้าน')).not.toHaveValue('ข้อมูลเดิม'),
    );
  },
);

it('does not select or save a newly created store after the user changes', async () => {
  mocks.role = null;
  let finishCreation!: (value: unknown) => void;
  mocks.request.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finishCreation = resolve;
      }),
  );
  const view = renderSetup();
  fireEvent.change(screen.getByLabelText('ชื่อร้าน'), {
    target: { value: 'ร้านเดิม' },
  });

  fireEvent.click(screen.getByRole('button', { name: /บันทึกและถัดไป/ }));
  mocks.userID = 'another-user';
  view.refreshView();
  finishCreation({
    organization: { id: 'created-org' },
    branches: [{ id: 'created-branch' }],
  });
  await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1));
  await Promise.resolve();
  expect(mocks.select).not.toHaveBeenCalled();
  expect(mocks.request).toHaveBeenCalledTimes(1);
});

it('saves the profile before a refreshed organization selection remounts the wizard', async () => {
  mocks.role = null;
  mocks.request.mockImplementation((path: string) =>
    path === '/organizations'
      ? Promise.resolve({
          organization: { id: 'new-org' },
          branches: [{ id: 'branch' }],
        })
      : Promise.resolve({ ...setupState }),
  );
  const view = renderSetup();
  mocks.refresh.mockImplementation(async () => {
    mocks.role = 'OWNER';
    mocks.context = {
      organization: { id: 'new-org' },
      membership: { role: 'OWNER' },
    };
    view.refreshView();
  });
  fireEvent.change(screen.getByLabelText('ชื่อร้าน'), {
    target: { value: 'ร้านใหม่' },
  });

  fireEvent.click(screen.getByRole('button', { name: /บันทึกและถัดไป/ }));
  await waitFor(() =>
    expect(mocks.request).toHaveBeenCalledWith(
      '/organizations/new-org/restaurant/setup/profile',
      expect.objectContaining({ method: 'PUT' }),
    ),
  );
});

it('preserves other menu categories and items while editing the first', async () => {
  mocks.context = {
    organization: { id: 'org-1' },
    membership: { role: 'OWNER' },
  };
  mocks.request.mockResolvedValue({
    ...setupState,
    current_step: 'menu',
    menu: {
      categories: [{ name: 'อาหาร' }, { name: 'เครื่องดื่ม' }],
      items: [
        { name: 'ข้าว', price: '45', category: 'อาหาร' },
        { name: 'ชา', price: '30', category: 'เครื่องดื่ม' },
      ],
    },
  });
  renderSetup();
  fireEvent.change(await screen.findByLabelText('หมวดหมู่เมนูแรก'), {
    target: { value: 'จานหลัก' },
  });
  fireEvent.change(screen.getByLabelText('ชื่อเมนูแรก'), {
    target: { value: 'ข้าวผัด' },
  });
  fireEvent.click(screen.getByRole('button', { name: /บันทึกและถัดไป/ }));
  await waitFor(() =>
    expect(mocks.request).toHaveBeenCalledWith(
      '/organizations/org-1/restaurant/setup/menu',
      expect.objectContaining({
        body: expect.objectContaining({
          categories: [{ name: 'จานหลัก' }, { name: 'เครื่องดื่ม' }],
          items: [
            { name: 'ข้าวผัด', price: '45', category: 'จานหลัก' },
            { name: 'ชา', price: '30', category: 'เครื่องดื่ม' },
          ],
        }),
      }),
    ),
  );
});

it('preserves server table and zone codes on save', async () => {
  mocks.context = {
    organization: { id: 'org-1' },
    membership: { role: 'OWNER' },
  };
  mocks.request.mockResolvedValue({
    ...setupState,
    current_step: 'tables',
    tables: {
      zones: [
        { code: 'PATIO', name: 'นอกอาคาร' },
        { code: 'INSIDE', name: 'ในอาคาร' },
      ],
      tables: [
        {
          code: 'P-8',
          name: 'แปด',
          zone: 'นอกอาคาร',
          zone_code: 'PATIO',
          seats: 4,
        },
        {
          code: 'I-3',
          name: 'สาม',
          zone: 'ในอาคาร',
          zone_code: 'INSIDE',
          seats: 2,
        },
      ],
      qr_enabled: true,
    },
  });
  renderSetup();
  await waitFor(() =>
    expect(screen.getByLabelText('ชื่อ/เลขโต๊ะ 1')).toHaveValue('แปด'),
  );
  expect(screen.queryByLabelText('ชื่อโซน 1')).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('ชื่อ/เลขโต๊ะ 1'), {
    target: { value: 'โต๊ะแปด' },
  });
  fireEvent.click(screen.getByRole('button', { name: /บันทึกและถัดไป/ }));
  await waitFor(() =>
    expect(mocks.request).toHaveBeenCalledWith(
      '/organizations/org-1/restaurant/setup/tables',
      expect.objectContaining({
        body: expect.objectContaining({
          zones: [
            { code: 'PATIO', name: 'นอกอาคาร' },
            { code: 'INSIDE', name: 'ในอาคาร' },
          ],
          tables: [
            { code: 'P-8', name: 'โต๊ะแปด', zone_code: 'PATIO', seats: 4 },
            { code: 'I-3', name: 'สาม', zone_code: 'INSIDE', seats: 2 },
          ],
        }),
      }),
    ),
  );
});

async function completeProfile() {
  if (!mocks.context)
    mocks.request.mockResolvedValueOnce({ organization: { id: 'new-org' } });
  if (mocks.context)
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /บันทึกและถัดไป/ }),
      ).toBeEnabled(),
    );
  fireEvent.change(screen.getByLabelText('ชื่อร้าน'), {
    target: { value: 'ร้านตัวอย่าง' },
  });

  fireEvent.click(screen.getByRole('button', { name: /บันทึกและถัดไป/ }));
  await screen.findByText('ขั้นตอนที่ 2 จาก 4');
}

async function completeServicesAndTables() {
  fireEvent.change(screen.getByLabelText('ที่อยู่ร้าน'), {
    target: { value: 'Bangkok' },
  });
  fireEvent.click(screen.getByRole('button', { name: /บันทึกและถัดไป/ }));
  await screen.findByText('ขั้นตอนที่ 3 จาก 4');
}

it('keeps setup within one named main region with a clear page heading', () => {
  renderSetup();

  const main = screen.getByRole('main', { name: 'เริ่มต้นใช้งานร้านอาหาร' });
  expect(within(main).getAllByRole('heading', { level: 1 })).toHaveLength(1);
  expect(
    within(main).getByRole('heading', {
      level: 1,
      name: 'เริ่มต้นใช้งานร้านอาหาร',
    }),
  ).toBeVisible();
  expect(
    within(main).getByRole('heading', { level: 2, name: 'ร้านและบริการ' }),
  ).toBeVisible();
  expect(within(main).getByLabelText('ชื่อร้าน')).toBeVisible();
});

it('renders four accessible steps and keeps the first step blocked by validation', () => {
  renderSetup();

  const progress = screen.getByRole('complementary', {
    name: 'ความคืบหน้าการตั้งค่า',
  });
  const steps = within(progress).getAllByRole('listitem');
  expect(steps).toHaveLength(4);
  const names = [
    'ร้านและบริการ',
    'ตำแหน่งร้าน',
    'เมนูและรับเงิน',
    'ตรวจสอบความพร้อม',
  ];
  steps.forEach((item, index) => {
    const button = within(item).getByRole('button', {
      name: new RegExp(names[index]),
    });
    if (index === 0) {
      expect(button).toHaveAttribute('aria-current', 'step');
      expect(button).toBeEnabled();
    } else {
      expect(button).not.toHaveAttribute('aria-current');
      expect(button).toBeDisabled();
    }
  });
  expect(screen.getByText('ขั้นตอนที่ 1 จาก 4')).toBeInTheDocument();
  expect(screen.getAllByText('ร้านและบริการ').length).toBeGreaterThan(0);
  expect(screen.getByRole('button', { name: /บันทึกและถัดไป/ })).toBeEnabled();

  fireEvent.click(screen.getByRole('button', { name: /บันทึกและถัดไป/ }));

  expect(screen.getByRole('alert')).toHaveTextContent('กรอกชื่อร้านให้ครบ');
  expect(screen.getByText('ขั้นตอนที่ 1 จาก 4')).toBeInTheDocument();
});

it('supports forward and backward navigation while preserving values', async () => {
  mocks.context = {
    organization: { id: 'org-1' },
    membership: { role: 'OWNER' },
  };
  renderSetup();
  await completeProfile();

  expect(screen.getByLabelText('แผนที่เลือกตำแหน่งร้าน')).toBeVisible();
  const progress = screen.getByRole('complementary', {
    name: 'ความคืบหน้าการตั้งค่า',
  });
  expect(
    within(progress).getByRole('button', { name: /ตำแหน่งร้าน/ }),
  ).toHaveAttribute('aria-current', 'step');
  fireEvent.click(screen.getByRole('button', { name: /ย้อนกลับ/ }));
  expect(screen.getByLabelText('ชื่อร้าน')).toHaveValue('ร้านตัวอย่าง');
  fireEvent.click(screen.getByRole('button', { name: /บันทึกและถัดไป/ }));
  await screen.findByLabelText('แผนที่เลือกตำแหน่งร้าน');
  fireEvent.click(
    within(progress).getByRole('button', { name: /ร้านและบริการ/ }),
  );

  expect(screen.getByLabelText('ชื่อร้าน')).toHaveValue('ร้านตัวอย่าง');
  expect(
    within(progress).getByRole('button', { name: /ร้านและบริการ/ }),
  ).toHaveAttribute('aria-current', 'step');
});

it('disables editing and navigation while saving a step', async () => {
  mocks.context = {
    organization: { id: 'org-1' },
    membership: { role: 'OWNER' },
  };
  let finishSave!: (value: unknown) => void;
  mocks.request.mockImplementation(
    (path: string, options?: { method?: string }) =>
      options?.method === 'PUT' && path.endsWith('/profile')
        ? new Promise((resolve) => {
            finishSave = resolve;
          })
        : Promise.resolve({ ...setupState }),
  );
  renderSetup();
  await waitFor(() => expect(screen.getByLabelText('ชื่อร้าน')).toBeEnabled());
  fireEvent.change(screen.getByLabelText('ชื่อร้าน'), {
    target: { value: 'ร้านตัวอย่าง' },
  });
  fireEvent.click(screen.getByRole('button', { name: /บันทึกและถัดไป/ }));

  expect(
    await screen.findByRole('button', { name: /กำลังบันทึก/ }),
  ).toBeDisabled();
  expect(screen.getByLabelText('ชื่อร้าน')).toBeDisabled();
  expect(screen.getByRole('button', { name: /ย้อนกลับ/ })).toBeDisabled();
  const progress = screen.getByRole('complementary', {
    name: 'ความคืบหน้าการตั้งค่า',
  });
  expect(
    within(progress)
      .getAllByRole('button')
      .every((button) => button.hasAttribute('disabled')),
  ).toBe(true);
  expect(
    mocks.request.mock.calls.filter(
      ([path, options]) =>
        path.endsWith('/profile') && options?.method === 'PUT',
    ),
  ).toHaveLength(1);

  await act(async () => {
    finishSave({ ...setupState });
  });
  expect(await screen.findByLabelText('แผนที่เลือกตำแหน่งร้าน')).toBeEnabled();
});

it('shows card payments as unavailable instead of allowing false completion', async () => {
  mocks.context = {
    organization: { id: 'org-1' },
    membership: { role: 'OWNER' },
  };
  renderSetup();
  await completeProfile();
  await completeServicesAndTables();
  fireEvent.change(screen.getByLabelText('ชื่อเมนูแรก'), {
    target: { value: 'ผัดไทย' },
  });
  fireEvent.change(screen.getByLabelText('ราคาเมนูแรก (บาท)'), {
    target: { value: '80' },
  });
  const card = screen.getByLabelText(/บัตรเครดิต/);
  expect(card).toBeDisabled();
  expect(screen.getByText(/รอเชื่อมต่อผู้ให้บริการ/)).toBeInTheDocument();
  const promptPay = screen.getByLabelText(/PromptPay/);
  expect(promptPay).toBeDisabled();
  expect(screen.getByText(/ต้องตั้งค่า Merchant ID/)).toBeInTheDocument();
});

it('recovers from initial setup loading errors with retry before editing', async () => {
  mocks.context = {
    organization: { id: 'org-1' },
    membership: { role: 'OWNER' },
  };
  mocks.request.mockRejectedValueOnce(new Error('โหลดข้อมูลไม่สำเร็จ'));
  renderSetup();

  expect(await screen.findByRole('alert')).toHaveTextContent(
    'โหลดข้อมูลไม่สำเร็จ',
  );
  expect(screen.getByLabelText('ชื่อร้าน')).toBeDisabled();
  mocks.request.mockResolvedValueOnce({ ...setupState });
  fireEvent.click(screen.getByRole('button', { name: 'ลองใหม่' }));

  await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.getByLabelText('ชื่อร้าน')).toBeEnabled());
});

it('resumes the server step with saved configuration', async () => {
  mocks.context = {
    organization: { id: 'org-1' },
    membership: { role: 'OWNER' },
  };
  mocks.request.mockResolvedValue({
    ...setupState,
    current_step: 'menu',
    menu: {
      categories: [{ name: 'อาหาร' }],
      items: [{ name: 'ข้าว', price: '45.50', category: 'อาหาร' }],
    },
  });
  renderSetup();
  expect(await screen.findByLabelText('ชื่อเมนูแรก')).toHaveValue('ข้าว');
  expect(screen.getByLabelText('ราคาเมนูแรก (บาท)')).toHaveValue(45.5);
  expect(screen.getByText('ขั้นตอนที่ 3 จาก 4')).toBeInTheDocument();
});

it('never enables activation when server readiness is false', async () => {
  mocks.context = {
    organization: { id: 'org-1' },
    membership: { role: 'OWNER' },
  };
  mocks.request.mockResolvedValue({
    ...setupState,
    current_step: 'review',
    readiness: {
      ready: false,
      incomplete: [
        { key: 'other', label: 'ข้อกำหนด', reason: 'ยังไม่ผ่านการตรวจสอบ' },
      ],
    },
  });
  renderSetup();
  expect(
    await screen.findByRole('button', { name: /เปิดใช้งานร้าน/ }),
  ).toBeDisabled();
  expect(screen.getByText(/ยังไม่ผ่านการตรวจสอบ/)).toBeInTheDocument();
});

it('resumes service modes from the flat backend response', async () => {
  mocks.context = {
    organization: { id: 'org-1' },
    membership: { role: 'OWNER' },
  };
  mocks.request.mockResolvedValue({
    ...setupState,
    current_step: 'services',
    services: { dine_in: false, takeaway: true, delivery: true },
  });
  renderSetup();
  await waitFor(() =>
    expect(screen.getByLabelText('ทานที่ร้าน')).not.toBeChecked(),
  );
  expect(screen.getByLabelText('ซื้อกลับบ้าน')).toBeChecked();
  expect(screen.getByLabelText('เดลิเวอรี')).toBeChecked();
});

it('rejects prices with more than two decimal places', async () => {
  mocks.context = {
    organization: { id: 'org-1' },
    membership: { role: 'OWNER' },
  };
  mocks.request.mockResolvedValue({
    ...setupState,
    current_step: 'menu',
    menu: {
      categories: [{ name: 'อาหาร' }],
      items: [{ name: 'ข้าว', price: '1.234', category: 'อาหาร' }],
    },
  });
  renderSetup();
  await screen.findByLabelText('ชื่อเมนูแรก');
  fireEvent.click(screen.getByRole('button', { name: /บันทึกและถัดไป/ }));
  expect(screen.getByRole('alert')).toHaveTextContent('ราคาที่ถูกต้อง');
  expect(
    mocks.request.mock.calls.filter(([path]) => path.endsWith('/menu')),
  ).toHaveLength(0);
});

it('shows the exact server readiness reason and keeps activation disabled', async () => {
  mocks.context = {
    organization: { id: 'org-1' },
    membership: { role: 'OWNER' },
  };
  const incomplete = {
    ...setupState,
    ready: false,
    readiness: {
      ready: false,
      incomplete: [
        {
          key: 'menu',
          label: 'เมนู',
          reason: 'ต้องมีเมนูที่เปิดขายอย่างน้อยหนึ่งรายการ',
        },
      ],
    },
  };
  mocks.request.mockResolvedValue(incomplete);
  renderSetup();
  await completeProfile();
  await completeServicesAndTables();
  fireEvent.change(screen.getByLabelText('ชื่อเมนูแรก'), {
    target: { value: 'ผัดไทย' },
  });
  fireEvent.change(screen.getByLabelText('ราคาเมนูแรก (บาท)'), {
    target: { value: '80' },
  });
  fireEvent.click(screen.getByRole('button', { name: /บันทึกและถัดไป/ }));
  await screen.findByText('ขั้นตอนที่ 4 จาก 4');
  await screen.findByRole('button', { name: /เปิดใช้งานร้าน/ });

  expect(screen.getByText('ยังตั้งค่าไม่ครบ')).toBeInTheDocument();
  expect(
    screen.getByText('ต้องมีเมนูที่เปิดขายอย่างน้อยหนึ่งรายการ'),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /เปิดใช้งานร้าน/ })).toBeDisabled();
});

it('completes readiness review once and routes to the existing dashboard', async () => {
  mocks.context = {
    organization: { id: 'org-1' },
    membership: { role: 'OWNER' },
  };
  mocks.request.mockImplementation((path: string) => {
    if (path === '/organizations/org-1/restaurant/setup/complete')
      return Promise.resolve({ ...setupState, ready: true, completed: true });
    return Promise.resolve({ ...setupState });
  });
  renderSetup();
  await completeProfile();
  await completeServicesAndTables();
  fireEvent.change(screen.getByLabelText('ชื่อเมนูแรก'), {
    target: { value: 'ผัดไทย' },
  });
  fireEvent.change(screen.getByLabelText('ราคาเมนูแรก (บาท)'), {
    target: { value: '80' },
  });
  fireEvent.click(screen.getByRole('button', { name: /บันทึกและถัดไป/ }));
  await screen.findByText('ขั้นตอนที่ 4 จาก 4');
  await screen.findByRole('button', { name: /เปิดใช้งานร้าน/ });

  expect(await screen.findByText('ร้านพร้อมเปิดใช้งาน')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /เปิดใช้งานร้าน/ }));

  expect(await screen.findByText('แดชบอร์ด')).toBeInTheDocument();
  expect(
    mocks.request.mock.calls.filter(
      ([path]) => path === '/organizations/org-1/restaurant/setup/complete',
    ),
  ).toHaveLength(1);
  expect(
    mocks.request.mock.calls.some(
      ([path]) =>
        path === '/organizations/org-1/restaurant/setup?branch_id=branch',
    ),
  ).toBe(true);
});

it('does not offer setup to an account outside the configured store', () => {
  mocks.storeMode = 'single';
  mocks.role = null;
  renderSetup();

  expect(screen.queryByLabelText('ชื่อร้าน')).not.toBeInTheDocument();
  expect(mocks.request).not.toHaveBeenCalled();
});

it.each(['MANAGER', 'CASHIER', 'INVENTORY_STAFF', 'PURCHASING_STAFF'])(
  'redirects non-owner role %s away from setup',
  (role) => {
    mocks.role = role;
    mocks.context = { organization: { id: 'org-1' }, membership: { role } };
    renderSetup();
    expect(screen.getByText('บัญชี')).toBeInTheDocument();
  },
);

it('renders standalone form layout without backoffice sidebar or hero panel', () => {
  mocks.role = null;
  renderSetup();

  expect(document.querySelector('aside.sidebar')).not.toBeInTheDocument();
  const topbar = document.querySelector('header.topbar.setup-topbar');
  expect(topbar).toBeInTheDocument();
  expect(
    document.querySelector('.topbar .breadcrumb strong'),
  ).toHaveTextContent('เริ่มต้นใช้งานร้านอาหาร');
  expect(topbar?.querySelector('.workspace-area-link')).not.toBeInTheDocument();
  expect(topbar?.querySelector('.tag')).not.toBeInTheDocument();
  expect(
    within(topbar as HTMLElement).queryByText('ดูหน้าร้าน'),
  ).not.toBeInTheDocument();
  expect(
    within(topbar as HTMLElement).queryByText('เจ้าของร้าน'),
  ).not.toBeInTheDocument();

  const stepper = screen.getByRole('complementary', {
    name: 'ความคืบหน้าการตั้งค่า',
  });
  expect(stepper).toHaveClass('setup-top-stepper');
  expect(stepper).not.toHaveClass('visually-hidden');
  expect(stepper.querySelector('.setup-top-stepper-line')).toBeInTheDocument();
  const badges = Array.from(
    stepper.querySelectorAll('.setup-top-step-badge'),
  ).map((el) => el.textContent?.trim());
  expect(badges).toEqual(['1', '2', '3', '4']);
  const layout = document.querySelector('.setup-layout');
  expect(layout).not.toBeNull();
  expect(
    stepper.compareDocumentPosition(layout!) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
  expect(within(stepper).getByText('ตั้งค่าข้อมูลพื้นฐาน')).toBeVisible();
  expect(within(stepper).getByText('ตรวจทานและเริ่มใช้งาน')).toBeVisible();

  expect(
    screen.queryByRole('complementary', {
      name: 'จุดเด่นและบริการ VELOPOS',
    }),
  ).not.toBeInTheDocument();
  expect(document.querySelector('.setup-hero-card')).not.toBeInTheDocument();

  expect(screen.getByPlaceholderText('เช่น ร้านอาหารของคุณ')).toBeVisible();
  expect(
    screen.getByPlaceholderText('เช่น contact@velocafe.com'),
  ).toBeVisible();
  expect(screen.getByPlaceholderText('เช่น 061-507-1665')).toBeVisible();
  expect(
    screen.getByPlaceholderText(
      'เช่น 123 ถ.สุขุมวิท แขวงคลองตัน เขตวัฒนา กรุงเทพฯ 10110',
    ),
  ).toBeVisible();
  expect(
    screen.getByPlaceholderText(
      'เช่น ร้านอาหารและคาเฟ่ อาหารไทย เครื่องดื่ม และเบเกอรี่',
    ),
  ).toBeVisible();
  expect(document.querySelector('.setup-select-overlay')).toHaveTextContent(
    'ร้านอาหาร',
  );
  expect(document.querySelector('.setup-select-overlay')).not.toHaveTextContent(
    'Restaurant',
  );
  expect(
    screen.getByText(
      /คุณสามารถแก้ไขข้อมูลเหล่านี้ได้ในภายหลัง เช่น ชื่อร้าน ที่อยู่ รูปภาพ และคำอธิบายร้าน/,
    ),
  ).toBeVisible();
  expect(screen.getByText('ถัดไป')).toBeVisible();
});
