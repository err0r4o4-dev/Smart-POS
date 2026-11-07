import { LanguageSwitcher } from '../components/ui/LanguageSwitcher';
import { useLanguage } from '../app/language';
import { Link, Outlet, useParams, useSearchParams } from 'react-router-dom';
import { CircleHelp, Info, Menu, ShoppingCart } from 'lucide-react';
import { Brand } from '../components/ui/primitives';
import { paths } from '../app/routes';
import { useShopCart } from '../features/storefront/shop-cart';
import { VeloAssistantChat } from '../features/storefront/VeloAssistantChat';
import '../features/storefront/shop-directory.css';

export function StorefrontLayout() {
  const { t, language } = useLanguage();

  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const tableQuery = searchParams.has('table')
    ? `?${searchParams.toString()}`
    : '';
  const home = slug ? `/shop/${slug}` : paths.shop;
  const cartPath = slug ? `${home}/cart${tableQuery}` : paths.shop;
  const cart = useShopCart(slug);
  return (
    <div
      className={'storefront-shell' + (!slug ? ' shop-directory-shell' : '')}
      data-workspace="customer"
    >
      <a className="skip-link" href="#main-content">
        {t('pos.skipToContent')}
      </a>
      <header className="storefront-header">
        <div className="storefront-header-left">
          {slug && (
            <button
              type="button"
              className="storefront-menu-btn"
              aria-label={language === 'th' ? 'เมนู' : 'Menu'}
              onClick={() => {
                window.dispatchEvent(new CustomEvent('toggle-catalog-sidebar'));
              }}
            >
              <Menu size={20} aria-hidden="true" />
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
              aria-label={t('shell.cartValue0', { value0: cart.items.length })}
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
      </header>
      <main id="main-content" className="storefront-content">
        <Outlet />
      </main>
      {!slug ? (
        <footer className="shop-directory-footer">
          <Link to="/">
            <Info size={24} aria-hidden="true" />
            {language === 'th' ? 'เกี่ยวกับระบบ VELOPOS' : 'About VELOPOS'}
          </Link>
          <Link to={paths.help}>
            <CircleHelp size={24} aria-hidden="true" />
            {language === 'th' ? 'ช่วยเหลือและสนับสนุน' : 'Help & Support'}
          </Link>
          <Link to="/" className="shop-directory-footer-brand">
            <Brand compact />
            <span>
              <strong>VELOPOS</strong> — Smart POS Platform
            </span>
          </Link>
        </footer>
      ) : (
        <footer className="storefront-footer">
          <div className="storefront-footer-container">
            <div className="storefront-footer-columns">
              <div className="storefront-footer-col">
                <h3>
                  {language === 'th' ? 'บริการของ VELOPOS' : 'VELOPOS Services'}
                </h3>
                <p className="storefront-footer-links">
                  <span>
                    {language === 'th'
                      ? 'ระบบขายหน้าร้าน (POS)'
                      : 'Point of Sale (POS)'}
                  </span>
                  <span className="dot" aria-hidden="true">
                    ·
                  </span>
                  <span>
                    {language === 'th'
                      ? 'จัดการสินค้าและสต็อก'
                      : 'Inventory & Stock'}
                  </span>
                  <span className="dot" aria-hidden="true">
                    ·
                  </span>
                  <span>
                    {language === 'th' ? 'ร้านค้าออนไลน์' : 'Online Store'}
                  </span>
                </p>
              </div>
              <div className="storefront-footer-col">
                <h3>
                  {language === 'th'
                    ? 'ช่วยเหลือและสนับสนุน'
                    : 'Help & Support'}
                </h3>
                <p className="storefront-footer-links">
                  <Link to={paths.help}>
                    {language === 'th' ? 'ศูนย์ช่วยเหลือ' : 'Help Center'}
                  </Link>
                  <span className="dot" aria-hidden="true">
                    ·
                  </span>
                  <Link to={paths.help}>
                    {language === 'th' ? 'คู่มือการใช้งาน' : 'User Guide'}
                  </Link>
                  <span className="dot" aria-hidden="true">
                    ·
                  </span>
                  <Link to={paths.help}>
                    {language === 'th' ? 'ติดต่อทีมบริการ' : 'Contact Support'}
                  </Link>
                </p>
              </div>
              <div className="storefront-footer-col">
                <h3>VELOPOS — Smart POS Platform</h3>
                <p className="storefront-footer-desc">
                  {language === 'th'
                    ? 'โซลูชันช่วยให้ร้านค้าจัดการการขาย สินค้า และคำสั่งซื้อได้สะดวกในระบบเดียว'
                    : 'All-in-one POS platform helping businesses manage sales, inventory, and orders seamlessly.'}
                </p>
              </div>
            </div>
            <div className="storefront-footer-bottom">
              <small>© 2026 VELOPOS · Smart POS Platform</small>
              <div className="storefront-footer-legal">
                <Link to={paths.help}>
                  {language === 'th'
                    ? 'เงื่อนไขการให้บริการ'
                    : 'Terms of Service'}
                </Link>
                <span className="dot" aria-hidden="true">
                  ·
                </span>
                <Link to={paths.help}>
                  {language === 'th'
                    ? 'นโยบายความเป็นส่วนตัว'
                    : 'Privacy Policy'}
                </Link>
              </div>
            </div>
          </div>
        </footer>
      )}
      <VeloAssistantChat />
    </div>
  );
}
