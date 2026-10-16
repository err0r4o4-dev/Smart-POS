import { LanguageSwitcher } from '../components/ui/LanguageSwitcher';
import { useLanguage } from '../app/language';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { Brand, Tag } from '../components/ui/primitives';

export function AuthLayout({ children }: { children: ReactNode }) {
  const { t } = useLanguage();

  return (
    <main id="main-content" className="auth-shell">
      <section className="auth-story">
        <Brand />
        <div>
          <Tag tone="amber">{t('shell.intelligentRetail')}</Tag>
          <h1 tabIndex={-1}>
            {t('shell.lessComplexity')}
            <br />
            {t('shell.morePossibility')}
          </h1>
          <p>{t('shell.oneConnectedWorkspaceForTheWayYour')}</p>
          <div className="auth-art" aria-hidden="true">
            <span />
            <span />
            <span />
            <ArrowUpRight size={88} />
          </div>
        </div>
        <small>VELO · Smart POS Platform</small>
      </section>
      <section className="auth-form-section">
        <div className="auth-toolbar">
          <Link to="/" className="back-link">
            <ArrowLeft size={18} />
            {t('shell.backToHomeAndEntrances')}
          </Link>
          <LanguageSwitcher />
        </div>
        <div className="auth-form">{children}</div>
      </section>
    </main>
  );
}
