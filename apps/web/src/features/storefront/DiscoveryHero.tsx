import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin } from 'lucide-react';
import { useLanguage } from '../../app/language';
import { paths } from '../../app/routes';
import { customerAreas, type CustomerArea } from './customer-areas';
import './discovery.css';

export function DiscoveryHero({
  title,
  description,
  image = '/images/home/reference/hero-meal.webp',
  area = false,
  compact = false,
  children,
}: {
  title: string;
  description: string;
  image?: string;
  area?: boolean;
  compact?: boolean;
  children?: ReactNode;
}) {
  return (
    <section
      className={`discovery-hero${area ? ' discovery-hero-area' : ''}${compact ? ' discovery-hero-compact' : ''}`}
      aria-labelledby="discovery-title"
    >
      <div className="discovery-hero-copy">
        <h1 id="discovery-title" tabIndex={-1}>
          {title}
        </h1>
        <p>{description}</p>
        {children}
      </div>
      {!compact && <img className="discovery-hero-art" src={image} alt="" />}
    </section>
  );
}

export function DiscoveryAreaSelect({
  areaId,
  search,
}: {
  areaId?: CustomerArea['id'];
  search: string;
}) {
  const { t } = useLanguage();
  const navigate = useNavigate();
  return (
    <label className="discovery-area-select">
      <MapPin size={17} aria-hidden="true" />
      <span>
        {t(
          areaId
            ? 'storefront.customer.changeArea'
            : 'storefront.customer.chooseArea',
        )}
      </span>
      <select
        value={areaId ?? ''}
        onChange={(event) => {
          const next = customerAreas.find(
            (item) => item.id === event.target.value,
          );
          void navigate({
            pathname: next ? `${paths.areas}/${next.id}` : paths.shop,
            search,
          });
        }}
      >
        <option value="">{t('landing.viewAllShops')}</option>
        {customerAreas.map((item) => (
          <option key={item.id} value={item.id}>
            {t(item.title)}
          </option>
        ))}
      </select>
    </label>
  );
}
