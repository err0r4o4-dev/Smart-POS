import { Link } from 'react-router-dom';
import { useLanguage } from '../../app/language';
import './mfa-required.css';

export function MFARequiredState({ newTab = false }: { newTab?: boolean }) {
  const { t } = useLanguage();
  const Container = newTab ? 'section' : 'main';
  const Heading = newTab ? 'h3' : 'h1';
  return (
    <Container
      className={`organization-mfa-required ${newTab ? 'organization-mfa-required-inline' : 'card'}`}
      aria-label={t('mfa.requiredTitle')}
    >
      <Heading>{t('mfa.requiredTitle')}</Heading>
      <p role="alert">{t('mfa.requiredHelp')}</p>
      <Link
        className="button"
        to="/security"
        {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {t(newTab ? 'mfa.securityNewTab' : 'mfa.title')}
      </Link>
      {newTab && <p>{t('mfa.returnToRetry')}</p>}
    </Container>
  );
}
