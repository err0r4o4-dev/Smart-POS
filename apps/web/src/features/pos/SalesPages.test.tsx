import { render } from '../../test/render';
import { StrictMode } from 'react';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SaleDetailsPage, SalesPage } from './SalesPages';
import { LanguageSwitcher } from '../../components/ui/LanguageSwitcher';
import type { POSSale, SaleSummary } from '../../lib/pos-api';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  selectOrg: vi.fn(),
}));

vi.mock('../../app/AuthProvider', () => ({
  useAuth: () => ({
    state: {
      status: 'authenticated',
      session: { user: { id: 'user-1' }, csrf_token: 'csrf' },
    },
  }),
}));

vi.mock('../../app/OrganizationProvider', () => ({
  useOrganization: () => ({
    storeMode: 'multi',
    loading: false,
    organizations: [{ id: 'org-1', name: 'yam' }],
    context: {
      organization: { id: 'org-1', name: 'yam' },
      branches: [
        { id: 'branch-main', name: 'สาขาหลัก' },
        { id: 'branch-2', name: 'สาขาสอง' },
      ],
      membership: { user_id: 'user-1', role: 'OWNER' },
    },
    branchID: 'branch-main',
    select: mocks.selectOrg,
    can: () => true,
  }),
}));

vi.mock('../../lib/organization-api', () => ({
  organizationRequest: mocks.request,
}));

const sampleSales: SaleSummary[] = [
  {
    id: 'sale-1',
    sale_number: 'SAL-75b94e59-6859-490d-95ab-efb082b376b8',
    receipt_id: 'rcp-1',
    receipt_number: 'RCP-001',
    branch_id: 'branch-main',
    terminal_id: 'term-1',
    branch_name: 'สาขาหลัก',
    terminal_name: 'เครื่องขายตัวอย่าง',
    cashier_name: 'Thirawat Duangta',
    grand_total: '28.00',
    method: 'CASH',
    payment_status: 'CONFIRMED',
    status: 'COMPLETED',
    completed_at: '2026-10-11T10:11:00Z',
  },
  {
    id: 'sale-2',
    sale_number: 'SAL-6dd4e707-f4ae-44cf-b043-1d5e664eee11',
    receipt_id: 'rcp-2',
    receipt_number: 'RCP-002',
    branch_id: 'branch-main',
    terminal_id: 'term-1',
    branch_name: 'สาขาหลัก',
    terminal_name: 'เครื่องขายตัวอย่าง',
    cashier_name: 'Thirawat Duangta',
    grand_total: '36.00',
    method: 'CASH',
    payment_status: 'CONFIRMED',
    status: 'COMPLETED',
    completed_at: '2026-10-11T10:11:00Z',
  },
  {
    id: 'sale-3',
    sale_number: 'SAL-28a6e1f3-3be0-4d00-b9ab-b81cf9f2e784',
    receipt_id: 'rcp-3',
    receipt_number: 'RCP-003',
    branch_id: 'branch-main',
    terminal_id: 'term-1',
    branch_name: 'สาขาหลัก',
    terminal_name: 'เครื่องขายตัวอย่าง',
    cashier_name: 'Thirawat Duangta',
    grand_total: '57.00',
    method: 'CASH',
    payment_status: 'CONFIRMED',
    status: 'COMPLETED',
    completed_at: '2026-10-11T10:09:00Z',
  },
];

beforeEach(() => {
  localStorage.clear();
  mocks.request.mockReset();
  mocks.selectOrg.mockReset();
  mocks.request.mockImplementation(async (path: string) => {
    if (path.includes('/pos/terminals')) {
      return {
        items: [
          {
            id: 'term-1',
            branch_id: 'branch-main',
            code: 'POS-01',
            name: 'เครื่องขายตัวอย่าง',
            stock_location_id: 'loc-1',
            status: 'ACTIVE',
            revision: 1,
          },
        ],
        total: 1,
        page: 1,
        page_size: 100,
      };
    }
    const url = new URL(path, 'http://localhost');
    const methodFilter = url.searchParams.get('method') ?? '';
    const searchFilter = url.searchParams.get('search') ?? '';
    const filtered = sampleSales.filter(
      (item) =>
        (!methodFilter || item.method === methodFilter) &&
        (!searchFilter || item.sale_number.includes(searchFilter)),
    );
    return {
      items: filtered,
      total: filtered.length,
      page: Number(url.searchParams.get('page') ?? '1'),
      page_size: Number(url.searchParams.get('page_size') ?? '10'),
    };
  });
});

function renderSalesPage(receipts = false) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <StrictMode>
      <QueryClientProvider client={client}>
        <MemoryRouter
          initialEntries={[receipts ? '/manage/receipts' : '/manage/sales']}
        >
          <LanguageSwitcher />
          <SalesPage receipts={receipts} />
        </MemoryRouter>
      </QueryClientProvider>
    </StrictMode>,
  );
}

