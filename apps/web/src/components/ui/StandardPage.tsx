import {
  useId,
  useState,
  type FormEvent,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsLeft,
  ChevronsRight,
  Filter,
  RotateCcw,
  Search,
  TrendingUp,
} from 'lucide-react';
import { useLanguage } from '../../app/language';
import { Button, Card } from './primitives';

export function StandardPageHeader({
  icon,
  title,
  description,
  eyebrow,
  hideEyebrow = true,
  actions,
  className = '',
  headingTabIndex,
}: {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  hideEyebrow?: boolean;
  actions?: ReactNode;
  className?: string;
  headingTabIndex?: number;
}) {
  return (
    <div className={`page-heading sales-page-heading ${className}`.trim()}>
      <div className="sales-heading-main">
        <span className="sales-heading-icon" aria-hidden="true">
          {icon}
        </span>
        <div>
          {eyebrow && (
            <p className={hideEyebrow ? 'eyebrow sr-only' : 'eyebrow'}>
              {eyebrow}
            </p>
          )}
          <h1 tabIndex={headingTabIndex}>{title}</h1>
          {description && <p>{description}</p>}
        </div>
      </div>
      {actions && <div className="sales-heading-actions">{actions}</div>}
    </div>
  );
}

export type KpiTone = 'amber' | 'success' | 'info' | 'danger';

