import { Navigate, Outlet } from 'react-router-dom';
import { useOrganization } from '../../app/OrganizationProvider';
import { ErrorState, Loading } from '../../components/ui/primitives';
export function OrganizationGate({ permission }: { permission?: string }) {
  const tenant = useOrganization();
  if (tenant.loading) return <Loading>กำลังตรวจสอบสิทธิ์องค์กร…</Loading>;
  if (tenant.error)
    return (
      <ErrorState message={tenant.error} retry={() => void tenant.refresh()} />
    );
  if (!tenant.context) return <Navigate to="/setup" replace />;
  if (permission && !tenant.can(permission))
    return <Navigate to="/403" replace />;
  return (
    <Outlet
      key={`${tenant.context.organization.id}:${tenant.branchID}:${tenant.context.membership.role}`}
    />
  );
}
export function ContextSwitchers() {
  const tenant = useOrganization();
  if (!tenant.organizations.length) return null;
  return (
    <div className="tenant-switchers">
      <label>
        องค์กร
        <select
          aria-label="องค์กรที่ใช้งาน"
          value={tenant.context?.organization.id ?? ''}
          disabled={tenant.loading}
          onChange={(event) => tenant.select(event.target.value)}
        >
          <option value="" disabled>
            เลือกองค์กร
          </option>
          {tenant.organizations.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </label>
      <label>
        สาขา
        <select
          aria-label="สาขาที่ใช้งาน"
          value={tenant.branchID}
          disabled={tenant.loading || !tenant.context}
          onChange={(event) =>
            tenant.context &&
            tenant.select(tenant.context.organization.id, event.target.value)
          }
        >
          <option value="" disabled>
            ไม่มีสาขาที่เข้าถึงได้
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
