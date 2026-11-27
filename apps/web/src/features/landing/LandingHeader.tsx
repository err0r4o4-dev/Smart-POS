import { useState, type MouseEvent } from 'react';
import { ArrowLeft, Menu } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../app/language';
import { LanguageSwitcher } from '../../components/ui/LanguageSwitcher';
import { Brand } from '../../components/ui/primitives';
import { PublicAccountMenu } from '../auth/PublicAccountMenu';
import './landing.css';

export function LandingHeader({
  variant = 'home',
}: {
  variant?: 'home' | 'directory';
}) {
  const { t } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const directory = variant === 'directory';
  const label = t(
    directory ? 'shell.customerStorefrontNavigation' : 'landing.homeNavigation',
  );
  const backHome = directory ? t('landing.backToHome') : undefined;

  return (
    <header className="landing-header">
      <div className="layout-shell landing-header-inner">
        <Link
          className="landing-brand-link"
          to="/"
          aria-label={t('landing.veloPosHome')}
        >
          <Brand />
        </Link>
        <div className="landing-desktop-navigation">
          <LandingNavigation backHome={backHome} label={label} />
        </div>
        <div className="landing-mobile-language">
          <LanguageSwitcher />
        </div>
        <details
          className="landing-mobile-menu"
          onToggle={(event) => setMobileMenuOpen(event.currentTarget.open)}
        >
          <summary
            role="button"
            aria-label={t('landing.menu')}
            aria-expanded={mobileMenuOpen}
          >
            <Menu size={22} aria-hidden="true" />
          </summary>
          <LandingNavigation backHome={backHome} label={label} compactLanguage />
        </details>
        <PublicAccountMenu />
      </div>
    </header>
  );
}

function LandingNavigation({
  backHome,
  label,
  compactLanguage = false,
}: {
  backHome?: string;
  label: string;
  compactLanguage?: boolean;
}) {
  const close = (event: MouseEvent<HTMLElement>) =>
    event.currentTarget.closest('details')?.removeAttribute('open');
  return (
    <nav className="landing-navigation" aria-label={label}>
      <div className="landing-nav-actions">
        {compactLanguage ? (
          <div className="landing-menu-language">
            <LanguageSwitcher />
          </div>
        ) : (
          <LanguageSwitcher />
        )}
        {backHome && (
          <Link className="landing-nav-link" to="/" onClick={close}>
            <ArrowLeft size={17} aria-hidden="true" /> {backHome}
          </Link>
        )}
      </div>
    </nav>
  );
}
