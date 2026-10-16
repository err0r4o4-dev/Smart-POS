import { render } from '../../test/render';
import { StrictMode } from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { InventoryPage } from './InventoryPage';
import { LanguageSwitcher } from '../../components/ui/LanguageSwitcher';

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../app/AuthProvider', () => ({
  useAuth: () => ({
    state: { session: { user: { id: 'user' }, csrf_token: 'csrf' } },
  }),
}));
vi.mock('../../app/OrganizationProvider', () => ({
  useOrganization: () => ({
    context: {
      organization: { id: 'org' },
      branches: [{ id: 'branch', name: 'สาขาทดสอบ' }],
      membership: { user_id: 'user' },
    },
    branchID: 'branch',
    can: () => true,
  }),
}));
vi.mock('../../lib/organization-api', () => ({
  organizationRequest: mocks.request,
}));

beforeEach(() => {
  mocks.request.mockReset();
  mocks.request.mockImplementation(async (_path, options) => {
    if (options?.signal?.aborted)
      throw new DOMException('Aborted', 'AbortError');
    return options?.method
      ? { id: 'location' }
      : { items: [], total: 0, page: 1, page_size: 20 };
  });
});

function renderLocations() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/manage/inventory/locations']}>
          <LanguageSwitcher />
          <InventoryPage section="locations" />
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
}

it('translates status labels while preserving filter codes and draft input', async () => {
  renderLocations();
  const filter = await screen.findByRole('combobox', { name: 'กรองสถานะ' });
  expect(within(filter).getByRole('option', { name: 'ใช้งาน' })).toHaveValue(
    'ACTIVE',
  );
  fireEvent.change(screen.getByLabelText('รหัสสถานที่เก็บ'), {
    target: { value: 'DRAFT-LOCATION' },
  });
  fireEvent.change(filter, { target: { value: 'ACTIVE' } });
  await waitFor(() =>
    expect(mocks.request).toHaveBeenCalledWith(
      expect.stringContaining('status=ACTIVE'),
      expect.anything(),
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'English' }));
  expect(screen.getByRole('combobox', { name: 'Status filter' })).toHaveValue(
    'ACTIVE',
  );
  expect(screen.getByLabelText('Location code')).toHaveValue('DRAFT-LOCATION');
});

it('saves a location under StrictMode using a live signal and the existing payload', async () => {
  renderLocations();
  fireEvent.change(await screen.findByLabelText('รหัสสถานที่เก็บ'), {
    target: { value: 'test' },
  });
  fireEvent.change(screen.getByLabelText('ชื่อสถานที่เก็บ'), {
    target: { value: 'คลังทดสอบ' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'บันทึก Location' }));
  await waitFor(() =>
    expect(screen.getByLabelText('รหัสสถานที่เก็บ')).toHaveValue(''),
  );
  const call = mocks.request.mock.calls.find(
    ([, options]) => options?.method === 'POST',
  );
  expect(call?.[0]).toBe('/organizations/org/inventory/locations');
  expect(call?.[1]).toMatchObject({
    csrf: 'csrf',
    body: { branch_id: 'branch', code: 'TEST', name: 'คลังทดสอบ', revision: 0 },
  });
  expect(call?.[1].signal.aborted).toBe(false);
});

it('preserves location input on a failed save so it can be retried', async () => {
  mocks.request.mockImplementation(async (_path, options) => {
    if (options?.method) throw new Error('การเชื่อมต่อขัดข้อง');
    return { items: [], total: 0, page: 1, page_size: 20 };
  });
  renderLocations();
  fireEvent.change(await screen.findByLabelText('รหัสสถานที่เก็บ'), {
    target: { value: 'test' },
  });
  fireEvent.change(screen.getByLabelText('ชื่อสถานที่เก็บ'), {
    target: { value: 'คลังทดสอบ' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'บันทึก Location' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'การเชื่อมต่อขัดข้อง',
  );
  expect(screen.getByLabelText('รหัสสถานที่เก็บ')).toHaveValue('test');
  expect(screen.getByLabelText('ชื่อสถานที่เก็บ')).toHaveValue('คลังทดสอบ');
});

it('retries failed location options as well as the main inventory list', async () => {
  let unavailable = true;
  mocks.request.mockImplementation(async (path) => {
    if (unavailable && path.includes('page_size=100'))
      throw new Error('โหลดตัวเลือกสถานที่เก็บไม่สำเร็จ');
    return { items: [], total: 0, page: 1, page_size: 20 };
  });
  renderLocations();
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'โหลดตัวเลือกสถานที่เก็บไม่สำเร็จ',
  );
  unavailable = false;
  fireEvent.click(
    screen.getByRole('button', { name: 'ลองโหลดข้อมูลอีกครั้ง' }),
  );
  await waitFor(() =>
    expect(screen.queryByRole('alert')).not.toBeInTheDocument(),
  );
  expect(screen.getByRole('button', { name: 'บันทึก Location' })).toBeEnabled();
});

function renderBalances() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/manage/inventory/balances']}>
          <InventoryPage section="balances" />
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
}

