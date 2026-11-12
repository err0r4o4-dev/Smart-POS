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
import { businessArea, workspacePath } from '../../app/workspace-paths';
import { ErrorState, Loading } from '../../components/ui/primitives';
import { useQuery } from '@tanstack/react-query';
import { getSetup } from '../organization/setup-api';

function SetupCompletionGate() {
  const { t, localize } = useLanguage();
  const { state } = useAuth();
  const tenant = useOrganization();
  const organizationID = tenant.context!.organization.id;
  const branchID = tenant.branchID;
  const setup = useQuery({
    queryKey: [
      'restaurant-setup',
      state.session?.user.id,
      organizationID,
      branchID,
    ],
    queryFn: ({ signal }) => getSetup({ organizationID, branchID }, signal),
    enabled: Boolean(branchID),
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: 'always',
    refetchInterval: 30_000,
  });
  if (!branchID) return <Navigate to={paths.setup} replace />;
  if (setup.isError)
    return (
      <ErrorState
        message={localize(setup.error.message)}
        retry={() => void setup.refetch()}
      />
    );
  if (setup.isPending || !setup.isFetchedAfterMount)
    return <Loading>{t('organization.setupLoading')}</Loading>;
  if (setup.data.complete !== true)
    return <Navigate to={paths.setup} replace />;
  return <Outlet />;
}

export function WorkspaceAreaGate() {
  const { t, localize } = useLanguage();

  const { state } = useAuth();
  const tenant = useOrganization();
  const { pathname } = useLocation();
  if (state.session?.user.email_verified === false && pathname !== paths.help)
    return <Navigate to={paths.verifyEmail} replace />;
  if (
    (businessArea(pathname) === 'management' || pathname === paths.workspace) &&
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
    if (!tenant.context)
      return (
        <Navigate
          to={tenant.storeMode === 'multi' ? paths.setup : paths.forbidden}
          replace
        />
      );
    if (!isManagementRole(tenant.context.membership.role))
      return <Navigate to={paths.forbidden} replace />;
    return (
      <SetupCompletionGate
        key={JSON.stringify([
          state.session?.user.id,
          tenant.context.organization.id,
          tenant.branchID,
        ])}
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
  if (!tenant.context)
    return (
      <Navigate
        to={tenant.storeMode === 'multi' ? paths.setup : paths.forbidden}
        replace
      />
    );
  if (!isManagementRole(tenant.context.membership.role))
    return <Navigate to={paths.forbidden} replace />;
  const destination =
    path === '/dashboard'
      ? paths.dashboard
      : workspacePath(generatePath(path, params), 'management');
  return <Navigate to={destination + search + hash} replace />;
}