describe('SalesPage standardized design and behavior', () => {
  it('renders KPI summary cards with exact decimal totals, averages, and completion ratio', async () => {
    renderSalesPage();

    expect(
      await screen.findByText('SAL-75b94e59-6859-490d-95ab-efb082b376b8'),
    ).toBeVisible();

    const kpiRegion = screen.getByRole('region', { name: 'สรุปยอดขาย' });
    expect(within(kpiRegion).getByText('ยอดขายรวม')).toBeVisible();
    expect(within(kpiRegion).getByText('฿121.00')).toBeVisible();
    expect(within(kpiRegion).getByText('จำนวนรายการ')).toBeVisible();
    expect(within(kpiRegion).getByText('ยอดเฉลี่ยต่อรายการ')).toBeVisible();
    expect(within(kpiRegion).getByText('฿40.33')).toBeVisible();
    expect(within(kpiRegion).getByText('รายการสำเร็จ')).toBeVisible();
    expect(within(kpiRegion).getByText('100.0% ของทั้งหมด')).toBeVisible();
  });

  it('filters by payment method tabs, supports resetting filters, and renders standardized table actions and pagination', async () => {
    renderSalesPage();

    expect(
      await screen.findByText('SAL-75b94e59-6859-490d-95ab-efb082b376b8'),
    ).toBeVisible();

    expect(
      screen.getByRole('tab', { name: /รายการขายทั้งหมด/ }),
    ).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /เงินสด/ })).toBeVisible();
    expect(screen.getByRole('tab', { name: /บัตร\/QR/ })).toBeVisible();
    expect(screen.getByRole('tab', { name: /โอนเงิน/ })).toBeVisible();
    expect(screen.getByRole('tab', { name: /คืนสินค้า/ })).toBeVisible();

    // Cashier avatar and name
    expect(screen.getAllByText('Thirawat Duangta')).toHaveLength(3);
    expect(screen.getByText('฿28.00')).toBeVisible();
    expect(screen.getByText('฿36.00')).toBeVisible();
    expect(screen.getByText('฿57.00')).toBeVisible();

    // Row action links
    expect(
      screen.getAllByRole('link', { name: 'ดูรายละเอียด' })[0],
    ).toHaveAttribute('href', '/manage/sales/sale-1');
    expect(screen.getAllByRole('link', { name: 'พิมพ์' })[0]).toHaveAttribute(
      'href',
      '/manage/sales/sale-1',
    );

    // Filter by search and reset
    const searchInput = screen.getByLabelText('ค้นหาเลขรายการ');
    fireEvent.change(searchInput, { target: { value: 'SAL-75b94e59' } });
    await waitFor(() =>
      expect(mocks.request).toHaveBeenCalledWith(
        expect.stringContaining('search=SAL-75b94e59'),
        expect.anything(),
      ),
    );

    fireEvent.click(screen.getByRole('button', { name: 'ล้างตัวกรอง' }));
    expect(searchInput).toHaveValue('');

    // Pagination summary
    expect(screen.getByText('แสดง 1 – 3 จาก 3 รายการ')).toBeVisible();
  });

  it('translates KPI cards, filters, tabs, and table headers to English while keeping filter state', async () => {
    renderSalesPage();
    expect(
      await screen.findByText('SAL-75b94e59-6859-490d-95ab-efb082b376b8'),
    ).toBeVisible();

    fireEvent.change(screen.getByLabelText('ค้นหาเลขรายการ'), {
      target: { value: 'SAL-75' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'English' }));

    expect(
      screen.getByRole('heading', { name: 'Sales history', level: 1 }),
    ).toBeVisible();
    expect(screen.getByText('Total sales')).toBeVisible();
    expect(screen.getByText('Average per sale')).toBeVisible();
    expect(screen.getByLabelText('Search transaction number')).toHaveValue(
      'SAL-75',
    );
  });

  it('renders standardized SaleDetailsPage with receipt reprint controls and linked actions', async () => {
    const detailedSale: POSSale = {
      ...sampleSales[0],
      store_name: 'yam',
      store_address: 'กรุงเทพฯ',
      currency: 'THB',
      subtotal: '28.00',
      discount_total: '0.00',
      tax_total: '0.00',
      inventory_operation_id: 'op-1',
      receipt: { id: 'rcp-1', receipt_number: 'RCP-001' },
      items: [
        {
          variant_id: 'var-1',
          stock_location_id: 'loc-1',
          product_name: 'น้ำดื่มคริสตัล',
          variant_name: '600 มล.',
          sku: 'SKU-WATER',
          barcode: '8850001',
          unit: 'ขวด',
          quantity: '2.000',
          unit_price: '14.00',
          line_total: '28.00',
        },
      ],
      payment: {
        method: 'CASH',
        status: 'CONFIRMED',
        amount: '28.00',
        received: '30.00',
        change: '2.00',
        reference: '',
        confirmed_by: 'user-1',
        confirmed_at: '2026-10-11T10:11:00Z',
      },
      movements: [],
      audit: [],
    };
    mocks.request.mockResolvedValueOnce(detailedSale);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <StrictMode>
        <QueryClientProvider client={client}>
          <MemoryRouter initialEntries={['/manage/sales/sale-1']}>
            <Routes>
              <Route path="/manage/sales/:id" element={<SaleDetailsPage />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      </StrictMode>,
    );

    expect(
      await screen.findByRole('heading', {
        name: 'รายละเอียดการขาย',
        level: 1,
      }),
    ).toBeVisible();
    expect(screen.getByText('น้ำดื่มคริสตัล')).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'กลับประวัติขาย' }),
    ).toHaveAttribute('href', '/manage/sales');
  });
});

