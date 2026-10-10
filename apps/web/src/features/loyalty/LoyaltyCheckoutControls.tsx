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
        problem instanceof Error ? problem.message : 'Loyalty unavailable',
      );
    }
  };
  return (
    <section aria-label="แต้มสมาชิก / Loyalty points">
      <h2>แลกแต้ม / Redeem points</h2>
      {selected ? (
        <p>
          แต้มใช้ได้ / Available: {selected.available} · {selected.status} /{' '}
          {selected.program_status}
        </p>
      ) : (
        <p>ยังไม่สมัครสมาชิก / Not enrolled</p>
      )}
      <p>
        เป็นส่วนลด ไม่ใช่การชำระเงิน ไม่ซ้อนโปรโมชั่น / Discount, not payment.
        No promotion stacking.
      </p>
      <Field label="แต้มจำนวนเต็ม / Integer points">
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
        ใช้แต้ม / Apply points
      </Button>
      {(error || account.error) && (
        <p role="alert">{error || account.error?.message}</p>
      )}
    </section>
  );
}
