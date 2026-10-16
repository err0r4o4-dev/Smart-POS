import { useLanguage } from '../../app/language';
import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Card } from '../../components/ui/primitives';
import {
  posRequest,
  moneyText,
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
    ],
    queryFn: ({ signal }) =>
      posRequest<POSPage<POSShift>>(
        pos.org,
        `/pos/shifts?branch_id=${pos.branch}&page=${page}`,
        { signal },
      ),
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
  return (
    <>
      <h1>
        {
          {
            open: t('pos.openRegisterShift'),
            close: t('pos.closeShiftAndCountCash'),
            history: t('pos.shiftHistory'),
            shifts: t('pos.paymentReview'),
          }[section]
        }
      </h1>
      {section === 'open' && (
        <>
          <Card>
            <p>{t('pos.eachTerminalCanHaveOneOpenShift')}</p>
            <label>
              {t('pos.openingCash')}
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
          </Card>
          {pos.can('pos.terminal.manage') && (
            <Card>
              <h2>{t('pos.configureTerminal')}</h2>
              <label>
                {t('pos.terminalCode')}
                <input
                  value={code}
                  onChange={(event) =>
                    setCode(event.target.value.toUpperCase())
                  }
                />
              </label>
              <label>
                {t('pos.terminalName')}
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label>
                {t('pos.sellingStockLocation')}
                <select
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                >
                  <option value="">{t('pos.selectLocation')}</option>
                  {locations.data?.items
                    .filter((item) =>
                      ['WAREHOUSE', 'SALES_FLOOR', 'SHELF'].includes(item.type),
                    )
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
            </Card>
          )}
        </>
      )}
      {section === 'close' && (
        <Card>
          {pos.shift ? (
            <>
              <p>
                {t('pos.openingCash')} {moneyText(pos.shift.opening_cash)}
              </p>
              <p>
                {t('pos.netCashSales')} {moneyText(pos.shift.cash_sales)}
              </p>
              <p>
                {t('pos.cashRefunds')}{' '}
                {moneyText(pos.shift.cash_refunds ?? '0.00')}
              </p>
              <strong>
                {t('pos.expectedCash')} {moneyText(pos.shift.expected_cash)}{' '}
                {t('loyalty.thb')}
              </strong>
              <p>{t('pos.qrBankTransfersAreExcludedFromThe')}</p>
              <label>
                {t('pos.countedCash')}
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
                        params: { value0: result.difference ?? '—' },
                      });
                  })()
                }
              >
                {t('pos.confirmShiftClosure')}
              </Button>
            </>
          ) : (
            <p>{t('pos.youHaveNoOpenShiftAtThis')}</p>
          )}
        </Card>
      )}
      {section === 'history' && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t('pos.terminalCashier')}</th>
                <th>{t('inventory.time')}</th>
                <th>{t('pos.openShift')}</th>
                <th>{t('pos.cashSales')}</th>
                <th>{t('pos.cashRefunds')}</th>
                <th>{t('pos.expected')}</th>
                <th>{t('pos.countedDifference')}</th>
                <th>{t('auth.status')}</th>
              </tr>
            </thead>
            <tbody>
              {history.data?.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.terminal_name}
                    <br />
                    {item.cashier_name}
                  </td>
                  <td>
                    {formatDateTime(item.opened_at)}
                    <br />
                    {item.closed_at && formatDateTime(item.closed_at)}
                  </td>
                  <td>{item.opening_cash}</td>
                  <td>{item.cash_sales}</td>
                  <td>{item.cash_refunds ?? '0.00'}</td>
                  <td>{item.expected_cash}</td>
                  <td>
                    {item.counted_cash ?? '?'} / {item.difference ?? '?'}
                  </td>
                  <td>{labelCode(item.status)}</td>
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
      )}
      {section === 'shifts' && (
        <>
          <p>{t('pos.confirmedPaymentsWithIncompleteSalesRequireManual')}</p>
          {pos.can('pos.payment.reconcile') && (
            <label>
              {t('pos.recordReviewEvidenceExternalRefund')}
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
              <Card key={item.id}>
                <p>
                  {item.id} · {labelCode(item.status)} ·{' '}
                  {localize(paymentLabels[item.method])}
                </p>
                <strong>
                  {item.total} {t('loyalty.thb')}
                </strong>
                <p>
                  {t('pos.reference')} {item.reference || '—'} ·{' '}
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
                  <>
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
                  </>
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
        </>
      )}
      {['history', 'shifts'].includes(section) && (
        <POSPagination
          page={page}
          total={
            (section === 'history' ? history.data : payments.data)?.total ?? 0
          }
          busy={history.isFetching || payments.isFetching}
          change={setPage}
        />
      )}
    </>
  );
}
