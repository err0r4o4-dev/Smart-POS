import { useLanguage } from '../../app/language';
import { useParams, useSearchParams } from 'react-router-dom';
import { PackageOpen } from 'lucide-react';
import { Card, Loading } from '../../components/ui/primitives';
import { ShopCatalog } from './ShopCatalog';
import { ShopError } from './shop-feedback';
import { normalizeBusinessType } from './business-type';
import { ShopDirectoryGrid } from './ShopDirectoryGrid';
import { useShopDirectory } from './useShopDirectory';
export { ShopError, ShopPagination } from './shop-feedback';
import './storefront.css';

export function StorefrontPage() {
  const { slug } = useParams();
  return slug ? <ShopCatalog key={slug} slug={slug} /> : <ShopEntry />;
}
function ShopEntry() {
  const { t } = useLanguage();
  const [searchParams] = useSearchParams();
  const showCarts = searchParams.get('view') === 'cart';
  const initialType = searchParams.get('type');
  const shops = useShopDirectory();

  const status = shops.isPending ? (
    <Loading>{t('storefront.loadingStorefronts')}</Loading>
  ) : shops.error ? (
    <ShopError error={shops.error} retry={() => void shops.refetch()} />
  ) : shops.data?.length === 0 ? (
    <Card className="storefront-status">
      <PackageOpen size={40} aria-hidden="true" />
      <h2>{t('storefront.noPublishedStoresYet')}</h2>
      <p>{t('storefront.onceStoresSetUpTheirStorefrontsAnd')}</p>
    </Card>
  ) : undefined;

  return (
    <div className="customer-page">
      <header className="customer-page-heading">
        <h1 id="storefront-title" tabIndex={-1}>
          {showCarts
            ? t('landing.cart')
            : t('storefront.customer.exploreTitle')}
        </h1>
        <p>
          {showCarts
            ? t('landing.chooseCartStore')
            : t('storefront.customer.exploreDescription')}
        </p>
      </header>
      <ShopDirectoryGrid
        shops={shops.data ?? []}
        initialQuery={searchParams.get('q') ?? ''}
        initialType={
          initialType === null ? null : normalizeBusinessType(initialType)
        }
        action={showCarts ? 'cart' : 'store'}
        headingId="storefront-results"
        status={status}
      />
    </div>
  );
}
