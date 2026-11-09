
import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  BarChart3,
  Clock3,
  LayoutDashboard,
  Package,
  RefreshCw,
  ShoppingBag,
  Store,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { useLanguage } from '../../app/language';
import { useOrganization } from '../../app/OrganizationProvider';
import { WorkspaceLink } from '../../app/WorkspaceNavigation';
import { isManagementRole } from '../../app/access';
import {
  posRequest,
  exactDecimal,
  moneyText,
  type POSPage,
  type POSShift,
  type POSTerminal,
  type POSSale,
  type SaleSummary,
  type POSCart,
} from '../../lib/pos-api';
import type { CustomerRefund } from '../../lib/returns-api';
import type { ShopSettings, OnlineOrder } from '../../lib/storefront-api';
import type { Product } from '../../lib/catalog-api';
import type { InventoryOverview } from '../../lib/inventory-api';

// Dashboard UI. No mock business figures or write requests.
const styles = `
  .ov {
    color: #111b38;
    min-width: 0;
    padding: 12px 0 28px;
  }
  .ov * { box-sizing: border-box; }
  .ov-head, .ov-toolbar, .ov-between {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .ov h1 {
    font-size: clamp(24px, 3vw, 31px);
    margin: 0;
    font-weight: 800;
  }
  .ov h2 {
    font-size: 16px;
    margin: 0 0 14px;
    font-weight: 800;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .ov h3 {
    font-size: 14px;
    margin: 0 0 8px;
    font-weight: 750;
  }
  .ov-note, .ov-muted {
    font-size: 12px;
    color: #65738d;
  }
  .ov-sub {
    margin: 3px 0 0;
    color: #65738d;
    font-size: 13px;
  }
  .ov-panel, .ov-kpi {
    background: #fff;
    border: 1px solid #e8ecf3;
    border-radius: 14px;
    box-shadow: 0 2px 12px rgba(10,35,73,.035);
    padding: 16px;
    min-width: 0;
  }
  .ov-panel { margin-top: 14px; }
  .ov-grid4 {
    display: grid;
    grid-template-columns: repeat(4,minmax(0,1fr));
    gap: 12px;
    margin-top: 14px;
  }
  .ov-grid2 {
    display: grid;
    grid-template-columns: repeat(2,minmax(0,1fr));
    gap: 12px;
  }
  .ov-grid3 {
    display: grid;
    grid-template-columns: minmax(0,1.3fr) minmax(0,1fr) minmax(0,1fr);
    gap: 12px;
  }
  .ov-grid-bottom {
    display: grid;
    grid-template-columns: 1.1fr .8fr 1.2fr;
    gap: 12px;
  }
  .ov-kpi { border-left: 4px solid #ffce3e; }
  .ov-kpi:nth-child(2) { border-left-color: #4f9cff; }
  .ov-kpi:nth-child(3) { border-left-color: #a87aff; }
  .ov-kpi:nth-child(4) { border-left-color: #f36b7a; }
  .ov-kpi strong {
    display: block;
    font-size: clamp(21px,2.3vw,29px);
    font-weight: 800;
    line-height: 1.35;
    margin: 7px 0;
  }
  .ov-kpi small {
    display: block;
    color: #65738d;
    line-height: 1.6;
  }
  .ov-status {
    display: inline-flex;
    gap: 5px;
    align-items: center;
    border-radius: 999px;
    padding: 5px 10px;
    background: #e7f8ee;
    color: #146c3a;
    font-size: 12px;
    font-weight: 700;
  }
  .ov-status.off {
    background: #fff1ef;
    color: #aa433f;
  }
  .ov-btn {
    border: 1px solid #e5e9f0;
    background: #fff;
    border-radius: 9px;
    padding: 10px 13px;
    color: #111b38;
    cursor: pointer;
    text-decoration: none;
    display: inline-flex;
    gap: 8px;
    align-items: center;
    font: inherit;
    font-size: 13px;
  }
  .ov-btn.active, .ov-btn.primary {
    border-color: #ffcb36;
    background: #ffcb36;
    color: #101d38;
    font-weight: 800;
  }
  .ov-btn:disabled {
    opacity: .6;
    cursor: not-allowed;
  }
  .ov-toolbar {
    padding: 15px;
    margin-top: 14px;
    background: #fff;
    border: 1px solid #e8ecf3;
    border-radius: 14px;
  }
  .ov-row {
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 0;
    border-bottom: 1px solid #edf0f4;
    min-width: 0;
  }
  .ov-row:last-child { border: 0; }
  .ov-row span, .ov-row strong { overflow-wrap: anywhere; }
  .ov-alert {
    border-radius: 10px;
    padding: 12px;
    background: #fff3e7;
    color: #92531d;
    display: flex;
    gap: 10px;
    align-items: center;
    margin-top: 8px;
    font-size: 13px;
  }
  .ov-bars {
    height: 195px;
    display: flex;
    align-items: end;
    gap: 6px;
    overflow-x: auto;
    padding: 15px 0 4px;
    border-bottom: 1px solid #e8ecf3;
  }
  .ov-barcol {
    height: 100%;
    min-width: 19px;
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: end;
    align-items: center;
    gap: 5px;
  }
  .ov-bar {
    width: 100%;
    max-width: 37px;
    background: linear-gradient(180deg,#ffca39,#ffd971);
    border-radius: 5px 5px 0 0;
    min-height: 1px;
  }
  .ov-barcol small {
    font-size: 10px;
    color: #68758b;
    white-space: nowrap;
  }
  .ov-table-wrap {
    max-width: 100%;
    overflow-x: auto;
  }
  .ov-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
    min-width: 400px;
  }
  .ov-table th {
    text-align: left;
    background: #f6f8fb;
    color: #53617c;
    font-weight: 700;
    padding: 9px 7px;
  }
  .ov-table td {
    border-bottom: 1px solid #edf0f4;
    padding: 9px 7px;
    vertical-align: top;
  }
  .ov-table tr:last-child td { border-bottom: 0; }
  .ov-meter {
    height: 9px;
    background: #eef2f7;
    border-radius: 9px;
    overflow: hidden;
  }
  .ov-meter > div {
    height: 100%;
    background: #ffc93d;
    border-radius: 9px;
  }
  .ov-emptystate {
    padding: 12px;
    color: #758096;
    font-size: 13px;
    background: #f8fafc;
    border-radius: 9px;
  }
  .ov-dot {
    display: inline-block;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    margin-right: 7px;
  }
  .ov-links {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .ov-checklist {
    display: grid;
    grid-template-columns: repeat(4,minmax(0,1fr));
    gap: 9px;
  }
  .ov-checklist a {
    border: 1px solid #e7eaf0;
    background: #fffef8;
    padding: 14px;
    border-radius: 9px;
    text-decoration: none;
    color: #111b38;
    font-size: 13px;
  }
  .ov-error {
    border: 1px solid #f0b7b7;
    background: #fff0f0;
    border-radius: 10px;
    padding: 11px;
    color: #913f3f;
    margin-top: 12px;
    font-size: 13px;
  }
  @media(max-width:1200px) {
    .ov-grid4 { grid-template-columns: repeat(2,minmax(0,1fr)); }
    .ov-grid3, .ov-grid-bottom {
      grid-template-columns: repeat(2,minmax(0,1fr));
    }
  }
  @media(max-width:750px) {
    .ov-grid4, .ov-grid2, .ov-grid3,
    .ov-grid-bottom, .ov-checklist {
      grid-template-columns: 1fr;
    }
    .ov-toolbar { align-items: flex-start; }
    .ov-btn { min-height: 43px; }
    .ov-panel { padding: 13px; }
  }
`;

