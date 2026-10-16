import { useLanguage } from '../../app/language';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Loading } from '../../components/ui/primitives';
import { storefrontRequest, type OnlineOrder } from '../../lib/storefront-api';
import { ShopError } from './StorefrontPage';
import { OrderDetails } from './OrderDetails';

export function ShopTrackingPage() {
  const { t } = useLanguage();

  const { slug = '', orderId = '' } = useParams();
  const { hash } = useLocation();
  const token = new URLSearchParams(hash.slice(1)).get('access') ?? '';
  const valid = /^[a-f0-9]{64}$/.test(token);
  const order = useQuery({
    queryKey: ['storefront-tracking', slug, orderId, token],
    queryFn: ({ signal }) =>
      storefrontRequest<OnlineOrder>(`/${slug}/track`, {
        body: { order_id: orderId, access_token: token },
        signal,
      }),
    enabled: valid,
    retry: false,
    refetchInterval: (query) =>
      query.state.data &&
      ['PENDING', 'PREPARING', 'READY'].includes(query.state.data.status)
        ? 15000
        : false,
    gcTime: 0,
  });
  return (
    <>
      <div className="shop-heading">
        <h1>{t('storefront.trackOrder')}</h1>
        <Link to={`/shop/${slug}`}>{t('storefront.backToStorefront')}</Link>
      </div>
      <p className="notice">
        {t('storefront.keepThisLinkPrivateAnyoneWithThe')}
      </p>
      {!valid ? (
        <ShopError
          error={
            new Error(t('storefront.incompleteTrackingLinkUseTheLinkReceived'))
          }
        />
      ) : (
        <>
          {order.isPending && (
            <Loading>{t('storefront.checkingOrderStatus')}</Loading>
          )}
          {order.error && (
            <ShopError error={order.error} retry={() => void order.refetch()} />
          )}
          {order.data && (
            <Card>
              <OrderDetails order={order.data} />
              <Button
                className="button-secondary"
                disabled={order.isFetching}
                onClick={() => void order.refetch()}
              >
                {t('storefront.refreshStatus')}
              </Button>
            </Card>
          )}
        </>
      )}
    </>
  );
}
