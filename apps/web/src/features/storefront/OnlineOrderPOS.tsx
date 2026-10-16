import { useLanguage } from '../../app/language';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { WorkspaceLink as Link } from '../../app/WorkspaceNavigation';
import { useWorkspaceNavigate } from '../../app/useWorkspaceNavigate';
import { Button, Card, Loading } from '../../components/ui/primitives';
import { posRequest, moneyText, type POSCart } from '../../lib/pos-api';
import type { OnlineOrder } from '../../lib/storefront-api';
import { usePOS } from '../pos/POSContext';
import { ShopError } from './StorefrontPage';

export function OnlineOrderPOS() {
  const { t } = useLanguage();

  const pos = usePOS();
  const navigate = useWorkspaceNavigate();
  const [params] = useSearchParams();
  const id = params.get('online_order') ?? '';
  const order = useQuery({
    queryKey: [
      'tenant',
      pos.user,
      pos.org,
      pos.branch,
      'online-order-entry',
      id,
    ],
    queryFn: ({ signal }) =>
      posRequest<OnlineOrder>(pos.org, `/online-orders/${id}`, { signal }),
    enabled: !!id && pos.can('online_orders.read'),
    retry: false,
  });
  if (!id) return null;
  if (!pos.can('online_orders.read'))
    return (
      <ShopError
        error={new Error(t('storefront.youDoNotHaveAccessToOnline'))}
      />
    );
  if (order.isPending)
    return <Loading>{t('storefront.checkingOnlineOrder')}</Loading>;
  if (order.error || !order.data)
    return <ShopError error={order.error} retry={() => void order.refetch()} />;
  const value = order.data;
  const sourceMatches = pos.terminal?.id === value.terminal_id;
  const occupied = !!pos.cart?.items.length && pos.cart.id !== value.cart_id;
  return (
    <Card className="online-pos-entry">
      <h2>
        {t('storefront.pickup')} {value.number}
      </h2>
      <p>
        {value.customer_name} {t('storefront.estimatedOrderTotal')}
        {moneyText(value.estimated_total)}
      </p>
      <p>{t('storefront.reviewItemsLotsStockAndTheLatest')}</p>
      {value.status !== 'READY' && (
        <p role="alert">{t('storefront.thisOrderIsNotReadyForPickup')}</p>
      )}
      {!sourceMatches && (
        <Button
          className="button-secondary"
          disabled={
            pos.busy ||
            !pos.terminals.some((terminal) => terminal.id === value.terminal_id)
          }
          onClick={() =>
            value.terminal_id && pos.setTerminal(value.terminal_id)
          }
        >
          {t('storefront.selectTheOrderSTerminal')}
        </Button>
      )}
      {!sourceMatches &&
        !pos.terminals.some(
          (terminal) => terminal.id === value.terminal_id,
        ) && (
          <p role="status">{t('storefront.selectTheOrderSBranchUsingThe')}</p>
        )}
      {sourceMatches && !pos.shift && (
        <p>
          {t('pos.youMust')}{' '}
          <Link to="/pos/register/open">{t('pos.openYourRegisterShift')}</Link>{' '}
          {t('storefront.thenReopenTheOrderFromTheList')}
        </p>
      )}
      {occupied && (
        <p role="status">{t('storefront.holdOrCancelTheCurrentCartFirst')}</p>
      )}
      <div className="shop-actions">
        <Button
          disabled={
            pos.busy ||
            !sourceMatches ||
            !pos.shift ||
            occupied ||
            value.status !== 'READY' ||
            !pos.can('online_orders.manage')
          }
          onClick={() =>
            void (async () => {
              const cart = await pos.mutate<POSCart>(
                `/online-orders/${value.id}/pos-cart`,
                { revision: value.revision },
              );
              if (!cart) return;
              pos.setCart(cart.id);
              pos.setMessage({
                key: 'storefront.openedValue0InPosReviewTheTotal',
                params: { value0: value.number },
              });
              navigate('/pos');
            })()
          }
        >
          {t('storefront.openThisOrderSCart')}
        </Button>
        <Link to={`/online-orders/${value.id}`}>
          {t('storefront.backToOrderDetails')}
        </Link>
      </div>
    </Card>
  );
}
