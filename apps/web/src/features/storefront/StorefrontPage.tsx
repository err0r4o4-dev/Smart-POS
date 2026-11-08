import { useLanguage } from '../../app/language';
import { Navigate, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PackageOpen, ShoppingBag } from 'lucide-react';
import { Card, Loading, Tag } from '../../components/ui/primitives';
import { storefrontRequest, type ShopSummary } from '../../lib/storefront-api';
import { ShopCatalog } from './ShopCatalog';
import { ShopError } from './shop-feedback';
export { ShopError, ShopPagination } from './shop-feedback';
import { ApiError } from '../../lib/api';
import './storefront.css';

export function StorefrontPage() {
  const { slug } = useParams();
  return slug ? <ShopCatalog key={slug} slug={slug} /> : <ShopEntry />;
}
function ShopEntry() {
  const { t } = useLanguage();

  const shops = useQuery({
    queryKey: ['storefront-directory'],
    queryFn: async ({ signal }) => {
      const items = await storefrontRequest<ShopSummary[]>('', {
        signal,
        storeMode: () => {},
      });
      if (items.length > 1)
        throw new ApiError(
          502,
          t('shell.invalidSingleStoreConfigurationCheckSystemSettings'),
        );
      return items;
    },
    retry: false,
  });
  if (shops.data?.length === 1)
    return (
      <Navigate
        to={`/shop/${encodeURIComponent(shops.data[0].slug)}`}
        replace
      />
    );
  return (
    <>
      <section className="storefront-hero" aria-labelledby="storefront-title">
        <div>
          <p className="eyebrow">{t('storefront.customerArea')}</p>
          <h1 id="storefront-title" tabIndex={-1}>
            {t('landing.onlineStorefront')}
          </h1>
          <p>{t('storefront.chooseProductsSubmitAnOrderThenPick')}</p>
          <Tag tone="amber">{t('storefront.storePickupNoOnlinePayment')}</Tag>
        </div>
        <ShoppingBag size={72} strokeWidth={1.3} aria-hidden="true" />
      </section>
      <section id="online-status" aria-label={t('storefront.publishedStores')}>
        {shops.isPending && (
          <Loading>{t('storefront.loadingStorefronts')}</Loading>
        )}
        {shops.error && (
          <ShopError error={shops.error} retry={() => void shops.refetch()} />
        )}
        {shops.data?.length === 0 && (
          <Card className="storefront-status">
            <PackageOpen size={40} aria-hidden="true" />
            <h2>{t('storefront.noPublishedStoresYet')}</h2>
            <p>{t('storefront.onceStoresSetUpTheirStorefrontsAnd')}</p>
          </Card>
        )}
      </section>
    </>
  );
}
