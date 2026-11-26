import { useLanguage } from '../app/language';
import {
  Link,
  Outlet,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { ArrowLeft, LogIn } from 'lucide-react';
import { paths } from '../app/routes';
import { LanguageSwitcher } from '../components/ui/LanguageSwitcher';
import { Brand } from '../components/ui/primitives';
import { useShopCart } from '../features/storefront/shop-cart';
import { CustomerHeader } from '../features/storefront/CustomerHeader';
import { VeloAssistantChat } from '../features/storefront/VeloAssistantChat';
import '../features/storefront/catalog.css';
import '../features/storefront/shop-directory.css';
import '../features/storefront/shop-customer.css';
import '../features/storefront/customer.css';

export function StorefrontLayout() {
  const { t, language } = useLanguage();

  const { slug } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const directorySearch: unknown = state?.directorySearch;
  const returnToDirectory =
    typeof directorySearch === 'string' &&
    (directorySearch === '' || directorySearch.startsWith('?'));
  const [searchParams] = useSearchParams();
  const directory = !slug && searchParams.get('view') !== 'cart';
  const tableQuery = searchParams.has('table')
    ? `?${searchParams.toString()}`
    : '';
  const cart = useShopCart(slug);
  return (
    <div
      className={
        'storefront-shell shop-directory-shell' +
        (slug ? ' shop-store-shell' : directory ? ' shop-discovery-shell' : '')
      }
      data-workspace="customer"
    >
      <a className="skip-link" href="#main-content">
        {t('pos.skipToContent')}
      </a>
      {directory ? (
        <header className="landing-header shop-discovery-header">
          <div className="layout-shell landing-header-inner">
            <Link
              className="landing-brand-link"
              to="/"
              aria-label={t('landing.veloPosHome')}
            >
              <Brand />
            </Link>
            <nav aria-label={t('shell.customerStorefrontNavigation')}>
              <LanguageSwitcher />
              <Link className="shop-discovery-sign-in" to={paths.login}>
                <LogIn size={17} aria-hidden="true" />
                <span>{t('auth.signIn')}</span>
              </Link>
            </nav>
          </div>
        </header>
      ) : (
        <CustomerHeader
          slug={slug}
          tableQuery={tableQuery}
          cartCount={cart.items.length}
        />
      )}
      <main id="main-content" className="storefront-content" tabIndex={-1}>
        {slug && (
          <Link
            className="shop-back-link"
            to={{
              pathname: paths.shop,
              search: returnToDirectory ? directorySearch : '',
            }}
            onClick={(event) => {
              if (
                !returnToDirectory ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.altKey ||
                event.shiftKey
              )
                return;
              event.preventDefault();
              void navigate(-1);
            }}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            {returnToDirectory
              ? t('storefront.customer.backToResults')
              : language === 'th'
                ? 'ร้านค้าทั้งหมด'
                : 'All stores'}
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
      <VeloAssistantChat
        scope={slug ? { mode: 'store', slug } : { mode: 'discovery' }}
      />
    </div>
  );
}
