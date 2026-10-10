import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { navigation, paths } from '../../app/routes';
import { canAccess } from '../../app/access';
import { useOrganization } from '../../app/OrganizationProvider';
import { Card, Tag } from '../../components/ui/primitives';

export function DashboardPage() {
  const tenant = useOrganization();
  const context = tenant.context;
  if (!context) return null;
  const branch = context.branches.find((item) => item.id === tenant.branchID);
  const modules = navigation.filter(
    (item) =>
      item.permission &&
      canAccess(
        {
          authenticated: true,
          role: context.membership.role,
          permissions: context.permissions,
        },
        item.permission,
        item.roles,
      ),
  );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SMARTPOS WORKSPACE</p>
          <h1 tabIndex={-1}>พื้นที่ปฏิบัติงาน</h1>
          <p>
            {context.organization.name} ·{' '}
            {branch?.name ?? 'ยังไม่มีสาขาที่เข้าถึงได้'}
          </p>
        </div>
        <Tag tone="amber">{context.membership.role}</Tag>
      </div>
      <Card>
        <h2>โมดูลที่ใช้งานได้</h2>
        <p>
          เปิดหน้าทำงานตามสิทธิ์ของคุณในองค์กรและสาขาที่เลือก
          ข้อมูลมาจากระบบจริง
        </p>
        {!branch && (
          <p role="status">
            ยังไม่มีสาขาที่เข้าถึงได้
            โปรดตรวจสอบสาขาหรือเลือกองค์กรที่หน้าตั้งค่าร้าน
          </p>
        )}
        <Link className="text-link" to={paths.setup}>
          ตั้งค่าร้าน / เลือกองค์กร <ArrowRight size={17} aria-hidden="true" />
        </Link>
      </Card>
      <section
        className="module-section workspace-modules"
        aria-label="Operational modules"
      >
        <div className="workspace-module-grid">
          {modules.map((item) => (
            <Link
              className="card workspace-module-link"
              key={item.to}
              to={item.to}
            >
              <h2>{item.label}</h2>
              <span>
                เปิดหน้าทำงาน <ArrowRight size={17} aria-hidden="true" />
              </span>
            </Link>
          ))}
        </div>
        {modules.length === 0 && (
          <p role="status">
            บัญชีนี้ยังไม่มีสิทธิ์เข้าถึงโมดูล โปรดติดต่อผู้ดูแลองค์กร
          </p>
        )}
      </section>
      <p className="muted">
        หน้านี้เป็นจุดเข้าใช้งาน ไม่ใช่รายงานยอดขายหรือ AI dashboard
        ซึ่งยังอยู่ในแผนพัฒนา
      </p>
    </>
  );
}
