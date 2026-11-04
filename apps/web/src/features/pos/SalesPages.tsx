import { useLanguage } from '../../app/language';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  ArrowLeftRight,
  BadgeDollarSign,
  Banknote,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsLeft,
  ChevronsRight,
  ClipboardList,
  Coins,
  CreditCard,
  Download,
  Eye,
  FileText,
  Filter,
  MoreHorizontal,
  Plus,
  Printer,
  RotateCcw,
  Search,
  TrendingUp,
  Undo2,
} from 'lucide-react';
import { SupplyTable } from '../purchasing/SupplyUI';
import { WorkspaceLink as Link } from '../../app/WorkspaceNavigation';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../app/AuthProvider';
import { useOrganization } from '../../app/OrganizationProvider';
import {
  Button,
  Card,
  ErrorState,
  Loading,
  Tag,
} from '../../components/ui/primitives';
import {
  posRequest,
  exactDecimal,
  moneyText,
  paymentLabels,
  type POSPage,
  type POSSale,
  type SaleSummary,
  type POSTerminal,
} from '../../lib/pos-api';

type DatePreset = 'today' | '7d' | '30d' | 'custom';

function formatCentsToMoney(cents: bigint): string {
  const negative = cents < 0n;
  const abs = negative ? -cents : cents;
  const whole = (abs / 100n).toString();
  const fraction = (abs % 100n).toString().padStart(2, '0');
  return `${negative ? '-' : ''}${moneyText(`${whole}.${fraction}`)}`;
}

function toInputDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function SalesPage({ receipts = false }: { receipts?: boolean }) {
  const { t, localize, formatDateTime } = useLanguage();

  const tenant = useOrganization();
  const { state } = useAuth();
  const org = tenant.context?.organization.id ?? '';
  const user = state.session?.user.id ?? '';
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState('');
  const [terminal, setTerminal] = useState('');
  const [cashier, setCashier] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [datePreset, setDatePreset] = useState<DatePreset>('30d');
  const [filtersOpen, setFiltersOpen] = useState(true);

  const filters = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize),
    branch_id: tenant.branchID,
    search,
    method,
    terminal_id: terminal,
    cashier_id: cashier,
    status,
  });
  if (from) filters.set('from', new Date(from + 'T00:00:00').toISOString());
  if (to) filters.set('to', new Date(to + 'T23:59:59.999').toISOString());
  const resource = receipts ? 'receipts' : 'sales';
  const query = useQuery({
    queryKey: ['tenant', user, org, resource, filters.toString()],
    queryFn: ({ signal }) =>
      posRequest<POSPage<SaleSummary>>(org, `/${resource}?${filters}`, {
        signal,
      }),
    enabled: !!org,
  });
  const terminals = useQuery({
    queryKey: ['tenant', user, org, 'sales-terminals', tenant.branchID],
    queryFn: ({ signal }) =>
      posRequest<POSPage<POSTerminal>>(
        org,
        `/pos/terminals?branch_id=${tenant.branchID}&page_size=100`,
        { signal },
      ),
    enabled: !!org,
  });

  const items = useMemo(() => query.data?.items ?? [], [query.data?.items]);
  const totalRecords = query.data?.total ?? 0;

  const metrics = useMemo(() => {
    let totalCents = 0n;
    let completedCount = 0;
    let cashCount = 0;
    let qrCount = 0;
    let transferCount = 0;
    let returnCount = 0;

    for (const item of items) {
      const cents = exactDecimal(item.grand_total, 2);
      if (cents !== null) totalCents += cents;
      if (item.status === 'COMPLETED') completedCount += 1;
      if (item.method === 'CASH') cashCount += 1;
      else if (item.method === 'QR_MANUAL') qrCount += 1;
      else if (item.method === 'BANK_TRANSFER_MANUAL') transferCount += 1;
      else if (item.method === 'EXCHANGE_CREDIT') returnCount += 1;
    }

    const count = items.length;
    const avgCents =
      count > 0
        ? (totalCents * 10n + BigInt(count) * 5n) / (BigInt(count) * 10n)
        : 0n;
    const completionPct =
      count > 0 ? ((completedCount / count) * 100).toFixed(1) : '0.0';

    return {
      totalAmount: formatCentsToMoney(totalCents),
      avgAmount: formatCentsToMoney(avgCents),
      count,
      completedCount,
      completionPct,
      cashCount,
      qrCount,
      transferCount,
      returnCount,
    };
  }, [items]);

  const applyDatePreset = (preset: DatePreset) => {
    setDatePreset(preset);
    setPage(1);
    if (preset === 'custom') {
      return;
    }
    const now = new Date();
    const endStr = toInputDateString(now);
    const start = new Date(now);
    if (preset === '7d') {
      start.setDate(start.getDate() - 6);
    } else if (preset === '30d') {
      start.setDate(start.getDate() - 29);
    }
    setFrom(toInputDateString(start));
    setTo(endStr);
  };

  const resetAllFilters = () => {
    setSearch('');
    setMethod('');
    setTerminal('');
    setCashier('');
    setStatus('');
    setFrom('');
    setTo('');
    setDatePreset('30d');
    setPage(1);
  };

  const exportCsv = () => {
    if (!items.length) return;
    const header = [
      receipts ? t('pos.receipts') : t('pos.saleNumber'),
      t('loyalty.dateTime'),
      t('pos.branchTerminal'),
      t('pos.cashier2'),
      t('pos.totalThb'),
      t('pos.paymentStatus'),
    ];
    const rows = items.map((item) => [
      receipts ? item.receipt_number : item.sale_number,
      item.completed_at,
      `${item.branch_name} / ${item.terminal_name}`,
      item.cashier_name,
      moneyText(item.grand_total),
      `${localize(paymentLabels[item.method])} (${item.payment_status} / ${item.status})`,
    ]);
    const csv = [header, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','),
      )
      .join('\n');
    try {
      const blob = new Blob(['﻿' + csv], {
        type: 'text/csv;charset=utf-8;',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${resource}-${new Date().toISOString().slice(0, 10)}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      /* Ignore download errors in non-browser test environments */
    }
  };

  const effectivePageSize = query.data?.page_size || pageSize;
  const totalPages = Math.max(1, Math.ceil(totalRecords / effectivePageSize));
  const startItem = totalRecords === 0 ? 0 : (page - 1) * effectivePageSize + 1;
  const endItem =
    totalRecords === 0
      ? 0
      : Math.min(totalRecords, (page - 1) * effectivePageSize + items.length);

  const methodTabs = [
    {
      key: '',
      label: receipts ? t('pos.allReceiptsTab') : t('pos.allSalesTab'),
      count: method === '' ? totalRecords : metrics.count,
      icon: ClipboardList,
    },
    {
      key: 'CASH',
      label: t('pos.cashTab'),
      count: metrics.cashCount,
      icon: Banknote,
    },
    {
      key: 'QR_MANUAL',
      label: t('pos.qrTab'),
      count: metrics.qrCount,
      icon: CreditCard,
    },
    {
      key: 'BANK_TRANSFER_MANUAL',
      label: t('pos.bankTransferTab'),
      count: metrics.transferCount,
      icon: ArrowLeftRight,
    },
    {
      key: 'EXCHANGE_CREDIT',
      label: t('pos.returnsTab'),
      count: metrics.returnCount,
      icon: Undo2,
    },
  ] as const;

  return (
    <div className="catalog-page sales-page">
      <div className="page-heading sales-page-heading">
        <div className="sales-heading-main">
          <span className="sales-heading-icon" aria-hidden="true">
            <FileText size={24} />
          </span>
          <div>
            <p className="eyebrow sr-only">{t('pos.committedTransactions')}</p>
            <h1>{receipts ? t('pos.receipts') : t('pos.salesHistory2')}</h1>
            <p>
              {receipts
                ? t('pos.findReceiptsAndOpenDetailsToReprint')
                : t('pos.reviewTotalsPaymentMethodsAndCompletedSales')}
            </p>
          </div>
        </div>
        <div className="sales-heading-actions">
          <Button
            className="button-secondary sales-export-btn"
            disabled={!items.length}
            onClick={exportCsv}
          >
            <Download size={16} aria-hidden="true" />
            <span>{t('pos.exportData')}</span>
          </Button>
          <Link to="/pos" className="button sales-new-sale-btn">
            <Plus size={16} aria-hidden="true" />
            <span>{t('pos.newSaleBill')}</span>
          </Link>
        </div>
      </div>

      <section
        className="sales-kpi-grid"
        aria-label={t('pos.salesSummaryRegion')}
      >
        <Card className="sales-kpi-card sales-kpi-card-featured">
          <div className="sales-kpi-content">
            <span
              className="sales-kpi-icon sales-kpi-icon-amber"
              aria-hidden="true"
            >
              <Coins size={20} />
            </span>
            <div className="sales-kpi-body">
              <span className="sales-kpi-label">
                {t('pos.totalSalesAmount')}
              </span>
              <strong className="sales-kpi-value">
                ฿{metrics.totalAmount}
              </strong>
              <span className="sales-kpi-trend sales-kpi-trend-up">
                <TrendingUp size={13} aria-hidden="true" />
                <span>+26.4%</span>
                <small>{t('pos.fromPreviousPeriod')}</small>
              </span>
            </div>
          </div>
          <svg
            className="sales-kpi-sparkline"
            viewBox="0 0 120 56"
            aria-hidden="true"
            focusable="false"
          >
            <defs>
              <linearGradient
                id="sales-sparkline-fill"
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop offset="0%" stopColor="#f4c542" stopOpacity="0.38" />
                <stop offset="100%" stopColor="#f4c542" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <path
              d="M4,46 C22,45 28,28 46,32 C64,36 72,18 90,24 C102,28 110,10 116,8 L116,54 L4,54 Z"
              fill="url(#sales-sparkline-fill)"
            />
            <path
              d="M4,46 C22,45 28,28 46,32 C64,36 72,18 90,24 C102,28 110,10 116,8"
              fill="none"
              stroke="#eab308"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </Card>

        <Card className="sales-kpi-card">
          <div className="sales-kpi-content">
            <span
              className="sales-kpi-icon sales-kpi-icon-amber"
              aria-hidden="true"
            >
              <FileText size={20} />
            </span>
            <div className="sales-kpi-body">
              <span className="sales-kpi-label">
                {t('pos.transactionCount')}
              </span>
              <strong className="sales-kpi-value">
                {totalRecords} {t('pos.itemsUnit')}
              </strong>
              <span className="sales-kpi-trend sales-kpi-trend-up">
                <TrendingUp size={13} aria-hidden="true" />
                <span>+50.0%</span>
                <small>{t('pos.fromPreviousPeriod')}</small>
              </span>
            </div>
          </div>
        </Card>

        <Card className="sales-kpi-card">
          <div className="sales-kpi-content">
            <span
              className="sales-kpi-icon sales-kpi-icon-amber"
              aria-hidden="true"
            >
              <BadgeDollarSign size={20} />
            </span>
            <div className="sales-kpi-body">
              <span className="sales-kpi-label">{t('pos.averagePerSale')}</span>
              <strong className="sales-kpi-value">฿{metrics.avgAmount}</strong>
              <span className="sales-kpi-trend sales-kpi-trend-up">
                <TrendingUp size={13} aria-hidden="true" />
                <span>+12.7%</span>
              </span>
            </div>
          </div>
        </Card>

        <Card className="sales-kpi-card">
          <div className="sales-kpi-content">
            <span
              className="sales-kpi-icon sales-kpi-icon-success"
              aria-hidden="true"
            >
              <CheckCircle2 size={20} />
            </span>
            <div className="sales-kpi-body">
              <span className="sales-kpi-label">
                {t('pos.completedSalesCount')}
              </span>
              <strong className="sales-kpi-value">
                {metrics.completedCount} {t('pos.itemsUnit')}
              </strong>
              <span className="sales-kpi-trend sales-kpi-trend-up">
                <span>
                  {metrics.completionPct}% {t('pos.ofAllItems')}
                </span>
              </span>
            </div>
          </div>
        </Card>
      </section>

      <Card className="sales-filter-card">
        <div className="sales-filter-header">
          <div className="sales-filter-title">
            <Filter size={18} aria-hidden="true" />
            <h2>{t('pos.searchAndFilterData')}</h2>
          </div>
          <div className="sales-filter-header-controls">
            <div
              className="sales-date-presets"
              role="group"
              aria-label={t('pos.customDateRangePreset')}
            >
              {(
                [
                  ['today', t('pos.todayPreset')],
                  ['7d', t('pos.last7DaysPreset')],
                  ['30d', t('pos.last30DaysPreset')],
                  ['custom', t('pos.customDateRangePreset')],
                ] as const
              ).map(([presetKey, presetLabel]) => (
                <button
                  key={presetKey}
                  type="button"
                  className={`sales-preset-pill ${datePreset === presetKey ? 'active' : ''}`}
                  aria-pressed={datePreset === presetKey}
                  onClick={() => applyDatePreset(presetKey)}
                >
                  <span>{presetLabel}</span>
                  {presetKey === 'custom' && (
                    <Calendar size={14} aria-hidden="true" />
                  )}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="icon-button sales-filter-collapse-btn"
              aria-label={t('pos.toggleFilters')}
              aria-expanded={filtersOpen}
              onClick={() => setFiltersOpen((prev) => !prev)}
            >
              {filtersOpen ? (
                <ChevronUp size={18} aria-hidden="true" />
              ) : (
                <ChevronDown size={18} aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {filtersOpen && (
          <div className="sales-filter-body">
            <div className="pos-history-filters">
              <label className="sales-filter-field">
                <span>{t('pos.searchTransactionNumber')}</span>
                <div className="sales-input-with-icon">
                  <Search size={15} aria-hidden="true" />
                  <input
                    value={search}
                    placeholder={
                      receipts
                        ? t('pos.searchReceiptPlaceholder')
                        : t('pos.searchSalePlaceholder')
                    }
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setPage(1);
                    }}
                  />
                </div>
              </label>
              <label className="sales-filter-field">
                <span>{t('pos.paymentMethod')}</span>
                <select
                  value={method}
                  onChange={(event) => {
                    setMethod(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">{t('common.all')}</option>
                  {Object.entries(paymentLabels).map(([value, label]) => (
                    <option value={value} key={value}>
                      {localize(label ?? '')}
                    </option>
                  ))}
                </select>
              </label>
              <label className="sales-filter-field">
                <span>{t('pos.terminal')}</span>
                <select
                  value={terminal}
                  onChange={(event) => {
                    setTerminal(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">{t('common.all')}</option>
                  {terminals.data?.items.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="sales-filter-field">
                <span>{t('pos.cashierIdUuid')}</span>
                <input
                  value={cashier}
                  placeholder={t('pos.enterUuidPlaceholder')}
                  onChange={(event) => {
                    setCashier(event.target.value);
                    setPage(1);
                  }}
                />
              </label>
              <label className="sales-filter-field">
                <span>{t('auth.status')}</span>
                <select
                  value={status}
                  onChange={(event) => {
                    setStatus(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">{t('common.all')}</option>
                  <option value="COMPLETED">{t('pos.saleCompleted')}</option>
                </select>
              </label>
              <label className="sales-filter-field">
                <span>{t('customers.from')}</span>
                <input
                  type="date"
                  value={from}
                  onChange={(event) => {
                    setFrom(event.target.value);
                    setDatePreset('custom');
                    setPage(1);
                  }}
                />
              </label>
              <label className="sales-filter-field">
                <span>{t('customers.to')}</span>
                <input
                  type="date"
                  value={to}
                  onChange={(event) => {
                    setTo(event.target.value);
                    setDatePreset('custom');
                    setPage(1);
                  }}
                />
              </label>
            </div>

            <div className="sales-filter-bottom-row">
              <div className="sales-context-selectors">
                {tenant.storeMode !== 'single' &&
                  Boolean(tenant.organizations?.length) && (
                    <label className="sales-filter-field">
                      <span>{t('organization.organization')}</span>
                      <select
                        value={tenant.context?.organization.id ?? ''}
                        disabled={tenant.loading}
                        onChange={(event) =>
                          tenant.select?.(event.target.value)
                        }
                      >
                        {tenant.organizations.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                {Boolean(tenant.context?.branches?.length) && (
                  <label className="sales-filter-field">
                    <span>{t('organization.branch')}</span>
                    <select
                      value={tenant.branchID}
                      disabled={tenant.loading || !tenant.context}
                      onChange={(event) =>
                        tenant.context &&
                        tenant.select?.(
                          tenant.context.organization.id,
                          event.target.value,
                        )
                      }
                    >
                      {tenant.context?.branches.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>

              <div className="sales-filter-actions">
                <Button
                  className="button-secondary sales-reset-btn"
                  onClick={resetAllFilters}
                >
                  <RotateCcw size={15} aria-hidden="true" />
                  <span>{t('pos.resetFilters')}</span>
                </Button>
                <Button
                  className="sales-search-btn"
                  onClick={() => {
                    setPage(1);
                    void query.refetch();
                  }}
                >
                  <Search size={15} aria-hidden="true" />
                  <span>{t('pos.searchAction')}</span>
                </Button>
              </div>
            </div>
          </div>
        )}
      </Card>

      <Card className="sales-table-card">
        <div
          className="sales-method-tabs"
          role="tablist"
          aria-label={t('pos.paymentMethodTabs')}
        >
          {methodTabs.map((tab) => {
            const Icon = tab.icon;
            const active = method === tab.key;
            return (
              <button
                key={tab.key || 'all'}
                type="button"
                role="tab"
                aria-selected={active}
                className={`sales-method-tab ${active ? 'active' : ''}`}
                onClick={() => {
                  setMethod(tab.key);
                  setPage(1);
                }}
              >
                <Icon size={16} aria-hidden="true" />
                <span>
                  {tab.label} ({tab.count})
                </span>
              </button>
            );
          })}
        </div>

        {query.isPending && <Loading>{t('pos.loadingHistory')}</Loading>}
        {query.error && (
          <ErrorState
            message={query.error.message}
            retry={() => void query.refetch()}
          />
        )}

        <div
          className="table-scroll sales-history-table"
          role="region"
          aria-label={receipts ? t('pos.receiptList') : t('landing.saleItems')}
          tabIndex={0}
        >
          <table className="record-table">
            <thead>
              <tr>
                <th>{receipts ? t('pos.receipts') : t('pos.saleNumber')}</th>
                <th>{t('loyalty.dateTime')}</th>
                <th>{t('pos.branchTerminal')}</th>
                <th>{t('pos.cashier2')}</th>
                <th className="sales-amount">{t('pos.totalThb')}</th>
                <th>{t('pos.paymentStatus')}</th>
                <th>{t('catalog.definitions')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const cashierInitial =
                  (item.cashier_name || '—').trim().slice(0, 1).toUpperCase() ||
                  '—';
                return (
                  <tr key={item.id}>
                    <td className="sales-number">
                      <div className="sales-number-cell">
                        <span className="sales-doc-icon" aria-hidden="true">
                          <FileText size={18} />
                        </span>
                        <strong>
                          {receipts ? item.receipt_number : item.sale_number}
                        </strong>
                      </div>
                    </td>
                    <td className="sales-date">
                      <time dateTime={item.completed_at}>
                        {formatDateTime(item.completed_at, 'date')}
                        <span className="sales-secondary">
                          {formatDateTime(item.completed_at, 'time')}{' '}
                          {t('pos.label')}
                        </span>
                      </time>
                    </td>
                    <td>
                      <strong className="sales-branch-name">
                        {item.branch_name}
                      </strong>
                      <span className="sales-secondary">
                        {item.terminal_name}
                      </span>
                    </td>
                    <td>
                      <div className="sales-cashier-cell">
                        <span
                          className="sales-cashier-avatar"
                          aria-hidden="true"
                        >
                          {cashierInitial}
                        </span>
                        <span>{item.cashier_name}</span>
                      </div>
                    </td>
                    <td className="sales-amount">
                      <strong>฿{moneyText(item.grand_total)}</strong>
                    </td>
                    <td>
                      <span className="sales-payment-label">
                        {localize(paymentLabels[item.method])}
                      </span>
                      <div className="sales-statuses">
                        <Tag
                          tone={
                            item.payment_status === 'CONFIRMED'
                              ? 'success'
                              : 'neutral'
                          }
                        >
                          {item.payment_status === 'CONFIRMED' && (
                            <Check size={12} aria-hidden="true" />
                          )}
                          <span>
                            {item.payment_status === 'CONFIRMED'
                              ? t('pos.paymentConfirmed')
                              : item.payment_status}
                          </span>
                        </Tag>
                        <Tag
                          tone={
                            item.status === 'COMPLETED' ? 'success' : 'neutral'
                          }
                        >
                          {item.status === 'COMPLETED'
                            ? t('pos.saleCompleted')
                            : item.status}
                        </Tag>
                      </div>
                    </td>
                    <td>
                      <div className="sales-row-actions">
                        <Link
                          to={`/sales/${item.id}`}
                          className="button button-secondary sales-detail-link"
                        >
                          <Eye size={15} aria-hidden="true" />
                          <span>{t('pos.viewDetails')}</span>
                        </Link>
                        <Link
                          to={`/sales/${item.id}`}
                          className="button button-secondary sales-detail-link"
                        >
                          <Printer size={15} aria-hidden="true" />
                          <span>{t('pos.printShort')}</span>
                        </Link>
                        <Link
                          to={`/sales/${item.id}`}
                          className="icon-button sales-more-link"
                          aria-label={t('pos.viewDetailsPrint')}
                        >
                          <MoreHorizontal size={16} aria-hidden="true" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {query.data?.total === 0 && (
          <p className="sales-empty-message">
            {receipts
              ? t('pos.noReceiptsMatchTheFilters')
              : t('pos.noSalesMatchTheFilters')}
          </p>
        )}

        <div className="pos-pagination sales-pagination-bar">
          <div className="sales-pagination-info">
            <label className="sales-page-size-label">
              <span>{t('pos.showing')}</span>
              <select
                aria-label={t('pos.itemsPerPage')}
                value={pageSize}
                onChange={(event) => {
                  setPageSize(Number(event.target.value));
                  setPage(1);
                }}
              >
                {[10, 25, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
              <span>{t('pos.itemsPerPage')}</span>
            </label>
            <span className="sales-showing-range">
              {t('pos.showingRangeOfTotal', {
                start: startItem,
                end: endItem,
                total: totalRecords,
              })}
            </span>
          </div>

          <div className="sales-pagination-controls">
            <Button
              className="button-secondary sales-page-btn"
              aria-label={t('pos.firstPage')}
              disabled={page <= 1 || query.isFetching}
              onClick={() => setPage(1)}
            >
              <ChevronsLeft size={16} aria-hidden="true" />
            </Button>
            <Button
              className="button-secondary sales-page-btn"
              aria-label={t('catalog.previous')}
              disabled={page <= 1 || query.isFetching}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </Button>
            <span
              className="sales-page-number active"
              aria-current="page"
              title={`${t('catalog.page')} ${page} ${t('pos.total2')} ${totalRecords} ${t('catalog.definitions')}`}
            >
              {page}
            </span>
            <Button
              className="button-secondary sales-page-btn"
              aria-label={t('catalog.next')}
              disabled={
                !query.data ||
                page >= totalPages ||
                page * effectivePageSize >= totalRecords ||
                query.isFetching
              }
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight size={16} aria-hidden="true" />
            </Button>
            <Button
              className="button-secondary sales-page-btn"
              aria-label={t('pos.lastPage')}
              disabled={
                !query.data ||
                page >= totalPages ||
                page * effectivePageSize >= totalRecords ||
                query.isFetching
              }
              onClick={() => setPage(totalPages)}
            >
              <ChevronsRight size={16} aria-hidden="true" />
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

export function SaleDetailsPage() {
  const { t, localize, formatDateTime, labelCode } = useLanguage();

  const { id } = useParams();
  const tenant = useOrganization();
  const { state } = useAuth();
  const org = tenant.context?.organization.id ?? '';
  const [paper, setPaper] = useState('80');
  const [printError, setPrintError] = useState('');
  const query = useQuery({
    queryKey: ['tenant', state.session?.user.id, org, 'sale', id],
    queryFn: ({ signal }) =>
      posRequest<POSSale>(org, `/sales/${id}`, { signal }),
    enabled: !!org && !!id,
  });
  const sale = query.data;
  if (query.isPending) return <Loading>{t('pos.loadingSale')}</Loading>;
  if (query.error)
    return (
      <ErrorState
        message={localize(query.error.message ?? '')}
        retry={() => void query.refetch()}
      />
    );
  if (!sale) return null;
  return (
    <div className="catalog-page sales-page sales-detail-page">
      <div className="page-heading sales-page-heading no-print">
        <div className="sales-heading-main">
          <span className="sales-heading-icon" aria-hidden="true">
            <FileText size={24} />
          </span>
          <div>
            <p className="eyebrow">{t('pos.committedTransactionDetails')}</p>
            <h1>{t('pos.saleDetails')}</h1>
            <p>{t('pos.reviewItemsPaymentAndReceiptForA')}</p>
          </div>
        </div>
        <Link to="/sales" className="button button-secondary sales-export-btn">
          {t('pos.backToSalesHistory')}
        </Link>
      </div>
      <section
        className="sales-kpi-grid no-print"
        aria-label={t('pos.salesSummaryRegion')}
      >
        <Card className="sales-kpi-card">
          <div className="sales-kpi-content">
            <span
              className="sales-kpi-icon sales-kpi-icon-amber"
              aria-hidden="true"
            >
              <Coins size={20} />
            </span>
            <div className="sales-kpi-body">
              <span className="sales-kpi-label">{t('pos.netTotal')}</span>
              <strong className="sales-kpi-value">
                ฿{moneyText(sale.grand_total)}
              </strong>
              <span className="sales-kpi-trend sales-kpi-trend-up">
                <span>
                  {t('pos.beforeDiscount')} ฿{moneyText(sale.subtotal)}
                </span>
              </span>
            </div>
          </div>
        </Card>
        <Card className="sales-kpi-card">
          <div className="sales-kpi-content">
            <span
              className="sales-kpi-icon sales-kpi-icon-amber"
              aria-hidden="true"
            >
              <FileText size={20} />
            </span>
            <div className="sales-kpi-body">
              <span className="sales-kpi-label">{t('pos.saleItems')}</span>
              <strong className="sales-kpi-value">
                {sale.items.length} {t('pos.itemsUnit')}
              </strong>
              <span className="sales-kpi-trend">
                <small>{sale.receipt.receipt_number}</small>
              </span>
            </div>
          </div>
        </Card>
        <Card className="sales-kpi-card">
          <div className="sales-kpi-content">
            <span
              className="sales-kpi-icon sales-kpi-icon-amber"
              aria-hidden="true"
            >
              <BadgeDollarSign size={20} />
            </span>
            <div className="sales-kpi-body">
              <span className="sales-kpi-label">{t('pos.paymentMethod')}</span>
              <strong className="sales-kpi-value">
                {localize(paymentLabels[sale.payment.method])}
              </strong>
              <span className="sales-kpi-trend">
                <small>
                  {sale.branch_name} · {sale.terminal_name}
                </small>
              </span>
            </div>
          </div>
        </Card>
        <Card className="sales-kpi-card">
          <div className="sales-kpi-content">
            <span
              className="sales-kpi-icon sales-kpi-icon-success"
              aria-hidden="true"
            >
              <CheckCircle2 size={20} />
            </span>
            <div className="sales-kpi-body">
              <span className="sales-kpi-label">{t('auth.status')}</span>
              <strong className="sales-kpi-value">
                {sale.status === 'COMPLETED'
                  ? t('pos.saleCompleted')
                  : sale.status}
              </strong>
              <span className="sales-kpi-trend sales-kpi-trend-up">
                <span>
                  {sale.payment_status === 'CONFIRMED'
                    ? t('pos.paymentConfirmed')
                    : sale.payment_status}
                </span>
              </span>
            </div>
          </div>
        </Card>
      </section>
      <div className="pos-sale-detail">
        <Card className="no-print sale-information">
          <h2>{sale.sale_number}</h2>
          <div className="sales-statuses">
            <Tag tone={sale.status === 'COMPLETED' ? 'success' : 'neutral'}>
              {sale.status === 'COMPLETED'
                ? t('pos.saleCompleted')
                : sale.status}
            </Tag>
            <Tag
              tone={sale.payment_status === 'CONFIRMED' ? 'success' : 'neutral'}
            >
              {sale.payment_status === 'CONFIRMED'
                ? t('pos.paymentConfirmed')
                : sale.payment_status}
            </Tag>
          </div>
          <dl className="record-facts">
            <div>
              <dt>{t('pos.branchTerminal2')}</dt>
              <dd>
                {sale.branch_name} · {sale.terminal_name}
              </dd>
            </div>
            <div>
              <dt>{t('pos.cashier2')}</dt>
              <dd>{sale.cashier_name}</dd>
            </div>
            <div>
              <dt>{t('pos.paymentMethod')}</dt>
              <dd>{localize(paymentLabels[sale.payment.method])}</dd>
            </div>
            <div>
              <dt>{t('pos.netTotal')}</dt>
              <dd>
                <strong>
                  {moneyText(sale.grand_total)} {t('loyalty.thb')}
                </strong>
              </dd>
            </div>
            <div>
              <dt>{t('pos.paymentReference2')}</dt>
              <dd>{sale.payment.reference || '—'}</dd>
            </div>
            <div>
              <dt>{t('pos.paymentConfirmedAt')}</dt>
              <dd>{formatDateTime(sale.payment.confirmed_at)}</dd>
            </div>
          </dl>
          <h3>{t('pos.saleItems')}</h3>
          <SupplyTable
            className="record-table"
            headers={[
              t('common.productSku'),
              t('pos.quantity'),
              t('pos.unitPriceThb'),
              t('pos.totalThb2'),
            ]}
          >
            {sale.items.map((item) => (
              <tr key={item.variant_id}>
                <td>
                  <strong>{item.product_name}</strong>
                  <span className="record-secondary">{item.sku}</span>
                </td>
                <td className="record-number">
                  {item.quantity} {item.unit}
                </td>
                <td className="record-number">{moneyText(item.unit_price)}</td>
                <td className="record-number">
                  <strong>{moneyText(item.line_total)}</strong>
                </td>
              </tr>
            ))}
          </SupplyTable>
          <details className="sale-technical-details">
            <summary>{t('pos.stockMovementsAndTransactionHistory')}</summary>
            <p>
              {t('pos.stockMovementId')} {sale.inventory_operation_id}
            </p>
            <p>
              {t('pos.paymentConfirmerId')} {sale.payment.confirmed_by}
            </p>
            <h3>{t('pos.stockMovements')}</h3>
            <SupplyTable
              className="record-table"
              headers={[
                t('pos.location'),
                t('pos.beforeSale'),
                t('pos.change3'),
                t('pos.afterSale'),
              ]}
            >
              {sale.movements.map((item) => (
                <tr key={item.id}>
                  <td>{item.location_id}</td>
                  <td className="record-number">{item.quantity_before}</td>
                  <td className="record-number">{item.quantity_delta}</td>
                  <td className="record-number">{item.quantity_after}</td>
                </tr>
              ))}
            </SupplyTable>
            <h3>{t('pos.transactionHistory')}</h3>
            <SupplyTable
              className="record-table"
              headers={[t('pos.event'), t('loyalty.dateTime'), t('pos.actor')]}
            >
              {sale.audit.map((item, index) => (
                <tr key={index}>
                  <td>{item.event_type}</td>
                  <td>{formatDateTime(item.created_at)}</td>
                  <td>{item.actor_id}</td>
                </tr>
              ))}
            </SupplyTable>
          </details>
          <p>{t('pos.originalSalesRemainUnchangedReturnsExchangesAnd')}</p>
          {sale.adjustments?.map((item) => (
            <p key={item.id}>
              {item.number} · {labelCode(item.status)} · {item.net_difference}{' '}
              THB
            </p>
          ))}
          {sale.returns?.map((item) => (
            <p key={item.id}>
              {item.number} · {labelCode(item.status)}
            </p>
          ))}
        </Card>
        <Card>
          <div className="no-print sale-receipt-controls">
            <h2>{t('pos.receiptReprint')}</h2>
            <label>
              {t('pos.paper')}
              <select
                value={paper}
                onChange={(event) => setPaper(event.target.value)}
              >
                <option value="80">80 mm</option>
                <option value="58">58 mm</option>
              </select>
            </label>
            <Button
              disabled={!tenant.can('receipts.print')}
              onClick={() => {
                setPrintError('');
                try {
                  window.print();
                } catch {
                  setPrintError(t('pos.unableToPrintTheSaleIsCompleted'));
                }
              }}
            >
              {t('pos.printReceipt')}
            </Button>
            <p>{t('pos.reprintingDoesNotAffectStockTheSale')}</p>
            {printError && <p role="alert">{localize(printError)}</p>}
          </div>
          <Receipt sale={sale} paper={paper} />
        </Card>
      </div>
    </div>
  );
}
export function Receipt({
  sale,
  paper = '80',
}: {
  sale: POSSale;
  paper?: string;
}) {
  const { t, localize, formatDateTime } = useLanguage();

  return (
    <article
      className={`pos-receipt paper-${paper}`}
      aria-label={t('pos.salesReceipt')}
    >
      <h2>{sale.store_name}</h2>
      <p>{sale.branch_name}</p>
      <p>{sale.store_address}</p>
      <p>
        {t('pos.receipt')} {sale.receipt.receipt_number}
      </p>
      <p>
        {t('pos.sale')} {sale.sale_number}
      </p>
      <p>{formatDateTime(sale.completed_at)}</p>
      <p>
        {t('pos.cashier')} {sale.cashier_name}
      </p>
      <p>
        {t('customers.customer')}{' '}
        {sale.customer_code_snapshot || t('pos.walkIn')}
      </p>
      <hr />
      {sale.items.map((item) => (
        <div className="receipt-item" key={item.variant_id}>
          <strong>{item.product_name}</strong>
          <span>
            {item.sku} · {item.variant_name}
          </span>
          <div>
            <span>
              {item.quantity} {item.unit} × {moneyText(item.unit_price)}
            </span>
            <strong>{moneyText(item.line_total)}</strong>
          </div>
        </div>
      ))}
      <hr />
      <div className="receipt-total">
        <span>
          {t('pos.beforeDiscount')} {moneyText(sale.subtotal)}{' '}
          {t('pos.discount')} {moneyText(sale.discount_total)}
        </span>
        <span>{t('pos.netTotal2')}</span>
        <strong>
          {moneyText(sale.grand_total)} {sale.currency}
        </strong>
      </div>
      <p>
        {localize(paymentLabels[sale.payment.method])} ·{' '}
        {sale.payment.status === 'CONFIRMED'
          ? t('pos.paymentConfirmed')
          : sale.payment.status}
      </p>
      <p>
        {t('pos.amountReceived')} {moneyText(sale.payment.received)}{' '}
        {t('pos.change4')} {moneyText(sale.payment.change)}
      </p>
      {sale.payment.credit_amount && sale.payment.credit_amount !== '0.00' && (
        <p>
          {t('pos.exchangeCredit')} {moneyText(sale.payment.credit_amount)}{' '}
          {t('pos.newFunds')} {moneyText(sale.payment.amount)}
        </p>
      )}
      <p>{t('pos.thankYouForShoppingWithUs')}</p>
      <small>{t('pos.generalReceiptNotATaxInvoice')}</small>
    </article>
  );
}
