import {
  ArrowLeft,
  ChartNoAxesColumnIncreasing,
  Layers,
  Package,
  Tag,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useLanguage } from '../app/language';
import { LanguageSwitcher } from '../components/ui/LanguageSwitcher';
import { Brand } from '../components/ui/primitives';
import './login.css';

export function LoginLayout({
  children,
  titleId = 'login-title',
  story = 'login',
}: {
  children: ReactNode;
  titleId?: string;
  story?: 'login' | 'register' | 'verify' | 'recover' | 'reset';
}) {
  const { t } = useLanguage();
  const storyTitle =
    story === 'login'
      ? t('auth.storeSimplified')
      : t(`auth.${story}StoryTitle`);
  const storySummary =
    story === 'login' ? t('auth.storeSummary') : t(`auth.${story}StorySummary`);

  return (
    <div className="account-shell" data-account-story={story}>
      <a className="skip-link" href="#main-content">
        {t('landing.skipToContent')}
      </a>
      <header className="account-header">
        <a
          className="account-brand"
          href="/"
          aria-label={t('landing.veloPosHome')}
        >
          <Brand />
        </a>
        <LanguageSwitcher />
      </header>
      <div className="account-navigation">
        <a href="/" className="login-back-link">
          <ArrowLeft size={17} aria-hidden="true" />
          <span>{t('auth.backToHome')}</span>
        </a>
      </div>
      <main id="main-content" className="login-shell">
        <section className="login-visual" aria-labelledby="login-visual-title">
          <div className="login-visual-copy">
            <h1 id="login-visual-title">{storyTitle}</h1>
            <p>{storySummary}</p>
          </div>
          <div className="login-illustration">
            <div className="login-feature-orbit" aria-hidden="true">
              <span>
                <Package />
              </span>
              <span>
                <Layers />
              </span>
              <span>
                <Tag />
              </span>
              <span>
                <ChartNoAxesColumnIncreasing />
              </span>
            </div>
            <img
              className="login-visual-art"
              src="/images/auth-pos-reference.png"
              alt={t('auth.storeIllustration')}
              width={620}
              height={309}
            />
          </div>
          <footer className="login-visual-footer">
            VELO - Smart POS Platform
          </footer>
        </section>

        <section className="login-panel" aria-labelledby={titleId}>
          <div className="login-card-stage">
            <div className="auth-glass-card login-card">{children}</div>
          </div>
        </section>
      </main>
    </div>
  );
}
