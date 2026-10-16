import { useLanguage } from '../../app/language';
import type { UiMessage } from '../../i18n';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronDown,
  Grid2X2,
  LayoutGrid,
  List,
  Minus,
  PackageOpen,
  Plus,
  Search,
  ShoppingCart,
  SlidersHorizontal,
} from 'lucide-react';
import { Button, Card, Loading } from '../../components/ui/primitives';
import { exactDecimal, moneyText } from '../../lib/pos-api';
import {
  storefrontRequest,
  type ShopCatalogPage,
  type ShopProduct,
  type ShopSettings,
} from '../../lib/storefront-api';
import { useShopCart } from './shop-cart';
import { ShopError, ShopPagination } from './shop-feedback';
import './catalog.css';

const initialFilters = {
  category: '',
  minimum: '',
  maximum: '',
  sort: 'name',
};
function quantityText(value: bigint) {
  const remainder = (value % 1000n)
    .toString()
    .padStart(3, '0')
    .replace(/0+$/, '');
  return `${value / 1000n}${remainder ? `.${remainder}` : ''}`;
}

export function ShopCatalog({ slug }: { slug: string }) {
  const { t, messageText, localize } = useLanguage();

  const cart = useShopCart(slug);
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(initialFilters);
  const [priceDraft, setPriceDraft] = useState({ minimum: '', maximum: '' });
  const [priceError, setPriceError] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [message, setMessage] = useState<UiMessage>('');
  const shop = useQuery({
    queryKey: ['storefront', slug, 'settings'],
    queryFn: ({ signal }) =>
      storefrontRequest<ShopSettings>(`/${slug}`, { signal }),
    retry: false,
  });
  const parameters = new URLSearchParams({
    search: submitted,
    page: String(page),
  });
  if (filters.category) parameters.set('category_id', filters.category);
  if (filters.minimum) parameters.set('min_price', filters.minimum);
  if (filters.maximum) parameters.set('max_price', filters.maximum);
  if (filters.sort !== 'name') parameters.set('sort', filters.sort);
  const query = parameters.toString();
  const products = useQuery({
    queryKey: ['storefront', slug, 'products', query],
    queryFn: ({ signal }) =>
      storefrontRequest<ShopCatalogPage>(`/${slug}/products?${query}`, {
        signal,
      }),
    enabled: !!shop.data,
    retry: false,
  });
  const changeFilters = (change: Partial<typeof initialFilters>) => {
    setFilters((previous) => ({ ...previous, ...change }));
    setPage(1);
    setMessage('');
  };
  const clear = () => {
    setFilters(initialFilters);
    setPriceDraft({ minimum: '', maximum: '' });
    setPriceError('');
    setSearch('');
    setSubmitted('');
    setPage(1);
  };
  if (shop.isPending) return <Loading>{t('storefront.loadingStore')}</Loading>;
  if (shop.error || !shop.data)
    return <ShopError error={shop.error} retry={() => void shop.refetch()} />;
  const store = shop.data;
  const categories = products.data?.categories ?? [];
  const supportsFilters = products.data?.categories !== undefined;
  const allCount = supportsFilters
    ? categories.reduce((total, category) => total + category.count, 0)
    : (products.data?.total ?? 0);
  const filtered = !!(
    submitted ||
    filters.category ||
    filters.minimum ||
    filters.maximum ||
    filters.sort !== 'name'
  );
  return (
    <div className="shop-catalog">
      <div className="catalog-layout">
        <aside
          className="catalog-sidebar"
          aria-label={t('catalog.productCategory')}
        >
          <h2>
            <Grid2X2 size={19} aria-hidden="true" />{' '}
            {t('catalog.productCategory')}
          </h2>
          <Button
            className="button-secondary catalog-category-toggle"
            aria-expanded={categoriesOpen}
            aria-controls="catalog-category-list"
            onClick={() => setCategoriesOpen(!categoriesOpen)}
          >
            <SlidersHorizontal size={18} aria-hidden="true" />{' '}
            {t('catalog.categories')}{' '}
            <ChevronDown size={16} aria-hidden="true" />
          </Button>
          <div
            id="catalog-category-list"
            className="catalog-category-list"
            data-expanded={categoriesOpen}
          >
            <Button
              className="catalog-category"
              aria-label={t('storefront.allValue0', { value0: allCount })}
              aria-pressed={!filters.category}
              onClick={() => changeFilters({ category: '' })}
            >
              <LayoutGrid size={19} aria-hidden="true" />
              <span>{t('common.all')}</span>
              <span className="catalog-category-count">{allCount}</span>
            </Button>
            {categories.map((category) => (
              <Button
                key={category.id}
                className="catalog-category"
                aria-label={`${category.name} ${category.count}`}
                aria-pressed={filters.category === category.id}
                onClick={() => {
                  changeFilters({ category: category.id });
                  setCategoriesOpen(false);
                }}
              >
                <PackageOpen size={19} aria-hidden="true" />
                <span>{category.name}</span>
                <span className="catalog-category-count">{category.count}</span>
              </Button>
            ))}
          </div>
        </aside>
        <section
          className="catalog-main"
          aria-label={t('landing.yourProducts')}
        >
          <form
            className="catalog-search"
            onSubmit={(event) => {
              event.preventDefault();
              setSubmitted(search.trim());
              setPage(1);
              setMessage('');
            }}
          >
            <label htmlFor="shop-search" className="catalog-search-field">
              <Search size={20} aria-hidden="true" />
              <span className="catalog-visually-hidden">
                {t('common.searchProducts')}
              </span>
              <input
                id="shop-search"
                type="search"
                value={search}
                maxLength={100}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('storefront.productNameVariantOrSku')}
              />
            </label>
            <Button type="submit">{t('customers.search')}</Button>
          </form>
          <div
            className="catalog-toolbar"
            role="group"
            aria-label={t('storefront.productFiltersAndDisplay')}
          >
            <details className="catalog-price-filter">
              <summary>
                <SlidersHorizontal size={16} aria-hidden="true" />{' '}
                {t('storefront.priceRange')}{' '}
                <ChevronDown size={16} aria-hidden="true" />
              </summary>
              <form
                className="catalog-price-panel"
                onSubmit={(event) => {
                  event.preventDefault();
                  const minimum = priceDraft.minimum
                    ? exactDecimal(priceDraft.minimum)
                    : null;
                  const maximum = priceDraft.maximum
                    ? exactDecimal(priceDraft.maximum)
                    : null;
                  const moneyPattern = /^[0-9]{1,16}(\.[0-9]{1,2})?$/;
                  if (
                    (priceDraft.minimum &&
                      (!moneyPattern.test(priceDraft.minimum) ||
                        minimum === null)) ||
                    (priceDraft.maximum &&
                      (!moneyPattern.test(priceDraft.maximum) ||
                        maximum === null)) ||
                    (minimum !== null && maximum !== null && minimum > maximum)
                  ) {
                    setPriceError(
                      t('storefront.enterAValidPriceRangeTheMinimum'),
                    );
                    return;
                  }
                  setPriceError('');
                  changeFilters(priceDraft);
                  event.currentTarget
                    .closest('details')
                    ?.removeAttribute('open');
                }}
              >
                <label>
                  {t('storefront.minimumPrice')}
                  <input
                    inputMode="decimal"
                    value={priceDraft.minimum}
                    maxLength={19}
                    onChange={(event) =>
                      setPriceDraft({
                        ...priceDraft,
                        minimum: event.target.value,
                      })
                    }
                    placeholder="0.00"
                  />
                </label>
                <label>
                  {t('storefront.maximumPrice')}
                  <input
                    inputMode="decimal"
                    value={priceDraft.maximum}
                    maxLength={19}
                    onChange={(event) =>
                      setPriceDraft({
                        ...priceDraft,
                        maximum: event.target.value,
                      })
                    }
                    placeholder={t('storefront.noLimit')}
                  />
                </label>
                {priceError && <p role="alert">{localize(priceError)}</p>}
                <Button type="submit" disabled={!supportsFilters}>
                  {t('storefront.applyPriceRange')}
                </Button>
              </form>
            </details>
            {filtered && (
              <Button className="catalog-clear" onClick={clear}>
                {t('storefront.clearFilters')}
              </Button>
            )}
            <div className="catalog-view-controls">
              <select
                aria-label={t('storefront.sortProducts')}
                value={filters.sort}
                disabled={!supportsFilters}
                onChange={(event) =>
                  changeFilters({ sort: event.target.value })
                }
              >
                <option value="name">{t('storefront.sortProductName')}</option>
                <option value="price_asc">
                  {t('storefront.priceLowToHigh')}
                </option>
                <option value="price_desc">
                  {t('storefront.priceHighToLow')}
                </option>
              </select>
              <div
                className="catalog-view-toggle"
                role="group"
                aria-label={t('storefront.productDisplayMode')}
              >
                <Button
                  aria-label={t('storefront.gridView')}
                  aria-pressed={view === 'grid'}
                  onClick={() => setView('grid')}
                >
                  <Grid2X2 size={19} aria-hidden="true" />
                </Button>
                <Button
                  aria-label={t('storefront.listView')}
                  aria-pressed={view === 'list'}
                  onClick={() => setView('list')}
                >
                  <List size={20} aria-hidden="true" />
                </Button>
              </div>
            </div>
          </div>
          {products.data && !supportsFilters && (
            <p className="catalog-compatibility">
              {t('storefront.categoryPriceAndSortingFiltersRequireA')}
            </p>
          )}
          <p
            role="status"
            aria-label={t('storefront.addProductResult')}
            className="catalog-feedback"
          >
            {messageText(message)}
          </p>
          {products.isPending && (
            <Loading>{t('storefront.loadingProducts')}</Loading>
          )}
          {products.error && (
            <ShopError
              error={products.error}
              retry={() => void products.refetch()}
            />
          )}
          {products.data?.total === 0 && (
            <Card className="catalog-empty">
              <PackageOpen size={40} aria-hidden="true" />
              <h2>{t('pos.noProductsFound')}</h2>
              <p>{t('storefront.tryAnotherSearchOrWaitForThe')}</p>
              {filtered && (
                <Button className="button-secondary" onClick={clear}>
                  {t('storefront.showAllProducts')}
                </Button>
              )}
            </Card>
          )}
          <div className={`catalog-products catalog-products-${view}`}>
            {products.data?.items.map((product) => (
              <CatalogProductCard
                key={`${product.variant_id}:${product.image_url ?? ''}`}
                product={product}
                cartQuantity={
                  cart.items.find(
                    (item) => item.variant_id === product.variant_id,
                  )?.quantity ?? '0.000'
                }
                disabled={
                  !store.accepting_orders ||
                  (cart.items.length >= 100 &&
                    !cart.items.some(
                      (item) => item.variant_id === product.variant_id,
                    ))
                }
                add={(quantity) => {
                  if (cart.add(product, quantity))
                    setMessage({
                      key: 'storefront.addedValue0ToCart',
                      params: { value0: product.product_name },
                    });
                  else
                    setMessage(
                      t('storefront.unableToAddProductCheckQuantityAnd'),
                    );
                }}
              />
            ))}
          </div>
          {products.data && (
            <ShopPagination
              page={page}
              pageSize={products.data.page_size}
              total={products.data.total}
              change={(next) => {
                setPage(next);
                setMessage('');
              }}
            />
          )}
        </section>
      </div>
    </div>
  );
}

