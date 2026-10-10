import { Navigate, Outlet, useLocation } from 'react-router-dom';
import type { Role, Session } from './access';
import { canAccess } from './access';
import { useAuth } from './AuthProvider';
import { ErrorState, Loading } from '../components/ui/primitives';

export function ProtectedRoute({
  session,
  permission,
  roles,
}: {
  session: Session;
  permission: string;
  roles?: Role[];
}) {
  return canAccess(session, permission, roles) ? (
    <Outlet />
  ) : (
    <Navigate to="/403" replace />
  );
}

export function RequireSession() {
  const { state, refresh } = useAuth();
  const location = useLocation();
  if (state.status === 'loading')
    return <Loading>Checking your session…</Loading>;
  if (state.status === 'error')
    return (
      <ErrorState
        message="Could not verify your session."
        retry={() => void refresh()}
      />
    );
  if (state.status === 'anonymous')
    return (
      <Navigate
        to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search + location.hash)}`}
        replace
      />
    );
  return <Outlet />;
}
