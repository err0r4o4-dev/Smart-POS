import {
  ChartNoAxesColumnIncreasing,
  Layers,
  ShoppingCart,
  Store,
  TrendingUp,
  UsersRound,
  Utensils,
  Zap,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { useLanguage } from '../app/language';
import { LanguageSwitcher } from '../components/ui/LanguageSwitcher';
import { Brand } from '../components/ui/primitives';
import './login.css';

const storeFeatures = [
  [ShoppingCart, 'auth.featureMenu'],
  [Layers, 'auth.featureOrders'],
  [UsersRound, 'auth.featureKitchen'],
  [ChartNoAxesColumnIncreasing, 'auth.featureReports'],
  [Store, 'auth.featureBranches'],
] as const;

export function LoginLayout({
  children,
  titleId = 'login-title',
  story = 'login',
}: {
  children: ReactNode;
  titleId?: string;
  story?: 'login' | 'register' | 'verify' | 'recover' | 'reset' | 'security';
}) {
  const { t } = useLanguage();
  const storyAccent = t('auth.storeSimplifiedAccent');

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
      <div className="login-ambient-tile" aria-hidden="true">
        <Utensils />
      </div>
      <main id="main-content" className="login-shell">
        <div className="login-visual">
          <div className="login-visual-copy">
            <p className="login-story-badge">
              <Zap size={16} aria-hidden="true" />
              {t('auth.restaurantPos')}
            </p>
            <p id="login-visual-title" className="login-visual-heading">
              {t('auth.storeSimplified') +
                (storyAccent.startsWith(' ') ? ' ' : '')}
              <em>{storyAccent.trimStart()}</em>
            </p>
            <p className="login-visual-summary">{t('auth.storeSummary')}</p>
          </div>
          <ul id="login-features" className="login-feature-list">
            {storeFeatures.map(([Icon, label]) => (
              <li key={label}>
                <span>
                  <Icon size={23} aria-hidden="true" />
                </span>
                {t(label)}
              </li>
            ))}
          </ul>
          <div className="login-illustration">
            <img
              className="login-visual-art"
              src="/images/auth-pos-studio.svg"
              alt={t('auth.storeIllustration')}
              width={620}
              height={326}
            />
            <span className="login-scene-trend" aria-hidden="true">
              <TrendingUp />
            </span>
          </div>
        </div>

        <section className="login-panel" aria-labelledby={titleId}>
          <div className="login-card-stage">
            <div className="auth-glass-card login-card">{children}</div>
          </div>
        </section>
      </main>
    </div>
  );
}
