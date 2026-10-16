import { useLanguage } from '../app/language';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../app/AuthProvider';
import { useOrganization } from '../app/OrganizationProvider';
import { isManagementRole } from '../app/access';
import { businessArea } from '../app/workspace-paths';
import { Loading } from '../components/ui/primitives';
import { ManagementLayout, WorkspaceShell } from './ManagementLayout';
import { StaffLayout } from './StaffLayout';

export function RoleWorkspaceLayout() {
  const { t } = useLanguage();

  const { state } = useAuth();
  const tenant = useOrganization();
  const { pathname } = useLocation();
  if (state.status === 'loading' || tenant.loading)
    return (
      <main className="standalone">
        <Loading>{t('shell.selectingAWorkspaceBasedOnYourAccess')}</Loading>
      </main>
    );
  const role =
    state.status === 'authenticated' && !tenant.error
      ? tenant.context?.membership.role
      : undefined;
  if (!role) return <WorkspaceShell area="account" />;
  if (!isManagementRole(role) || businessArea(pathname) === 'staff')
    return <StaffLayout />;
  return <ManagementLayout />;
}
