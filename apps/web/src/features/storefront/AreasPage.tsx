import { useMemo, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, MapPin, Search } from 'lucide-react';
import { useLanguage } from '../../app/language';
import { paths } from '../../app/routes';
import { Card } from '../../components/ui/primitives';
import {
  customerAreas,
  findCustomerArea,
  type CustomerArea,
} from './customer-areas';
import { DiscoveryAreaSelect, DiscoveryHero } from './DiscoveryHero';

export function AreasPage() {
  const { t } = useLanguage();
  const { search } = useLocation();
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
    <div className="customer-page discovery-page">
      <DiscoveryHero
        title={t('storefront.customer.areasTitle')}
        description={t('storefront.customer.areasDescription')}
      />
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
                to={{ pathname: `${paths.areas}/${area.id}`, search }}
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
  return area ? <AreaDetail area={area} /> : <AreaNotFound />;
}

function AreaBackLink() {
  const { t } = useLanguage();
  const { search } = useLocation();
  return (
    <Link className="customer-back-link" to={{ pathname: paths.areas, search }}>
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

function AreaDetail({ area }: { area: CustomerArea }) {
  const { t } = useLanguage();
  const { search } = useLocation();

  return (
    <div className="customer-page discovery-page">
      <DiscoveryHero
        title={t('storefront.customer.areaTitle', { name: t(area.title) })}
        description={t(area.description)}
        image={area.image}
        area
      >
        <DiscoveryAreaSelect areaId={area.id} search={search} />
      </DiscoveryHero>
      <AreaBackLink />
      <section
        className="discovery-unavailable"
        aria-labelledby="area-unavailable-title"
      >
        <MapPin size={26} aria-hidden="true" />
        <h2 id="area-unavailable-title">
          {t('storefront.customer.areaUnmatchedNote')}
        </h2>
        <p>{t('storefront.customer.areaTryAll')}</p>
        <Link className="button primary" to={{ pathname: paths.shop, search }}>
          {t('landing.viewAllShops')}
          <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </section>
    </div>
  );
}
