import { useEffect, useState } from 'react';
import { useLanguage } from '../../app/language';
import { getGoogleConfig } from '../../lib/api';

export function GoogleAuth({
  mode = 'login',
  disabled = false,
  returnTo = '/workspace',
}: {
  mode?: 'login' | 'register';
  disabled?: boolean;
  returnTo?: string;
}) {
  const { t } = useLanguage();
  const [availability, setAvailability] = useState<
    'loading' | 'enabled' | 'disabled' | 'error'
  >('loading');
  const [attempt, setAttempt] = useState(0);
  const [redirecting, setRedirecting] = useState(false);
  useEffect(() => {
    let active = true;
    getGoogleConfig().then(
      (result) => {
        if (active) setAvailability(result.enabled ? 'enabled' : 'disabled');
      },
      () => {
        if (active) setAvailability('error');
      },
    );
    return () => {
      active = false;
    };
  }, [attempt]);
  const start = () => {
    if (disabled || redirecting || availability !== 'enabled') return;
    setRedirecting(true);
    const destination = returnTo === '/setup' ? '/setup' : '/workspace';
    window.location.assign(
      `/api/v1/auth/google/start?returnTo=${encodeURIComponent(destination)}`,
    );
  };
  return (
    <div className="auth-google">
      <div className="auth-divider">
        <span>{t('auth.or')}</span>
      </div>
      <button
        type="button"
        className="auth-google-button"
        disabled={disabled || redirecting || availability !== 'enabled'}
        onClick={start}
        aria-busy={redirecting || availability === 'loading'}
      >
        <img src="/images/google-g.png" alt="" width="20" height="20" />
        {t(mode === 'register' ? 'auth.googleSignUp' : 'auth.googleSignIn')}
      </button>
      {availability === 'loading' && (
        <p role="status" className="auth-google-note">
          {t('auth.googleChecking')}
        </p>
      )}
      {availability === 'disabled' && (
        <p role="status" className="auth-google-note">
          {t('auth.googleUnavailable')}
        </p>
      )}
      {availability === 'error' && (
        <div className="auth-google-note" role="status">
          <p>{t('auth.googleCheckFailed')}</p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => {
              setAvailability('loading');
              setAttempt((current) => current + 1);
            }}
          >
            {t('auth.googleRetry')}
          </button>
        </div>
      )}
    </div>
  );
}
