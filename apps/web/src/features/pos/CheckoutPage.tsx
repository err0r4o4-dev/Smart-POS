import { useLanguage } from '../../app/language';
import { useRef, useState } from 'react';
import { WorkspaceLink as Link } from '../../app/WorkspaceNavigation';
import { useQuery } from '@tanstack/react-query';
import { Button, Card } from '../../components/ui/primitives';
import {
  PricingCheckoutControls,
  type PricingSelection,
} from '../pricing/PricingCheckoutControls';
import {
  posRequest,
  moneyText,
  exactDecimal,
  paymentLabels,
  type POSPage,
  type POSCheckout,
  type PaymentMethod,
} from '../../lib/pos-api';
import { usePOS } from './POSContext';
import { QueryFeedback } from '../../components/feedback/QueryFeedback';
import { LoyaltyCheckoutControls } from '../loyalty/LoyaltyCheckoutControls';

export function CheckoutPage() {
  const { t, localize, labelCode } = useLanguage();

  const pos = usePOS();
  const [pricingSelection, setPricingSelection] = useState<PricingSelection>();
  const currentSelection =
    pricingSelection?.cartID === pos.cart?.id &&
    pricingSelection?.cartRevision === pos.cart?.revision &&
    pricingSelection?.baseRevision === pos.cart?.pricing?.revision
      ? pricingSelection
      : undefined;
  const payable = currentSelection?.quote.total ?? pos.cart?.total ?? '0.00';
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [received, setReceived] = useState('');
  const [reference, setReference] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [selected, setSelected] = useState<POSCheckout>();
  const request = useRef<{ key: string; body: object } | null>(null);
  const [requestLocked, setRequestLocked] = useState(false);
  const confirmKey = useRef(crypto.randomUUID());
  const quickPresets = (() => {
    const payDec = exactDecimal(payable, 2);
    if (payDec === null || payDec <= 0n) return [];
    const list: string[] = [];
    const denominations = [50n, 100n, 500n, 1000n];
    for (const denom of denominations) {
      const val = denom * 100n;
      if (val > payDec) {
        list.push(`${denom}.00`);
      }
    }
    if (payDec > 100000n) {
      const nextThou = ((payDec + 99999n) / 100000n) * 1000n;
      const nextStr = `${nextThou}.00`;
      if (!list.includes(nextStr)) {
        list.push(nextStr);
      }
    }
    return list;
  })();
  const changeCalculation = (() => {
    if (!received.trim()) return null;
    const payDec = exactDecimal(payable, 2);
    const recDec = exactDecimal(received.trim(), 2);
    if (payDec === null || recDec === null) return null;
    const diff = recDec - payDec;
    if (diff >= 0n) {
      const whole = diff / 100n;
      const frac = (diff % 100n).toString().padStart(2, '0');
      return { valid: true, amount: `${whole}.${frac}` };
    } else {
      const shortage = -diff;
      const whole = shortage / 100n;
      const frac = (shortage % 100n).toString().padStart(2, '0');
      return { valid: false, amount: `${whole}.${frac}` };
    }
  })();
  const pending = useQuery({
    queryKey: [
      'tenant',
      pos.user,
      pos.org,
      'pos',
      pos.branch,
      'pending',
      pos.terminal?.id,
    ],
    queryFn: ({ signal }) =>
      posRequest<POSPage<POSCheckout>>(
        pos.org,
        `/pos/checkouts?branch_id=${pos.branch}&terminal_id=${pos.terminal?.id}`,
        { signal },
      ),
    enabled: !!pos.terminal,
  });
  const checkout =
    selected ??
    pending.data?.items.find(
      (item) =>
        item.cart_id === pos.cart?.id &&
        ['AWAITING_PAYMENT', 'CONFIRMED', 'RECONCILIATION_REQUIRED'].includes(
          item.status,
        ),
    );
  const prepare = async () => {
    if (!pos.cart || pending.isPending || pending.isError) return;
    setRequestLocked(true);
    if (!request.current)
      request.current = {
        key: crypto.randomUUID(),
        body: {
          cart_id: pos.cart.id,
          revision: pos.cart.revision,
          method: payable === '0.00' ? 'NONE' : method,
          expected_total: payable,
          received:
            payable === '0.00'
              ? '0.00'
              : method === 'CASH'
                ? received
                : payable,
          pricing_revision:
            currentSelection?.quote.revision ?? pos.cart.pricing?.revision,
          approval_id: currentSelection?.approvalID ?? '',
          loyalty_points: currentSelection?.quote.loyalty?.points ?? 0,
        },
      };
    const result = await pos.mutate<POSCheckout>(
      '/pos/checkout',
      request.current.body,
      'POST',
      request.current.key,
    );
    if (result) setSelected(result);
  };
  const confirm = async () => {
    if (!checkout) return;
    const result = await pos.mutate<POSCheckout>(
      `/pos/payments/${checkout.id}/confirm`,
      { acknowledged, reference },
      'POST',
      confirmKey.current,
    );
    if (result) setSelected(result);
  };
  const complete = async () => {
    if (!checkout) return;
    const result = await pos.mutate<POSCheckout>(
      `/pos/checkouts/${checkout.id}/complete`,
      {},
    );
    if (result) {
      setSelected(result);
      if (result.status === 'COMPLETED') {
        pos.setCart('');
        pos.setMessage(t('pos.saleCompletedAndStockPostedPrintingDoes'));
      }
    }
  };
  return (
    <>
      <h1>{t('pos.checkout')}</h1>
      <QueryFeedback
        loading={pending.isFetching}
        error={pending.error}
        retry={() => void pending.refetch()}
      />
      <Card className="pos-checkout">
        <p>
          {t('customers.customer')}{' '}
          {checkout?.customer_code_snapshot ||
            pos.cart?.customer?.code ||
            t('pos.walkIn')}
        </p>
        <p>{t('pos.finalPricesComeFromTheServerPricing')}</p>
        {!checkout ? (
          <>
            <strong className="pos-total">
              {t('pos.total')} {moneyText(payable)} {t('loyalty.thb')}
            </strong>
            <LoyaltyCheckoutControls
              locked={requestLocked || !!checkout}
              onSelection={setPricingSelection}
            />
            <PricingCheckoutControls
              key={[
                pos.cart?.id,
                pos.cart?.revision,
                pos.cart?.pricing?.revision,
              ].join(':')}
              locked={requestLocked}
              onSelection={setPricingSelection}
            />
            <label>
              {t('pos.paymentMethod')}
              <select
                value={method}
                disabled={pos.busy || requestLocked}
                onChange={(event) =>
                  setMethod(event.target.value as PaymentMethod)
                }
              >
                {Object.entries(paymentLabels)
                  .filter(
                    ([value]) =>
                      value !== 'EXCHANGE_CREDIT' && value !== 'NONE',
                  )
                  .map(([value, label]) => (
                    <option value={value} key={value}>
                      {localize(label ?? '')}
                    </option>
                  ))}
              </select>
            </label>
            {method === 'CASH' && (
              <div className="pos-cash-field">
                <label>
                  {t('pos.amountReceived')}
                  <input
                    aria-label={t('pos.amountReceived')}
                    inputMode="decimal"
                    value={received}
                    disabled={pos.busy || requestLocked}
                    onChange={(event) => setReceived(event.target.value)}
                  />
                </label>
                <div
                  className="quick-cash-buttons"
                  role="group"
                  aria-label={t('pos.quickCashAmounts')}
                >
                  <button
                    type="button"
                    className="quick-cash-btn"
                    disabled={pos.busy || requestLocked}
                    onClick={() => setReceived(payable)}
                  >
                    {t('pos.exactAmount')}
                    {moneyText(payable)})
                  </button>
                  {quickPresets.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      className="quick-cash-btn"
                      disabled={pos.busy || requestLocked}
                      onClick={() => setReceived(amt)}
                    >
                      {moneyText(amt)}
                    </button>
                  ))}
                </div>
                {changeCalculation && (
                  <div
                    className={`pos-change-hint ${changeCalculation.valid ? 'change-valid' : 'change-short'}`}
                    role="status"
                  >
                    {changeCalculation.valid ? (
                      <span>
                        {t('pos.change')}{' '}
                        <strong>
                          {moneyText(changeCalculation.amount)}{' '}
                          {t('loyalty.thb')}
                        </strong>
                      </span>
                    ) : (
                      <span>
                        {t('pos.stillDue')}{' '}
                        <strong>
                          {moneyText(changeCalculation.amount)}{' '}
                          {t('loyalty.thb')}
                        </strong>
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
            <Button
              disabled={
                pos.busy ||
                pending.isPending ||
                pending.isError ||
                !pos.cart?.items.length ||
                !pos.shift
              }
              onClick={() => void prepare()}
            >
              {t('pos.reviewTotalAndPreparePayment')}
            </Button>
            {requestLocked && (
              <Button
                disabled={pos.busy}
                onClick={() => {
                  request.current = null;
                  setRequestLocked(false);
                  pos.setMessage(t('pos.youCanEditAgainTheServerPrevents'));
                }}
              >
                {t('pos.editAfterCheckingStatus')}
              </Button>
            )}
          </>
        ) : (
          <>
            <p>
              {t('catalog.definitions')} {checkout.id} {t('pos.status')}{' '}
              <strong>{labelCode(checkout.status)}</strong>
            </p>
            <p>{localize(paymentLabels[checkout.method])}</p>
            <strong className="pos-total">
              {moneyText(checkout.total)} {t('loyalty.thb')}
            </strong>
            <p>
              {t('pos.amountReceived')} {moneyText(checkout.received)}{' '}
              {t('pos.change2')} {moneyText(checkout.change)}
            </p>
            {checkout.status === 'AWAITING_PAYMENT' && (
              <>
                <p className="notice">
                  {t('pos.verifyActualFundsBeforeConfirmingNoBank')}
                </p>
                {checkout.method !== 'CASH' && (
                  <label>
                    {t('pos.paymentReference')}
                    <input
                      aria-label={t('pos.paymentReference')}
                      value={reference}
                      maxLength={200}
                      onChange={(event) => setReference(event.target.value)}
                    />
                  </label>
                )}
                <label className="pos-checkbox">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(event) => setAcknowledged(event.target.checked)}
                  />
                  {t('pos.iVerifiedThatActualFundsWereReceived')}
                </label>
                <Button
                  disabled={
                    pos.busy ||
                    !acknowledged ||
                    (checkout.method !== 'CASH' && !reference.trim())
                  }
                  onClick={() => void confirm()}
                >
                  {t('pos.confirmActualFundsReceived')}
                </Button>
                <Button
                  disabled={pos.busy}
                  onClick={() =>
                    void (async () => {
                      const result = await pos.mutate<POSCheckout>(
                        `/pos/checkouts/${checkout.id}/cancel`,
                        {},
                      );
                      if (result) {
                        setSelected(undefined);
                        request.current = null;
                        setRequestLocked(false);
                        confirmKey.current = crypto.randomUUID();
                      }
                    })()
                  }
                >
                  {t('pos.cancelBeforeReceivingFunds')}
                </Button>
              </>
            )}
            {['CONFIRMED', 'RECONCILIATION_REQUIRED'].includes(
              checkout.status,
            ) && (
              <>
                <p role="status">
                  {checkout.method === 'NONE'
                    ? t('pos.zeroNetTotalNoFundsAreCollected')
                    : t('pos.fundsConfirmedTheSaleIsNotCompleted')}
                </p>
                {checkout.failure_code && (
                  <p role="alert">
                    {checkout.failure_code}{' '}
                    {t('pos.paymentEvidenceRemainsReviewItAndDo')}
                  </p>
                )}
                <Button disabled={pos.busy} onClick={() => void complete()}>
                  {checkout.status === 'CONFIRMED'
                    ? t('pos.saveSaleAndPostStock')
                    : t('pos.retrySavingTheSameSale')}
                </Button>
                <Link to="/pos/shifts">{t('pos.reviewPendingPayments')}</Link>
              </>
            )}
            {checkout.status === 'COMPLETED' && (
              <>
                <p role="status">{t('pos.saleCompleted')}</p>
                <Link to={`/sales/${checkout.sale_id}`}>
                  {t('pos.viewSaleAndPrintReceipt')}
                </Link>
                <Button
                  onClick={() => {
                    setSelected(undefined);
                    request.current = null;
                    setRequestLocked(false);
                    confirmKey.current = crypto.randomUUID();
                    setReceived('');
                    setReference('');
                    setAcknowledged(false);
                  }}
                >
                  {t('pos.startNewSale')}
                </Button>
              </>
            )}
          </>
        )}
      </Card>
    </>
  );
}
