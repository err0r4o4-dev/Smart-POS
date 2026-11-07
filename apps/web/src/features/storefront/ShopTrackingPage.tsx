import { useLanguage } from '../../app/language';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Button, Card, Loading } from '../../components/ui/primitives';
import { storefrontRequest, type OnlineOrder } from '../../lib/storefront-api';
import { ShopError } from './StorefrontPage';
import { OrderDetails } from './OrderDetails';

// Keep the original prototype layout.
// Only adjust spacing on smaller screens.
const responsiveTrackingCSS = `
  .velopos-tracking {
    box-sizing: border-box;
    width: 100%;
    max-width: 1200px;
    min-width: 0;
    margin: 0 auto;
    padding: clamp(16px, 2vw, 28px);
  }

  .velopos-tracking *,
  .velopos-tracking *::before,
  .velopos-tracking *::after {
    box-sizing: border-box;
  }

  .velopos-tracking .shop-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 16px;
  }

  .velopos-tracking img {
    max-width: 100%;
    height: auto;
  }

  .velopos-tracking table {
    max-width: 100%;
  }

  @media (max-width: 767px) {
    .velopos-tracking {
      padding: 14px 12px;
    }

    .velopos-tracking .shop-heading {
      align-items: flex-start;
      flex-direction: column;
      gap: 12px;
    }

    .velopos-tracking .shop-heading h1 {
      font-size: 26px;
    }

    .velopos-tracking .shop-heading a {
      width: 100%;
      justify-content: center;
    }
  }

  @media (max-width: 380px) {
    .velopos-tracking {
      padding: 10px 8px;
    }
  }
`;

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
        body: {
          order_id: orderId,
          access_token: token,
        },
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
    <div className="velopos-tracking">
      <style>{responsiveTrackingCSS}</style>

      {/* ORIGINAL PAGE HEADING */}
      <div className="shop-heading">
        <h1>{t('storefront.trackOrder')}</h1>

        {/* YELLOW BACK BUTTON */}
        <Link
          to={`/shop/${slug}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 42,
            padding: '10px 16px',
            borderRadius: 11,
            border: '1px solid #F0C542',
            background: '#FFF3CA',
            color: '#111B38',
            fontFamily: 'inherit',
            fontSize: 14,
            fontWeight: 700,
            textDecoration: 'none',
            lineHeight: 1.5,
          }}
        >
          {t('storefront.backToStorefront')}
        </Link>
      </div>

      {/* ORIGINAL NOTICE */}
      <p className="notice">
        {t('storefront.keepThisLinkPrivateAnyoneWithThe')}
      </p>

      {/* ORIGINAL TRACKING CONTENT */}
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
    </div>
  );
}
