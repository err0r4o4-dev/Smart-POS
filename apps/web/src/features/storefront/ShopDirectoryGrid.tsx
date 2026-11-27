import { useMemo, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BadgeCheck,
  Beef,
  CakeSlice,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CookingPot,
  CupSoda,
  Heart,
  LayoutGrid,
  Salad,
  Search,
  SlidersHorizontal,
  Soup,
  Sparkles,
  Utensils,
} from 'lucide-react';
import { useLanguage } from '../../app/language';
import type { ShopDirectoryEntry } from '../../lib/storefront-api';
import { foodCategories, foodCategory } from './food-categories';
import { ShopCard } from './ShopCard';
import { LandingShopCard } from '../landing/LandingShopCard';
import { useShopFavorites } from './shop-favorites';
import { DiscoveryAreaSelect, DiscoveryHero } from './DiscoveryHero';

const chips = [
  { value: 'all', label: 'landing.recommended', icon: Sparkles },
  { value: 'open', label: 'landing.openNow', icon: BadgeCheck },
  { value: 'favorites', label: 'landing.favoriteShops', icon: Heart },
] as const;
type Chip = (typeof chips)[number]['value'];

const categoryIcons = {
  'made-to-order': CookingPot,
  noodles: Soup,
  isan: Beef,
  fried: Beef,
  drinks: CupSoda,
  desserts: CakeSlice,
  healthy: Salad,
  snacks: CookingPot,
} satisfies Record<(typeof foodCategories)[number]['code'], typeof Utensils>;

