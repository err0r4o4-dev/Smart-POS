import { Link, NavLink, useSearchParams } from 'react-router-dom';
import { useLanguage } from '../../app/language';
import { paths } from '../../app/routes';
import { LanguageSwitcher } from '../../components/ui/LanguageSwitcher';
import { Brand } from '../../components/ui/primitives';
import { PublicAccountMenu } from '../auth/PublicAccountMenu';
import { shopDirectorySearch } from './shop-directory-search';
import './shop-discovery.css';

export function ShopDiscoveryHeader() {
  const { t } = useLanguage();
  const [params] = useSearchParams();
  const search = shopDirectorySearch(params);

  return (
    <header className="shop-discovery-header">
      <div className="layout-shell shop-discovery-header-inner">
        <Link
          className="shop-discovery-brand"
          to="/"
          aria-label={t('landing.veloPosHome')}
        >
          <Brand />
        </Link>
        <nav aria-label={t('shell.customerStorefrontNavigation')}>
        </nav>
        <div className="shop-discovery-header-actions">
          <LanguageSwitcher />
          <PublicAccountMenu />
        </div>
      </div>
    </header>
  );
}
