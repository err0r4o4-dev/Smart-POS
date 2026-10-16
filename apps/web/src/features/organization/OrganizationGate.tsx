import { useLanguage } from '../../app/language';
import { Navigate, Outlet } from 'react-router-dom';
import { useOrganization } from '../../app/OrganizationProvider';
import { ErrorState, Loading } from '../../components/ui/primitives';
import type { Role } from '../../app/access';
export function OrganizationGate({
  permission,
  roles,
}: {
  permission?: string;
  roles?: Role[];
}) {
  const { t, localize } = useLanguage();

  const tenant = useOrganization();
  if (tenant.loading)
    return (
      <Loading>{t('organization.checkingOrganizationPermissions')}</Loading>
    );
  if (tenant.error)
    return (
      <ErrorState
        message={localize(tenant.error ?? '')}
        retry={() => void tenant.refresh()}
      />
    );
  if (!tenant.context) return <Navigate to="/setup" replace />;
  if (roles && !roles.includes(tenant.context.membership.role))
    return <Navigate to="/403" replace />;
  if (permission && !tenant.can(permission))
    return <Navigate to="/403" replace />;
  return (
    <Outlet
      key={`${tenant.context.organization.id}:${tenant.branchID}:${tenant.context.membership.role}`}
    />
  );
}
export function ContextSwitchers() {
  const { t } = useLanguage();

  const tenant = useOrganization();
  if (!tenant.organizations.length) return null;
  return (
    <div className="tenant-switchers">
      {tenant.storeMode !== 'single' && (
        <label>
          {t('organization.organization')}
          <select
            aria-label={t('organization.activeOrganization')}
            value={tenant.context?.organization.id ?? ''}
            disabled={tenant.loading}
            onChange={(event) => tenant.select(event.target.value)}
          >
            <option value="" disabled>
              {t('organization.selectOrganization')}
            </option>
            {tenant.organizations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label>
        {t('organization.branch')}
        <select
          aria-label={t('organization.activeBranch')}
          value={tenant.branchID}
          disabled={tenant.loading || !tenant.context}
          onChange={(event) =>
            tenant.context &&
            tenant.select(tenant.context.organization.id, event.target.value)
          }
        >
          <option value="" disabled>
            {t('organization.noAccessibleBranches')}
          </option>
          {tenant.context?.branches.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