export function ShopDirectoryGrid({
  shops,
  initialQuery = '',
  action = 'store',
  headingId,
  status,
  hero,
  directoryMode = false,
}: {
  shops: ShopDirectoryEntry[];
  initialQuery?: string;
  action?: 'store' | 'cart';
  headingId: string;
  /** Loading/error/empty slot rendered instead of results while present. */
  status?: ReactNode;
  hero?: { title: string; description: string };
  directoryMode?: boolean;
}) {
  const { t, language } = useLanguage();
  const [params, setParams] = useSearchParams();
  const search = params.toString();
  const query = params.get('q') ?? initialQuery;
  const filter = params.get('filter');
  const activeFilters = useMemo(
    () => new URLSearchParams(search).getAll('filter'),
    [search],
  );
  const chip: Chip =
    filter === 'open' || filter === 'favorites' ? filter : 'all';
  const sort = params.get('sort') === 'name' ? 'name' : 'recommended';
  const selectedCategory = foodCategory(params.get('category'));
  const category = selectedCategory?.code ?? null;
  const directorySearch = search ? `?${search}` : '';

  function updateFilters(updates: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    next.delete('type');
    if (directoryMode && !('page' in updates)) next.delete('page');
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    setParams(next, { replace: true, preventScrollReset: true });
  }

  function clearFilters() {
    updateFilters({
      ...(directoryMode ? {} : { q: initialQuery ? '' : null }),
      filter: null,
      sort: null,
      category: null,
      page: null,
    });
  }
  // Directory favorites have a separate key from the product favorites of any shop.
  const saved = useShopFavorites(':directory');

  const visible = (() => {
    const needle = query.trim().toLocaleLowerCase();
    const filtered = shops.filter(
      (shop) =>
        (!needle || shop.name.toLocaleLowerCase().includes(needle)) &&
        (category === null || shop.category_codes?.includes(category)) &&
        (!(directoryMode ? activeFilters.includes('open') : chip === 'open') ||
          shop.accepting_orders) &&
        (!(directoryMode
          ? activeFilters.includes('favorites')
          : chip === 'favorites') ||
          saved.isFavorite(shop.slug)) &&
        (!directoryMode ||
          !activeFilters.includes('delivery') ||
          shop.delivery_enabled === true),
    );
    if (sort === 'name')
      return [...filtered].sort((a, b) =>
        a.name.localeCompare(b.name, language),
      );
    // Stable: open stores first, then the directory order.
    return [...filtered].sort(
      (a, b) => Number(b.accepting_orders) - Number(a.accepting_orders),
    );
  })();

  const empty =
    chip === 'favorites' &&
    !query.trim() &&
    (!directoryMode || (activeFilters.length === 1 && !category))
      ? t('landing.noFavoriteShops')
      : chip === 'open' &&
          !query.trim() &&
          (!directoryMode || (activeFilters.length === 1 && !category))
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

  if (directoryMode) {
    const pageCount = Math.max(1, Math.ceil(visible.length / 8));
    const requestedPage = Number(params.get('page'));
    const page =
      Number.isSafeInteger(requestedPage) && requestedPage > 0
        ? Math.min(requestedPage, pageCount)
        : 1;
    const firstPage = Math.max(1, Math.min(page - 2, pageCount - 4));
    const pageNumbers = Array.from(
      { length: Math.min(pageCount, 5) },
      (_, index) => firstPage + index,
    );
    const quickFilters = [
      { value: 'open', label: 'landing.openNow' },
      { value: 'delivery', label: 'landing.deliveryAvailable' },
      { value: 'favorites', label: 'landing.favoriteShops' },
    ] as const;

    function toggleFilter(value: string) {
      const next = new URLSearchParams(params);
      next.delete('type');
      const values = activeFilters.includes(value)
        ? activeFilters.filter((item) => item !== value)
        : [...activeFilters, value];
      next.delete('filter');
      values.forEach((item) => next.append('filter', item));
      next.delete('page');
      setParams(next, { replace: true, preventScrollReset: true });
    }

    return (
      <div className="landing-page customer-directory shop-discover-directory">
        <div className="shop-discover-toolbar">
          <div
            className="shop-discover-types"
            role="group"
            aria-label={t('storefront.customer.foodCategories')}
          >
            <span className="shop-discover-filter-label">
              <Utensils size={18} aria-hidden="true" />
              {t('storefront.customer.foodCategories')}
            </span>
            <button
              type="button"
              aria-pressed={category === null}
              onClick={() => updateFilters({ category: null })}
            >
              <LayoutGrid size={17} aria-hidden="true" />
              {t('storefront.customer.allCategories')}
            </button>
            {foodCategories.map(({ code: value, label }) => {
              const Icon = categoryIcons[value];
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={category === value}
                  onClick={() => updateFilters({ category: value })}
                >
                  <Icon size={17} aria-hidden="true" />
                  {t(label)}
                </button>
              );
            })}
          </div>
          <label className="customer-sort">
            <span>{t('storefront.customer.sortLabel')}</span>
            <select
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
            <ChevronDown size={16} aria-hidden="true" />
          </label>
        </div>
        <section
          className="customer-directory-results"
          aria-labelledby={headingId}
        >
          <h2 className="sr-only" id={headingId} tabIndex={-1}>
            {t('storefront.publishedStores')}
          </h2>
          {!status && (
            <p className="sr-only" role="status">
              {t('storefront.customer.areaListed', {
                count: visible.length.toLocaleString(language),
              })}
            </p>
          )}
          <div
            className="customer-chips"
            role="group"
            aria-label={t('storefront.customer.shopFilters')}
          >
            <span className="shop-discover-filter-label">
              <SlidersHorizontal size={18} aria-hidden="true" />
              {t('storefront.customer.quickFilters')}
            </span>
            {quickFilters.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                aria-pressed={activeFilters.includes(value)}
                onClick={() => toggleFilter(value)}
              >
                <span className="shop-discover-check" aria-hidden="true">
                  <Check size={14} />
                </span>
                {t(label)}
              </button>
            ))}
          </div>
          {status ??
            (visible.length ? (
              <>
                <ul
                  className="landing-shops"
                  aria-label={t('storefront.publishedStores')}
                  aria-live="polite"
                >
                  {visible.slice((page - 1) * 8, page * 8).map((shop) => (
                    <li key={shop.slug}>
                      <LandingShopCard
                        shop={shop}
                        directorySearch={directorySearch}
                        statusLabel={t(
                          shop.accepting_orders
                            ? 'storefront.acceptingOrders'
                            : 'storefront.notAcceptingOrders',
                        )}
                        favorite={saved.isFavorite(shop.slug)}
                        onToggleFavorite={() => saved.toggle(shop.slug)}
                      />
                    </li>
                  ))}
                </ul>
                {pageCount > 1 && (
                  <nav
                    className="shop-discover-pagination"
                    aria-label={t('storefront.customer.pagination')}
                  >
                    <button
                      type="button"
                      disabled={page === 1}
                      onClick={() =>
                        updateFilters({
                          page: page === 2 ? null : String(page - 1),
                        })
                      }
                    >
                      <ChevronLeft size={16} aria-hidden="true" />
                      {t('storefront.customer.previousPage')}
                    </button>
                    {pageNumbers.map((number) => (
                      <button
                        key={number}
                        type="button"
                        aria-current={page === number ? 'page' : undefined}
                        onClick={() =>
                          updateFilters({
                            page: number === 1 ? null : String(number),
                          })
                        }
                      >
                        {number}
                      </button>
                    ))}
                    <button
                      type="button"
                      disabled={page === pageCount}
                      onClick={() => updateFilters({ page: String(page + 1) })}
                    >
                      {t('storefront.customer.nextPage')}
                      <ChevronRight size={16} aria-hidden="true" />
                    </button>
                  </nav>
                )}
              </>
            ) : (
              <div className="customer-empty">
                <p role="status">{empty}</p>
                {(category ||
                  activeFilters.length > 0 ||
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
    );
  }

  return (
    <div className="customer-directory">
      {hero && (
        <DiscoveryHero {...hero} compact>
          {searchField}
        </DiscoveryHero>
      )}
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
                {selectedCategory && ` · ${t(selectedCategory.label)}`}
              </summary>
              <label className="customer-sort">
                <span>{t('storefront.customer.foodCategories')}</span>
                <select
                  value={category ?? ''}
                  onChange={(event) =>
                    updateFilters({
                      category: event.target.value || null,
                    })
                  }
                >
                  <option value="">
                    {t('storefront.customer.allCategories')}
                  </option>
                  {foodCategories.map(({ code: value, label }) => (
                    <option key={value} value={value}>
                      {t(label)}
                    </option>
                  ))}
                </select>
              </label>
            </details>
          )}
          <h2 className="customer-type-heading">
            {t('storefront.customer.foodCategories')}
          </h2>
          <div
            className="customer-type-list"
            role="group"
            aria-label={t('storefront.customer.foodCategories')}
          >
            <button
              type="button"
              aria-pressed={category === null}
              onClick={() => updateFilters({ category: null })}
            >
              <LayoutGrid size={16} aria-hidden="true" />
              {t('storefront.customer.allCategories')}
            </button>
            {foodCategories.map(({ code: value, label }) => (
              <button
                key={value}
                type="button"
                aria-pressed={category === value}
                onClick={() => updateFilters({ category: value })}
              >
                {t(label)}
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
                  category ||
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