function CatalogProductCard({
  product,
  cartQuantity,
  disabled,
  add,
}: {
  product: ShopProduct;
  cartQuantity: string;
  disabled: boolean;
  add: (quantity: string) => void;
}) {
  const { t } = useLanguage();

  const stock = exactDecimal(product.available, 3) ?? 0n;
  const remaining = stock - (exactDecimal(cartQuantity, 3) ?? 0n);
  const whole = ['COUNT', 'PACKAGING'].includes(product.unit_type);
  const step = whole ? 1000n : 1n;
  const [quantity, setQuantity] = useState(() =>
    !whole && remaining > 0n && remaining < 1000n
      ? quantityText(remaining)
      : '1',
  );
  const [imageFailed, setImageFailed] = useState(false);
  const units = exactDecimal(quantity, 3);
  const valid =
    units !== null &&
    units > 0n &&
    units <= remaining &&
    (!whole || units % 1000n === 0n);
  const ready = product.saleable && stock >= step;
  const inputID = `quantity-${product.variant_id}`;
  const errorID = `${inputID}-error`;
  return (
    <article
      className="catalog-product"
      aria-labelledby={`product-${product.variant_id}`}
    >
      <div className="catalog-product-media">
        {product.image_url && !imageFailed ? (
          <img
            src={product.image_url}
            alt={product.product_name}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="catalog-product-placeholder">
            <PackageOpen size={62} strokeWidth={1.2} aria-hidden="true" />
            <span>{t('catalog.noProductImageYet')}</span>
          </div>
        )}
      </div>
      <div className="catalog-product-body">
        <span className="catalog-product-category">
          {product.category_name || t('common.products')}
        </span>
        <h2 id={`product-${product.variant_id}`}>{product.product_name}</h2>
        <p className="catalog-variant">{product.variant_name}</p>
        <small className="catalog-product-sku">
          {t('common.sku')} {product.sku} {t('storefront.unit')} {product.unit}
        </small>
        <strong className="catalog-product-price">
          ฿{moneyText(product.unit_price)}
        </strong>
        <p className="catalog-product-stock" data-ready={ready}>
          <span aria-hidden="true" />
          {ready
            ? t('storefront.availableValue0Value1', {
                value0: quantityText(stock),
                value1: product.unit,
              })
            : t('storefront.productUnavailableForSale')}
        </p>
        <div className="catalog-product-actions">
          <div className="catalog-quantity">
            <Button
              aria-label={t('storefront.decreaseQuantityForValue0', {
                value0: product.product_name,
              })}
              disabled={disabled || !ready || units === null || units <= step}
              onClick={() => {
                if (units !== null) setQuantity(quantityText(units - step));
              }}
            >
              <Minus size={16} aria-hidden="true" />
            </Button>
            <label className="catalog-visually-hidden" htmlFor={inputID}>
              {t('pos.quantity')} {product.product_name}
            </label>
            <input
              id={inputID}
              type="number"
              inputMode={whole ? 'numeric' : 'decimal'}
              min={quantityText(step)}
              max={quantityText(remaining > 0n ? remaining : 0n)}
              step={quantityText(step)}
              value={quantity}
              disabled={disabled || !ready || remaining < step}
              aria-invalid={!valid && ready && remaining >= step}
              aria-describedby={
                !valid && ready && remaining >= step ? errorID : undefined
              }
              onChange={(event) => setQuantity(event.target.value)}
            />
            <Button
              aria-label={t('storefront.increaseQuantityForValue02', {
                value0: product.product_name,
              })}
              disabled={
                disabled || !ready || units === null || units + step > remaining
              }
              onClick={() => {
                if (units !== null) setQuantity(quantityText(units + step));
              }}
            >
              <Plus size={16} aria-hidden="true" />
            </Button>
          </div>
          <Button
            className="catalog-add"
            disabled={disabled || !ready || !valid}
            onClick={() => add(quantity)}
          >
            <ShoppingCart size={18} aria-hidden="true" />
            {t('storefront.addToCart')}
          </Button>
        </div>
        {!valid && ready && remaining >= step && (
          <small id={errorID} className="catalog-quantity-error">
            {t('storefront.enterQuantity')}
            {whole ? t('storefront.whole') : ''}
            {t('storefront.greaterThan0AndNoMoreThan')}{' '}
            {quantityText(remaining)} {product.unit}
          </small>
        )}
        {ready && remaining < step && (
          <small className="catalog-cart-limit">
            {t('storefront.allAvailableQuantityIsAlreadyInYour')}
          </small>
        )}
      </div>
    </article>
  );
}