export function StandardKpiGrid({
  label,
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  const { t } = useLanguage();
  return (
    <section
      className="sales-kpi-grid"
      aria-label={label ?? t('pos.salesSummaryRegion')}
    >
      {children}
    </section>
  );
}

export function StandardKpiCard({
  icon,
  tone = 'amber',
  label,
  value,
  subtext,
  trendUp = false,
  trendWarn = false,
  sparkline = false,
}: {
  icon: ReactNode;
  tone?: KpiTone;
  label: ReactNode;
  value: ReactNode;
  subtext?: ReactNode;
  trendUp?: boolean;
  trendWarn?: boolean;
  sparkline?: boolean;
}) {
  const gradientId = useId();
  return (
    <Card
      className={`sales-kpi-card ${sparkline ? 'sales-kpi-card-featured' : ''}`.trim()}
    >
      <div className="sales-kpi-content">
        <span
          className={`sales-kpi-icon sales-kpi-icon-${tone}`}
          aria-hidden="true"
        >
          {icon}
        </span>
        <div className="sales-kpi-body">
          <span className="sales-kpi-label">{label}</span>
          <strong className="sales-kpi-value">{value}</strong>
          {subtext && (
            <span
              className={`sales-kpi-trend ${
                trendUp
                  ? 'sales-kpi-trend-up'
                  : trendWarn
                    ? 'sales-kpi-trend-warn'
                    : ''
              }`.trim()}
            >
              {trendUp && <TrendingUp size={13} aria-hidden="true" />}
              <span>{subtext}</span>
            </span>
          )}
        </div>
      </div>
      {sparkline && (
        <svg
          className="sales-kpi-sparkline"
          viewBox="0 0 120 56"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f4c542" stopOpacity="0.38" />
              <stop offset="100%" stopColor="#f4c542" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          <path
            d="M4,46 C22,45 28,28 46,32 C64,36 72,18 90,24 C102,28 110,10 116,8 L116,54 L4,54 Z"
            fill={`url(#${gradientId})`}
          />
          <path
            d="M4,46 C22,45 28,28 46,32 C64,36 72,18 90,24 C102,28 110,10 116,8"
            fill="none"
            stroke="#eab308"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <circle cx="116" cy="8" r="5" fill="#f4c542" fillOpacity="0.35" />
          <circle cx="116" cy="8" r="2.5" fill="#eab308" />
        </svg>
      )}
    </Card>
  );
}

export function StandardSearchField({
  label,
  ...inputProps
}: {
  label: ReactNode;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="sales-filter-field">
      <span>{label}</span>
      <div className="sales-input-with-icon">
        <Search size={15} aria-hidden="true" />
        <input {...inputProps} />
      </div>
    </label>
  );
}

export function StandardFilterCard({
  title,
  headerControls,
  children,
  useForm = false,
  onSubmit,
  onReset,
  onSearch,
  searchSubmit = false,
  searchLabel,
  extraActions,
  footerLeft,
  collapsible = true,
  gridLayout = true,
}: {
  title?: ReactNode;
  headerControls?: ReactNode;
  children?: ReactNode;
  useForm?: boolean;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  onReset?: () => void;
  onSearch?: () => void;
  searchSubmit?: boolean;
  searchLabel?: ReactNode;
  extraActions?: ReactNode;
  footerLeft?: ReactNode;
  collapsible?: boolean;
  gridLayout?: boolean;
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(true);

  const bodyContent = (
    <>
      {children &&
        (gridLayout ? (
          <div className="pos-history-filters">{children}</div>
        ) : (
          children
        ))}
      {(footerLeft || onReset || onSearch || searchSubmit || extraActions) && (
        <div className="sales-filter-bottom-row">
          {footerLeft ?? <div />}
          {(onReset || onSearch || searchSubmit || extraActions) && (
            <div className="sales-filter-actions">
              {extraActions}
              {onReset && (
                <Button
                  className="button-secondary sales-reset-btn"
                  onClick={onReset}
                >
                  <RotateCcw size={15} aria-hidden="true" />
                  <span>{t('pos.resetFilters')}</span>
                </Button>
              )}
              {(onSearch || searchSubmit) && (
                <Button
                  type={searchSubmit ? 'submit' : 'button'}
                  className="sales-search-btn"
                  onClick={onSearch}
                >
                  <Search size={15} aria-hidden="true" />
                  <span>{searchLabel ?? t('pos.searchAction')}</span>
                </Button>
              )}
            </div>
          )}
        </div>
      )}
    </>
  );

  return (
    <Card className="sales-filter-card">
      <div className="sales-filter-header">
        <div className="sales-filter-title">
          <Filter size={18} aria-hidden="true" />
          <h2>{title ?? t('pos.searchAndFilterData')}</h2>
        </div>
        <div className="sales-filter-header-controls">
          {headerControls}
          {collapsible && (
            <button
              type="button"
              className="icon-button sales-filter-collapse-btn"
              aria-label={t('pos.toggleFilters')}
              aria-expanded={open}
              onClick={() => setOpen((prev) => !prev)}
            >
              {open ? (
                <ChevronUp size={18} aria-hidden="true" />
              ) : (
                <ChevronDown size={18} aria-hidden="true" />
              )}
            </button>
          )}
        </div>
      </div>

      {open &&
        (useForm ? (
          <form className="sales-filter-body" onSubmit={onSubmit}>
            {bodyContent}
          </form>
        ) : (
          <div className="sales-filter-body">{bodyContent}</div>
        ))}
    </Card>
  );
}

export function StandardContextBar() {
  return null;
}

export interface StandardTabOption {
  key: string;
  label: ReactNode;
  count?: number;
  icon?: ReactNode;
}

export function StandardStatusTabs({
  ariaLabel,
  tabs,
  value,
  onChange,
}: {
  ariaLabel?: string;
  tabs: StandardTabOption[];
  value: string;
  onChange: (key: string) => void;
}) {
  const { t } = useLanguage();
  return (
    <div
      className="sales-method-tabs"
      role="tablist"
      aria-label={ariaLabel ?? t('common.status')}
    >
      {tabs.map((tab) => {
        const active = value === tab.key;
        return (
          <button
            key={tab.key || '__all__'}
            type="button"
            role="tab"
            aria-selected={active}
            className={`sales-method-tab ${active ? 'active' : ''}`}
            onClick={() => onChange(tab.key)}
          >
            {tab.icon}
            <span>
              {tab.label}
              {typeof tab.count === 'number' ? ` (${tab.count})` : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function StandardPaginationBar({
  page,
  total,
  pageSize = 20,
  currentCount,
  loading = false,
  onPageChange,
  onPageSizeChange,
  pageSizes = [10, 25, 50, 100],
}: {
  page: number;
  total: number;
  pageSize?: number;
  currentCount?: number;
  loading?: boolean;
  onPageChange: (nextPage: number) => void;
  onPageSizeChange?: (nextSize: number) => void;
  pageSizes?: number[];
}) {
  const { t } = useLanguage();
  const safeSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(total / safeSize));
  const start = total === 0 ? 0 : (page - 1) * safeSize + 1;
  const end =
    total === 0
      ? 0
      : typeof currentCount === 'number'
        ? Math.min(total, (page - 1) * safeSize + currentCount)
        : Math.min(total, page * safeSize);

  return (
    <div className="pos-pagination sales-pagination-bar">
      <div className="sales-pagination-info">
        {onPageSizeChange && (
          <label className="sales-page-size-label">
            <span>{t('pos.showing')}</span>
            <select
              aria-label={t('pos.itemsPerPage')}
              value={safeSize}
              onChange={(event) => {
                onPageSizeChange(Number(event.target.value));
              }}
            >
              {pageSizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <span>{t('pos.itemsPerPage')}</span>
          </label>
        )}
        <span className="sales-showing-range">
          {t('pos.showingRangeOfTotal', {
            start,
            end,
            total,
          })}
        </span>
      </div>

      <div className="sales-pagination-controls">
        <Button
          className="button-secondary sales-page-btn"
          aria-label={t('pos.firstPage')}
          disabled={page <= 1 || loading}
          onClick={() => onPageChange(1)}
        >
          <ChevronsLeft size={16} aria-hidden="true" />
        </Button>
        <Button
          className="button-secondary sales-page-btn"
          aria-label={t('catalog.previous')}
          disabled={page <= 1 || loading}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </Button>
        <span
          className="sales-page-number active"
          aria-current="page"
          title={`${t('catalog.page')} ${page} / ${totalPages}`}
        >
          {page}
        </span>
        <Button
          className="button-secondary sales-page-btn"
          aria-label={t('catalog.next')}
          disabled={page >= totalPages || page * safeSize >= total || loading}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight size={16} aria-hidden="true" />
        </Button>
        <Button
          className="button-secondary sales-page-btn"
          aria-label={t('pos.lastPage')}
          disabled={page >= totalPages || page * safeSize >= total || loading}
          onClick={() => onPageChange(totalPages)}
        >
          <ChevronsRight size={16} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
