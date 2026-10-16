import { LanguageSwitcher } from '../components/ui/LanguageSwitcher';
import { useLanguage } from '../app/language';
import { Link, Outlet, useParams } from 'react-router-dom';
import { ShoppingBag, ShoppingCart } from 'lucide-react';
import { Brand, Tag } from '../components/ui/primitives';
import { paths } from '../app/routes';
import { useShopCart } from '../features/storefront/shop-cart';

export function StorefrontLayout() {
  const { t } = useLanguage();

  const { slug } = useParams();
  const home = slug ? `/shop/${slug}` : paths.shop;
  const cart = useShopCart(slug);
  return (
    <div className="storefront-shell" data-workspace="customer">
      <a className="skip-link" href="#main-content">
        {t('pos.skipToContent')}
      </a>
      <header className="storefront-header">
        <Link to={paths.shop} aria-label={t('landing.onlineStorefront')}>
          <Brand />
        </Link>
        <Tag tone="amber">
          <ShoppingBag size={15} aria-hidden="true" /> {t('shell.forCustomers')}
        </Tag>
        <nav aria-label={t('shell.customerStorefrontNavigation')}>
          <LanguageSwitcher />
          {slug && (
            <Link
              className="storefront-icon-link storefront-cart-link"
              to={`${home}/cart`}
              aria-label={t('shell.cartValue0', { value0: cart.items.length })}
            >
              <ShoppingCart size={21} aria-hidden="true" />
              <span className="storefront-cart-count" aria-hidden="true">
                {cart.items.length}
              </span>
            </Link>
          )}
        </nav>
      </header>
      <main id="main-content" className="storefront-content">
        <Outlet />
      </main>
      <footer className="storefront-footer">
        <Brand compact />
        <span>{t('shell.customerStorefrontSeparateFromTheStaffPos')}</span>
        <Link to="/">{t('shell.smartposHome')}</Link>
        <Link to={paths.login}>{t('shell.storeTeamSignIn')}</Link>
      </footer>
    </div>
  );
}
