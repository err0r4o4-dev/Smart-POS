import { useLanguage } from '../../app/language';
import { useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Coins,
  FileText,
  Layers,
  Package,
  Play,
  Plus,
  ShieldCheck,
  ShoppingBasket,
  ShoppingCart,
  Store,
  TrendingUp,
  Trophy,
  Truck,
  Users,
  Zap,
} from 'lucide-react';
import {
  useOrganization,
  OrganizationProvider,
} from '../../app/OrganizationProvider';
import { WorkspaceLink } from '../../app/WorkspaceNavigation';
import {
  canAccess,
  isManagementRole,
  roleLabels,
  workspaceHome,
} from '../../app/access';
import {
  paths,
  staffNavigation,
  type NavigationItem,
} from '../../app/routes';
import { Card, ErrorState, Loading, Tag } from '../../components/ui/primitives';
import { WorkspaceAreaGate } from './WorkspaceRouting';

export function OrganizationWorkspaceProvider() {
  return (
    <OrganizationProvider>
      <WorkspaceAreaGate />
    </OrganizationProvider>
  );
}

export function WorkspaceEntryPage() {
  const { t, localize } = useLanguage();

  const tenant = useOrganization();
  if (tenant.loading)
    return <Loading>{t('workspace.selectingWorkspace')}</Loading>;
  if (tenant.error)
    return (
      <ErrorState
        message={localize(tenant.error ?? '')}
        retry={() => void tenant.refresh()}
      />
    );
  if (!tenant.context) return <Navigate to={paths.account} replace />;
  return (
    <Navigate to={workspaceHome(tenant.context.membership.role)} replace />
  );
}

function TaskCards({ items }: { items: NavigationItem[] }) {
  const { t, localize } = useLanguage();

  const tenant = useOrganization();
  if (!tenant.context) return null;
  const access = {
    authenticated: true as const,
    role: tenant.context.membership.role,
    permissions: tenant.context.permissions,
  };
  const visibleItems = items.filter((item) =>
    canAccess(access, item.permission, item.roles),
  );
  if (!visibleItems.length)
    return (
      <p role="status">{t('workspace.noAuthorizedToolsInThisAreaContact')}</p>
    );
  return (
    <div className="workspace-task-grid">
      {visibleItems.map((item) => (
        <Link key={item.to} className="workspace-task" to={item.to}>
          <span>{localize(item.label ?? '')}</span>
          <ArrowRight size={19} aria-hidden="true" />
        </Link>
      ))}
    </div>
  );
}

type TrendGranularity = 'daily' | 'weekly' | 'monthly';
type DashboardPeriod = '7d' | '30d' | '90d';

interface TrendPoint {
  labelTh: string;
  labelEn: string;
  fullDateTh: string;
  fullDateEn: string;
  value: number;
  amount: string;
}

