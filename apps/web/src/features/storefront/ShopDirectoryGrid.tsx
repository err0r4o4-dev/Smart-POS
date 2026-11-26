import { useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BadgeCheck,
  Heart,
  LayoutGrid,
  Search,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import { useLanguage } from '../../app/language';
import type { ShopDirectoryEntry } from '../../lib/storefront-api';
import { businessTypeLabel, normalizeBusinessType } from './business-type';
import { ShopCard } from './ShopCard';
import { useShopFavorites } from './shop-favorites';
import { DiscoveryAreaSelect, DiscoveryHero } from './DiscoveryHero';

const chips = [
  { value: 'all', label: 'landing.recommended', icon: Sparkles },
  { value: 'open', label: 'landing.openNow', icon: BadgeCheck },
  { value: 'favorites', label: 'landing.favoriteShops', icon: Heart },
] as const;
type Chip = (typeof chips)[number]['value'];

export function ShopDirectoryGrid({
  shops,
  initialQuery = '',
  initialType = null,
  action = 'store',
  headingId,
  status,
  hero,
}: {
  shops: ShopDirectoryEntry[];
  initialQuery?: string;
  initialType?: string | null;
  action?: 'store' | 'cart';
  headingId: string;
  /** Loading/error/empty slot rendered instead of results while present. */
  status?: ReactNode;
  hero?: { title: string; description: string };
}) {
  const { t, language } = useLanguage();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? initialQuery;
  const filter = params.get('filter');
  const chip: Chip =
    filter === 'open' || filter === 'favorites' ? filter : 'all';
  const sort = params.get('sort') === 'name' ? 'name' : 'recommended';
  const rawType = params.get('type') ?? initialType;
  const type = rawType ? normalizeBusinessType(rawType) : null;
  const search = params.toString();
  const directorySearch = search ? `?${search}` : '';

  function updateFilters(updates: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true, preventScrollReset: true });
  }

  function clearFilters() {
    updateFilters({
      q: initialQuery ? '' : null,
      filter: null,
      sort: null,
      type: initialType ? '' : null,
    });
  }
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

  const searchField = (
    <label className="customer-search">
      <Search size={20} aria-hidden="true" />
      <input
        type="search"
        aria-label={t('storefront.searchStores')}
        placeholder={t('storefront.customer.searchByName')}
        value={query}
        onChange={(event) =>
          updateFilters({ q: event.target.value || (initialQuery ? '' : null) })
        }
      />
    </label>
  );

  return (
    <div className="customer-directory">
      {hero && <DiscoveryHero {...hero}>{searchField}</DiscoveryHero>}
      <div className="customer-directory-toolbar">
        {hero ? <DiscoveryAreaSelect search={directorySearch} /> : searchField}
        <label className="customer-sort">
          <span>{t('storefront.customer.sortLabel')}</span>
          <select
            aria-label={t('storefront.customer.sortLabel')}
            value={sort}
            onChange={(event) =>
              updateFilters({
                sort: event.target.value === 'name' ? 'name' : null,
              })
            }
          >
            <option value="recommended">
              {t('storefront.customer.sortRecommended')}
            </option>
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
            onClick={() =>
              updateFilters({ filter: value === 'all' ? null : value })
            }
          >
            <Icon size={15} aria-hidden="true" />
            {t(label)}
          </button>
        ))}
      </div>
      <div className="customer-directory-layout">
        <aside className="customer-type-panel">
          {hero && (
            <details className="discovery-mobile-filter">
              <summary>
                <SlidersHorizontal size={17} aria-hidden="true" />{' '}
                {t('storefront.customer.filterLabel')}
                {type && ` · ${businessTypeLabel(type, language)}`}
              </summary>
              <label className="customer-sort">
                <span>{t('storefront.customer.shopTypes')}</span>
                <select
                  value={type ?? ''}
                  onChange={(event) =>
                    updateFilters({
                      type: event.target.value || (initialType ? '' : null),
                    })
                  }
                >
                  <option value="">{t('storefront.customer.allTypes')}</option>
                  {types.map((value) => (
                    <option key={value} value={value}>
                      {businessTypeLabel(value, language)}
                    </option>
                  ))}
                </select>
              </label>
            </details>
          )}
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
              onClick={() => updateFilters({ type: initialType ? '' : null })}
            >
              <LayoutGrid size={16} aria-hidden="true" />
              {t('storefront.customer.allTypes')}
            </button>
            {types.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={type === value}
                onClick={() => updateFilters({ type: value })}
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
          <h2
            id={headingId}
            className={hero ? 'discovery-results-heading' : 'sr-only'}
          >
            {t('storefront.publishedStores')}
          </h2>
          {hero && !status && (
            <p className="discovery-result-count" role="status">
              {t('storefront.customer.areaListed', {
                count: visible.length.toLocaleString(language),
              })}
            </p>
          )}
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
                      directorySearch={hero ? directorySearch : undefined}
                      favorite={saved.isFavorite(shop.slug)}
                      onToggleFavorite={() => saved.toggle(shop.slug)}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <div className="customer-empty">
                <p role="status">{empty}</p>
                {(query ||
                  type ||
                  chip !== 'all' ||
                  sort !== 'recommended') && (
                  <button
                    type="button"
                    className="button"
                    onClick={clearFilters}
                  >
                    {t('storefront.customer.clearFilters')}
                  </button>
                )}
              </div>
            ))}
        </section>
      </div>
    </div>
  );
}
