import { useRef, type KeyboardEvent } from 'react';
import { Clock, Phone, Star, Store, Truck } from 'lucide-react';
import { useLanguage } from '../../app/language';
import { moneyText } from '../../lib/pos-api';
import type { ShopSettings } from '../../lib/storefront-api';
import { ShopCoverImage } from './ShopCoverImage';
import { hasValidRating, shopCoverImage } from './shop-art';
import { useShopDirectory } from './useShopDirectory';

export type StoreTab = 'menu' | 'info' | 'reviews';
const tabs: StoreTab[] = ['menu', 'info', 'reviews'];
const tabLabels = {
  menu: 'storefront.customer.storeMenuTab',
  info: 'storefront.customer.storeInfoTab',
  reviews: 'storefront.customer.storeReviewsTab',
} as const;

/** The public directory entry carries the business type and verified rating. */
function useDirectoryEntry(slug: string) {
  const directory = useShopDirectory();
  // The hero must survive a missing or malformed directory response.
  return Array.isArray(directory.data)
    ? directory.data.find((entry) => entry?.slug === slug)
    : undefined;
}

export function StoreHero({
  store,
  slug,
}: {
  store: ShopSettings;
  slug: string;
}) {
  const { t, language } = useLanguage();
  const entry = useDirectoryEntry(slug);
  const cover = shopCoverImage(store.category_codes ?? entry?.category_codes);

  return (
    <section
      className="customer-store-hero"
      aria-labelledby="customer-store-name"
    >
      <div className="customer-store-cover">
        <ShopCoverImage cover={store.cover_image_url ?? entry?.cover_image_url} fallback={cover} />
      </div>
      <div className="customer-store-identity">
        <span className="customer-store-logo" aria-hidden="true">
          <Store size={34} strokeWidth={1.6} />
        </span>
        <div className="customer-store-copy">
          <h1 id="customer-store-name">{store.name}</h1>
          {store.description && <p>{store.description}</p>}
          <div className="customer-store-meta">
            {entry && hasValidRating(entry) && (
              <span className="customer-shop-rating">
                <Star size={15} aria-hidden="true" fill="currentColor" />
                <strong>{entry.average_rating.toFixed(1)}</strong>
                <span>
                  {t('landing.reviewCount', {
                    count: entry.review_count.toLocaleString(language),
                  })}
                </span>
              </span>
            )}
            <span
              className={
                store.accepting_orders
                  ? 'customer-store-status is-open'
                  : 'customer-store-status'
              }
            >
              <span className="customer-status-dot" aria-hidden="true" />
              {store.accepting_orders
                ? t('storefront.acceptingOrders')
                : t('storefront.notAcceptingOrders')}
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

export function StoreTabs({
  active,
  onChange,
}: {
  active: StoreTab;
  onChange: (tab: StoreTab) => void;
}) {
  const { t } = useLanguage();
  const refs = useRef<Partial<Record<StoreTab, HTMLButtonElement | null>>>({});

  const move = (event: KeyboardEvent<HTMLButtonElement>, tab: StoreTab) => {
    const offset =
      event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    const index =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? tabs.length - 1
          : offset
            ? (tabs.indexOf(tab) + offset + tabs.length) % tabs.length
            : -1;
    if (index < 0) return;
    event.preventDefault();
    onChange(tabs[index]);
    refs.current[tabs[index]]?.focus();
  };

  return (
    <div
      className="customer-store-tabs"
      role="tablist"
      aria-label={t('storefront.customer.storeTabs')}
    >
      {tabs.map((tab) => (
        <button
          key={tab}
          ref={(element) => {
            refs.current[tab] = element;
          }}
          id={`store-tab-${tab}`}
          type="button"
          role="tab"
          aria-selected={active === tab}
          aria-controls={`store-panel-${tab}`}
          tabIndex={active === tab ? 0 : -1}
          onClick={() => onChange(tab)}
          onKeyDown={(event) => move(event, tab)}
        >
          {t(tabLabels[tab])}
        </button>
      ))}
    </div>
  );
}

export function StoreInfoPanel({ store }: { store: ShopSettings }) {
  const { t } = useLanguage();
  const missing = t('storefront.customer.storeNoInfo');
  return (
    <section
      id="store-panel-info"
      role="tabpanel"
      aria-labelledby="store-tab-info"
      className="customer-store-panel"
    >
      <dl className="customer-store-facts">
        <div>
          <dt>
            <Phone size={16} aria-hidden="true" />
            {t('storefront.customer.storePhone')}
          </dt>
          <dd>{store.contact_phone || missing}</dd>
        </div>
        <div>
          <dt>
            <Clock size={16} aria-hidden="true" />
            {t('storefront.customer.storePickup')}
          </dt>
          <dd>{store.pickup_instructions || missing}</dd>
        </div>
        <div>
          <dt>
            <Truck size={16} aria-hidden="true" />
            {t('storefront.customer.storeDelivery')}
          </dt>
          <dd>
            {store.delivery_enabled ? (
              <>
                <span>{t('storefront.customer.storeDeliveryOn')}</span>
                {store.shipping_fee && (
                  <span>
                    {t('storefront.customer.storeShippingFee', {
                      amount: moneyText(store.shipping_fee),
                    })}
                  </span>
                )}
              </>
            ) : (
              t('storefront.customer.storeDeliveryOff')
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}

export function StoreReviewsPanel({ slug }: { slug: string }) {
  const { t, language } = useLanguage();
  const entry = useDirectoryEntry(slug);
  return (
    <section
      id="store-panel-reviews"
      role="tabpanel"
      aria-labelledby="store-tab-reviews"
      className="customer-store-panel"
    >
      {entry && hasValidRating(entry) ? (
        <p className="customer-review-summary">
          <Star size={22} aria-hidden="true" fill="currentColor" />
          {t('storefront.customer.storeRatingSummary', {
            average: entry.average_rating.toFixed(1),
            count: entry.review_count.toLocaleString(language),
          })}
        </p>
      ) : entry?.average_rating === null && entry.review_count === 0 ? (
        <p className="customer-review-summary">
          {t('storefront.customer.storeNoReviews')}
        </p>
      ) : null}
      <p className="customer-review-note">
        {t('storefront.customer.storeReviewsNote')}
      </p>
    </section>
  );
}
