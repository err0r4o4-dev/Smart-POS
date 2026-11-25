import { Link, Navigate } from 'react-router-dom';
import { useLanguage } from '../../app/language';
import { paths } from '../../app/routes';
import './mfa-required.css';

export function MFARequiredState({ newTab = false }: { newTab?: boolean }) {
  const { t } = useLanguage();
  if (!newTab)
    return (
      <Navigate to={paths.security} state={{ mfaRequired: true }} replace />
    );

  return (
    <section
      className="organization-mfa-required organization-mfa-required-inline"
      aria-label={t('mfa.requiredTitle')}
    >
      <h3>{t('mfa.requiredTitle')}</h3>
      <p role="alert">{t('mfa.requiredHelp')}</p>
      <Link
        className="button"
        to={paths.security}
        target="_blank"
        rel="noopener noreferrer"
      >
        {t('mfa.securityNewTab')}
      </Link>
      <p>{t('mfa.returnToRetry')}</p>
    </section>
  );
}
