import { useState, type MouseEvent } from 'react';
import { LogIn, Menu, Store } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../app/language';
import { paths } from '../../app/routes';
import { LanguageSwitcher } from '../../components/ui/LanguageSwitcher';
import { Brand } from '../../components/ui/primitives';
import './landing.css';

type Translate = ReturnType<typeof useLanguage>['t'];

export function LandingHeader({
  authenticated = false,
  navigationLabel,
}: {
  authenticated?: boolean;
  navigationLabel?: string;
}) {
  const { t } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const label = navigationLabel ?? t('landing.homeNavigation');

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
          <LandingNavigation t={t} authenticated={authenticated} label={label} />
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
          <LandingNavigation
            t={t}
            authenticated={authenticated}
            label={label}
            compactLanguage
          />
        </details>
      </div>
    </header>
  );
}

function LandingNavigation({
  t,
  authenticated,
  label,
  compactLanguage = false,
}: {
  t: Translate;
  authenticated: boolean;
  label: string;
  compactLanguage?: boolean;
}) {
  const close = (event: MouseEvent<HTMLElement>) =>
    event.currentTarget.closest('details')?.removeAttribute('open');
  return (
    <nav
      className="landing-navigation"
      aria-label={label}
    >
      <div className="landing-nav-actions">
        {compactLanguage ? (
          <div className="landing-menu-language">
            <LanguageSwitcher />
          </div>
        ) : (
          <LanguageSwitcher />
        )}
        <Link
          className="landing-nav-link"
          to={authenticated ? paths.workspace : paths.login}
          onClick={close}
        >
          {authenticated ? (
            <Store size={17} aria-hidden="true" />
          ) : (
            <LogIn size={17} aria-hidden="true" />
          )}
          {t(authenticated ? 'landing.goToWorkspace' : 'auth.signIn')}
        </Link>
      </div>
    </nav>
  );
}
