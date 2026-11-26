import { useState, type MouseEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  House,
  Menu,
  Search,
  ShoppingCart,
  Store,
  type LucideIcon,
} from 'lucide-react';
import { useOptionalAuth } from '../../app/AuthProvider';
import { useLanguage } from '../../app/language';
import { paths } from '../../app/routes';
import { LanguageSwitcher } from '../../components/ui/LanguageSwitcher';
import { Brand } from '../../components/ui/primitives';
import type { TranslationKey } from '../../i18n';

type Section = {
  to: string;
  label: TranslationKey;
  icon: LucideIcon;
  active?: (pathname: string) => boolean;
};

const sections: Section[] = [
  { to: '/', label: 'landing.navHome', icon: House },
  {
    to: paths.shop,
    label: 'landing.navExplore',
    icon: Search,
    active: (pathname) => pathname.startsWith(paths.shop),
  },
];

export function CustomerHeader({
  slug,
  tableQuery,
  cartCount,
}: {
  slug?: string;
  tableQuery: string;
  cartCount: number;
}) {
  const { t } = useLanguage();
  const [menuOpen, setMenuOpen] = useState(false);
  const storePath = slug ? `${paths.shop}/${encodeURIComponent(slug)}` : '';

  return (
    <header className="storefront-header customer-header">
      <div className="layout-shell customer-header-inner">
        <Link
          className="customer-brand-link"
          to={slug ? `${storePath}${tableQuery}` : paths.shop}
          aria-label={t('landing.onlineStorefront')}
        >
          <Brand />
        </Link>
        <div className="customer-desktop-navigation">
          <CustomerNavigation />
        </div>
        {slug && (
          <Link
            className="customer-cart-link"
            to={`${storePath}/cart${tableQuery}`}
            aria-label={t('shell.cartValue0', { value0: cartCount })}
          >
            <ShoppingCart size={20} aria-hidden="true" />
            {cartCount > 0 && (
              <span className="customer-cart-count" aria-hidden="true">
                {cartCount}
              </span>
            )}
          </Link>
        )}
        <details
          className="customer-mobile-menu"
          onToggle={(event) => setMenuOpen(event.currentTarget.open)}
        >
          <summary
            role="button"
            aria-label={t('landing.menu')}
            aria-expanded={menuOpen}
          >
            <Menu size={22} aria-hidden="true" />
          </summary>
          <CustomerNavigation />
        </details>
      </div>
    </header>
  );
}

function CustomerNavigation() {
  const { t } = useLanguage();
  const { pathname } = useLocation();
  const status = useOptionalAuth()?.state.status ?? 'anonymous';
  const close = (event: MouseEvent<HTMLElement>) =>
    event.currentTarget.closest('details')?.removeAttribute('open');

  return (
    <nav
      className="customer-navigation"
      aria-label={t('shell.customerStorefrontNavigation')}
    >
      <div className="customer-nav-links">
        {sections.map(({ to, label, icon: Icon, active }) => {
          const current = active?.(pathname) ?? false;
          return (
            <Link
              key={to}
              className={
                current ? 'customer-nav-link is-active' : 'customer-nav-link'
              }
              to={to}
              aria-current={current ? 'page' : undefined}
              onClick={close}
            >
              <Icon size={17} aria-hidden="true" />
              {t(label)}
            </Link>
          );
        })}
      </div>
      <div className="customer-nav-actions">
        <LanguageSwitcher />
        <Link
          className="customer-nav-link"
          to="/#for-merchants"
          onClick={close}
        >
          <Store size={17} aria-hidden="true" />
          {t('landing.forMerchants')}
        </Link>
        {status === 'loading' ? (
          <button className="button" type="button" disabled>
            {t('landing.checking')}
          </button>
        ) : (
          <Link
            className="button"
            to={status === 'authenticated' ? paths.workspace : paths.login}
          >
            {status === 'authenticated'
              ? t('landing.goToWorkspace')
              : t('auth.signIn')}
          </Link>
        )}
      </div>
    </nav>
  );
}
