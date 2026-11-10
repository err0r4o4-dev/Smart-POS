import { useLanguage } from '../../app/language';
import { useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Banknote,
  CheckCircle2,
  ClipboardList,
  Clock,
  Coins,
  Download,
  Monitor,
  Plus,
  PowerOff,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react';
import { Button, Card } from '../../components/ui/primitives';
import {
  StandardPageHeader,
  StandardKpiGrid,
  StandardKpiCard,
  StandardStatusTabs,
  StandardPaginationBar,
} from '../../components/ui/StandardPage';
import {
  posRequest,
  moneyText,
  exactDecimal,
  paymentLabels,
  type POSPage,
  type POSCheckout,
  type POSShift,
} from '../../lib/pos-api';
import { usePOS } from './POSContext';
import { QueryFeedback } from '../../components/feedback/QueryFeedback';
import { POSPagination } from './POSPagination';

export function RegisterPage({
  section,
}: {
  section: 'open' | 'close' | 'history' | 'shifts';
}) {
  const { t, localize, formatDateTime, labelCode } = useLanguage();

  const pos = usePOS();
  const [cash, setCash] = useState('0.00');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [statusFilter, setStatusFilter] = useState('');
  const [terminalFilter, setTerminalFilter] = useState('');

  const key = useRef(crypto.randomUUID());
  const locations = useQuery({
    queryKey: ['tenant', pos.user, pos.org, 'pos', pos.branch, 'locations'],
    queryFn: ({ signal }) =>
      posRequest<POSPage<{ id: string; name: string; type: string }>>(
        pos.org,
        `/inventory/locations?branch_id=${pos.branch}&status=ACTIVE&page_size=100`,
        { signal },
      ),
    enabled: section === 'open' && pos.can('pos.terminal.manage'),
  });

  const history = useQuery({
    queryKey: [
      'tenant',
      pos.user,
      pos.org,
      'pos',
      pos.branch,
      'register-history',
      page,
      pageSize,
      statusFilter,
      terminalFilter,
    ],
    queryFn: ({ signal }) => {
      const params = new URLSearchParams({
        branch_id: pos.branch,
        page: String(page),
        page_size: String(pageSize),
      });
      if (statusFilter) params.set('status', statusFilter);
      if (terminalFilter) params.set('terminal_id', terminalFilter);
      return posRequest<POSPage<POSShift>>(
        pos.org,
        `/pos/shifts?${params.toString()}`,
        { signal },
      );
    },
    enabled: section === 'history',
  });

  const payments = useQuery({
    queryKey: [
      'tenant',
      pos.user,
      pos.org,
      'pos',
      pos.branch,
      'payment-history',
      page,
    ],
    queryFn: ({ signal }) =>
      posRequest<POSPage<POSCheckout>>(
        pos.org,
        `/pos/checkouts?branch_id=${pos.branch}&page=${page}`,
        { signal },
      ),
    enabled: section === 'shifts',
  });

  const items = useMemo(() => history.data?.items ?? [], [history.data?.items]);
  const totalRecords = history.data?.total ?? 0;

  const metrics = useMemo(() => {
    let cashSalesCents = 0n;
    let refundsCents = 0n;
    let expectedCents = 0n;
    let diffCents = 0n;
    let openCount = 0;

    for (const item of items) {
      if (item.status === 'OPEN') openCount += 1;

      const sales = exactDecimal(item.cash_sales, 2);
      if (sales !== null) cashSalesCents += sales;

      const refunds = exactDecimal(item.cash_refunds ?? '0.00', 2);
      if (refunds !== null) refundsCents += refunds;

      const expected = exactDecimal(item.expected_cash, 2);
      if (expected !== null) expectedCents += expected;

      if (item.difference) {
        const diff = exactDecimal(item.difference, 2);
        if (diff !== null) diffCents += diff;
      }
    }

    const formatMoney = (cents: bigint) => {
      const neg = cents < 0n;
      const abs = neg ? -cents : cents;
      const w = (abs / 100n).toString();
      const f = (abs % 100n).toString().padStart(2, '0');
      return `${neg ? '-' : ''}${moneyText(`${w}.${f}`)}`;
    };

    return {
      openCount,
      totalCashSales: formatMoney(cashSalesCents),
      totalRefunds: formatMoney(refundsCents),
      totalExpected: formatMoney(expectedCents),
      netDifference: formatMoney(diffCents),
      hasShortage: diffCents < 0n,
      hasExcess: diffCents > 0n,
      isBalanced: diffCents === 0n,
    };
  }, [items]);

  const exportCsv = () => {
    if (!items.length) return;
    const headers = [
      t('pos.terminalCashier'),
      t('inventory.time'),
      t('pos.openShift'),
      t('pos.cashSales'),
      t('pos.cashRefunds'),
      t('pos.expected'),
      t('pos.countedCash'),
      t('pos.countedDifference'),
      t('auth.status'),
    ];
    const rows = items.map((item) => [
      `${item.terminal_name} / ${item.cashier_name}`,
      `${item.opened_at}${item.closed_at ? ' - ' + item.closed_at : ''}`,
      item.opening_cash,
      item.cash_sales,
      item.cash_refunds ?? '0.00',
      item.expected_cash,
      item.counted_cash ?? 'â€”',
      item.difference ?? 'â€”',
      item.status,
    ]);
    const csv = [headers, ...rows]
      .map((r) => r.map((c) => `"${String(c).replaceAll('"', '""')}"`).join(','))
      .join('\n');
    try {
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `shift-history-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      /* ignore download errors in test environments */
    }
  };

  return (
    <div className="pos-register-page">
      <StandardPageHeader
        icon={
          section === 'open' ? (
            <Plus size={24} />
          ) : section === 'close' ? (
            <PowerOff size={24} />
          ) : section === 'shifts' ? (
            <ShieldAlert size={24} />
          ) : (
            <Clock size={24} />
          )
        }
        title={
          {
            open: t('pos.openRegisterShift'),
            close: t('pos.closeShiftAndCountCash'),
            history: t('pos.shiftHistory'),
            shifts: t('pos.paymentReview'),
          }[section]
        }
        description={
          {
            open: t('pos.openShiftDescription'),
            close: t('pos.closeShiftDescription'),
            history: t('pos.shiftHistoryDescription'),
            shifts: t('pos.confirmedPaymentsWithIncompleteSalesRequireManual'),
          }[section]
        }
        actions={
          section === 'history' ? (
            <>
              <Button
                className="button-secondary sales-export-btn"
                disabled={history.isFetching}
                onClick={() => void history.refetch()}
              >
                <RotateCcw size={15} aria-hidden="true" />
                <span>{t('pos.refreshAction')}</span>
              </Button>
              <Button
                className="button-secondary sales-export-btn"
                disabled={!items.length}
                onClick={exportCsv}
              >
                <Download size={15} aria-hidden="true" />
                <span>{t('pos.exportData')}</span>
              </Button>
            </>
          ) : undefined
        }
      />

      {section === 'open' && (
        <div className="pos-register-container">
          <Card className="pos-form-card">
            <div className="pos-form-card-header">
              <h3>{t('pos.openRegisterShift')}</h3>
              <p>{t('pos.eachTerminalCanHaveOneOpenShift')}</p>
            </div>
            <div className="pos-form-body">
              <label className="pos-form-field">
                <span>{t('pos.openingCash')} (à¸¿)</span>
                <input
                  aria-label={t('pos.openingCash')}
                  value={cash}
                  inputMode="decimal"
                  onChange={(event) => setCash(event.target.value)}
                />
              </label>
              <Button
                disabled={pos.busy || !pos.terminal || !!pos.shift}
                onClick={() =>
                  void pos.mutate(
                    '/pos/shifts/open',
                    { terminal_id: pos.terminal?.id, opening_cash: cash },
                    'POST',
                    key.current,
                  )
                }
              >
                {t('pos.openRegisterShift')}
              </Button>
            </div>
          </Card>

          {pos.can('pos.terminal.manage') && (
            <Card className="pos-form-card">
              <div className="pos-form-card-header">
                <h3>{t('pos.configureTerminal')}</h3>
              </div>
              <div className="pos-form-body">
                <label className="pos-form-field">
                  <span>{t('pos.terminalCode')}</span>
                  <input
                    value={code}
                    onChange={(event) =>
                      setCode(event.target.value.toUpperCase())
                    }
                  />
                </label>
                <label className="pos-form-field">
                  <span>{t('pos.terminalName')}</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <label className="pos-form-field">
                  <span>{t('pos.sellingStockLocation')}</span>
                  <select
                    value={location}
                    onChange={(event) => setLocation(event.target.value)}
                  >
                    <option value="">{t('pos.selectLocation')}</option>
                    {locations.data?.items
                      .filter((item) => item.type === 'WAREHOUSE')
                      .map((item) => (
                        <option value={item.id} key={item.id}>
                          {item.name} ({item.type})
                        </option>
                      ))}
                  </select>
                </label>
                <Button
                  disabled={pos.busy || !location || !name || !code}
                  onClick={() =>
                    void pos.mutate('/pos/terminals', {
                      branch_id: pos.branch,
                      code,
                      name,
                      stock_location_id: location,
                      status: 'ACTIVE',
                    })
                  }
                >
                  {t('pos.createTerminal')}
                </Button>
              </div>
            </Card>
          )}
        </div>
      )}

      {section === 'close' && (
        <div className="pos-register-container">
          <Card className="pos-form-card">
            {pos.shift ? (
              <>
                <div className="pos-form-card-header">
                  <h3>{t('pos.closeShiftAndCountCash')}</h3>
                </div>
                <div className="pos-shift-summary-grid">
                  <div className="pos-shift-summary-item">
                    <span>{t('pos.openingCash')}</span>
                    <strong>à¸¿{moneyText(pos.shift.opening_cash)}</strong>
                  </div>
                  <div className="pos-shift-summary-item">
                    <span>{t('pos.netCashSales')}</span>
                    <strong>à¸¿{moneyText(pos.shift.cash_sales)}</strong>
                  </div>
                  <div className="pos-shift-summary-item">
                    <span>{t('pos.cashRefunds')}</span>
                    <strong>à¸¿{moneyText(pos.shift.cash_refunds ?? '0.00')}</strong>
                  </div>
                  <div className="pos-shift-summary-item featured">
                    <span>{t('pos.expectedCash')}</span>
                    <strong>à¸¿{moneyText(pos.shift.expected_cash)}</strong>
                  </div>
                </div>
                <p className="pos-form-hint">
                  {t('pos.qrBankTransfersAreExcludedFromThe')}
                </p>
                <div className="pos-form-body">
                  <label className="pos-form-field">
                    <span>{t('pos.countedCash')} (à¸¿)</span>
                    <input
                      aria-label={t('pos.countedCash')}
                      value={cash}
                      inputMode="decimal"
                      onChange={(event) => setCash(event.target.value)}
                    />
                  </label>
                  <Button
                    disabled={pos.busy}
                    onClick={() =>
                      void (async () => {
                        const result = await pos.mutate<POSShift>(
                          `/pos/shifts/${pos.shift?.id}/close`,
                          { counted_cash: cash },
                          'POST',
                          key.current,
                        );
                        if (result)
                          pos.setMessage({
                            key: 'pos.shiftClosedDifferenceValue0Thb',
                            params: { value0: result.difference ?? 'â€”' },
                          });
                      })()
                    }
                  >
                    {t('pos.confirmShiftClosure')}
                  </Button>
                </div>
              </>
            ) : (
              <p className="pos-empty-state">{t('pos.youHaveNoOpenShiftAtThis')}</p>
            )}
          </Card>
        </div>
      )}

      {section === 'history' && (
        <div className="pos-history-view">
          <StandardKpiGrid label={t('pos.salesSummaryRegion')}>
            <StandardKpiCard
              icon={<ClipboardList size={20} />}
              tone="amber"
              label={t('pos.allShifts')}
              value={`${totalRecords} ${t('pos.itemsUnit')}`}
              subtext={t('pos.inThisBranch')}
            />
            <StandardKpiCard
              icon={<CheckCircle2 size={20} />}
              tone="success"
              label={t('pos.openShifts')}
              value={`${metrics.openCount} ${t('pos.itemsUnit')}`}
              subtext={t('pos.activeAndReady')}
            />
            <StandardKpiCard
              icon={<Banknote size={20} />}
              tone="amber"
              label={t('pos.totalCashSales')}
              value={`à¸¿${metrics.totalCashSales}`}
              subtext={`${t('pos.cashRefunds')}: à¸¿${metrics.totalRefunds}`}
            />
            <StandardKpiCard
              icon={<Coins size={20} />}
              tone={
                metrics.hasShortage
                  ? 'danger'
                  : metrics.hasExcess
                    ? 'info'
                    : 'success'
              }
              label={t('pos.cashDifference')}
              value={`${metrics.netDifference} à¸¿`}
              subtext={
                metrics.hasShortage
                  ? t('pos.cashShortageDetected')
                  : metrics.hasExcess
                    ? t('pos.cashExcessDetected')
                    : t('pos.exactBalanceMatched')
              }
              trendWarn={metrics.hasShortage}
            />
          </StandardKpiGrid>

          <Card className="pos-history-filter-card">
            <div className="pos-history-filter-row">
              <StandardStatusTabs
                ariaLabel={t('auth.status')}
                value={statusFilter}
                onChange={(nextKey) => {
                  setStatusFilter(nextKey);
                  setPage(1);
                }}
                tabs={[
                  {
                    key: '',
                    label: t('common.all') || 'à¸—à¸±à¹‰à¸‡à¸«à¸¡à¸”',
                    count: totalRecords,
                    icon: <ClipboardList size={15} />,
                  },
                  {
                    key: 'OPEN',
                    label: t('pos.openShifts'),
                    count: metrics.openCount,
                    icon: <Clock size={15} />,
                  },
                  {
                    key: 'CLOSED',
                    label: t('pos.closedShifts'),
                    count: Math.max(0, totalRecords - metrics.openCount),
                    icon: <CheckCircle2 size={15} />,
                  },
                ]}
              />

              <div className="pos-history-filters">
                <label className="pos-terminal-filter-label">
                  <Monitor size={15} aria-hidden="true" />
                  <span>{t('pos.terminal')}</span>
                  <select
                    value={terminalFilter}
                    aria-label={t('pos.terminal')}
                    onChange={(event) => {
                      setTerminalFilter(event.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">{t('common.all') || 'à¸—à¸±à¹‰à¸‡à¸«à¸¡à¸”'}</option>
                    {pos.terminals.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name} Â· {item.code}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          </Card>

          <Card className="pos-table-card">
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label={t('pos.shiftHistory')}
            >
              <table className="record-table pos-history-table">
                <thead>
                  <tr>
                    <th>{t('pos.terminalCashier')}</th>
                    <th>{t('inventory.time')}</th>
                    <th className="amount-col">{t('pos.openShift')}</th>
                    <th className="amount-col">{t('pos.cashSales')}</th>
                    <th className="amount-col">{t('pos.cashRefunds')}</th>
                    <th className="amount-col">{t('pos.expected')}</th>
                    <th className="amount-col">{t('pos.countedDifference')}</th>
                    <th>{t('auth.status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="pos-table-primary">
                          <span className="pos-table-icon" aria-hidden="true">
                            <Monitor size={16} />
                          </span>
                          <div>
                            <strong>{item.terminal_name || t('pos.terminal')}</strong>
                            <p className="pos-table-sub">{item.cashier_name || 'â€”'}</p>
                          </div>
                        </div>
                      </td>
                      <td>
                        <div className="pos-time-cell">
                          <span>{formatDateTime(item.opened_at)}</span>
                          {item.closed_at ? (
                            <p className="pos-table-sub">{formatDateTime(item.closed_at)}</p>
                          ) : (
                            <span className="pos-shift-live-badge">
                              {t('pos.shiftOngoing')}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="amount-col">à¸¿{moneyText(item.opening_cash)}</td>
                      <td className="amount-col">à¸¿{moneyText(item.cash_sales)}</td>
                      <td className="amount-col">à¸¿{moneyText(item.cash_refunds ?? '0.00')}</td>
                      <td className="amount-col font-semibold">à¸¿{moneyText(item.expected_cash)}</td>
                      <td className="amount-col">
                        {item.counted_cash !== null ? (
                          <div className="pos-counted-cell">
                            <span>à¸¿{moneyText(item.counted_cash)}</span>
                            <span
                              className={`pos-diff-badge ${
                                !item.difference || item.difference === '0.00'
                                  ? 'is-exact'
                                  : item.difference.startsWith('-')
                                    ? 'is-short'
                                    : 'is-excess'
                              }`}
                            >
                              {!item.difference || item.difference === '0.00'
                                ? `(${t('pos.exactBalanceMatched')})`
                                : `${item.difference} à¸¿`}
                            </span>
                          </div>
                        ) : (
                          <span className="pos-table-sub">â€”</span>
                        )}
                      </td>
                      <td>
                        <span
                          className={`pos-shift-status-pill ${
                            item.status === 'OPEN' ? 'is-open' : 'is-closed'
                          }`}
                        >
                          <span
                            className={`status-dot ${item.status === 'OPEN' ? 'green' : 'gray'}`}
                            aria-hidden="true"
                          />
                          <span>
                            {item.status === 'OPEN'
                              ? t('pos.shiftOpen')
                              : t('pos.closeShift')}
                          </span>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <QueryFeedback
                loading={history.isFetching}
                error={history.error}
                empty={history.data?.total === 0}
                emptyMessage={t('pos.noShiftHistoryInThisBranchYet')}
                retry={() => void history.refetch()}
              />
            </div>

            <StandardPaginationBar
              page={page}
              total={history.data?.total ?? 0}
              pageSize={pageSize}
              currentCount={items.length}
              loading={history.isFetching}
              onPageChange={setPage}
              onPageSizeChange={(newSize) => {
                setPageSize(newSize);
                setPage(1);
              }}
            />
          </Card>
        </div>
      )}

      {section === 'shifts' && (
        <div className="pos-reconciliation-view">
          <p className="pos-reconciliation-intro">
            {t('pos.confirmedPaymentsWithIncompleteSalesRequireManual')}
          </p>
          {pos.can('pos.payment.reconcile') && (
            <label className="pos-reconciliation-note">
              <span>{t('pos.recordReviewEvidenceExternalRefund')}</span>
              <input
                value={note}
                maxLength={2000}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
          )}
          {payments.data?.items
            .filter((item) =>
              [
                'AWAITING_PAYMENT',
                'CONFIRMED',
                'RECONCILIATION_REQUIRED',
              ].includes(item.status),
            )
            .map((item) => (
              <Card key={item.id} className="pos-payment-review-card">
                <p>
                  {item.id} Â· {labelCode(item.status)} Â·{' '}
                  {localize(paymentLabels[item.method])}
                </p>
                <strong className="pos-payment-review-total">
                  {item.total} {t('loyalty.thb')}
                </strong>
                <p>
                  {t('pos.reference')} {item.reference || 'â€”'} Â·{' '}
                  {item.failure_code}
                </p>
                {item.status === 'AWAITING_PAYMENT' ? (
                  <Button
                    disabled={pos.busy}
                    onClick={() =>
                      void pos.mutate(`/pos/checkouts/${item.id}/cancel`, {})
                    }
                  >
                    {t('pos.cancelBeforeReceivingFunds')}
                  </Button>
                ) : (
                  <div className="pos-payment-review-actions">
                    <Button
                      disabled={pos.busy}
                      onClick={() =>
                        void (async () => {
                          const result = await pos.mutate<POSCheckout>(
                            `/pos/checkouts/${item.id}/complete`,
                            {},
                          );
                          if (result)
                            pos.setMessage(
                              result.status === 'COMPLETED'
                                ? t('pos.saleCompleted')
                                : {
                                    key: 'pos.reviewStillRequiredValue0',
                                    params: { value0: result.failure_code },
                                  },
                            );
                        })()
                      }
                    >
                      {t('pos.retryTheSameSale')}
                    </Button>
                    {pos.can('pos.payment.reconcile') && (
                      <Button
                        disabled={pos.busy || !note.trim()}
                        onClick={() =>
                          void pos.mutate(`/pos/checkouts/${item.id}/resolve`, {
                            acknowledged: true,
                            note,
                          })
                        }
                      >
                        {t('pos.confirmPaymentReviewCompleted')}
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            ))}
          <QueryFeedback
            loading={payments.isFetching}
            error={payments.error}
            empty={payments.data?.total === 0}
            emptyMessage={t('pos.noPaymentRecordsInThisBranchYet')}
            retry={() => void payments.refetch()}
          />

          <POSPagination
            page={page}
            total={payments.data?.total ?? 0}
            busy={payments.isFetching}
            change={setPage}
          />
        </div>
      )}
    </div>
  );
}
