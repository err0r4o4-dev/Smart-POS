import { useLanguage } from '../../app/language';
import { useId, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowRight,
  ChevronDown,
  LayoutGrid,
  List,
  PackageOpen,
  Search,
  ShieldCheck,
  ShoppingBag,
  Store,
  Zap,
} from 'lucide-react';
import { Card, Loading, Tag } from '../../components/ui/primitives';
import {
  storefrontRequest,
  type ShopDirectoryEntry,
} from '../../lib/storefront-api';
import { ShopCatalog } from './ShopCatalog';
import { ShopError } from './shop-feedback';
export { ShopError, ShopPagination } from './shop-feedback';
import './storefront.css';

function normalizeBusinessType(type: string | undefined) {
  return type?.trim().toUpperCase() ?? '';
}

function businessTypeLabel(type: string, language: string) {
  const labels: Record<string, [string, string]> = {
    RESTAURANT: ['ร้านอาหาร', 'Restaurant'],
    CAFE: ['คาเฟ่', 'Cafe'],
    BAKERY: ['เบเกอรี่', 'Bakery'],
    FAST_FOOD: ['ฟาสต์ฟู้ด', 'Fast food'],
    BAR: ['บาร์', 'Bar'],
    RETAIL: ['ร้านค้าปลีก', 'Retail'],
    '': ['ไม่ระบุประเภท', 'Unspecified'],
  };
  return labels[type]?.[language === 'th' ? 0 : 1] ?? type;
}

