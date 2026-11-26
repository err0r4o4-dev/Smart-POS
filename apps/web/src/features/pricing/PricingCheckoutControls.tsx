import { useLanguage } from '../../app/language';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { WorkspaceLink as Link } from '../../app/WorkspaceNavigation';
import { Button } from '../../components/ui/primitives';
import { usePOS } from '../pos/POSContext';
import {
  pricingRequest,
  type DiscountApproval,
  type PricingQuote,
} from '../../lib/pricing-api';
export interface PricingSelection {
  cartID: string;
  cartRevision: number;
  baseRevision: string;
  approvalID: string;
  quote: PricingQuote;
}
export function PricingCheckoutControls({
  onSelection,
  locked,
}: {
  onSelection: (value: PricingSelection) => void;
  locked: boolean;
}) {
  const { t, localize } = useLanguage();

  const pos = usePOS(),
    [amount, setAmount] = useState(''),
    [reason, setReason] = useState(''),
    [approval, setApproval] = useState(''),
    [error, setError] = useState('');
  const approvals = useQuery({
    queryKey: [
      'tenant',
      pos.user,
      pos.org,
      'pricing',
      'checkout-approvals',
      pos.cart?.id,
    ],
    queryFn: ({ signal }) =>
      pricingRequest<DiscountApproval[]>(pos.org, '/discount-approvals', {
        signal,
      }),
    enabled: !!pos.cart,
    refetchInterval: 10000,
  });
  const select = async (id: string) => {
    setError('');
    try {
      const quote = await pricingRequest<PricingQuote>(
        pos.org,
        `/pos/carts/${pos.cart?.id}/quote${id ? '?approval_id=' + id : ''}`,
      );
      if (pos.cart) {
        setApproval(id);
        onSelection({
          cartID: pos.cart.id,
          cartRevision: pos.cart.revision,
          baseRevision: pos.cart.pricing?.revision ?? '',
          approvalID: id,
          quote,
        });
      }
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : t('pricing.pricingUnavailable'),
      );
    }
  };
  const request = async () => {
    if (!pos.cart?.pricing) return;
    const result = await pos.mutate('/discount-approvals', {
      cart_id: pos.cart.id,
      revision: pos.cart.revision,
      pricing_revision: pos.cart.pricing.revision,
      amount,
      reason,
    });
    if (result) {
      await approvals.refetch();
      pos.setMessage(t('pricing.discountRequested'));
    }
  };
  return (
    <section>
      <h3>{t('pricing.pricingQuote')}</h3>
      <p>
        {t('pos.beforeDiscount')}{' '}
        {pos.cart?.pricing?.subtotal ?? pos.cart?.total} {t('pos.discount')}{' '}
        {pos.cart?.pricing?.discount ?? '0.00'} THB
      </p>
      {pos.cart?.pricing?.promotions.map((item) => (
        <p key={item.id}>
          {item.name} −{item.discount} THB
        </p>
      ))}
      <Link to="/discount-approvals">{t('pricing.approvalQueue')}</Link>
      <label>
        {t('pricing.approvedDiscount')}
        <select
          value={approval}
          disabled={locked || pos.busy}
          onChange={(event) => void select(event.target.value)}
        >
          <option value="">{t('pricing.none')}</option>
          {approvals.data
            ?.filter(
              (item) =>
                item.status === 'APPROVED' &&
                item.cart_id === pos.cart?.id &&
                item.cart_revision === pos.cart?.revision,
            )
            .map((item) => (
              <option key={item.id} value={item.id}>
                {item.amount} THB · {item.reason}
              </option>
            ))}
        </select>
      </label>
      {pos.can('discount.request') && (
        <div>
          <label>
            {t('pricing.requestedDiscountThb')}
            <input
              inputMode="decimal"
              value={amount}
              disabled={locked}
              onChange={(event) => setAmount(event.target.value)}
            />
          </label>
          <label>
            {t('pricing.reason')}
            <input
              value={reason}
              maxLength={2000}
              disabled={locked}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <Button
            disabled={locked || pos.busy || !amount || !reason.trim()}
            onClick={() => void request()}
          >
            {t('pricing.requestDiscount')}
          </Button>
        </div>
      )}
      {(error || approvals.error) && (
        <p role="alert">
          {localize((error || approvals.error?.message) ?? '')}
        </p>
      )}
    </section>
  );
}