const TREND_SERIES: Record<TrendGranularity, TrendPoint[]> = {
  daily: [
    {
      labelTh: '12 ต.ค.',
      labelEn: '12 Oct',
      fullDateTh: '12 ต.ค. 2026',
      fullDateEn: '12 Oct 2026',
      value: 8,
      amount: '฿8.00',
    },
    {
      labelTh: '15 ต.ค.',
      labelEn: '15 Oct',
      fullDateTh: '15 ต.ค. 2026',
      fullDateEn: '15 Oct 2026',
      value: 19,
      amount: '฿19.00',
    },
    {
      labelTh: '18 ต.ค.',
      labelEn: '18 Oct',
      fullDateTh: '18 ต.ค. 2026',
      fullDateEn: '18 Oct 2026',
      value: 36,
      amount: '฿36.00',
    },
    {
      labelTh: '21 ต.ค.',
      labelEn: '21 Oct',
      fullDateTh: '21 ต.ค. 2026',
      fullDateEn: '21 Oct 2026',
      value: 34,
      amount: '฿34.00',
    },
    {
      labelTh: '24 ต.ค.',
      labelEn: '24 Oct',
      fullDateTh: '24 ต.ค. 2026',
      fullDateEn: '24 Oct 2026',
      value: 32,
      amount: '฿32.00',
    },
    {
      labelTh: '27 ต.ค.',
      labelEn: '27 Oct',
      fullDateTh: '27 ต.ค. 2026',
      fullDateEn: '27 Oct 2026',
      value: 57,
      amount: '$57.00',
    },
    {
      labelTh: '30 ต.ค.',
      labelEn: '30 Oct',
      fullDateTh: '30 ต.ค. 2026',
      fullDateEn: '30 Oct 2026',
      value: 36,
      amount: '฿36.00',
    },
    {
      labelTh: '11 พ.ย.',
      labelEn: '11 Nov',
      fullDateTh: '11 พ.ย. 2026',
      fullDateEn: '11 Nov 2026',
      value: 56,
      amount: '฿56.00',
    },
  ],
  weekly: [
    {
      labelTh: 'สัปดาห์ 1',
      labelEn: 'Wk 1',
      fullDateTh: 'สัปดาห์ที่ 1 ต.ค. 2026',
      fullDateEn: 'Week 1 Oct 2026',
      value: 22,
      amount: '฿22.00',
    },
    {
      labelTh: 'สัปดาห์ 2',
      labelEn: 'Wk 2',
      fullDateTh: 'สัปดาห์ที่ 2 ต.ค. 2026',
      fullDateEn: 'Week 2 Oct 2026',
      value: 36,
      amount: '฿36.00',
    },
    {
      labelTh: 'สัปดาห์ 3',
      labelEn: 'Wk 3',
      fullDateTh: 'สัปดาห์ที่ 3 ต.ค. 2026',
      fullDateEn: 'Week 3 Oct 2026',
      value: 28,
      amount: '฿28.00',
    },
    {
      labelTh: 'สัปดาห์ 4',
      labelEn: 'Wk 4',
      fullDateTh: 'สัปดาห์ที่ 4 ต.ค. 2026',
      fullDateEn: 'Week 4 Oct 2026',
      value: 57,
      amount: '฿57.00',
    },
  ],
  monthly: [
    {
      labelTh: 'ส.ค.',
      labelEn: 'Aug',
      fullDateTh: 'สิงหาคม 2026',
      fullDateEn: 'August 2026',
      value: 40,
      amount: '฿40.00',
    },
    {
      labelTh: 'ก.ย.',
      labelEn: 'Sep',
      fullDateTh: 'กันยายน 2026',
      fullDateEn: 'September 2026',
      value: 64,
      amount: '฿64.00',
    },
    {
      labelTh: 'ต.ค.',
      labelEn: 'Oct',
      fullDateTh: 'ตุลาคม 2026',
      fullDateEn: 'October 2026',
      value: 76,
      amount: '฿121.00',
    },
  ],
};

