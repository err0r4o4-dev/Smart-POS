import { useLanguage } from '../../app/language';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '../../components/ui/primitives';
import { Field } from '../purchasing/SupplyUI';
import { usePOS } from '../pos/POSContext';
import {
  loyaltyRequest,
  type LoyaltyAccount,
  type LoyaltyPage,
} from '../../lib/loyalty-api';
import { posRequest } from '../../lib/pos-api';
import type { PricingQuote } from '../../lib/pricing-api';
import type { PricingSelection } from '../pricing/PricingCheckoutControls';

export function LoyaltyCheckoutControls({
  locked,
  onSelection,
}: {
  locked: boolean;
  onSelection: (value: PricingSelection) => void;
}) {
  const { t, localize, labelCode } = useLanguage();

  const pos = usePOS(),
    [points, setPoints] = useState(''),
    [error, setError] = useState('');
  const customer = pos.cart?.customer_id;
  const account = useQuery({
    queryKey: [
      'tenant',
      pos.user,
      pos.org,
      pos.branch,
      'loyalty-checkout',
      customer,
      pos.can('loyalty.redeem'),
    ],
    queryFn: ({ signal }) =>
      loyaltyRequest<LoyaltyPage<LoyaltyAccount>>(
        pos.org,
        `/loyalty/accounts?customer_id=${customer}`,
        { signal },
      ),
    enabled: !!customer && pos.can('loyalty.read'),
    retry: false,
  });
  if (!customer || !pos.can('loyalty.redeem')) return null;
  const selected = account.data?.items[0];
  const apply = async () => {
    const cart = pos.cart;
    if (!cart?.pricing) return;
    setError('');
    try {
      const quote = await posRequest<PricingQuote>(
        pos.org,
        `/pos/carts/${cart.id}/quote?loyalty_points=${encodeURIComponent(points || '0')}`,
      );
      onSelection({
        cartID: cart.id,
        cartRevision: cart.revision,
        baseRevision: cart.pricing.revision,
        approvalID: '',
        quote,
      });
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : t('loyalty.loyaltyUnavailable'),
      );
    }
  };
  return (
    <section aria-label={t('loyalty.loyaltyPoints')}>
      <h2>{t('loyalty.redeemPoints')}</h2>
      {selected ? (
        <p>
          {t('loyalty.available')} {selected.available} ·{' '}
          {labelCode(selected.status)} / {selected.program_status}
        </p>
      ) : (
        <p>{t('loyalty.notEnrolled')}</p>
      )}
      <p>{t('loyalty.discountNotPaymentNoPromotionStacking')}</p>
      <Field label={t('loyalty.integerPoints')}>
        <input
          inputMode="numeric"
          pattern="[0-9]+"
          value={points}
          disabled={locked || !selected}
          onChange={(event) => setPoints(event.target.value)}
        />
      </Field>
      <Button
        disabled={
          locked ||
          pos.busy ||
          !selected ||
          selected.status !== 'ACTIVE' ||
          selected.program_status !== 'ACTIVE' ||
          !/^[0-9]+$/.test(points || '0')
        }
        onClick={() => void apply()}
      >
        {t('loyalty.applyPoints')}
      </Button>
      {(error || account.error) && (
        <p role="alert">{localize((error || account.error?.message) ?? '')}</p>
      )}
    </section>
  );
}
