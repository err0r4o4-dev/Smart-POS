import { ArrowRight, Heart, Star } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../app/language';
import { paths } from '../../app/routes';
import type { ShopDirectoryEntry } from '../../lib/storefront-api';
import { foodCategories } from '../storefront/food-categories';
import { hasValidRating } from '../storefront/shop-art';
import './landing.css';

function shopCover(codes: readonly string[] = []) {
  if (codes.includes('drinks')) return '/images/home/reference/cover-tea.webp';
  if (codes.includes('desserts')) return '/images/home/cat-desserts.webp';
  if (codes.includes('fried'))
    return '/images/home/reference/cover-fast-food.webp';
  return '/images/home/reference/cover-restaurant.webp';
}

export function LandingShopCard({
  shop,
  favorite,
  onToggleFavorite,
  directorySearch,
  statusLabel,
}: {
  shop: ShopDirectoryEntry;
  favorite: boolean;
  onToggleFavorite: () => void;
  directorySearch?: string;
  statusLabel?: string;
}) {
  const { t, language } = useLanguage();
  const titleId = `landing-shop-${shop.slug}`;
  const categories = foodCategories.filter(({ code }) =>
    shop.category_codes?.includes(code),
  );
  const { average_rating: average, review_count: count } = shop;
  const hasRating = hasValidRating(shop);
  const noReviews = count === 0 && average === null;

  return (
    <article className="landing-shop" aria-labelledby={titleId}>
      <div className="landing-shop-cover">
        <img src={shopCover(shop.category_codes)} alt="" loading="lazy" />
        <div className="landing-shop-controls">
          <span
            className={
              shop.accepting_orders
                ? 'landing-shop-badge is-open'
                : 'landing-shop-badge'
            }
          >
            {statusLabel ?? t(
              shop.accepting_orders
                ? 'landing.openNow'
                : 'landing.closedNow',
            )}
          </span>
          <button
            type="button"
            className="landing-shop-favorite"
            aria-label={t('landing.favorite', {
              name: shop.name,
            })}
            aria-pressed={favorite}
            onClick={onToggleFavorite}
          >
            <Heart
              size={18}
              aria-hidden="true"
              fill={favorite ? 'currentColor' : 'none'}
            />
          </button>
        </div>
      </div>
      <div className="landing-shop-body">
        <div className="landing-shop-title">
          <h3 id={titleId}>
            <Link
              to={paths.shop + '/' + encodeURIComponent(shop.slug)}
              state={
                directorySearch === undefined ? undefined : { directorySearch }
              }
            >
              {shop.name}
            </Link>
          </h3>
          {categories.length > 0 && (
            <span>
              {categories.map(({ label }) => t(label)).join(' · ')}
            </span>
          )}
        </div>
        {(hasRating || noReviews || shop.delivery_enabled === true) && (
          <div className="landing-shop-details">
            {hasRating && (
              <div className="landing-shop-review">
                <strong>
                  <Star size={15} aria-hidden="true" />
                  {shop.average_rating.toFixed(1)} / 5
                </strong>
                <span>
                  {t('landing.reviewCount', {
                    count: shop.review_count.toLocaleString(language),
                  })}
                </span>
              </div>
            )}
            {noReviews && <span>{t('landing.noReviews')}</span>}
            {shop.delivery_enabled === true && (
              <span>{t('landing.deliveryAvailable')}</span>
            )}
          </div>
        )}
        <span
          className="landing-shop-meta"
          aria-hidden="true"
        >
          {t('storefront.viewStore')}
          <ArrowRight size={15} />
        </span>
      </div>
    </article>
  );
}
