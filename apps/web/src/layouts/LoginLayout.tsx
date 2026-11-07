import { ArrowLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../app/language';
import { LanguageSwitcher } from '../components/ui/LanguageSwitcher';
import { Brand } from '../components/ui/primitives';
import './login.css';

export function LoginLayout({
  children,
  titleId = 'login-title',
}: {
  children: ReactNode;
  titleId?: string;
}) {
  const { t } = useLanguage();

  return (
    <main id="main-content" className="login-shell">
      <section className="login-visual" aria-labelledby="login-visual-title">
        <div className="login-visual-brand">
          <Brand />
        </div>
        <div className="login-visual-copy">
          <h1 id="login-visual-title">{t('auth.storeSimplified')}</h1>
          <p>{t('auth.storeSummary')}</p>
        </div>
        <img
          className="login-visual-art"
          src="/images/auth-pos-reference.png"
          alt={t('auth.storeIllustration')}
          width={620}
          height={309}
        />
        <footer className="login-visual-footer">
          VELO - Smart POS Platform
        </footer>
      </section>

      <section className="login-panel" aria-labelledby={titleId}>
        <header className="login-toolbar">
          <Link to="/" className="login-back-link">
            <ArrowLeft size={17} aria-hidden="true" />
            <span>{t('auth.backToHome')}</span>
          </Link>
          <LanguageSwitcher />
        </header>
        <div className="login-card-stage">
          <div className="auth-glass-card login-card">{children}</div>
        </div>
      </section>
    </main>
  );
}
