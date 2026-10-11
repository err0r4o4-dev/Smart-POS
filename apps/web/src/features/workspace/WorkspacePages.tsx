import { Link, Navigate } from 'react-router-dom';
import { ArrowRight, BookOpen, ShieldCheck, ShoppingBag } from 'lucide-react';
import {
  useOrganization,
  OrganizationProvider,
} from '../../app/OrganizationProvider';
import {
  canAccess,
  isManagementRole,
  roleLabels,
  workspaceHome,
} from '../../app/access';
import {
  navigation,
  paths,
  staffNavigation,
  type NavigationItem,
} from '../../app/routes';
import { Card, ErrorState, Loading, Tag } from '../../components/ui/primitives';
import { WorkspaceAreaGate } from './WorkspaceRouting';

export function OrganizationWorkspaceProvider() {
  return (
    <OrganizationProvider>
      <WorkspaceAreaGate />
    </OrganizationProvider>
  );
}

export function WorkspaceEntryPage() {
  const tenant = useOrganization();
  if (tenant.loading) return <Loading>กำลังเลือกพื้นที่ทำงาน…</Loading>;
  if (tenant.error)
    return (
      <ErrorState message={tenant.error} retry={() => void tenant.refresh()} />
    );
  if (!tenant.context) return <Navigate to={paths.account} replace />;
  return (
    <Navigate to={workspaceHome(tenant.context.membership.role)} replace />
  );
}

function TaskCards({ items }: { items: NavigationItem[] }) {
  const tenant = useOrganization();
  if (!tenant.context) return null;
  const access = {
    authenticated: true as const,
    role: tenant.context.membership.role,
    permissions: tenant.context.permissions,
  };
  const visibleItems = items.filter((item) =>
    canAccess(access, item.permission, item.roles),
  );
  if (!visibleItems.length)
    return (
      <p role="status">
        ยังไม่มีเครื่องมือที่ได้รับสิทธิ์ในพื้นที่นี้ กรุณาติดต่อเจ้าของร้าน
      </p>
    );
  return (
    <div className="workspace-task-grid">
      {visibleItems.map((item) => (
        <Link key={item.to} className="workspace-task" to={item.to}>
          <span>{item.label}</span>
          <ArrowRight size={19} aria-hidden="true" />
        </Link>
      ))}
    </div>
  );
}

export function ManagementHomePage() {
  const tenant = useOrganization();
  if (!tenant.context) return null;
  const role = tenant.context.membership.role;
  if (!isManagementRole(role)) return <Navigate to={paths.staff} replace />;
  return (
    <div className="workspace-home">
      <div className="page-heading">
        <div>
          <p className="eyebrow">พื้นที่จัดการร้าน</p>
          <h1 tabIndex={-1}>ภาพรวมร้าน</h1>
          <p>{tenant.context.organization.name} · จัดการร้านตามสิทธิ์ของคุณ</p>
        </div>
        <Tag tone="amber">{roleLabels[role]}</Tag>
      </div>
      <Card className="workspace-intro">
        <ShieldCheck size={27} aria-hidden="true" />
        <div>
          <h2>ข้อมูลร้านและทีมงาน อยู่ในพื้นที่นี้</h2>
          <p>
            หน้าร้านลูกค้าและหน้าทำงานพนักงานแยกออกจากการจัดการร้าน
            ไม่มีการเปลี่ยนบทบาทเมื่อสลับพื้นที่
          </p>
        </div>
        <Link className="button button-secondary" to={paths.staff}>
          เปิดพื้นที่พนักงาน
        </Link>
      </Card>
      <section aria-labelledby="management-tasks-title">
        <h2 id="management-tasks-title">เครื่องมือจัดการร้าน</h2>
        <TaskCards
          items={navigation.filter(
            (item) =>
              ![paths.dashboard, paths.account, paths.help, paths.setup].some(
                (path) => path === item.to,
              ),
          )}
        />
      </section>
      <div className="workspace-information-grid">
        <Card>
          <ShoppingBag aria-hidden="true" />
          <h2>หน้าร้านออนไลน์สำหรับลูกค้า</h2>
          <p>
            แยกทางเข้าและเมนูจากทีมร้านแล้ว
            ยังไม่เปิดรับออเดอร์หรือชำระเงินออนไลน์
          </p>
          <Link className="button button-secondary" to={paths.shop}>
            ดูหน้าร้านออนไลน์
          </Link>
        </Card>
        <Card>
          <BookOpen aria-hidden="true" />
          <h2>คู่มือและสถานะระบบ</h2>
          <p>
            ข้อมูลการเริ่มใช้งานและการเชื่อมต่อระบบ ไม่ใช่ยอดขายหรือรายงานธุรกิจ
          </p>
          <Link to={paths.help}>คู่มือการใช้งาน</Link>
          <Link to={paths.system}>ตรวจสถานะระบบ</Link>
        </Card>
      </div>
    </div>
  );
}

export function StaffHomePage() {
  const tenant = useOrganization();
  if (!tenant.context) return null;
  const role = tenant.context.membership.role;
  return (
    <div className="workspace-home">
      <div className="page-heading">
        <div>
          <p className="eyebrow">พื้นที่พนักงาน</p>
          <h1 tabIndex={-1}>งานของฉัน</h1>
          <p>
            {tenant.context.organization.name} · {roleLabels[role]}
          </p>
        </div>
        <Tag tone="amber">{roleLabels[role]}</Tag>
      </div>
      <Card className="workspace-intro">
        <ShieldCheck size={27} aria-hidden="true" />
        <div>
          <h2>เลือกงานตามหน้าที่ของคุณ</h2>
          <p>
            แสดงเฉพาะเครื่องมือที่ได้รับสิทธิ์ในองค์กรและสาขาปัจจุบัน
            ไม่มีเมนูตั้งค่าร้านหรือจัดการพนักงาน
          </p>
        </div>
      </Card>
      <section aria-labelledby="staff-tasks-title">
        <h2 id="staff-tasks-title">เครื่องมือทำงาน</h2>
        <TaskCards
          items={staffNavigation.filter(
            (item) =>
              ![paths.staff, paths.account, paths.help].some(
                (path) => path === item.to,
              ),
          )}
        />
      </section>
      <Card>
        <h2>บัญชีและความช่วยเหลือ</h2>
        <p>
          บทบาทมาจากสิทธิ์ที่ร้านกำหนด
          ไม่สามารถเลือกเปลี่ยนบทบาทด้วยตัวเองจากหน้าเมนู
        </p>
        <div className="tenant-actions">
          <Link className="button button-secondary" to={paths.account}>
            บัญชีของฉัน
          </Link>
          <Link to={paths.help}>คู่มือการใช้งาน</Link>
        </div>
      </Card>
    </div>
  );
}