export function StorefrontPage() {
  const { slug } = useParams();
  return slug ? <ShopCatalog key={slug} slug={slug} /> : <ShopEntry />;
}
function ShopEntry() {
  const { t, language } = useLanguage();
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [categoriesOpen, setCategoriesOpen] = useState(false);
  const [businessType, setBusinessType] = useState<string | null>(null);
  const categoryToggle = useRef<HTMLButtonElement>(null);
  const categoryPanelId = useId();

  const shops = useQuery({
    queryKey: ['storefront-directory'],
    queryFn: async ({ signal }) => {
      const items = await storefrontRequest<ShopDirectoryEntry[]>('', {
        signal,
        storeMode: () => {},
      });
      return items;
    },
    retry: false,
  });

  const businessTypes = useMemo(
    () =>
      [
        ...new Set(
          (shops.data ?? []).map((shop) =>
            normalizeBusinessType(shop.business_type),
          ),
        ),
      ].sort(),
    [shops.data],
  );
  const visibleShops = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return (shops.data ?? []).filter(
      (shop) =>
        (!query || shop.name.toLocaleLowerCase().includes(query)) &&
        (businessType === null ||
          normalizeBusinessType(shop.business_type) === businessType),
    );
  }, [search, businessType, shops.data]);
  return (
    <>
      <section
        className="storefront-hero shop-directory-hero"
        aria-labelledby="storefront-title"
      >
        <div className="shop-directory-hero-copy">
          <span className="shop-directory-badge">
            <Store size={21} aria-hidden="true" />
            {language === 'th' ? 'ร้านค้าออนไลน์' : 'Online stores'}
          </span>
          <h1 id="storefront-title" tabIndex={-1}>
            {t('landing.onlineStorefront')}
          </h1>
          <p>
            {language === 'th'
              ? 'เลือกค้นหาร้านอาหารที่คุณต้องการ และเริ่มสั่งซื้อได้ทันที'
              : 'Choose a restaurant and start your order.'}
          </p>
          <ul className="shop-directory-benefits">
            <li>
              <span>
                <ShoppingBag aria-hidden="true" />
              </span>
              {language === 'th' ? 'สั่งง่าย' : 'Easy ordering'}
            </li>
            <li>
              <span>
                <Zap aria-hidden="true" />
              </span>
              {language === 'th' ? 'รวดเร็ว' : 'Quick & simple'}
            </li>
            <li>
              <span>
                <ShieldCheck aria-hidden="true" />
              </span>
              {language === 'th' ? 'ปลอดภัย' : 'Secure'}
            </li>
          </ul>
        </div>
        <img
          className="shop-directory-art"
          src="/images/shop-directory.svg"
          alt=""
          width="440"
          height="340"
        />
      </section>
      <section
        id="online-status"
        className="shop-directory-results"
        aria-label={t('storefront.publishedStores')}
      >
        <div
          className="shop-directory-toolbar"
          role="group"
          aria-label={t('storefront.searchStores')}
        >
          <h2 className="shop-directory-heading">
            {t('storefront.searchStores')}
          </h2>
          <label className="shop-directory-search">
            <Search size={23} aria-hidden="true" />
            <input
              type="search"
              aria-label={t('storefront.searchStores')}
              placeholder={
                language === 'th'
                  ? 'พิมพ์ชื่อร้านอาหารที่ต้องการ'
                  : 'Search for a restaurant'
              }
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <button
            ref={categoryToggle}
            type="button"
            className="shop-directory-type-toggle"
            aria-expanded={categoriesOpen}
            aria-controls={categoryPanelId}
            onClick={() => setCategoriesOpen((open) => !open)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setCategoriesOpen(false);
            }}
          >
            {language === 'th' ? 'ประเภทร้าน' : 'Shop type'}
            <ChevronDown size={18} aria-hidden="true" />
          </button>
          <div
            className="shop-directory-view"
            role="group"
            aria-label={
              language === 'th' ? 'รูปแบบการแสดงร้าน' : 'Store layout'
            }
          >
            <button
              type="button"
              aria-label={language === 'th' ? 'มุมมองตาราง' : 'Grid view'}
              aria-pressed={view === 'grid'}
              onClick={() => setView('grid')}
            >
              <LayoutGrid size={23} aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-label={language === 'th' ? 'มุมมองรายการ' : 'List view'}
              aria-pressed={view === 'list'}
              onClick={() => setView('list')}
            >
              <List size={26} aria-hidden="true" />
            </button>
          </div>
        </div>
        <div
          id={categoryPanelId}
          className="shop-directory-categories"
          hidden={!categoriesOpen}
          role="group"
          aria-label={language === 'th' ? 'ประเภทร้าน' : 'Shop types'}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              setCategoriesOpen(false);
              categoryToggle.current?.focus();
            }
          }}
        >
          <h3>{language === 'th' ? 'ประเภทร้าน' : 'Shop types'}</h3>
          <div className="shop-directory-category-options">
            <button
              type="button"
              aria-pressed={businessType === null}
              onClick={() => setBusinessType(null)}
            >
              {language === 'th' ? 'ทั้งหมด' : 'All'}
            </button>
            {businessTypes.map((type) => (
              <button
                type="button"
                key={type}
                aria-pressed={businessType === type}
                onClick={() => setBusinessType(type)}
              >
                {businessTypeLabel(type, language)}
              </button>
            ))}
          </div>
        </div>
        {shops.isPending && (
          <Loading>{t('storefront.loadingStorefronts')}</Loading>
        )}
        {shops.error && (
          <ShopError error={shops.error} retry={() => void shops.refetch()} />
        )}
        {shops.data && shops.data.length > 0 && (
          <>
            {visibleShops.length > 0 ? (
              <ul
                className="shop-directory-list"
                data-view={view}
                aria-label={t('storefront.publishedStores')}
                aria-live="polite"
              >
                {visibleShops.map((shop) => (
                  <li className="shop-directory-card" key={shop.slug}>
                    <div className="shop-directory-store-icon">
                      <Store size={66} strokeWidth={1.6} aria-hidden="true" />
                    </div>
                    <div className="shop-directory-store-copy">
                      <h3>{shop.name}</h3>
                      <Tag tone={shop.accepting_orders ? 'success' : 'neutral'}>
                        <span
                          className="shop-directory-status-dot"
                          aria-hidden="true"
                        />
                        {shop.accepting_orders
                          ? t('storefront.acceptingOrders')
                          : t('storefront.notAcceptingOrders')}
                      </Tag>
                    </div>
                    <a
                      className="button"
                      href={`/shop/${encodeURIComponent(shop.slug)}`}
                      aria-disabled={!shop.accepting_orders}
                    >
                      {t('storefront.viewStore')}
                      <ArrowRight size={23} aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <Card className="storefront-status">
                <p>{t('storefront.noMatchingStores')}</p>
              </Card>
            )}
          </>
        )}
        {shops.data?.length === 0 && (
          <Card className="storefront-status">
            <PackageOpen size={40} aria-hidden="true" />
            <h2>{t('storefront.noPublishedStoresYet')}</h2>
            <p>{t('storefront.onceStoresSetUpTheirStorefrontsAnd')}</p>
          </Card>
        )}
      </section>
    </>
  );
}