function Sparkline({
  tone,
  id,
}: {
  tone: 'amber' | 'green';
  id: string;
}) {
  const stroke = tone === 'amber' ? '#eab308' : '#22c55e';
  const stopColor = tone === 'amber' ? '#facc15' : '#22c55e';
  const linePath =
    tone === 'amber'
      ? 'M 4 42 C 16 40, 22 24, 34 30 C 46 36, 54 14, 68 22 C 78 28, 86 8, 96 6'
      : 'M 4 42 C 18 40, 26 28, 38 32 C 50 36, 60 12, 74 18 C 84 22, 90 10, 96 8';
  const areaPath = `${linePath} L 96 50 L 4 50 Z`;
  return (
    <svg
      className="dashboard-sparkline"
      viewBox="0 0 100 52"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stopColor} stopOpacity="0.34" />
          <stop offset="100%" stopColor={stopColor} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${id})`} />
      <path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ProductIllustration({ kind }: { kind: 'water' | 'bread' | 'milk' }) {
  if (kind === 'water') {
    return (
      <svg
        className="dashboard-product-thumb"
        viewBox="0 0 36 36"
        aria-hidden="true"
      >
        <rect x="13" y="3" width="10" height="4" rx="1.5" fill="#0284c7" />
        <path
          d="M12 9 C12 7, 24 7, 24 9 L25 30 C25 32, 23 33, 21 33 L15 33 C13 33, 11 32, 11 30 Z"
          fill="#bae6fd"
          stroke="#38bdf8"
          strokeWidth="1.2"
        />
        <rect x="11.5" y="15" width="13" height="7" rx="1" fill="#0ea5e9" />
        <line
          x1="14"
          y1="18.5"
          x2="22"
          y2="18.5"
          stroke="#ffffff"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (kind === 'bread') {
    return (
      <svg
        className="dashboard-product-thumb"
        viewBox="0 0 36 36"
        aria-hidden="true"
      >
        <path
          d="M7 16 C5 11, 10 7, 18 7 C26 7, 31 11, 29 16 L28 28 C28 30, 26 31, 24 31 L12 31 C10 31, 8 30, 8 28 Z"
          fill="#d97706"
        />
        <path
          d="M10 16 C9 12, 13 9.5, 18 9.5 C23 9.5, 27 12, 26 16 L25 27 C25 28.5, 24 29, 22.5 29 L13.5 29 C12 29, 11 28.5, 11 27 Z"
          fill="#fde68a"
        />
        <circle cx="15" cy="18" r="1" fill="#b45309" />
        <circle cx="20" cy="16" r="1" fill="#b45309" />
        <circle cx="17" cy="23" r="1" fill="#b45309" />
        <circle cx="21" cy="22" r="1" fill="#b45309" />
      </svg>
    );
  }
  return (
    <svg
      className="dashboard-product-thumb"
      viewBox="0 0 36 36"
      aria-hidden="true"
    >
      <path d="M11 11 L15 5 L23 5 L25 11 Z" fill="#cbd5e1" />
      <rect
        x="10"
        y="11"
        width="16"
        height="22"
        rx="2"
        fill="#f8fafc"
        stroke="#94a3b8"
        strokeWidth="1.2"
      />
      <rect x="10.6" y="16" width="14.8" height="8" fill="#38bdf8" />
      <circle cx="18" cy="20" r="2.2" fill="#ffffff" />
    </svg>
  );
}

export function ManagementHomePage() {
  const { t, language } = useLanguage();
  const [period, setPeriod] = useState<DashboardPeriod>('30d');
  const [granularity, setGranularity] = useState<TrendGranularity>('daily');

  const tenant = useOrganization();
  if (!tenant.context) return null;
  const role = tenant.context.membership.role;
  if (!isManagementRole(role)) return <Navigate to={paths.staff} replace />;

  const storeName = tenant.context.organization.name;
  const branchName =
    tenant.context.branches.find((item) => item.id === tenant.branchID)?.name ??
    tenant.context.branches[0]?.name ??
    t('workspace.mainBranch');

  const points = TREND_SERIES[granularity];
  const activeIndex =
    granularity === 'daily' ? 5 : points.length - 1;
  const activePoint = points[activeIndex] ?? points[0];

  const chartLeft = 42;
  const chartRight = 528;
  const chartTop = 38;
  const chartBottom = 166;
  const chartWidth = chartRight - chartLeft;
  const chartHeight = chartBottom - chartTop;
  const maxVal = 80;

  const coords = points.map((pt, index) => {
    const x =
      points.length > 1
        ? chartLeft + (index / (points.length - 1)) * chartWidth
        : chartLeft + chartWidth / 2;
    const y = chartBottom - (Math.min(pt.value, maxVal) / maxVal) * chartHeight;
    return { x, y, pt };
  });

  const smoothLine = coords.reduce((acc, cur, idx, arr) => {
    if (idx === 0) return `M ${cur.x.toFixed(1)} ${cur.y.toFixed(1)}`;
    const prev = arr[idx - 1];
    const cx1 = (prev.x + (cur.x - prev.x) * 0.45).toFixed(1);
    const cy1 = prev.y.toFixed(1);
    const cx2 = (prev.x + (cur.x - prev.x) * 0.55).toFixed(1);
    const cy2 = cur.y.toFixed(1);
    return `${acc} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${cur.x.toFixed(1)} ${cur.y.toFixed(1)}`;
  }, '');

  const smoothArea = `${smoothLine} L ${coords[coords.length - 1].x.toFixed(1)} ${chartBottom} L ${coords[0].x.toFixed(1)} ${chartBottom} Z`;
  const highlightCoord = coords[activeIndex] ?? coords[0];

  const donutRadius = 56;
  const donutCircumference = 2 * Math.PI * donutRadius;
  const posShare = 0.711;
  const onlineShare = 0.289;
  const posArc = donutCircumference * posShare;
  const onlineArc = donutCircumference * onlineShare;

  const canCatalog = tenant.can('catalog.read');
  const canCreateProduct = tenant.can('catalog.create');
  const canSales = tenant.can('sales.read');
  const canInventory = tenant.can('inventory.read');
  const canPurchasing = tenant.can('purchasing.read');
  const canPos = tenant.can('pos.access');
  const canOnlineOrders = tenant.can('online_orders.read');

  return (
    <div className="workspace-home dashboard-overview">
      {/* Page Header */}
      <header className="dashboard-overview-header">
        <div className="dashboard-overview-title-group">
          <span className="dashboard-store-badge" aria-hidden="true">
            <Store size={26} />
          </span>
          <div className="dashboard-overview-titles">
            <h1 tabIndex={-1}>{t('workspace.storeOverview')}</h1>
            <p className="dashboard-overview-subtitle">
              {t('workspace.overviewSubtitle', {
                store: storeName,
                branch: branchName,
              })}
            </p>
          </div>
        </div>
        <div className="dashboard-period-pill">
          <Calendar size={16} aria-hidden="true" />
          <select
            aria-label={t('workspace.selectPeriod')}
            value={period}
            onChange={(event) =>
              setPeriod(event.target.value as DashboardPeriod)
            }
          >
            <option value="7d">{t('workspace.period7Days')}</option>
            <option value="30d">{t('workspace.period30Days')}</option>
            <option value="90d">{t('workspace.period90Days')}</option>
          </select>
          <ChevronDown
            size={15}
            className="dashboard-period-chevron"
            aria-hidden="true"
          />
        </div>
      </header>

      {/* Row 1: 4 KPI Cards */}
      <section
        className="dashboard-kpi-grid"
        aria-label={t('workspace.storeOverview')}
      >
        <Card className="dashboard-kpi-card">
          <div className="dashboard-kpi-main">
            <div className="dashboard-kpi-top">
              <span
                className="dashboard-kpi-icon tone-amber"
                aria-hidden="true"
              >
                <Coins size={20} />
              </span>
              <div className="dashboard-kpi-metric">
                <span className="dashboard-kpi-label">
                  {t('workspace.totalSales')}
                </span>
                <strong className="dashboard-kpi-value">฿121.00</strong>
              </div>
            </div>
            <div className="dashboard-kpi-foot">
              <span className="dashboard-trend-up">
                <TrendingUp size={13} aria-hidden="true" /> +26.4%
              </span>
              <span className="dashboard-trend-note">
                {t('workspace.fromPreviousPeriod')}
              </span>
            </div>
          </div>
          <Sparkline tone="amber" id="kpi-spark-sales" />
        </Card>

        <Card className="dashboard-kpi-card">
          <div className="dashboard-kpi-main">
            <div className="dashboard-kpi-top">
              <span
                className="dashboard-kpi-icon tone-amber"
                aria-hidden="true"
              >
                <FileText size={20} />
              </span>
              <div className="dashboard-kpi-metric">
                <span className="dashboard-kpi-label">
                  {t('workspace.totalBills')}
                </span>
                <strong className="dashboard-kpi-value">
                  {t('workspace.billsCount', { count: 3 })}
                </strong>
              </div>
            </div>
            <div className="dashboard-kpi-foot">
              <span className="dashboard-trend-up">
                <TrendingUp size={13} aria-hidden="true" /> +50.0%
              </span>
            </div>
          </div>
          <Sparkline tone="green" id="kpi-spark-bills" />
        </Card>

        <Card className="dashboard-kpi-card">
          <div className="dashboard-kpi-main">
            <div className="dashboard-kpi-top">
              <span
                className="dashboard-kpi-icon tone-amber"
                aria-hidden="true"
              >
                <ShoppingBasket size={20} />
              </span>
              <div className="dashboard-kpi-metric">
                <span className="dashboard-kpi-label">
                  {t('workspace.itemsSold')}
                </span>
                <strong className="dashboard-kpi-value">
                  {t('workspace.itemsCount', { count: 12 })}
                </strong>
              </div>
            </div>
            <div className="dashboard-kpi-foot">
              <span className="dashboard-trend-up">
                <TrendingUp size={13} aria-hidden="true" /> +20.0%
              </span>
            </div>
          </div>
          <Sparkline tone="green" id="kpi-spark-items" />
        </Card>

        <Card className="dashboard-kpi-card">
          <div className="dashboard-kpi-main">
            <div className="dashboard-kpi-top">
              <span
                className="dashboard-kpi-icon tone-green"
                aria-hidden="true"
              >
                <Users size={20} />
              </span>
              <div className="dashboard-kpi-metric">
                <span className="dashboard-kpi-label">
                  {t('workspace.newCustomers')}
                </span>
                <strong className="dashboard-kpi-value">
                  {t('workspace.customersCount', { count: 2 })}
                </strong>
              </div>
            </div>
            <div className="dashboard-kpi-foot">
              <span className="dashboard-trend-up">
                <TrendingUp size={13} aria-hidden="true" /> +100.0%
              </span>
            </div>
          </div>
          <Sparkline tone="green" id="kpi-spark-customers" />
        </Card>
      </section>

      {/* Row 2: Sales Trend + Sales by Channel + Best-Selling Products */}
      <div className="dashboard-middle-grid">
        {/* Sales Trend */}
        <Card className="dashboard-panel dashboard-trend-panel">
          <div className="dashboard-card-head">
            <div className="dashboard-card-title">
              <BarChart3 size={19} aria-hidden="true" />
              <h2>{t('workspace.salesTrend')}</h2>
            </div>
            <div
              className="dashboard-segmented"
              role="group"
              aria-label={t('workspace.salesTrend')}
            >
              {(
                [
                  ['daily', t('workspace.daily')],
                  ['weekly', t('workspace.weekly')],
                  ['monthly', t('workspace.monthly')],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  className={
                    'dashboard-segment-btn ' +
                    (granularity === key ? 'active' : '')
                  }
                  aria-pressed={granularity === key}
                  onClick={() => setGranularity(key)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="dashboard-trend-headline">
            <strong className="dashboard-trend-total">฿121.00</strong>
            <span className="dashboard-trend-up">
              <TrendingUp size={14} aria-hidden="true" /> +26.4%
            </span>
            <span className="dashboard-trend-note">
              {t('workspace.fromPreviousPeriod')}
            </span>
          </div>

          <div className="dashboard-chart-container">
            <svg
              className="dashboard-area-chart"
              viewBox="0 0 548 196"
              role="img"
              aria-label={t('workspace.salesTrend')}
            >
              <defs>
                <linearGradient
                  id="sales-trend-fill"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop offset="0%" stopColor="#16a34a" stopOpacity="0.28" />
                  <stop offset="100%" stopColor="#16a34a" stopOpacity="0.02" />
                </linearGradient>
              </defs>

              {[80, 60, 40, 20, 0].map((tick) => {
                const y = chartBottom - (tick / maxVal) * chartHeight;
                return (
                  <g key={tick}>
                    <text
                      x={chartLeft - 12}
                      y={y + 4}
                      textAnchor="end"
                      className="dashboard-axis-label"
                    >
                      {tick}
                    </text>
                    <line
                      x1={chartLeft}
                      y1={y}
                      x2={chartRight}
                      y2={y}
                      className="dashboard-grid-line"
                    />
                  </g>
                );
              })}

              <path d={smoothArea} fill="url(#sales-trend-fill)" />
              <path
                d={smoothLine}
                fill="none"
                stroke="#15803d"
                strokeWidth="2.6"
                strokeLinecap="round"
              />

              {highlightCoord && (
                <g>
                  <line
                    x1={highlightCoord.x}
                    y1={highlightCoord.y}
                    x2={highlightCoord.x}
                    y2={chartBottom}
                    stroke="#94a3b8"
                    strokeWidth="1.2"
                    strokeDasharray="3 3"
                  />
                  <circle
                    cx={highlightCoord.x}
                    cy={highlightCoord.y}
                    r="5.5"
                    fill="#15803d"
                    stroke="#ffffff"
                    strokeWidth="2.5"
                  />
                  <g
                    transform={`translate(${Math.min(Math.max(highlightCoord.x - 48, chartLeft), chartRight - 96)}, ${Math.max(highlightCoord.y - 46, 4)})`}
                  >
                    <rect
                      x="0"
                      y="0"
                      width="94"
                      height="38"
                      rx="8"
                      fill="#ffffff"
                      stroke="#e2e8f0"
                      strokeWidth="1"
                    />
                    <text
                      x="10"
                      y="15"
                      className="dashboard-tooltip-date"
                    >
                      {language === 'en'
                        ? activePoint.fullDateEn
                        : activePoint.fullDateTh}
                    </text>
                    <text
                      x="10"
                      y="30"
                      className="dashboard-tooltip-value"
                    >
                      {activePoint.amount}
                    </text>
                  </g>
                </g>
              )}

              {coords.map(({ x, pt }) => (
                <text
                  key={pt.labelTh}
                  x={x}
                  y={chartBottom + 20}
                  textAnchor="middle"
                  className="dashboard-axis-label"
                >
                  {language === 'en' ? pt.labelEn : pt.labelTh}
                </text>
              ))}
            </svg>
          </div>
        </Card>

        {/* Sales by Channel */}
        <Card className="dashboard-panel dashboard-channel-panel">
          <div className="dashboard-card-head">
            <div className="dashboard-card-title">
              <Store size={19} aria-hidden="true" />
              <h2>{t('workspace.salesByChannel')}</h2>
            </div>
          </div>

          <div className="dashboard-channel-body">
            <div className="dashboard-donut-wrap">
              <svg
                className="dashboard-donut-svg"
                viewBox="0 0 160 160"
                aria-hidden="true"
              >
                <circle
                  cx="80"
                  cy="80"
                  r={donutRadius}
                  fill="none"
                  stroke="#f1f5f9"
                  strokeWidth="22"
                />
                {/* POS segment (71.1%) starting from top-right clockwise */}
                <circle
                  cx="80"
                  cy="80"
                  r={donutRadius}
                  fill="none"
                  stroke="#15803d"
                  strokeWidth="22"
                  strokeDasharray={`${posArc} ${donutCircumference}`}
                  strokeDashoffset={0}
                  transform="rotate(-70 80 80)"
                />
                {/* Online segment (28.9%) */}
                <circle
                  cx="80"
                  cy="80"
                  r={donutRadius}
                  fill="none"
                  stroke="#f4c542"
                  strokeWidth="22"
                  strokeDasharray={`${onlineArc} ${donutCircumference}`}
                  strokeDashoffset={-posArc}
                  transform="rotate(-70 80 80)"
                />
              </svg>
              <div className="dashboard-donut-center">
                <strong>฿121.00</strong>
                <span>{t('workspace.totalSales')}</span>
              </div>
            </div>

            <div className="dashboard-channel-legend">
              <div className="dashboard-legend-item">
                <span className="dashboard-legend-dot tone-green" />
                <div className="dashboard-legend-info">
                  <div className="dashboard-legend-row">
                    <strong>{t('workspace.inStorePos')}</strong>
                    <span>71.1%</span>
                  </div>
                </div>
              </div>
              <div className="dashboard-legend-divider" />
              <div className="dashboard-legend-item">
                <span className="dashboard-legend-dot tone-amber" />
                <div className="dashboard-legend-info">
                  <div className="dashboard-legend-row">
                    <strong>{t('workspace.onlineChannel')}</strong>
                    <span>28.9%</span>
                  </div>
                  <small className="dashboard-legend-amount">฿35.00</small>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* Best-Selling Products */}
        <Card className="dashboard-panel dashboard-best-panel">
          <div className="dashboard-card-head">
            <div className="dashboard-card-title">
              <Trophy
                size={19}
                className="dashboard-icon-amber"
                aria-hidden="true"
              />
              <h2>{t('workspace.bestSellingProducts')}</h2>
            </div>
            {canCatalog && (
              <WorkspaceLink
                to="/products"
                className="dashboard-card-link"
                aria-label={t('workspace.manageProducts')}
              >
                <span>{t('workspace.viewAll')}</span>
                <ArrowRight size={14} aria-hidden="true" />
              </WorkspaceLink>
            )}
          </div>

          <ul className="dashboard-product-list">
            <li className="dashboard-product-row">
              <span className="dashboard-rank-badge rank-1">1</span>
              <ProductIllustration kind="water" />
              <strong className="dashboard-product-name">
                {t('workspace.productWaterVelo')}
              </strong>
              <span className="dashboard-product-qty">
                {t('workspace.itemsCount', { count: 7 })}
              </span>
              <strong className="dashboard-product-total">฿70.00</strong>
            </li>
            <li className="dashboard-product-row">
              <span className="dashboard-rank-badge rank-2">2</span>
              <ProductIllustration kind="bread" />
              <strong className="dashboard-product-name">
                {t('workspace.productWholeWheatBread')}
              </strong>
              <span className="dashboard-product-qty">
                {t('workspace.itemsCount', { count: 3 })}
              </span>
              <strong className="dashboard-product-total">฿24.00</strong>
            </li>
            <li className="dashboard-product-row">
              <span className="dashboard-rank-badge rank-3">3</span>
              <ProductIllustration kind="milk" />
              <strong className="dashboard-product-name">
                {t('workspace.productFreshMilk250')}
              </strong>
              <span className="dashboard-product-qty">
                {t('workspace.itemsCount', { count: 2 })}
              </span>
              <strong className="dashboard-product-total">฿18.00</strong>
            </li>
          </ul>
        </Card>
      </div>

      {/* Row 3: Recent Sales + Important Alerts + Quick Actions */}
      <div className="dashboard-bottom-grid">
        {/* Recent Sales */}
        <Card className="dashboard-panel dashboard-recent-panel">
          <div className="dashboard-card-head">
            <div className="dashboard-card-title">
              <FileText size={19} aria-hidden="true" />
              <h2>{t('workspace.recentSales')}</h2>
            </div>
            {canSales && (
              <WorkspaceLink to="/sales" className="dashboard-card-link">
                <span>{t('workspace.viewAll')}</span>
                <ArrowRight size={14} aria-hidden="true" />
              </WorkspaceLink>
            )}
          </div>

          <div className="dashboard-table-wrap">
            <table className="dashboard-sales-table">
              <thead>
                <tr>
                  <th>{t('workspace.saleNumber')}</th>
                  <th>{t('workspace.saleTime')}</th>
                  <th>{t('workspace.saleItemsCol')}</th>
                  <th>{t('workspace.saleTotalCol')}</th>
                  <th>{t('workspace.saleStatusCol')}</th>
                </tr>
              </thead>
              <tbody>
                {[
                  {
                    id: 'SAL-28a6e1f3',
                    timeTh: '11 ต.ค. 2026 17:09 น.',
                    timeEn: '11 Oct 2026 17:09',
                    items: 3,
                    total: '฿57.00',
                  },
                  {
                    id: 'SAL-6dd4e707',
                    timeTh: '11 ต.ค. 2026 17:11 น.',
                    timeEn: '11 Oct 2026 17:11',
                    items: 2,
                    total: '฿36.00',
                  },
                  {
                    id: 'SAL-75b94e59',
                    timeTh: '11 ต.ค. 2026 17:11 น.',
                    timeEn: '11 Oct 2026 17:11',
                    items: 1,
                    total: '฿28.00',
                  },
                ].map((sale) => (
                  <tr key={sale.id}>
                    <td className="dashboard-sale-code">
                      <strong>{sale.id}</strong>
                    </td>
                    <td className="dashboard-sale-time">
                      {language === 'en' ? sale.timeEn : sale.timeTh}
                    </td>
                    <td>{t('workspace.lineItemsCount', { count: sale.items })}</td>
                    <td className="dashboard-sale-amount">
                      <strong>{sale.total}</strong>
                    </td>
                    <td>
                      <span className="dashboard-status-pill">
                        <Check size={12} aria-hidden="true" />
                        {t('workspace.completedStatus')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Important Alerts */}
        <Card className="dashboard-panel dashboard-alerts-panel">
          <div className="dashboard-card-head">
            <div className="dashboard-card-title">
              <AlertTriangle
                size={19}
                className="dashboard-icon-amber"
                aria-hidden="true"
              />
              <h2>{t('workspace.importantAlerts')}</h2>
            </div>
            {canInventory && (
              <WorkspaceLink to="/inventory" className="dashboard-card-link">
                <span>{t('workspace.viewAll')}</span>
                <ArrowRight size={14} aria-hidden="true" />
              </WorkspaceLink>
            )}
          </div>

          <div className="dashboard-alert-list">
            {canInventory ? (
              <WorkspaceLink
                to="/inventory/reorder-points"
                className="dashboard-alert-row alert-danger"
              >
                <span className="dashboard-alert-icon" aria-hidden="true">
                  <Package size={18} />
                </span>
                <div className="dashboard-alert-copy">
                  <strong>{t('workspace.lowStockAlertTitle')}</strong>
                  <small>{t('workspace.lowStockAlertDetail')}</small>
                </div>
                <ChevronRight size={17} aria-hidden="true" />
              </WorkspaceLink>
            ) : (
              <div className="dashboard-alert-row alert-danger">
                <span className="dashboard-alert-icon" aria-hidden="true">
                  <Package size={18} />
                </span>
                <div className="dashboard-alert-copy">
                  <strong>{t('workspace.lowStockAlertTitle')}</strong>
                  <small>{t('workspace.lowStockAlertDetail')}</small>
                </div>
              </div>
            )}

            {canPurchasing ? (
              <WorkspaceLink
                to="/purchasing/orders"
                className="dashboard-alert-row alert-warning"
              >
                <span className="dashboard-alert-icon" aria-hidden="true">
                  <Truck size={18} />
                </span>
                <div className="dashboard-alert-copy">
                  <strong>{t('workspace.pendingReceiptAlertTitle')}</strong>
                  <small>{t('workspace.pendingReceiptAlertDetail')}</small>
                </div>
                <ChevronRight size={17} aria-hidden="true" />
              </WorkspaceLink>
            ) : (
              <div className="dashboard-alert-row alert-warning">
                <span className="dashboard-alert-icon" aria-hidden="true">
                  <Truck size={18} />
                </span>
                <div className="dashboard-alert-copy">
                  <strong>{t('workspace.pendingReceiptAlertTitle')}</strong>
                  <small>{t('workspace.pendingReceiptAlertDetail')}</small>
                </div>
              </div>
            )}

            <Link
              to={paths.system}
              className="dashboard-alert-row alert-success"
            >
              <span className="dashboard-alert-icon" aria-hidden="true">
                <Activity size={18} />
              </span>
              <div className="dashboard-alert-copy">
                <strong>{t('workspace.systemNormalTitle')}</strong>
                <small>{t('workspace.systemNormalDetail')}</small>
              </div>
              <CheckCircle2
                size={19}
                className="dashboard-alert-check"
                aria-hidden="true"
              />
            </Link>
          </div>
        </Card>

        {/* Quick Actions */}
        <Card className="dashboard-panel dashboard-shortcuts-panel">
          <div className="dashboard-card-head">
            <div className="dashboard-card-title">
              <Zap
                size={19}
                className="dashboard-icon-amber"
                aria-hidden="true"
              />
              <h2>{t('workspace.quickActions')}</h2>
            </div>
          </div>

          <div className="dashboard-shortcuts-grid">
            {[
              {
                key: 'pos',
                label: t('workspace.shortcutOpenPos'),
                to: '/pos',
                enabled: canPos,
                icon: Play,
                primary: true,
              },
              {
                key: 'add-product',
                label: t('workspace.shortcutAddProduct'),
                to: canCreateProduct ? '/products/new' : '/products',
                enabled: canCreateProduct || canCatalog,
                icon: Plus,
                primary: false,
              },
              {
                key: 'receive-stock',
                label: t('workspace.shortcutReceiveStock'),
                to: '/purchasing/receipts',
                enabled: canPurchasing,
                icon: Truck,
                primary: false,
              },
              {
                key: 'adjust-stock',
                label: t('workspace.shortcutAdjustStock'),
                to: '/inventory/adjustments',
                enabled: canInventory,
                icon: Layers,
                primary: false,
              },
              {
                key: 'online-orders',
                label: t('workspace.shortcutOnlineOrders'),
                to: '/online-orders',
                enabled: canOnlineOrders,
                icon: ShoppingCart,
                primary: false,
              },
              {
                key: 'reports',
                label: t('workspace.shortcutExportReport'),
                to: '/sales',
                enabled: canSales,
                icon: BarChart3,
                primary: false,
              },
            ].map((item) => {
              const Icon = item.icon;
              const className =
                'dashboard-shortcut-tile' +
                (item.primary ? ' is-primary' : '');
              return item.enabled ? (
                <WorkspaceLink
                  key={item.key}
                  to={item.to}
                  className={className}
                >
                  <Icon size={22} aria-hidden="true" />
                  <span>{item.label}</span>
                </WorkspaceLink>
              ) : (
                <div
                  key={item.key}
                  className={className + ' is-disabled'}
                  aria-disabled="true"
                >
                  <Icon size={22} aria-hidden="true" />
                  <span>{item.label}</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}

export function StaffHomePage() {
  const { t, localize } = useLanguage();

  const tenant = useOrganization();
  if (!tenant.context) return null;
  const role = tenant.context.membership.role;
  return (
    <div className="workspace-home">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t('workspace.staffWorkspace')}</p>
          <h1 tabIndex={-1}>{t('workspace.myWork')}</h1>
          <p>
            {tenant.context.organization.name} · {localize(roleLabels[role])}
          </p>
        </div>
        <Tag tone="amber">{localize(roleLabels[role])}</Tag>
      </div>
      <Card className="workspace-intro">
        <ShieldCheck size={27} aria-hidden="true" />
        <div>
          <h2>{t('workspace.chooseATaskForYourRole')}</h2>
          <p>{t('workspace.onlyAuthorizedToolsForYourCurrentOrganization')}</p>
        </div>
      </Card>
      <section aria-labelledby="staff-tasks-title">
        <h2 id="staff-tasks-title">{t('workspace.workTools')}</h2>
        <TaskCards
          items={staffNavigation.filter(
            (item) =>
              ![paths.staff, paths.account, paths.help].some(
                (path) => path === item.to,
              ),
          )}
        />
      </section>
      <Card>
        <h2>{t('workspace.accountAndHelp')}</h2>
        <p>{t('workspace.yourRoleIsAssignedByTheStore')}</p>
        <div className="tenant-actions">
          <Link className="button button-secondary" to={paths.account}>
            {t('workspace.myAccount')}
          </Link>
          <Link to={paths.help}>{t('landing.help')}</Link>
        </div>
      </Card>
    </div>
  );
}
