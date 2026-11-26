import { useMemo, useState, type ReactNode } from 'react';
import { BadgeCheck, Heart, LayoutGrid, Search, Sparkles } from 'lucide-react';
import { useLanguage } from '../../app/language';
import type { ShopDirectoryEntry } from '../../lib/storefront-api';
import { businessTypeLabel, normalizeBusinessType } from './business-type';
import { ShopCard } from './ShopCard';
import { useShopFavorites } from './shop-favorites';

const chips = [
  { value: 'all', label: 'landing.recommended', icon: Sparkles },
  { value: 'open', label: 'landing.openNow', icon: BadgeCheck },
  { value: 'favorites', label: 'landing.favoriteShops', icon: Heart },
] as const;
type Chip = (typeof chips)[number]['value'];
type Sort = 'recommended' | 'open' | 'name';

export function ShopDirectoryGrid({
  shops,
  initialQuery = '',
  initialType = null,
  action = 'store',
  headingId,
  status,
}: {
  shops: ShopDirectoryEntry[];
  initialQuery?: string;
  initialType?: string | null;
  action?: 'store' | 'cart';
  headingId: string;
  /** Loading/error/empty slot rendered instead of results while present. */
  status?: ReactNode;
}) {
  const { t, language } = useLanguage();
  const [query, setQuery] = useState(initialQuery);
  const [chip, setChip] = useState<Chip>('all');
  const [sort, setSort] = useState<Sort>('recommended');
  const [type, setType] = useState<string | null>(initialType);
  // Directory favorites have a separate key from the product favorites of any shop.
  const saved = useShopFavorites(':directory');

  const types = useMemo(
    () =>
      [
        ...new Set(
          shops.map((shop) => normalizeBusinessType(shop.business_type)),
        ),
      ].sort(),
    [shops],
  );

  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const filtered = shops.filter(
      (shop) =>
        (!needle || shop.name.toLocaleLowerCase().includes(needle)) &&
        (type === null || normalizeBusinessType(shop.business_type) === type) &&
        (chip !== 'open' || shop.accepting_orders) &&
        (chip !== 'favorites' || saved.isFavorite(shop.slug)),
    );
    if (sort === 'name')
      return [...filtered].sort((a, b) =>
        a.name.localeCompare(b.name, language),
      );
    // Stable: open stores first, then the directory order.
    return [...filtered].sort(
      (a, b) => Number(b.accepting_orders) - Number(a.accepting_orders),
    );
  }, [shops, query, type, chip, sort, saved, language]);

  const empty =
    chip === 'favorites' && !query.trim()
      ? t('landing.noFavoriteShops')
      : chip === 'open' && !query.trim()
        ? t('landing.noOpenShops')
        : t('storefront.noMatchingStores');

  return (
    <div className="customer-directory">
      <div className="customer-directory-toolbar">
        <label className="customer-search">
          <Search size={20} aria-hidden="true" />
          <input
            type="search"
            aria-label={t('storefront.searchStores')}
            placeholder={t('storefront.searchStores')}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="customer-sort">
          <span>{t('storefront.customer.sortLabel')}</span>
          <select
            aria-label={t('storefront.customer.sortLabel')}
            value={sort}
            onChange={(event) => setSort(event.target.value as Sort)}
          >
            <option value="recommended">
              {t('storefront.customer.sortRecommended')}
            </option>
            <option value="open">{t('storefront.customer.sortOpen')}</option>
            <option value="name">{t('storefront.customer.sortName')}</option>
          </select>
        </label>
      </div>
      <div
        className="customer-chips"
        role="group"
        aria-label={t('storefront.customer.shopFilters')}
      >
        {chips.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            aria-pressed={chip === value}
            onClick={() => setChip(value)}
          >
            <Icon size={15} aria-hidden="true" />
            {t(label)}
          </button>
        ))}
      </div>
      <div className="customer-directory-layout">
        <aside className="customer-type-panel">
          <h2 className="customer-type-heading">
            {t('storefront.customer.shopTypes')}
          </h2>
          <div
            className="customer-type-list"
            role="group"
            aria-label={t('storefront.customer.shopTypes')}
          >
            <button
              type="button"
              aria-pressed={type === null}
              onClick={() => setType(null)}
            >
              <LayoutGrid size={16} aria-hidden="true" />
              {t('storefront.customer.allTypes')}
            </button>
            {types.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={type === value}
                onClick={() => setType(value)}
              >
                {businessTypeLabel(value, language)}
              </button>
            ))}
          </div>
        </aside>
        <section
          className="customer-directory-results"
          aria-labelledby={headingId}
        >
          <h2 id={headingId} className="sr-only">
            {t('storefront.publishedStores')}
          </h2>
          {status ??
            (visible.length > 0 ? (
              <ul
                className="customer-shop-grid"
                aria-label={t('storefront.publishedStores')}
                aria-live="polite"
              >
                {visible.map((shop) => (
                  <li key={shop.slug}>
                    <ShopCard
                      shop={shop}
                      action={action}
                      favorite={saved.isFavorite(shop.slug)}
                      onToggleFavorite={() => saved.toggle(shop.slug)}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="customer-empty" role="status">
                {empty}
              </p>
            ))}
        </section>
      </div>
    </div>
  );
}