it('renders "ดูประวัติ" as a visible button link in balances table', async () => {
  mocks.request.mockImplementation(async (path) => {
    if (path.includes('/balances')) {
      return {
        items: [
          {
            id: 'bal-1',
            product_name: 'โออิชิ กรีนที',
            variant_name: 'โออิชิ ข้าวญี่ปุ่น 380 มล.',
            sku: 'OISHI-GEN-380',
            barcode: '8854698005883',
            branch_id: 'branch',
            location_name: 'คลังสินค้าหลัก',
            location_type: 'WAREHOUSE',
            quantity: '30.000',
            unit: 'BOTTLE',
            available: '0.000',
            reserved: '0.000',
            availability_status: 'RESTRICTED',
            updated_at: '2026-10-13T17:13:58Z',
          },
        ],
        total: 18,
        page: 1,
        page_size: 20,
      };
    }
    return { items: [], total: 0, page: 1, page_size: 20 };
  });

  renderBalances();
  const historyLink = await screen.findByRole('link', { name: /ดูประวัติ/ });
  expect(historyLink).toBeVisible();
  expect(historyLink.getAttribute('href')).toMatch(/\/inventory\/movements/);
  expect(historyLink).toHaveClass(
    'button',
    'button-secondary',
    'button-compact',
  );
});

it('renders standard catalog pagination with item total at the bottom of balances table', async () => {
  mocks.request.mockImplementation(async (path) => {
    if (path.includes('/balances')) {
      return {
        items: [
          {
            id: 'bal-1',
            product_name: 'โออิชิ กรีนที',
            variant_name: 'โออิชิ ข้าวญี่ปุ่น',
            sku: 'OISHI',
            branch_id: 'branch',
            location_name: 'คลังสินค้าหลัก',
            location_type: 'WAREHOUSE',
            quantity: '30.000',
            unit: 'BOTTLE',
            available: '0.000',
            reserved: '0.000',
            availability_status: 'RESTRICTED',
            updated_at: '2026-10-13T17:13:58Z',
          },
        ],
        total: 18,
        page: 1,
        page_size: 20,
      };
    }
    return { items: [], total: 0, page: 1, page_size: 20 };
  });

  const { container } = renderBalances();
  await screen.findByRole('link', { name: /ดูประวัติ/ });
  expect(container.querySelector('.catalog-pagination')).toBeInTheDocument();
  expect(screen.getByText(/หน้า 1 \/ 1 • 18 รายการ/)).toBeVisible();
});

it('renders Status filter as a dropdown select with options in locations section', async () => {
  renderLocations();
  const select = await screen.findByRole('combobox', { name: 'กรองสถานะ' });
  expect(select).toBeVisible();
  const options = within(select).getAllByRole('option');
  expect(options.map((opt) => opt.textContent)).toEqual([
    'ทั้งหมด',
    'ใช้งาน',
    'ปิดใช้งาน',
  ]);
});

it('renders location status as a colored tag and action button with edit styling', async () => {
  mocks.request.mockImplementation(async (path) => {
    if (path.includes('/locations')) {
      return {
        items: [
          {
            id: 'loc-wh-main',
            branch_id: 'branch',
            code: 'LOC-WH-MAIN',
            name: 'คลังสินค้าหลัก (หลังร้าน)',
            type: 'WAREHOUSE',
            status: 'ACTIVE',
            parent_location_id: null,
            description: '',
            revision: 0,
            is_system: false,
          },
        ],
        total: 1,
        page: 1,
        page_size: 20,
      };
    }
    return { items: [], total: 0, page: 1, page_size: 20 };
  });

  const { container } = renderLocations();
  await waitFor(() => {
    const tag = container.querySelector('.tag-success');
    expect(tag).toBeInTheDocument();
    expect(tag).toHaveTextContent('ใช้งาน');
  });

  const editButton = screen.getByRole('button', { name: /แก้ไข LOC-WH-MAIN/ });
  expect(editButton).toBeVisible();
  expect(editButton).toHaveClass(
    'button',
    'button-secondary',
    'button-compact',
    'location-edit-btn',
  );
});

function renderMovements() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/manage/inventory/movements']}>
          <InventoryPage section="movements" />
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
}

it('renders movements history table with formatted tags and deltas', async () => {
  mocks.request.mockImplementation(async (path) => {
    if (path.includes('/movements')) {
      return {
        items: [
          {
            id: 'mov-1',
            sku: 'COKE-CAN-325',
            location_id: 'loc-wh-main',
            movement_type: 'OPENING_BALANCE',
            quantity_delta: '150.000',
            quantity_before: '0.000',
            quantity_after: '150.000',
            document_id: null,
            operation_id: 'op-1',
            reason_code: 'ยอดเปิดรอบต้นงวด / Opening Stock',
            batch_id: null,
            performed_by: 'user-admin',
            created_at: '2026-10-10T10:00:00Z',
          },
          {
            id: 'mov-2',
            sku: 'COKE-CAN-325',
            location_id: 'loc-wh-main',
            movement_type: 'TRANSFER_OUT',
            quantity_delta: '-30.000',
            quantity_before: '150.000',
            quantity_after: '120.000',
            document_id: 'doc-trans-1',
            operation_id: 'op-2',
            reason_code: 'เติมสต็อกหน้าร้าน',
            batch_id: null,
            performed_by: 'user-admin',
            created_at: '2026-10-12T14:30:00Z',
          },
        ],
        total: 2,
        page: 1,
        page_size: 20,
      };
    }
    return { items: [], total: 0, page: 1, page_size: 20 };
  });

  renderMovements();
  const openingTag = await screen.findByText('ยอดยกมา');
  expect(openingTag).toHaveClass('tag', 'tag-success');

  const transferOutTag = screen.getByText('โอนออก');
  expect(transferOutTag).toHaveClass('tag', 'tag-amber');

  expect(screen.getAllByText('COKE-CAN-325')).toHaveLength(2);
  expect(screen.getByText('+150.000')).toBeVisible();
  expect(screen.getByText('-30.000')).toBeVisible();
  expect(screen.getByText('0.000 → 150.000')).toBeVisible();
  expect(screen.getByText('ยอดเปิดรอบต้นงวด / Opening Stock')).toBeVisible();
});
