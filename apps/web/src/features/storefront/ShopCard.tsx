import { Link } from 'react-router-dom';
import { ArrowRight, Heart, ShoppingCart, Star, Truck } from 'lucide-react';
import { useLanguage } from '../../app/language';
import type { ShopDirectoryEntry } from '../../lib/storefront-api';
import { businessTypeLabel, normalizeBusinessType } from './business-type';
import { hasValidRating, shopCoverImage } from './shop-art';

export function ShopCard({
  shop,
  favorite,
  onToggleFavorite,
  action = 'store',
}: {
  shop: ShopDirectoryEntry;
  favorite: boolean;
  onToggleFavorite: () => void;
  action?: 'store' | 'cart';
}) {
  const { t, language } = useLanguage();
  const type = normalizeBusinessType(shop.business_type);
  const storePath = `/shop/${encodeURIComponent(shop.slug)}`;
  const titleId = `shop-card-${shop.slug}`;
  const rated = hasValidRating(shop);
  const noReviews = shop.average_rating === null && shop.review_count === 0;

  return (
    <article className="customer-shop-card" aria-labelledby={titleId}>
      <div className="customer-shop-cover">
        <img src={shopCoverImage(type)} alt="" loading="lazy" />
        <span
          className={
            shop.accepting_orders
              ? 'customer-shop-status is-open'
              : 'customer-shop-status'
          }
        >
          <span className="customer-status-dot" aria-hidden="true" />
          {shop.accepting_orders
            ? t('storefront.acceptingOrders')
            : t('storefront.notAcceptingOrders')}
        </span>
        <button
          type="button"
          className="customer-shop-favorite"
          aria-label={t('landing.favorite', { name: shop.name })}
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
      <div className="customer-shop-body">
        <h3 id={titleId}>
          <Link to={storePath}>{shop.name}</Link>
        </h3>
        <p className="customer-shop-type">
          {businessTypeLabel(type, language)}
        </p>
        <div className="customer-shop-meta">
          {rated && (
            <span className="customer-shop-rating">
              <Star size={15} aria-hidden="true" fill="currentColor" />
              <strong>{shop.average_rating.toFixed(1)}</strong>
              <span>
                {t('landing.reviewCount', {
                  count: shop.review_count.toLocaleString(language),
                })}
              </span>
            </span>
          )}
          {noReviews && <span>{t('landing.noReviews')}</span>}
          {shop.delivery_enabled === true && (
            <span className="customer-shop-delivery">
              <Truck size={15} aria-hidden="true" />
              {t('landing.deliveryAvailable')}
            </span>
          )}
        </div>
        {action === 'cart' ? (
          <Link className="customer-shop-action" to={`${storePath}/cart`}>
            <ShoppingCart size={16} aria-hidden="true" />
            {t('landing.viewCart')}
          </Link>
        ) : (
          <span className="customer-shop-more" aria-hidden="true">
            {t('storefront.viewStore')}
            <ArrowRight size={15} />
          </span>
        )}
      </div>
    </article>
  );
}
