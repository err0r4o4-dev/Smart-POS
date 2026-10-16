import { useLanguage } from '../../app/language';
import {
  generatePath,
  Navigate,
  Outlet,
  useLocation,
  useParams,
} from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { useOrganization } from '../../app/OrganizationProvider';
import { isManagementRole } from '../../app/access';
import { paths } from '../../app/routes';
import {
  businessArea,
  isManagementPath,
  workspacePath,
} from '../../app/workspace-paths';
import { ErrorState, Loading } from '../../components/ui/primitives';

export function WorkspaceAreaGate() {
  const { t, localize } = useLanguage();

  const { state } = useAuth();
  const tenant = useOrganization();
  const { pathname } = useLocation();
  if (
    businessArea(pathname) === 'management' &&
    state.status === 'authenticated'
  ) {
    if (tenant.loading)
      return <Loading>{t('workspace.checkingManagementWorkspace')}</Loading>;
    if (tenant.error)
      return (
        <ErrorState
          message={localize(tenant.error ?? '')}
          retry={() => void tenant.refresh()}
        />
      );
    if (!tenant.context) return <Navigate to={paths.account} replace />;
    if (!isManagementRole(tenant.context.membership.role))
      return (
        <Navigate
          to={pathname === paths.dashboard ? paths.staff : paths.forbidden}
          replace
        />
      );
  }
  return <Outlet />;
}

export function LegacyWorkspaceRedirect({ path }: { path: string }) {
  const { t, localize } = useLanguage();

  const tenant = useOrganization();
  const params = useParams();
  const { search, hash } = useLocation();
  if (tenant.loading)
    return <Loading>{t('workspace.selectingWorkspace')}</Loading>;
  if (tenant.error)
    return (
      <ErrorState
        message={localize(tenant.error ?? '')}
        retry={() => void tenant.refresh()}
      />
    );
  if (!tenant.context) return <Navigate to={paths.account} replace />;
  const area =
    isManagementRole(tenant.context.membership.role) || isManagementPath(path)
      ? 'management'
      : 'staff';
  const destination =
    path === '/dashboard'
      ? area === 'management'
        ? paths.dashboard
        : paths.staff
      : path === '/staff'
        ? paths.staff
        : workspacePath(generatePath(path, params), area);
  return <Navigate to={destination + search + hash} replace />;
}
