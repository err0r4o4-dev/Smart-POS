import { useLanguage } from '../../app/language';
import type { UiMessage } from '../../i18n';
import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Grid2X2,
  Heart,
  LayoutGrid,
  List,
  Minus,
  Package,
  PackageOpen,
  Plus,
  Search,
  ShoppingCart,
  SlidersHorizontal,
  Store,
} from 'lucide-react';
import { Button, Card, Loading, Tag } from '../../components/ui/primitives';
import {
  exactDecimal,
  isKnownStockPolicy,
  MAX_LINE_QUANTITY,
  moneyText,
} from '../../lib/pos-api';
import {
  storefrontRequest,
  type ShopCatalogPage,
  type ShopProduct,
  type ShopSettings,
} from '../../lib/storefront-api';
import { useShopCart } from './shop-cart';
import { useShopFavorites } from './shop-favorites';
import { ShopError, ShopPagination } from './shop-feedback';
import './catalog.css';

const CATEGORY_TRANSLATIONS: Record<string, string> = {
  ขนมขบเคี้ยว: 'Snacks',
  ผลิตภัณฑ์นมและเนย: 'Dairy & Butter',
  อาหารกึ่งสำเร็จรูป: 'Instant Food',
  เครื่องดื่ม: 'Beverages',
};

const PRODUCT_TRANSLATIONS: Record<string, string> = {
  'โค้ก ออริจินัล': 'Coca-Cola Original',
  'มันฝรั่งแท้ทอดกรอบ เลย์ รสคลาสสิค': "Lay's Classic Potato Chips",
  'บะหมี่กึ่งสำเร็จรูป มาม่า รสต้มยำกุ้ง': 'Mama Instant Noodles Tom Yum Kung',
  'ชาเขียวพร้อมดื่ม อิชิตัน กรีนที รสต้นตำรับ': 'Ichitan Green Tea Original',
  'นมเปรี้ยว ดัชมิลล์ 4อิน1 รสผลไม้รวม':
    'Dutch Mill 4-in-1 Mixed Fruit Drinking Yogurt',
  'เนสกาแฟ เบลนด์ แอนด์ บรู ริช อโรมา': 'Nescafe Blend & Brew Rich Aroma',
  'โออิชิ กรีนที รสข้าวญี่ปุ่น เก็นไมฉะ': 'Oishi Green Tea Genmaicha',
  'เป๊ปซี่ กลิ่นไลม์ มะนาว ลิมิเต็ด (เลิกจำหน่าย)':
    'Pepsi Lime Limited Edition',
  'เลย์ แม็กซ์ แผ่นหยัก กลิ่นพริกปีศาจ เอกซ์ตรีม (เลิกจำหน่าย)':
    "Lay's Max Ghost Pepper Extreme",
};

function translateCategory(name: string | undefined, lang: string): string {
  if (!name) return '';
  if (lang !== 'en') return name;
  return CATEGORY_TRANSLATIONS[name.trim()] ?? name;
}

