import { LanguageSwitcher } from '../components/ui/LanguageSwitcher';
import { useLanguage } from '../app/language';
import {
  Link,
  Outlet,
  useLocation,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ArrowLeft, Menu, ShoppingCart, X } from 'lucide-react';
import { Brand } from '../components/ui/primitives';
import { paths } from '../app/routes';
import { useShopCart } from '../features/storefront/shop-cart';
import { VeloAssistantChat } from '../features/storefront/VeloAssistantChat';
import '../features/storefront/catalog.css';
import '../features/storefront/shop-directory.css';
import '../features/storefront/shop-customer.css';

export function StorefrontLayout() {
  const { t, language } = useLanguage();

  const { slug } = useParams();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const tableQuery = searchParams.has('table')
    ? `?${searchParams.toString()}`
    : '';
  const home = slug ? `/shop/${slug}` : paths.shop;
  const cartPath = slug ? `${home}/cart${tableQuery}` : paths.shop;
  const cart = useShopCart(slug);
  const catalogPage = !!slug && pathname.replace(/\/$/, '') === home;
  const [sidebarOpen, setSidebarOpen] = useState(true);
  useEffect(() => {
    const onSidebarState = (event: Event) => {
      setSidebarOpen((event as CustomEvent<{ open: boolean }>).detail.open);
    };
    window.addEventListener('catalog-sidebar-state', onSidebarState);
    return () =>
      window.removeEventListener('catalog-sidebar-state', onSidebarState);
  }, []);
  return (
    <div
      className={
        'storefront-shell shop-directory-shell' +
        (slug ? ' shop-store-shell' : '')
      }
      data-workspace="customer"
    >
      <a className="skip-link" href="#main-content">
        {t('pos.skipToContent')}
      </a>
      <header className="storefront-header">
        <div className="storefront-header-inner layout-shell">
          <div className="storefront-header-left">
            {catalogPage && (
              <button
                type="button"
                className="storefront-menu-btn"
                aria-label={
                  sidebarOpen
                    ? language === 'th'
                      ? 'ปิดเมนูหมวดหมู่'
                      : 'Close category menu'
                    : language === 'th'
                      ? 'เปิดเมนูหมวดหมู่'
                      : 'Open category menu'
                }
                aria-expanded={sidebarOpen}
                aria-controls="catalog-sidebar"
                onClick={() => {
                  setSidebarOpen((open) => !open);
                  window.dispatchEvent(
                    new CustomEvent('toggle-catalog-sidebar'),
                  );
                }}
              >
                {sidebarOpen ? (
                  <X size={20} aria-hidden="true" />
                ) : (
                  <Menu size={20} aria-hidden="true" />
                )}
              </button>
            )}
            <Link
              to={`${home}${tableQuery}`}
              aria-label={t('landing.onlineStorefront')}
            >
              <Brand />
            </Link>
          </div>
          <nav aria-label={t('shell.customerStorefrontNavigation')}>
            <LanguageSwitcher />
            {slug && (
              <Link
                className="storefront-icon-link storefront-cart-link"
                to={cartPath}
                aria-label={t('shell.cartValue0', {
                  value0: cart.items.length,
                })}
              >
                <ShoppingCart size={20} aria-hidden="true" />
                {cart.items.length > 0 && (
                  <span className="storefront-cart-count" aria-hidden="true">
                    {cart.items.length}
                  </span>
                )}
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main id="main-content" className="storefront-content" tabIndex={-1}>
        {slug && (
          <Link className="shop-back-link" to={paths.shop}>
            <ArrowLeft size={16} aria-hidden="true" />
            {language === 'th' ? 'ร้านค้าทั้งหมด' : 'All stores'}
          </Link>
        )}
        <Outlet />
      </main>
      <footer className="shop-directory-footer">
        <small>© {new Date().getFullYear()} VELOPOS · Smart POS Platform</small>
        <nav
          aria-label={language === 'th' ? 'ข้อมูลแพลตฟอร์ม' : 'Platform links'}
        >
          <Link to={paths.help}>
            {language === 'th' ? 'เงื่อนไขการให้บริการ' : 'Terms of Service'}
          </Link>
          <span aria-hidden="true">·</span>
          <Link to={paths.help}>
            {language === 'th' ? 'นโยบายความเป็นส่วนตัว' : 'Privacy Policy'}
          </Link>
        </nav>
      </footer>
      <VeloAssistantChat />
    </div>
  );
}
