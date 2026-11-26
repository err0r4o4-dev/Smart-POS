import { Link } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { useLanguage } from '../../app/language';
import { paths } from '../../app/routes';
import { LoginLayout } from '../../layouts/LoginLayout';

export function PublicAccountPage() {
  const { state } = useAuth();
  const { t } = useLanguage();
  if (!state.session) return null;
  const { user } = state.session;
  return (
    <LoginLayout titleId="public-account-title" story="security">
      <div className="auth-header-card">
        <h1 id="public-account-title">{t('auth.myAccount')}</h1>
      </div>
      <dl className="auth-form-body public-profile-details">
        <dt>{t('auth.displayName')}</dt>
        <dd>{user.display_name}</dd>
        <dt>{t('auth.emailAddress')}</dt>
        <dd>{user.email}</dd>
      </dl>
      <div className="auth-links auth-links-single">
        <Link to={paths.security}>{t('auth.accountSecurity')}</Link>
        <Link to="/">{t('landing.backToHome')}</Link>
      </div>
    </LoginLayout>
  );
}