function translateProduct(name: string | undefined, lang: string): string {
  if (!name) return '';
  if (lang !== 'en') return name;
  return PRODUCT_TRANSLATIONS[name.trim()] ?? name;
}
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
  const { t, messageText, localize, language } = useLanguage();

  const cart = useShopCart(slug);
  const favorites = useShopFavorites(slug);
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState(initialFilters);
  const [priceDraft, setPriceDraft] = useState({ minimum: '', maximum: '' });
  const [priceError, setPriceError] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [message, setMessage] = useState<UiMessage>('');

  useEffect(() => {
    const onToggle = () => setSidebarCollapsed((v) => !v);
    window.addEventListener('toggle-catalog-sidebar', onToggle);
    return () => window.removeEventListener('toggle-catalog-sidebar', onToggle);
  }, []);

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
  if (filters.sort !== 'name' && filters.sort !== 'favorites')
    parameters.set('sort', filters.sort);
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
  const rawItems = products.data?.items ?? [];
  const items = useMemo(() => {
    if (filters.sort !== 'favorites') return rawItems;
    return [...rawItems].sort((a, b) => {
      const aFav = favorites.isFavorite(a.variant_id) ? 1 : 0;
      const bFav = favorites.isFavorite(b.variant_id) ? 1 : 0;
      return bFav - aFav;
    });
  }, [rawItems, filters.sort, favorites]);
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
      <header className="shop-page-heading shop-store-heading">
        <div className="shop-store-identity">
          <span className="shop-store-symbol">
            <Store size={28} strokeWidth={1.6} aria-hidden="true" />
          </span>
          <div>
            <h1>{store.name}</h1>
            {store.description && <p>{store.description}</p>}
          </div>
        </div>
        <Tag tone={store.accepting_orders ? 'success' : 'neutral'}>
          <span className="shop-directory-status-dot" aria-hidden="true" />
          {store.accepting_orders
            ? t('storefront.acceptingOrders')
            : t('storefront.notAcceptingOrders')}
        </Tag>
      </header>
      <div
        className={`catalog-layout ${sidebarCollapsed ? 'catalog-layout-sidebar-collapsed' : ''}`}
      >
        <aside
          className={`catalog-sidebar ${sidebarCollapsed ? 'catalog-sidebar-collapsed' : ''}`}
          aria-label={t('catalog.productCategory')}
        >
          <div className="catalog-sidebar-header">
            <h2>
              {language === 'th'
                ? 'หมวดหมู่เมนู'
                : t('catalog.productCategory')}
            </h2>
            <button
              type="button"
              className="catalog-sidebar-collapse-btn"
              aria-label={
                sidebarCollapsed
                  ? language === 'th'
                    ? 'ขยายหมวดหมู่'
                    : 'Expand categories'
                  : language === 'th'
                    ? 'ย่อหมวดหมู่'
                    : 'Collapse categories'
              }
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            >
              {sidebarCollapsed ? (
                <ChevronRight size={16} aria-hidden="true" />
              ) : (
                <ChevronLeft size={16} aria-hidden="true" />
              )}
            </button>
          </div>
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
              <LayoutGrid size={18} aria-hidden="true" />
              <span>{t('common.all')}</span>
              <span className="catalog-category-count">{allCount}</span>
            </Button>
            {categories.map((category) => (
              <Button
                key={category.id}
                className="catalog-category"
                aria-label={`${translateCategory(category.name, language)} ${category.count}`}
                aria-pressed={filters.category === category.id}
                onClick={() => {
                  changeFilters({ category: category.id });
                  setCategoriesOpen(false);
                }}
              >
                <Package size={18} aria-hidden="true" />
                <span>{translateCategory(category.name, language)}</span>
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
              <Search size={19} aria-hidden="true" />
              <span className="catalog-visually-hidden">
                {t('common.searchProducts')}
              </span>
              <input
                id="shop-search"
                type="search"
                value={search}
                maxLength={100}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={
                  language === 'th'
                    ? 'ค้นหาเมนูอาหาร เช่น ผัดกะเพรา ราดหน้า ผัดซีอิ๊ว'
                    : t('storefront.productNameVariantOrSku')
                }
              />
            </label>
            <Button type="submit" className="catalog-search-submit">
              {t('customers.search')}
            </Button>
          </form>
          <div
            className="catalog-toolbar"
            role="group"
            aria-label={t('storefront.productFiltersAndDisplay')}
          >
            <div className="catalog-sort-wrapper">
              <SlidersHorizontal size={15} aria-hidden="true" />
              <select
                aria-label={t('storefront.sortProducts')}
                value={filters.sort}
                disabled={!supportsFilters}
                onChange={(event) =>
                  changeFilters({ sort: event.target.value })
                }
              >
                <option value="name">
                  {language === 'th' ? 'เรียงตาม: ยอดนิยม' : 'Sort: Popular'}
                </option>
                <option value="favorites">
                  {language === 'th'
                    ? 'เรียงตาม: รายการโปรด'
                    : 'Sort: Favorites'}
                </option>
                <option value="price_asc">
                  {language === 'th'
                    ? 'เรียงตาม: ราคา ต่ำ-สูง'
                    : t('storefront.priceLowToHigh')}
                </option>
                <option value="price_desc">
                  {language === 'th'
                    ? 'เรียงตาม: ราคา สูง-ต่ำ'
                    : t('storefront.priceHighToLow')}
                </option>
              </select>
            </div>
            <details className="catalog-price-filter">
              <summary>
                <SlidersHorizontal size={15} aria-hidden="true" />{' '}
                {t('storefront.priceRange')}{' '}
                <ChevronDown size={15} aria-hidden="true" />
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
                  <Grid2X2 size={18} aria-hidden="true" />
                </Button>
                <Button
                  aria-label={t('storefront.listView')}
                  aria-pressed={view === 'list'}
                  onClick={() => setView('list')}
                >
                  <List size={19} aria-hidden="true" />
                </Button>
              </div>
            </div>
          </div>
          {products.data && !supportsFilters && (
            <p className="catalog-compatibility">
              {t('storefront.categoryPriceAndSortingFiltersRequireA')}
            </p>
          )}
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
            {items.map((product) => (
              <CatalogProductCard
                key={`${product.variant_id}:${product.image_url ?? ''}`}
                product={product}
                cartQuantity={
                  cart.items.find(
                    (item) => item.variant_id === product.variant_id,
                  )?.quantity ?? '0.000'
                }
                isFavorite={favorites.isFavorite(product.variant_id)}
                onToggleFavorite={() => {
                  const added = favorites.toggle(product.variant_id);
                  setMessage(
                    added
                      ? language === 'th'
                        ? `บันทึก "${product.product_name}" ในรายการโปรดแล้ว`
                        : `Added "${product.product_name}" to favorites`
                      : language === 'th'
                        ? `นำ "${product.product_name}" ออกจากรายการโปรดแล้ว`
                        : `Removed "${product.product_name}" from favorites`,
                  );
                }}
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
  isFavorite = false,
  onToggleFavorite,
  disabled,
  add,
}: {
  product: ShopProduct;
  cartQuantity: string;
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  disabled: boolean;
  add: (quantity: string) => void;
}) {
  const { t, language } = useLanguage();

  const stock = exactDecimal(product.available ?? '', 3) ?? 0n;
  const menuOnly = product.stock_policy === 'MENU_ONLY';
  const cartUnits = exactDecimal(cartQuantity, 3) ?? 0n;
  const remaining =
    (menuOnly
      ? MAX_LINE_QUANTITY
      : stock < MAX_LINE_QUANTITY
        ? stock
        : MAX_LINE_QUANTITY) - cartUnits;
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
  const ready =
    product.saleable &&
    isKnownStockPolicy(product.stock_policy) &&
    (menuOnly || stock >= step);
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
            <PackageOpen size={48} strokeWidth={1.2} aria-hidden="true" />
            <span>{t('catalog.noProductImageYet')}</span>
          </div>
        )}
        <button
          type="button"
          className={`catalog-product-favorite ${isFavorite ? 'catalog-product-favorite-active' : ''}`}
          aria-pressed={isFavorite}
          aria-label={
            isFavorite
              ? language === 'th'
                ? 'นำออกจากรายการโปรด'
                : 'Remove from favorites'
              : language === 'th'
                ? 'บันทึกในรายการโปรด'
                : 'Add to favorites'
          }
          title={
            isFavorite
              ? language === 'th'
                ? 'นำออกจากรายการโปรด'
                : 'Remove from favorites'
              : language === 'th'
                ? 'บันทึกในรายการโปรด'
                : 'Add to favorites'
          }
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onToggleFavorite?.();
          }}
        >
          <Heart
            size={16}
            strokeWidth={isFavorite ? 0 : 1.8}
            fill={isFavorite ? '#ef4444' : 'none'}
            className={isFavorite ? 'heart-filled' : ''}
            aria-hidden="true"
          />
        </button>
      </div>
      <div className="catalog-product-body">
        <div className="catalog-product-info">
          <span className="catalog-product-category">
            {translateCategory(product.category_name, language) ||
              t('common.products')}
          </span>
          <h2 id={`product-${product.variant_id}`}>
            {translateProduct(product.product_name, language)}
          </h2>
          <p className="catalog-variant">{product.variant_name}</p>
        </div>
        <div className="catalog-product-meta-actions">
          <div className="catalog-product-price-stock">
            <strong className="catalog-product-price">
              ฿{moneyText(product.unit_price)}
            </strong>
            <p className="catalog-product-stock" data-ready={ready}>
              <span className="catalog-stock-dot" aria-hidden="true" />
              <span className="catalog-stock-text">
                {ready
                  ? language === 'th'
                    ? 'พร้อมจำหน่าย'
                    : menuOnly
                      ? 'Available'
                      : 'In stock'
                  : t('storefront.productUnavailableForSale')}
              </span>
              <span className="catalog-visually-hidden">
                {ready && !menuOnly
                  ? t('storefront.availableValue0Value1', {
                      value0: quantityText(stock),
                      value1: product.unit,
                    })
                  : !ready
                    ? t('storefront.productUnavailableForSale')
                    : null}
              </span>
            </p>
          </div>
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
                <Minus size={15} aria-hidden="true" />
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
                  disabled ||
                  !ready ||
                  units === null ||
                  units + step > remaining
                }
                onClick={() => {
                  if (units !== null) setQuantity(quantityText(units + step));
                }}
              >
                <Plus size={15} aria-hidden="true" />
              </Button>
            </div>
            <Button
              className="catalog-add"
              disabled={disabled || !ready || !valid}
              onClick={() => add(quantity)}
            >
              <ShoppingCart size={16} aria-hidden="true" />
              {t('storefront.addToCart')}
            </Button>
          </div>
        </div>
        {!valid && ready && remaining >= step && (
          <small id={errorID} className="catalog-quantity-error">
            {t('storefront.enterQuantity')}
            {whole ? t('storefront.whole') : ''}
            {t('storefront.greaterThan0AndNoMoreThan')}{' '}
            {quantityText(remaining)} {product.unit}
          </small>
        )}
        {ready && remaining < step && !menuOnly && (
          <small className="catalog-cart-limit">
            {t('storefront.allAvailableQuantityIsAlreadyInYour')}
          </small>
        )}
      </div>
    </article>
  );
}
