import { useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Menu, ShoppingCart } from 'lucide-react';
import { useLanguage } from '../../app/language';
import { paths } from '../../app/routes';
import { LanguageSwitcher } from '../../components/ui/LanguageSwitcher';
import { Brand } from '../../components/ui/primitives';
import { PublicAccountMenu } from '../auth/PublicAccountMenu';

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
        <PublicAccountMenu />
      </div>
    </header>
  );
}

function CustomerNavigation() {
  const { t } = useLanguage();
  const close = (event: MouseEvent<HTMLElement>) =>
    event.currentTarget.closest('details')?.removeAttribute('open');

  return (
    <nav
      className="customer-navigation"
      aria-label={t('shell.customerStorefrontNavigation')}
    >
      <LanguageSwitcher />
    </nav>
  );
}
