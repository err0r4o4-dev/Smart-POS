import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { useLanguage } from '../../app/language';
import { paths } from '../../app/routes';
import { ErrorState, Loading } from '../../components/ui/primitives';
import {
  authLink,
  clearGoogleReturn,
  pendingGoogleReturn,
} from './auth-destination';

// Google already returns to /workspace. Resume a public sign-in before the
// workspace route can send the user into store onboarding.
export function GoogleReturn() {
  const location = useLocation();
  return location.pathname === paths.workspace ? (
    <Resume key={location.key} />
  ) : (
    <Outlet />
  );
}

function Resume() {
  const [destination] = useState(pendingGoogleReturn);
  const { state, refresh } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const pending = destination !== null && destination !== paths.workspace;
  useEffect(() => {
    if (!pending || state.status === 'loading' || state.status === 'error')
      return;
    clearGoogleReturn();
    const next =
      state.status === 'authenticated'
        ? state.session.user.email_verified === false
          ? authLink(paths.verifyEmail, destination)
          : destination
        : authLink(paths.login, destination);
    void navigate(next, { replace: true });
  }, [destination, navigate, pending, state]);
  if (pending && state.status === 'error')
    return (
      <ErrorState
        message={t('shell.couldNotVerifyYourSession')}
        retry={() => void refresh()}
      />
    );
  if (pending) return <Loading>{t('shell.checkingYourSession')}</Loading>;
  return <Outlet />;
}
