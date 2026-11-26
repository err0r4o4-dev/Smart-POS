import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Info, MapPin, Search } from 'lucide-react';
import { useLanguage } from '../../app/language';
import { paths } from '../../app/routes';
import { Card, Loading } from '../../components/ui/primitives';
import { customerAreas, findCustomerArea } from './customer-areas';
import { ShopDirectoryGrid } from './ShopDirectoryGrid';
import { ShopError } from './shop-feedback';
import { useShopDirectory } from './useShopDirectory';

export function AreasPage() {
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return customerAreas.filter(
      (area) =>
        !needle ||
        t(area.title).toLocaleLowerCase().includes(needle) ||
        t(area.description).toLocaleLowerCase().includes(needle),
    );
  }, [query, t]);

  return (
    <div className="customer-page">
      <header className="customer-page-heading">
        <h1 tabIndex={-1}>{t('storefront.customer.areasTitle')}</h1>
        <p>{t('storefront.customer.areasDescription')}</p>
      </header>
      <label className="customer-search customer-area-search">
        <Search size={20} aria-hidden="true" />
        <input
          type="search"
          aria-label={t('storefront.customer.areasSearch')}
          placeholder={t('storefront.customer.areasSearch')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      {visible.length > 0 ? (
        <ul
          className="customer-area-grid"
          aria-label={t('storefront.customer.areasTitle')}
        >
          {visible.map((area) => (
            <li key={area.id}>
              <Link
                className="customer-area-card"
                to={`${paths.areas}/${area.id}`}
              >
                <img src={area.image} alt="" loading="lazy" />
                <span className="customer-area-copy">
                  <strong>{t(area.title)}</strong>
                  <span>{t(area.description)}</span>
                </span>
                <span className="customer-area-arrow" aria-hidden="true">
                  <ArrowRight size={18} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="customer-empty" role="status">
          {t('storefront.customer.areasEmpty')}
        </p>
      )}
    </div>
  );
}

export function AreaDetailPage() {
  const { areaId } = useParams();
  const area = findCustomerArea(areaId);
  return area ? <AreaDetail areaId={area.id} /> : <AreaNotFound />;
}

function AreaBackLink() {
  const { t } = useLanguage();
  return (
    <Link className="customer-back-link" to={paths.areas}>
      <ArrowLeft size={16} aria-hidden="true" />
      {t('storefront.customer.areaBack')}
    </Link>
  );
}

function AreaNotFound() {
  const { t } = useLanguage();
  return (
    <div className="customer-page">
      <Card className="storefront-status">
        <MapPin size={40} aria-hidden="true" />
        <h1>{t('storefront.customer.areaNotFound')}</h1>
        <p>{t('storefront.customer.areaNotFoundHint')}</p>
        <AreaBackLink />
      </Card>
    </div>
  );
}

function AreaDetail({ areaId }: { areaId: string }) {
  const { t } = useLanguage();
  const area = findCustomerArea(areaId)!;
  const shops = useShopDirectory();
  const count = shops.data?.length ?? 0;

  const status = shops.isPending ? (
    <Loading>{t('storefront.loadingStorefronts')}</Loading>
  ) : shops.error ? (
    <ShopError error={shops.error} retry={() => void shops.refetch()} />
  ) : count === 0 ? (
    <p className="customer-empty" role="status">
      {t('storefront.noPublishedStoresYet')}
    </p>
  ) : undefined;

  return (
    <div className="customer-page">
      <AreaBackLink />
      <section
        className="customer-area-hero"
        aria-labelledby="customer-area-title"
      >
        <img src={area.image} alt="" />
        <div className="customer-area-hero-copy">
          <h1 id="customer-area-title" tabIndex={-1}>
            <MapPin size={26} aria-hidden="true" />
            {t(area.title)}
          </h1>
          <p>{t(area.description)}</p>
        </div>
        {shops.isSuccess && count > 0 && (
          <p className="customer-area-count">
            {t('storefront.customer.areaListed', { count })}
          </p>
        )}
      </section>
      <p className="customer-note">
        <Info size={18} aria-hidden="true" />
        {t('storefront.customer.areaUnmatchedNote')}
      </p>
      <ShopDirectoryGrid
        shops={shops.data ?? []}
        headingId="customer-area-results"
        status={status}
      />
    </div>
  );
}
