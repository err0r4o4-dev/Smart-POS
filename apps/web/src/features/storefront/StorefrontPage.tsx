import { useLanguage } from '../../app/language';
import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { PackageOpen, ShoppingBag } from 'lucide-react';
import { Card, Loading, Tag } from '../../components/ui/primitives';
import { storefrontRequest, type ShopSummary } from '../../lib/storefront-api';
import { ShopCatalog } from './ShopCatalog';
import { ShopError } from './shop-feedback';
export { ShopError, ShopPagination } from './shop-feedback';
import './storefront.css';

export function StorefrontPage() {
  const { slug } = useParams();
  return slug ? <ShopCatalog key={slug} slug={slug} /> : <ShopEntry />;
}
function ShopEntry() {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');

  const shops = useQuery({
    queryKey: ['storefront-directory'],
    queryFn: async ({ signal }) => {
      const items = await storefrontRequest<ShopSummary[]>('', {
        signal,
        storeMode: () => {},
      });
      return items;
    },
    retry: false,
  });

  const visibleShops = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return (shops.data ?? []).filter((shop) =>
      !query || shop.name.toLocaleLowerCase().includes(query),
    );
  }, [search, shops.data]);
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
        {shops.data && shops.data.length > 0 && (
          <>
            <label className="shop-search" htmlFor="storefront-search">
              <span>{t('storefront.searchStores')}</span>
              <input
                id="storefront-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('storefront.searchStoresPlaceholder')}
              />
            </label>
            {visibleShops.length > 0 ? (
              <div className="shop-grid" aria-live="polite">
                {visibleShops.map((shop) => (
                  <Card className="shop-product" key={shop.slug}>
                    <ShoppingBag size={30} aria-hidden="true" />
                    <h2>{shop.name}</h2>
                    <Tag tone={shop.accepting_orders ? 'success' : 'neutral'}>
                      {shop.accepting_orders
                        ? t('storefront.acceptingOrders')
                        : t('storefront.notAcceptingOrders')}
                    </Tag>
                    <a
                      className="button"
                      href={`/shop/${encodeURIComponent(shop.slug)}`}
                      aria-disabled={!shop.accepting_orders}
                    >
                      {t('storefront.viewStore')}
                    </a>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="storefront-status">
                <p>{t('storefront.noMatchingStores')}</p>
              </Card>
            )}
          </>
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