type Period = 'today' | '7d' | '30d';

type Page<T> = {
  items: T[];
  total: number;
  truncated: boolean;
};

type AdminOrder = OnlineOrder & {
  fulfillment?: string;
  sale_id?: string | null;
};

type AdminShop = ShopSettings & {
  delivery_enabled?: boolean;
};

type NamedResult<T> = {
  data: T | null;
  error: string | null;
};

// Limit the number of API pages fetched.
// When data exceeds the limit, the UI displays a warning.
const maxPages = 8;

async function readPages<T>(
  org: string,
  path: string,
  signal: AbortSignal,
  online = false,
): Promise<Page<T>> {
  const items: T[] = [];
  let total = 0;

  for (let p = 1; p <= maxPages; p++) {
    const join = path.includes('?') ? '&' : '?';

    const result = await posRequest<POSPage<T>>(
      org,
      `${path}${join}page=${p}${online ? '' : '&page_size=100'}`,
      { signal },
    );

    total = result.total;
    items.push(...result.items);

    if (items.length >= total || result.items.length === 0) {
      break;
    }
  }

  return {
    items,
    total,
    truncated: items.length < total,
  };
}

async function attempt<T>(
  allowed: boolean,
  name: string,
  action: () => Promise<T>,
): Promise<NamedResult<T>> {
  if (!allowed) {
    return {
      data: null,
      error: `${name}: ไม่มีสิทธิ์เข้าถึง`,
    };
  }

  try {
    return { data: await action(), error: null };
  } catch (error) {
    return {
      data: null,
      error: `${name}: ${
        error instanceof Error ? error.message : 'โหลดข้อมูลไม่สำเร็จ'
      }`,
    };
  }
}

function ranges(period: Period) {
  const end = new Date();
  const start = new Date(end);

  start.setHours(0, 0, 0, 0);

  const span =
    period === 'today' ? 1 : period === '7d' ? 7 : 30;

  start.setDate(start.getDate() - span + 1);

  const previousEnd = new Date(start.getTime() - 1);
  const previousStart = new Date(start);
  previousStart.setDate(previousStart.getDate() - span);

  return { start, end, previousStart, previousEnd };
}

function cents(raw: string | undefined | null): bigint {
  if (!raw) return 0n;
  return exactDecimal(raw, 2) ?? 0n;
}

