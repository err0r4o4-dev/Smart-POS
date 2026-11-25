import {
  ArrowLeft,
  ChartNoAxesColumnIncreasing,
  ChefHat,
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
  const storyTitle =
    story === 'login'
      ? t('auth.storeSimplified')
      : t(`auth.${story}StoryTitle`);
  const storySummary =
    story === 'login' ? t('auth.storeSummary') : t(`auth.${story}StorySummary`);
  const storyAccent = story === 'login' ? t('auth.storeSimplifiedAccent') : '';
  const StoryHeading = story === 'login' || story === 'register' ? 'h1' : 'h2';

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
      {story !== 'login' && (
        <div className="account-navigation">
          <a href="/" className="login-back-link">
            <ArrowLeft size={17} aria-hidden="true" />
            <span>{t('auth.backToHome')}</span>
          </a>
        </div>
      )}
      <main id="main-content" className="login-shell">
        <section className="login-visual" aria-labelledby="login-visual-title">
          <div className="login-visual-copy">
            {story === 'login' && (
              <p className="login-story-badge">
                <Zap size={16} aria-hidden="true" />
                {t('auth.restaurantPos')}
              </p>
            )}
            <StoryHeading id="login-visual-title">
              {storyTitle + (storyAccent.startsWith(' ') ? ' ' : '')}
              {storyAccent && <em>{storyAccent.trimStart()}</em>}
            </StoryHeading>
            <p>{storySummary}</p>
          </div>
          {story === 'login' && (
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
          )}
          <div className="login-illustration">
            <img
              className="login-visual-art"
              src="/images/auth-pos-studio.svg"
              alt={t('auth.storeIllustration')}
              width={620}
              height={326}
            />
            {story === 'login' && (
              <div className="login-scene-labels" aria-hidden="true">
                <span className="login-scene-trend">
                  <TrendingUp />
                </span>
                <span className="login-scene-note login-scene-orders">
                  <ShoppingCart />
                  {t('auth.sceneOrders')}
                </span>
                <span className="login-scene-note login-scene-kitchen">
                  <ChefHat />
                  {t('auth.sceneKitchen')}
                </span>
                <span className="login-scene-note login-scene-sales">
                  <ChartNoAxesColumnIncreasing />
                  {t('auth.sceneSales')}
                </span>
                <span className="login-scene-note login-scene-start">
                  <Zap />
                  {t('auth.sceneStart')}
                </span>
              </div>
            )}
          </div>
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
