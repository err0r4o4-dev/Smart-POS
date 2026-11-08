import { LanguageSwitcher } from '../components/ui/LanguageSwitcher';
import { useLanguage } from '../app/language';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { Brand } from '../components/ui/primitives';

export function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useLanguage();

  return (
    <main id="main-content" className="auth-immersive-shell">
      {/* Ambient background glows using brand amber/gold palette */}
      <div className="auth-ambient-glows" aria-hidden="true">
        <div className="glow-orb glow-top-left" />
        <div className="glow-orb glow-bottom-right" />
        <div className="glow-grid" />
      </div>

      {/* Floating Header */}
      <header className="auth-floating-nav">
        <div className="auth-nav-left">
          <Link to="/" className="auth-back-button">
            <ArrowLeft size={16} />
            <span>{t('shell.backToHomeAndEntrances')}</span>
          </Link>
        </div>
        <div className="auth-nav-brand">
          <Brand />
        </div>
        <div className="auth-nav-right">
          <LanguageSwitcher />
        </div>
      </header>

      {/* Centered Main Stage */}
      <div className="auth-centered-stage">
        <div className="auth-card-wrapper">
          <div className="auth-card-glow-border" aria-hidden="true" />
          <div className="auth-glass-card">{children}</div>
        </div>

        <footer className="auth-stage-footer">
          <div className="auth-footer-badge">
            <Sparkles size={13} className="text-amber" />
            <span>SmartPOS · Intelligent Retail Architecture</span>
          </div>
          <div className="auth-footer-links">
            <small>
              © {new Date().getFullYear()} SmartPOS System. All rights reserved.
            </small>
          </div>
        </footer>
      </div>
    </main>
  );
}
