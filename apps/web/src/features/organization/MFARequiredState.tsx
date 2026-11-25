import { Link } from 'react-router-dom';
import { useLanguage } from '../../app/language';
import { paths } from '../../app/routes';
import { LoginLayout } from '../../layouts/LoginLayout';
import './mfa-required.css';

export function MFARequiredState({
  newTab = false,
  accountPage = false,
}: {
  newTab?: boolean;
  accountPage?: boolean;
}) {
  const { t } = useLanguage();
  const action = (
    <Link
      className={accountPage ? 'button auth-submit-btn' : 'button'}
      to={paths.security}
      {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {t(newTab ? 'mfa.securityNewTab' : 'mfa.goToVerification')}
    </Link>
  );
  if (accountPage)
    return (
      <LoginLayout titleId="mfa-required-title" story="security">
        <div className="auth-header-card">
          <h1 id="mfa-required-title">{t('mfa.requiredTitle')}</h1>
          <p>{t('mfa.requiredHelp')}</p>
        </div>
        {action}
      </LoginLayout>
    );
  const Container = newTab ? 'section' : 'main';
  const Heading = newTab ? 'h3' : 'h1';
  return (
    <Container
      className={`organization-mfa-required ${newTab ? 'organization-mfa-required-inline' : 'card'}`}
      aria-label={t('mfa.requiredTitle')}
    >
      <Heading>{t('mfa.requiredTitle')}</Heading>
      <p role="alert">{t('mfa.requiredHelp')}</p>
      {action}
      {newTab && <p>{t('mfa.returnToRetry')}</p>}
    </Container>
  );
}
