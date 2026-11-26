import { useLanguage } from '../app/language';
import { useAuth } from '../app/AuthProvider';
import { useOrganization } from '../app/OrganizationProvider';
import { isManagementRole } from '../app/access';
import { Loading } from '../components/ui/primitives';
import { ManagementLayout, WorkspaceShell } from './ManagementLayout';

export function RoleWorkspaceLayout() {
  const { t } = useLanguage();

  const { state } = useAuth();
  const tenant = useOrganization();
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
  if (!isManagementRole(role)) return <WorkspaceShell area="account" />;
  return <ManagementLayout />;
}
