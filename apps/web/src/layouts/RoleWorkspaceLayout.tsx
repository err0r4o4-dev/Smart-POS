import { useLocation } from 'react-router-dom';
import { useAuth } from '../app/AuthProvider';
import { useOrganization } from '../app/OrganizationProvider';
import { isManagementRole } from '../app/access';
import { paths } from '../app/routes';
import { Loading } from '../components/ui/primitives';
import { ManagementLayout, WorkspaceShell } from './ManagementLayout';
import { StaffLayout } from './StaffLayout';

export function RoleWorkspaceLayout() {
  const { state } = useAuth();
  const tenant = useOrganization();
  const { pathname } = useLocation();
  if (state.status === 'loading' || tenant.loading)
    return (
      <main className="standalone">
        <Loading>กำลังเลือกพื้นที่ตามสิทธิ์ของคุณ…</Loading>
      </main>
    );
  const role =
    state.status === 'authenticated' && !tenant.error
      ? tenant.context?.membership.role
      : undefined;
  if (!role) return <WorkspaceShell area="account" />;
  if (!isManagementRole(role) || pathname === paths.staff)
    return <StaffLayout />;
  return <ManagementLayout />;
}
