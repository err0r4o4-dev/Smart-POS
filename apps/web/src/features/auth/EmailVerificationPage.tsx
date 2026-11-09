import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { useLanguage } from '../../app/language';
import { paths } from '../../app/routes';
import { Button, ErrorState, Loading } from '../../components/ui/primitives';
import { LoginLayout } from '../../layouts/LoginLayout';
import { ResendVerification } from './VerificationFlow';

export function EmailVerificationPage() {
  const { state, refresh } = useAuth();
  const { t } = useLanguage();
  if (state.session?.user.email_verified === true)
    return <Navigate to={paths.workspace} replace />;
  return (
    <LoginLayout titleId="verification-required-title" story="verify">
      <div className="auth-header-card">
        <h2 id="verification-required-title">{t('auth.verificationTitle')}</h2>
        <p>{t('auth.verificationRequired')}</p>
      </div>
      {state.status === 'loading' ? (
        <Loading>{t('shell.checkingYourSession')}</Loading>
      ) : state.status === 'error' ? (
        <ErrorState
          message={t('shell.couldNotVerifyYourSession')}
          retry={() => void refresh()}
        />
      ) : (
        <>
          <ResendVerification
            key={state.session?.user.id ?? 'anonymous'}
            initialEmail={state.session?.user.email ?? ''}
          />
          {state.status === 'authenticated' && (
            <Button className="auth-submit-btn" onClick={() => void refresh()}>
              {t('auth.verificationCheck')}
            </Button>
          )}
        </>
      )}
      <div className="auth-links auth-links-single">
        <Link to="/login?returnTo=%2Fsetup">{t('auth.backToSignIn')}</Link>
      </div>
    </LoginLayout>
  );
}
