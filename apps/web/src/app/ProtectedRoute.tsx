import { Navigate, Outlet } from 'react-router-dom';
import type { Role, Session } from './access';
import { canAccess } from './access';

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