function baht(value: bigint): string {
  const abs = value < 0n ? -value : value;

  return `${value < 0n ? '-' : ''}฿${moneyText(
    `${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`,
  )}`;
}

function datetime(value: string | undefined, thai: boolean) {
  if (!value) return '—';

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString(thai ? 'th-TH' : 'en-GB', {
        dateStyle: 'short',
        timeStyle: 'short',
      });
}

function signedGrowth(current: bigint, previous: bigint): string {
  if (previous === 0n) return '—';

  return `${
    Number(((current - previous) * 1000n) / previous) / 10
  }%`;
}

function getTrend(
  sales: SaleSummary[],
  period: Period,
  from: Date,
) {
  const bucket = new Map<string, bigint>();
  const hours = period === 'today' ? 24 : period === '7d' ? 7 : 30;

  for (let i = 0; i < hours; i++) {
    const d = new Date(from);

    if (period === 'today') {
      d.setHours(i, 0, 0, 0);
    } else {
      d.setDate(d.getDate() + i);
    }

    const key =
      period === 'today'
        ? String(d.getHours()).padStart(2, '0')
        : `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

    bucket.set(key, 0n);
  }

  for (const sale of sales) {
    const d = new Date(sale.completed_at);

    const key =
      period === 'today'
        ? String(d.getHours()).padStart(2, '0')
        : `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;

    if (bucket.has(key)) {
      bucket.set(
        key,
        (bucket.get(key) ?? 0n) + cents(sale.grand_total),
      );
    }
  }

  return [...bucket.entries()].map(([label, value]) => ({
    label:
      period === 'today'
        ? `${label}:00`
        : label.split('-').slice(1).join('/'),
    value,
  }));
}

function Status({
  good,
  children,
}: {
  good: boolean;
  children: ReactNode;
}) {
  return (
    <span className={`ov-status${good ? '' : ' off'}`}>
      {children}
    </span>
  );
}

function Box({
  title,
  children,
  className = '',
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`ov-panel ${className}`}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function ManagementOverviewPage() {
  const { language } = useLanguage();
  const th = language !== 'en';

  const { state } = useAuth();
  const tenant = useOrganization();

  const [period, setPeriod] = useState<Period>('today');

  const context = tenant.context;
  const org = context?.organization.id ?? '';
  const branch = tenant.branchID;
  const user = state.session?.user.id ?? '';

  // Existing permissions from the organization context.
  const canSales = tenant.can('sales.read');
  const canOnline = tenant.can('online_orders.read');
  const canPos = tenant.can('pos.access');
  const canShifts = tenant.can('pos.register.history.read');
  const canHeld = tenant.can('pos.cart.manage');
  const canRefunds = tenant.can('refunds.read');
  const canInventory = tenant.can('inventory.read');
  const canCatalog = tenant.can('catalog.read');
  const canStorefront = tenant.can('storefront.manage');

  const r = useMemo(() => ranges(period), [period]);

  // All business metrics are loaded from existing backend endpoints.
  const dashboard = useQuery({
    queryKey: [
      'tenant',
      user,
      org,
      branch,
      'live-overview',
      period,
      r.start.toISOString(),
    ],
    enabled: !!org && !!branch,
    retry: false,
    refetchInterval: 60_000,

    queryFn: async ({ signal }) => {
      const dates = new URLSearchParams({
        branch_id: branch,
        status: 'COMPLETED',
        from: r.start.toISOString(),
        to: new Date().toISOString(),
      });

      const prevDates = new URLSearchParams({
        branch_id: branch,
        status: 'COMPLETED',
        from: r.previousStart.toISOString(),
        to: r.previousEnd.toISOString(),
      });

      const base = `branch_id=${encodeURIComponent(branch)}`;

      const [
        sales,
        previous,
        orders,
        shifts,
        terminals,
        held,
        refunds,
        inventory,
        products,
        published,
        shop,
      ] = await Promise.all([
        attempt(canSales, 'ยอดขาย', () =>
          readPages<SaleSummary>(org, `/sales?${dates}`, signal),
        ),
        attempt(canSales, 'ยอดขายรอบก่อน', () =>
          readPages<SaleSummary>(org, `/sales?${prevDates}`, signal),
        ),
        attempt(canOnline, 'ออเดอร์ออนไลน์', () =>
          readPages<AdminOrder>(
            org,
            `/online-orders?${base}`,
            signal,
            true,
          ),
        ),
        attempt(canShifts, 'กะแคชเชียร์', () =>
          readPages<POSShift>(
            org,
            `/pos/shifts?${base}&status=OPEN`,
            signal,
          ),
        ),
        attempt(canPos, 'เครื่อง POS', () =>
          readPages<POSTerminal>(
            org,
            `/pos/terminals?${base}`,
            signal,
          ),
        ),
        attempt(canHeld, 'บิลที่พักไว้', () =>
          readPages<POSCart>(
            org,
            `/pos/carts?${base}&status=HELD`,
            signal,
          ),
        ),
        attempt(canRefunds, 'เงินคืน', () =>
          readPages<CustomerRefund>(
            org,
            `/refunds?${base}`,
            signal,
          ),
        ),
        attempt(canInventory, 'สต็อก', () =>
          posRequest<InventoryOverview>(
            org,
            `/inventory/overview?${base}`,
            { signal },
          ),
        ),
        attempt(canCatalog, 'เมนูสินค้า', () =>
          readPages<Product>(
            org,
            '/products?status=ACTIVE',
            signal,
          ),
        ),
        attempt(canStorefront, 'เมนูออนไลน์', () =>
          readPages<{ published: boolean; saleable: boolean }>(
            org,
            '/storefront/products',
            signal,
            true,
          ),
        ),
        attempt(canStorefront, 'หน้าร้านออนไลน์', () =>
          posRequest<AdminShop>(
            org,
            '/storefront',
            { signal },
          ),
        ),
      ]);

      // Read up to 20 sale details for the recent top-products section.
      const details = await attempt(
        canSales && !!sales.data,
        'รายละเอียดสินค้าขายดี',
        async () => {
          const found = await Promise.allSettled(
            (sales.data?.items ?? [])
              .slice(0, 20)
              .map((item) =>
                posRequest<POSSale>(
                  org,
                  `/sales/${item.id}`,
                  { signal },
                ),
              ),
          );

          return found
            .filter(
              (item): item is PromiseFulfilledResult<POSSale> =>
                item.status === 'fulfilled',
            )
            .map((item) => item.value);
        },
      );

      return {
        sales,
        previous,
        orders,
        shifts,
        terminals,
        held,
        refunds,
        inventory,
        products,
        published,
        shop,
        details,
        loadedAt: new Date().toISOString(),
      };
    },
  });

  if (!context) return null;

  if (!isManagementRole(context.membership.role)) {
    return <Navigate to="/work" replace />;
  }

  const data = dashboard.data;

  const sales = data?.sales.data?.items ?? [];
  const previous = data?.previous.data?.items ?? [];
  const activeOrders = data?.orders.data?.items ?? [];
  const shifts = data?.shifts.data?.items ?? [];
  const returns = data?.refunds.data?.items ?? [];

  const completed = sales.filter(
    (item) => item.status === 'COMPLETED',
  );

  // Main KPI calculations from actual completed sales and refunds.
  const gross = completed.reduce(
    (sum, item) => sum + cents(item.grand_total),
    0n,
  );

  const prevGross = previous.reduce(
    (sum, item) => sum + cents(item.grand_total),
    0n,
  );

  const refunded = returns
    .filter(
      (item) =>
        item.status === 'CONFIRMED' &&
        item.confirmed_at &&
        new Date(item.confirmed_at) >= r.start &&
        new Date(item.confirmed_at) <= new Date(),
    )
    .reduce((sum, item) => sum + cents(item.amount), 0n);

  const net = gross - refunded;

  const previousRefunded = returns
    .filter(
      (item) =>
        item.status === 'CONFIRMED' &&
        item.confirmed_at &&
        new Date(item.confirmed_at) >= r.previousStart &&
        new Date(item.confirmed_at) <= r.previousEnd,
    )
    .reduce((sum, item) => sum + cents(item.amount), 0n);

  const previousNet = prevGross - previousRefunded;

  const asOf = data?.loadedAt
    ? new Date(data.loadedAt).getTime()
    : 0;

  const average = completed.length
    ? gross / BigInt(completed.length)
    : 0n;

  const canShowSales = !!data?.sales.data;
  const trends = getTrend(completed, period, r.start);

  const maximum = trends.reduce(
    (max, item) => (item.value > max ? item.value : max),
    1n,
  );

  // Match online orders to the actual sales they generated.
  const onlineSaleIds = new Map(
    activeOrders
      .filter((item) => item.sale_id)
      .map((item) => [item.sale_id as string, item]),
  );

  const pickup = completed.filter(
    (item) =>
      onlineSaleIds.has(item.id) &&
      onlineSaleIds.get(item.id)?.fulfillment !== 'DELIVERY',
  );

  const delivery = completed.filter(
    (item) =>
      onlineSaleIds.get(item.id)?.fulfillment === 'DELIVERY',
  );

  const posOrUnknown = completed.filter(
    (item) => !onlineSaleIds.has(item.id),
  );

  const paymentMethods = [
    {
      label: th ? 'เงินสด' : 'Cash',
      code: 'CASH',
      color: '#ffc93c',
    },
    {
      label: th ? 'QR หน้าร้าน' : 'In-store QR',
      code: 'QR_MANUAL',
      color: '#4285f4',
    },
    {
      label: th ? 'โอนเงิน' : 'Bank transfer',
      code: 'BANK_TRANSFER_MANUAL',
      color: '#41bf81',
    },
    {
      label: th ? 'อื่น ๆ' : 'Other',
      code: 'OTHER',
      color: '#a27be4',
    },
  ];

  const methodTotal = paymentMethods.map((payment) => ({
    ...payment,
    items: completed.filter((item) =>
      payment.code === 'OTHER'
        ? ![
            'CASH',
            'QR_MANUAL',
            'BANK_TRANSFER_MANUAL',
          ].includes(item.method)
        : item.method === payment.code,
    ),
  }));

  // Online-order queue is not the same as a kitchen KDS queue.
  const currentOrders = activeOrders.filter((item) =>
    ['PENDING', 'PREPARING', 'READY'].includes(item.status),
  );

  const lateOrders = currentOrders.filter(
    (item) =>
      item.status === 'PENDING' &&
      asOf - new Date(item.created_at).getTime() >
        15 * 60 * 1000,
  );

  const latestOrders = [...currentOrders]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .slice(0, 5);

  const openShifts = shifts.filter(
    (shift) => shift.status === 'OPEN',
  );

  const menus = data?.products.data?.items ?? [];
  const productsCount = menus.filter(
    (item) => item.status === 'ACTIVE',
  ).length;

  const publishedCount = data?.published.data?.items.filter(
    (item) => item.published,
  ).length;

  const lowStock =
    data?.inventory.data?.alerts.low_stock_variants;

  const currentStore = data?.shop.data;

  const alertRefunds = returns.filter((item) =>
    [
      'PENDING_SETTLEMENT',
      'SETTLEMENT_REPORTED',
      'RECONCILIATION_REQUIRED',
    ].includes(item.status),
  );

  const warnings = data
    ? Object.values(data).flatMap((item) =>
        item &&
        typeof item === 'object' &&
        'error' in item &&
        typeof item.error === 'string'
          ? [item.error]
          : [],
      )
    : [];

  const truncated =
    !!data &&
    [
      data.sales,
      data.orders,
      data.refunds,
      data.products,
      data.published,
    ].some(
      (item) =>
        item.data &&
        'truncated' in item.data &&
        item.data.truncated,
    );

  // Best selling items based on the loaded sale details.
  const topProducts = new Map<
    string,
    { name: string; quantity: number; revenue: bigint }
  >();

  for (const sale of data?.details.data ?? []) {
    for (const item of sale.items ?? []) {
      const key = item.variant_id || item.sku;

      const old = topProducts.get(key) ?? {
        name: item.product_name,
        quantity: 0,
        revenue: 0n,
      };

      old.quantity += Number(item.quantity || '0');
      old.revenue += cents(item.line_total);

      topProducts.set(key, old);
    }
  }

  const top = [...topProducts.values()]
    .sort((a, b) =>
      a.revenue === b.revenue
        ? 0
        : a.revenue > b.revenue
          ? -1
          : 1,
    )
    .slice(0, 5);

  const text = (thai: string, english: string) =>
    th ? thai : english;

  const boxValue = (value: string, detail: string) => (
    <>
      <strong>{value}</strong>
      <small>{detail}</small>
    </>
  );

  const checkoutStatus = currentStore
    ? !currentStore.published
      ? text('ยังไม่เผยแพร่', 'Unpublished')
      : currentStore.accepting_orders
        ? text('เปิดรับออเดอร์', 'Accepting orders')
        : text('ปิดรับชั่วคราว', 'Paused')
    : text('ไม่มีข้อมูล', 'Unavailable');

  return (
    <div className="ov">
      <style>{styles}</style>

      {/* 1. HEADER */}
      <header className="ov-head">
        <div>
          <h1>
            <LayoutDashboard
              size={26}
              style={{
                verticalAlign: 'middle',
                marginRight: 9,
              }}
            />
            {text('ภาพรวมร้าน', 'Store overview')}
          </h1>

          <p className="ov-sub">
            {context.organization.name} ·{' '}
            {context.branches.find(
              (item) => item.id === branch,
            )?.name ?? ''}
          </p>
        </div>

        <div className="ov-links">
          {canPos && (
            <WorkspaceLink
              to="/pos"
              className="ov-btn primary"
            >
              <ShoppingBag size={18} />
              {text('เปิดหน้าขาย POS', 'Open POS')}
            </WorkspaceLink>
          )}
        </div>
      </header>

      {/* STORE STATUS AND TIME FILTER */}
      <div className="ov-toolbar">
        <div className="ov-links">
          <Store size={19} />
          <strong>{context.organization.name}</strong>
          <span className="ov-note">
            {text(
              'เวลาทำการ: ยังไม่มี API',
              'Hours: no API yet',
            )}
          </span>
        </div>

        <div className="ov-links">
          <Status
            good={
              !!currentStore?.published &&
              !!currentStore.accepting_orders
            }
          >
            {checkoutStatus}
          </Status>

          <Status good={openShifts.length > 0}>
            {data?.shifts.data
              ? openShifts.length
                ? text('เปิดกะอยู่', 'Shift open')
                : text('ยังไม่เปิดกะ', 'No open shift')
              : '—'}
          </Status>
        </div>

        <div className="ov-links">
          {(['today', '7d', '30d'] as const).map(
            (option) => (
              <button
                key={option}
                type="button"
                className={`ov-btn${
                  period === option ? ' active' : ''
                }`}
                onClick={() => setPeriod(option)}
              >
                {option === 'today'
                  ? text('วันนี้', 'Today')
                  : option === '7d'
                    ? text('7 วัน', '7 days')
                    : text('30 วัน', '30 days')}
              </button>
            ),
          )}

          <button
            type="button"
            className="ov-btn"
            aria-label={text('รีเฟรชข้อมูล', 'Refresh')}
            onClick={() => void dashboard.refetch()}
            disabled={dashboard.isFetching}
          >
            <RefreshCw size={15} />
          </button>
        </div>

        <span className="ov-note">
          {text('อัปเดตล่าสุด', 'Updated')}:{' '}
          {datetime(data?.loadedAt, th)}
        </span>
      </div>

      {/* LOADING / ERRORS */}
      {dashboard.isPending && (
        <p
          role="status"
          className="ov-emptystate"
          style={{ marginTop: 14 }}
        >
          {text(
            'กำลังโหลดข้อมูลจริงจากระบบ...',
            'Loading live business data...',
          )}
        </p>
      )}

      {dashboard.isError && (
        <div className="ov-error" role="alert">
          {dashboard.error instanceof Error
            ? dashboard.error.message
            : 'Failed to load dashboard'}
        </div>
      )}

      {!!warnings.length && (
        <div role="status" className="ov-error">
          {text(
            'บางส่วนโหลดไม่ได้/ไม่มีสิทธิ์: ',
            'Some data unavailable: ',
          )}
          {warnings.join(' • ')}
        </div>
      )}

      {truncated && (
        <p
          role="status"
          className="ov-note"
          style={{ margin: '10px 0' }}
        >
          {text(
            'ข้อมูลบางหมวดมีมากกว่าขอบเขตที่โหลด ตัวเลขสรุปหมวดนั้นอาจไม่ครบ',
            'Some lists exceed the fetched page limit; related totals may be partial.',
          )}
        </p>
      )}

      {/* 2. ACTION ALERTS */}
      {!!data &&
        (lateOrders.length > 0 ||
          alertRefunds.length > 0 ||
          (lowStock ?? 0) > 0) && (
          <Box
            title={text(
              '⚠️ สิ่งที่ต้องรีบจัดการ',
              '⚠️ Action alerts',
            )}
          >
            <div className="ov-grid3">
              {lateOrders.length > 0 && (
                <WorkspaceLink
                  to="/online-orders"
                  className="ov-alert"
                >
                  <Clock3 size={19} />
                  {text(
                    'ออเดอร์รอเกิน 15 นาที (เกณฑ์หน้าจอ)',
                    'Orders pending over 15 min (UI threshold)',
                  )}
                  : {lateOrders.length}
                </WorkspaceLink>
              )}

              {alertRefunds.length > 0 && (
                <WorkspaceLink
                  to="/sales/refunds"
                  className="ov-alert"
                >
                  <Wallet size={19} />
                  {text(
                    'รายการคืนเงินรอดำเนินการ',
                    'Refunds requiring action',
                  )}
                  : {alertRefunds.length}
                </WorkspaceLink>
              )}

              {!!lowStock && lowStock > 0 && (
                <WorkspaceLink
                  to="/inventory"
                  className="ov-alert"
                >
                  <Package size={19} />
                  {text(
                    'สินค้าใกล้หมด',
                    'Low-stock items',
                  )}
                  : {lowStock}
                </WorkspaceLink>
              )}
            </div>
          </Box>
        )}

      {/* 3. CORE KPIs */}
      <section
        className="ov-grid4"
        aria-label={text(
          'ตัวเลขหลัก',
          'Key indicators',
        )}
      >
        <div className="ov-kpi">
          <div className="ov-muted">
            <TrendingUp size={17} />{' '}
            {text('ยอดขายสุทธิ', 'Net sales')}
          </div>

          {boxValue(
            canShowSales && data?.refunds.data
              ? baht(net)
              : '—',
            canShowSales
              ? `${text('ยอดขายรวม', 'Gross')} ${baht(
                  gross,
                )} • ${text(
                  'ยอดสุทธิเทียบรอบก่อน',
                  'Net vs prior',
                )} ${
                  data?.refunds.data && data?.previous.data
                    ? signedGrowth(net, previousNet)
                    : '—'
                }`
              : text(
                  'ไม่มีสิทธิ์/โหลดไม่ได้',
                  'Unavailable',
                ),
          )}
        </div>

        <div className="ov-kpi">
          <div className="ov-muted">
            <ShoppingBag size={17} />{' '}
            {text('จำนวนบิลสำเร็จ', 'Completed sales')}
          </div>

          {boxValue(
            canShowSales ? String(completed.length) : '—',
            text(
              'จากระบบ POS (รวมบิลออนไลน์ที่ชำระผ่าน POS)',
              'From POS (includes settled online orders)',
            ),
          )}
        </div>

        <div className="ov-kpi">
          <div className="ov-muted">
            <BarChart3 size={17} />{' '}
            {text(
              'ยอดเฉลี่ยต่อบิล',
              'Average order value',
            )}
          </div>

          {boxValue(
            canShowSales ? baht(average) : '—',
            text(
              'ยอดขายรวม ÷ จำนวนบิลสำเร็จ',
              'Gross ÷ completed sales',
            ),
          )}
        </div>

        <div className="ov-kpi">
          <div className="ov-muted">
            <Wallet size={17} />{' '}
            {text(
              'ยอดคืนเงินและยกเลิก',
              'Refunds & cancelled',
            )}
          </div>

          {boxValue(
            data?.refunds.data
              ? baht(refunded)
              : '—',
            `${text(
              'คืนเงินยืนยัน',
              'Confirmed refunds',
            )} ${
              returns.filter(
                (item) => item.status === 'CONFIRMED',
              ).length
            } • ${text(
              'ออนไลน์ยกเลิกที่โหลด',
              'Loaded cancelled online',
            )} ${
              activeOrders.filter((item) =>
                [
                  'CANCELLED',
                  'REJECTED',
                  'EXPIRED',
                ].includes(item.status),
              ).length
            }`,
          )}
        </div>
      </section>

      {/* 4. LIVE OPERATIONS */}
      <div className="ov-grid2">
        <Box
          title={text(
            'คิวออเดอร์ออนไลน์ปัจจุบัน (ไม่ใช่ KDS)',
            'Live online-order queue (not KDS)',
          )}
        >
          <div
            className="ov-grid3"
            style={{ marginBottom: 10 }}
          >
            {(
              ['PENDING', 'PREPARING', 'READY'] as const
            ).map((status, index) => (
              <div
                key={status}
                className="ov-emptystate"
                style={{
                  background: [
                    '#fff2ee',
                    '#fff8dd',
                    '#e8f8ed',
                  ][index],
                }}
              >
                <strong>
                  {text(
                    [
                      'รอร้านตรวจสอบ',
                      'กำลังเตรียม',
                      'พร้อมรับ',
                    ][index],
                    [
                      'Pending',
                      'Preparing',
                      'Ready',
                    ][index],
                  )}
                </strong>

                <div
                  style={{
                    fontSize: 24,
                    fontWeight: 800,
                  }}
                >
                  {data?.orders.data
                    ? currentOrders.filter(
                        (item) =>
                          item.status === status,
                      ).length
                    : '—'}
                </div>
              </div>
            ))}
          </div>

          <p className="ov-note">
            {text(
              'คิวที่รอนานสุด',
              'Longest wait',
            )}
            :{' '}
            {currentOrders.length
              ? Math.max(
                  ...currentOrders.map((item) =>
                    Math.max(
                      0,
                      Math.floor(
                        (asOf -
                          new Date(
                            item.created_at,
                          ).getTime()) /
                          60000,
                      ),
                    ),
                  ),
                ) + text(' นาที', ' min')
              : '—'}
          </p>

          {latestOrders.length ? (
            latestOrders.map((item) => (
              <div
                key={item.id}
                className="ov-row"
              >
                <span>{item.number}</span>
                <span>{item.status}</span>
                <span className="ov-muted">
                  {datetime(item.created_at, th)}
                </span>
              </div>
            ))
          ) : (
            <p className="ov-emptystate">
              {text(
                'ไม่มีคิวหรือยังไม่สามารถอ่านข้อมูลได้',
                'No orders or data unavailable',
              )}
            </p>
          )}
        </Box>

        <Box
          title={text(
            'กะแคชเชียร์และลิ้นชักเงินสด',
            'Cashier shifts & drawers',
          )}
        >
          <div className="ov-row">
            <span>
              {text(
                'เครื่อง POS ที่เปิดใช้งาน',
                'Active POS terminals',
              )}
            </span>
            <strong>
              {data?.terminals.data
                ? data.terminals.data.items.filter(
                    (item) =>
                      item.status === 'ACTIVE',
                  ).length
                : '—'}
            </strong>
          </div>

          <div className="ov-row">
            <span>
              {text('กะที่เปิดอยู่', 'Open shifts')}
            </span>
            <strong>
              {data?.shifts.data
                ? openShifts.length
                : '—'}
            </strong>
          </div>

          {openShifts.length ? (
            openShifts.slice(0, 3).map((shift) => (
              <div
                key={shift.id}
                style={{ padding: '10px 0' }}
              >
                <strong style={{ fontSize: 13 }}>
                  {shift.terminal_name} ·{' '}
                  {shift.cashier_name}
                </strong>

                <div className="ov-row">
                  <span>
                    {text(
                      'เงินทอนตั้งต้น',
                      'Opening cash',
                    )}
                  </span>
                  <strong>
                    {baht(cents(shift.opening_cash))}
                  </strong>
                </div>

                <div className="ov-row">
                  <span>
                    {text(
                      'รับเงินสด',
                      'Cash sales',
                    )}
                  </span>
                  <strong>
                    {baht(cents(shift.cash_sales))}
                  </strong>
                </div>

                <div className="ov-row">
                  <span>
                    {text(
                      'เงินสดที่ควรมี',
                      'Expected cash',
                    )}
                  </span>
                  <strong>
                    {baht(cents(shift.expected_cash))}
                  </strong>
                </div>
              </div>
            ))
          ) : (
            <p className="ov-emptystate">
              {text(
                'ไม่มีกะที่เปิดอยู่หรือยังไม่มีข้อมูล',
                'No open shift or data unavailable',
              )}
            </p>
          )}

          <div className="ov-row">
            <span>
              {text(
                'บิลที่พักไว้ (เฉพาะผู้ใช้ปัจจุบัน)',
                'Held carts (current cashier only)',
              )}
            </span>
            <strong>
              {data?.held.data?.total ?? '—'}
            </strong>
          </div>
        </Box>
      </div>

      {/* 5. SALES ANALYTICS */}
      <div className="ov-grid3">
        <Box
          title={text(
            'ยอดขายตามเวลา',
            'Sales over time',
          )}
        >
          {canShowSales ? (
            <>
              <div
                className="ov-bars"
                aria-label={text(
                  'กราฟยอดขาย',
                  'Sales chart',
                )}
              >
                {trends.map((point) => (
                  <div
                    className="ov-barcol"
                    key={point.label}
                    title={`${point.label}: ${baht(
                      point.value,
                    )}`}
                  >
                    <div
                      className="ov-bar"
                      style={{
                        height: `${
                          Math.max(
                            1,
                            Number(
                              (point.value *
                                100n) /
                                maximum,
                            ),
                          )
                        }%`,
                      }}
                    />

                    <small>
                      {period === '30d'
                        ? point.label.slice(0, 2)
                        : point.label}
                    </small>
                  </div>
                ))}
              </div>

              <p className="ov-note">
                {text(
                  'เฉพาะบิลที่ชำระสำเร็จในระบบ POS',
                  'Completed POS sales only',
                )}
              </p>
            </>
          ) : (
            <p className="ov-emptystate">
              {text(
                'ไม่มีข้อมูลยอดขาย',
                'No sales data',
              )}
            </p>
          )}
        </Box>

        <Box
          title={text(
            'ช่องทางสั่งซื้อ',
            'Sales channels',
          )}
        >
          {data?.orders.data && canShowSales ? (
            <>
              {[
                {
                  name: text(
                    'หน้าร้าน POS / ไม่ระบุ',
                    'POS / unmatched',
                  ),
                  items: posOrUnknown,
                },
                {
                  name: text(
                    'รับที่ร้านออนไลน์',
                    'Online pickup',
                  ),
                  items: pickup,
                },
                {
                  name: text(
                    'จัดส่งออนไลน์',
                    'Online delivery',
                  ),
                  items: delivery,
                },
              ].map((group) => (
                <div key={group.name}>
                  <div className="ov-row">
                    <span>{group.name}</span>

                    <strong>
                      {group.items.length} •{' '}
                      {baht(
                        group.items.reduce(
                          (sum, item) =>
                            sum +
                            cents(item.grand_total),
                          0n,
                        ),
                      )}
                    </strong>
                  </div>

                  <div className="ov-meter">
                    <div
                      style={{
                        width: `${
                          completed.length
                            ? (group.items.length /
                                completed.length) *
                              100
                            : 0
                        }%`,
                      }}
                    />
                  </div>
                </div>
              ))}

              <p className="ov-note">
                {text(
                  'QR โต๊ะยังไม่มีแหล่งข้อมูลแยก จัดประเภทจากออเดอร์ที่เชื่อม sale_id ได้เท่านั้น',
                  'Table QR is not separately supported. Classification uses linked sale IDs.',
                )}
              </p>
            </>
          ) : (
            <p className="ov-emptystate">
              {text(
                'ยังไม่สามารถแยกช่องทางได้',
                'Channel details unavailable',
              )}
            </p>
          )}
        </Box>

        <Box
          title={text(
            'วิธีชำระเงิน',
            'Payment methods',
          )}
        >
          {canShowSales ? (
            methodTotal.map((method) => (
              <div key={method.code}>
                <div className="ov-row">
                  <span>
                    <i
                      className="ov-dot"
                      style={{
                        background: method.color,
                      }}
                    />
                    {method.label}
                  </span>

                  <strong>
                    {method.items.length} •{' '}
                    {baht(
                      method.items.reduce(
                        (sum, item) =>
                          sum +
                          cents(item.grand_total),
                        0n,
                      ),
                    )}
                  </strong>
                </div>

                <div className="ov-meter">
                  <div
                    style={{
                      width: `${
                        completed.length
                          ? (method.items.length /
                              completed.length) *
                            100
                          : 0
                      }%`,
                      background: method.color,
                    }}
                  />
                </div>
              </div>
            ))
          ) : (
            <p className="ov-emptystate">
              {text(
                'ไม่มีข้อมูลวิธีชำระเงิน',
                'No payment data',
              )}
            </p>
          )}
        </Box>
      </div>

      {/* 6. MENU AND RECENT ACTIVITY */}
      <div className="ov-grid-bottom">
        <Box
          title={text(
            '5 อันดับเมนูขายดี',
            'Top five products',
          )}
        >
          <p className="ov-note">
            {text(
              'จากรายละเอียดบิลล่าสุดสูงสุด 20 บิลในช่วงที่เลือก',
              'Based on up to 20 recent sale details within selection',
            )}
          </p>

          {top.length ? (
            top.map((item, index) => (
              <div
                className="ov-row"
                key={`${item.name}-${index}`}
              >
                <span>
                  {index + 1}. {item.name}
                </span>

                <span>
                  {item.quantity.toLocaleString()} •{' '}
                  <strong>
                    {baht(item.revenue)}
                  </strong>
                </span>
              </div>
            ))
          ) : (
            <p className="ov-emptystate">
              {text(
                'ยังไม่มีรายการขาย',
                'No item sales',
              )}
            </p>
          )}
        </Box>

        <Box
          title={text(
            'สุขภาพเมนู',
            'Menu health',
          )}
        >
          <div className="ov-row">
            <span>
              {text(
                'สินค้าเปิดขาย',
                'Active products',
              )}
            </span>
            <strong>
              {data?.products.data
                ? productsCount
                : '—'}
            </strong>
          </div>

          <div className="ov-row">
            <span>
              {text(
                'รายการเผยแพร่ออนไลน์',
                'Online published variants',
              )}
            </span>
            <strong>
              {publishedCount ?? '—'}
            </strong>
          </div>

          <div className="ov-row">
            <span>
              {text(
                'สินค้าใกล้หมด',
                'Low stock',
              )}
            </span>
            <strong>
              {lowStock ?? '—'}
            </strong>
          </div>

          <p className="ov-note">
            {text(
              'ข้อมูลของหมด/ปิดขายอัตโนมัติยังไม่มี API สรุปเฉพาะ',
              'Auto-disabled menu count is not exposed as a dedicated metric.',
            )}
          </p>

          {canCatalog && (
            <WorkspaceLink
              to="/products"
              className="ov-btn"
            >
              {text(
                'จัดการเมนู',
                'Manage products',
              )}
            </WorkspaceLink>
          )}
        </Box>

        <Box
          title={text(
            'บิลขายล่าสุด 5 รายการ',
            'Latest five sales',
          )}
        >
          {completed.length ? (
            <div className="ov-table-wrap">
              <table className="ov-table">
                <thead>
                  <tr>
                    <th>
                      {text(
                        'เลขบิล',
                        'Receipt',
                      )}
                    </th>
                    <th>
                      {text(
                        'เวลา',
                        'Time',
                      )}
                    </th>
                    <th>
                      {text(
                        'วิธีจ่าย',
                        'Payment',
                      )}
                    </th>
                    <th>
                      {text(
                        'ยอด',
                        'Total',
                      )}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {completed
                    .slice(0, 5)
                    .map((item) => (
                      <tr key={item.id}>
                        <td>
                          {item.receipt_number ||
                            item.sale_number}
                        </td>
                        <td>
                          {datetime(
                            item.completed_at,
                            th,
                          )}
                        </td>
                        <td>
                          {item.method}
                        </td>
                        <td>
                          {baht(
                            cents(
                              item.grand_total,
                            ),
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="ov-emptystate">
              {text(
                'ยังไม่มีบิลขาย',
                'No recent sales',
              )}
            </p>
          )}
        </Box>
      </div>

      {/* NEW STORE CHECKLIST */}
      {canShowSales &&
        completed.length === 0 && (
          <Box
            title={text(
              'เริ่มเปิดร้าน — Checklist 4 ขั้นตอน',
              'New store setup checklist',
            )}
          >
            <div className="ov-checklist">
              {[
                {
                  to: '/settings/store',
                  label: text(
                    '1. ตั้งค่าร้าน',
                    '1. Set up store',
                  ),
                },
                {
                  to: '/products',
                  label: text(
                    '2. เพิ่มเมนูสินค้า',
                    '2. Add products',
                  ),
                },
                {
                  to: '/settings/storefront',
                  label: text(
                    '3. เปิดหน้าร้านออนไลน์',
                    '3. Publish online store',
                  ),
                },
                {
                  to: '/pos/register/open',
                  label: text(
                    '4. เปิดกะขายแรก',
                    '4. Open first shift',
                  ),
                },
              ].map((item) => (
                <WorkspaceLink
                  key={item.to}
                  to={item.to}
                >
                  {item.label}
                </WorkspaceLink>
              ))}
            </div>
          </Box>
        )}

      <p
        className="ov-note"
        style={{ marginTop: 16 }}
      >
        <Activity
          size={14}
          style={{ verticalAlign: 'middle' }}
        />{' '}
        {text(
          'ข้อมูลจริงจาก API • ไม่มีตัวเลขจำลอง • เวลาเปิดร้านและระบบคิวครัว KDS ต้องเพิ่ม API ฝั่ง Backend',
          'Live API data • no mock metrics • opening hours and KDS require backend support',
        )}
      </p>
    </div>
  );
}
