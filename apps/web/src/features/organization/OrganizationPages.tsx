import { useRef, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { WorkspaceLink as Link } from '../../app/WorkspaceNavigation';
import { useWorkspaceNavigate as useNavigate } from '../../app/useWorkspaceNavigate';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../app/AuthProvider';
import { useOrganization } from '../../app/OrganizationProvider';
import type { Role } from '../../app/access';
import { Button, Card, Loading, Tag } from '../../components/ui/primitives';
import {
  organizationRequest,
  type OrganizationInput,
  type OrganizationContext,
  type BranchInput,
  type Branch,
  type Member,
  type Invitation,
  type AuditEvent,
} from '../../lib/organization-api';

const blankOrganization: OrganizationInput = {
  name: '',
  code: '',
  business_type: 'RETAIL',
  contact_email: '',
  contact_phone: '',
  address: '',
};
const blankBranch: BranchInput = {
  name: '',
  code: '',
  address: '',
  phone: '',
  email: '',
  status: 'ACTIVE',
};
const roleNames: Role[] = [
  'OWNER',
  'MANAGER',
  'CASHIER',
  'INVENTORY_STAFF',
  'PURCHASING_STAFF',
];
function ErrorMessage({ message }: { message: string }) {
  return message ? (
    <p className="tenant-error" role="alert">
      {message}
    </p>
  ) : null;
}
function Field({
  label,
  value,
  onChange,
  required = false,
  type = 'text',
  maxLength = 200,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  maxLength?: number;
}) {
  return (
    <label className="tenant-field">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        type={type}
        maxLength={maxLength}
      />
    </label>
  );
}
function OrganizationFields({
  value,
  change,
}: {
  value: OrganizationInput;
  change: (value: OrganizationInput) => void;
}) {
  return (
    <div className="tenant-form-grid">
      <Field
        label="ชื่อองค์กร"
        value={value.name}
        required
        onChange={(name) => change({ ...value, name })}
      />
      <Field
        label="รหัสองค์กร"
        value={value.code}
        maxLength={50}
        required
        onChange={(code) => change({ ...value, code })}
      />
      <Field
        label="ประเภทธุรกิจ"
        value={value.business_type}
        maxLength={80}
        required
        onChange={(business_type) => change({ ...value, business_type })}
      />
      <Field
        label="อีเมลติดต่อ"
        value={value.contact_email}
        type="email"
        maxLength={254}
        onChange={(contact_email) => change({ ...value, contact_email })}
      />
      <Field
        label="โทรศัพท์ติดต่อ"
        value={value.contact_phone}
        maxLength={30}
        onChange={(contact_phone) => change({ ...value, contact_phone })}
      />
      <Field
        label="ที่อยู่องค์กร"
        value={value.address}
        maxLength={1000}
        onChange={(address) => change({ ...value, address })}
      />
    </div>
  );
}
function BranchFields({
  value,
  change,
  owner = true,
}: {
  value: BranchInput;
  change: (value: BranchInput) => void;
  owner?: boolean;
}) {
  return (
    <div className="tenant-form-grid">
      <Field
        label="ชื่อสาขา"
        value={value.name}
        required
        onChange={(name) => change({ ...value, name })}
      />
      <Field
        label="รหัสสาขา"
        value={value.code}
        maxLength={50}
        required
        onChange={(code) => change({ ...value, code })}
      />
      <Field
        label="ที่อยู่สาขา"
        value={value.address}
        maxLength={1000}
        onChange={(address) => change({ ...value, address })}
      />
      <Field
        label="โทรศัพท์สาขา"
        value={value.phone}
        maxLength={30}
        onChange={(phone) => change({ ...value, phone })}
      />
      <Field
        label="อีเมลสาขา"
        value={value.email}
        type="email"
        maxLength={254}
        onChange={(email) => change({ ...value, email })}
      />
      {owner && (
        <label className="tenant-field">
          สถานะสาขา
          <select
            aria-label="สถานะสาขา"
            value={value.status}
            onChange={(event) =>
              change({ ...value, status: event.target.value })
            }
          >
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
          </select>
        </label>
      )}
    </div>
  );
}
function useTenantData<Result>(resource: string) {
  const tenant = useOrganization();
  const userID = useAuth().state.session?.user.id;
  const orgID = tenant.context?.organization.id;
  return useQuery({
    queryKey: ['tenant', userID, orgID, tenant.branchID, resource],
    queryFn: ({ signal }) =>
      organizationRequest<Result>(`/organizations/${orgID}/${resource}`, {
        signal,
      }),
    enabled: !!orgID,
    retry: false,
  });
}
function useWrite() {
  const auth = useAuth();
  const tenant = useOrganization();
  const csrf = auth.state.session?.csrf_token;
  return async <Result,>(resource: string, method: string, body?: object) => {
    if (!tenant.context || !csrf)
      throw new Error('กรุณาเข้าสู่ระบบและเลือกองค์กร');
    try {
      const result = await organizationRequest<Result>(
        `/organizations/${tenant.context.organization.id}/${resource}`,
        { method, body, csrf },
      );
      await tenant.refresh();
      return result;
    } catch (error) {
      await tenant.refresh();
      throw error;
    }
  };
}
export function SetupPage() {
  const { state } = useAuth();
  const tenant = useOrganization();
  const navigate = useNavigate();
  const [organization, setOrganization] = useState(blankOrganization);
  const [branch, setBranch] = useState({
    ...blankBranch,
    name: 'สาขาหลัก',
    code: 'MAIN',
  });
  const [step, setStep] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const retry = useRef({ key: '', payload: '' });
  if (state.status === 'loading') return <Loading>กำลังตรวจสอบบัญชี…</Loading>;
  if (state.status !== 'authenticated')
    return (
      <Card className="tenant-page">
        <h1>ตั้งค่าร้าน</h1>
        <p>
          เข้าสู่ระบบด้วยอีเมลผู้รับก่อนสร้างร้านหรือรับคำเชิญ
          หากยังไม่มีบัญชีให้สมัครแล้วกลับมาเปิดคำเชิญ
        </p>
        <Link className="button" to="/login?returnTo=%2Fsetup">
          เข้าสู่ระบบ
        </Link>
        <Link className="button button-secondary" to="/register">
          สมัครบัญชี
        </Link>
      </Card>
    );
  if (tenant.loading)
    return <Loading>กำลังตรวจสอบโหมดร้านและสิทธิ์เข้าใช้งาน…</Loading>;
  if (tenant.error)
    return (
      <div className="tenant-page">
        <ErrorMessage message={tenant.error} />
        <Button onClick={() => void tenant.refresh()}>ตรวจสิทธิ์ใหม่</Button>
      </div>
    );
  const accept = async () => {
    setPending(true);
    setError('');
    try {
      const result = await organizationRequest<OrganizationContext>(
        '/invitations/accept',
        {
          method: 'POST',
          body: { token: tenant.invitationToken },
          csrf: state.session.csrf_token,
        },
      );
      tenant.clearInvitation();
      await tenant.refresh();
      tenant.select(result.organization.id);
      navigate('/manage/settings/store');
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'รับคำเชิญไม่สำเร็จ',
      );
    } finally {
      setPending(false);
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (tenant.storeMode === 'single') {
      setError('ระบบร้านเดียวไม่อนุญาตให้สร้างองค์กรเพิ่ม');
      return;
    }
    setError('');
    if (step < 2) {
      setStep(step + 1);
      return;
    }
    setPending(true);
    const payload = {
      ...organization,
      branch: { ...branch, status: 'ACTIVE' },
    };
    const encoded = JSON.stringify(payload);
    if (retry.current.payload !== encoded)
      retry.current = { key: crypto.randomUUID(), payload: encoded };
    try {
      const result = await organizationRequest<OrganizationContext>(
        '/organizations',
        {
          method: 'POST',
          body: payload,
          csrf: state.session.csrf_token,
          key: retry.current.key,
        },
      );
      await tenant.refresh();
      tenant.select(result.organization.id);
      navigate('/manage/settings/store');
    } catch (failure) {
      setError(
        failure instanceof Error ? failure.message : 'สร้างองค์กรไม่สำเร็จ',
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="tenant-page">
      <header>
        <Tag tone="amber">STORE ONBOARDING</Tag>
        <h1>ตั้งค่าร้าน</h1>
        <p>
          {tenant.storeMode === 'single'
            ? 'ระบบร้านเดียว ใช้สิทธิ์สมาชิกของร้านที่กำหนดเท่านั้น'
            : 'สร้างองค์กรพร้อม Owner และสาขาหลักในธุรกรรมเดียว'}
        </p>
      </header>
      {tenant.invitationToken && (
        <Card>
          <h2>คำเชิญเข้าร่วมองค์กร</h2>
          <p>บัญชีที่ใช้รับคำเชิญ: {state.session.user.email}</p>
          <Button disabled={pending} onClick={() => void accept()}>
            รับคำเชิญ
          </Button>
        </Card>
      )}
      {tenant.organizations.length > 0 && (
        <Card>
          <h2>
            {tenant.storeMode === 'single' ? 'ร้านของคุณ' : 'องค์กรของคุณ'}
          </h2>
          <div className="tenant-actions">
            {tenant.organizations.map((item) => (
              <Button
                key={item.id}
                className="button-secondary"
                onClick={() => {
                  tenant.select(item.id);
                  navigate('/manage/settings/store');
                }}
              >
                {item.name}
              </Button>
            ))}
          </div>
        </Card>
      )}
      {tenant.storeMode === 'single' && tenant.organizations.length === 0 && (
        <Card>
          <h2>ยังไม่มีสิทธิ์เข้าร้านนี้</h2>
          <p>
            ขอคำเชิญจากเจ้าของร้าน แล้วเข้าสู่ระบบด้วยบัญชีที่ได้รับคำเชิญ
            การสมัครบัญชีไม่เพิ่มสิทธิ์เข้าร้านให้อัตโนมัติ
          </p>
        </Card>
      )}
      {tenant.storeMode === 'single' && <ErrorMessage message={error} />}
      {tenant.storeMode !== 'single' && (
        <Card>
          <p className="tenant-step" role="status">
            ขั้นตอน {step + 1} / 3 ·{' '}
            {['ข้อมูลธุรกิจ', 'สาขาหลัก', 'ตรวจสอบข้อมูล'][step]}
          </p>
          <form onSubmit={(event) => void submit(event)}>
            <fieldset disabled={pending}>
              {step === 0 && (
                <OrganizationFields
                  value={organization}
                  change={setOrganization}
                />
              )}
              {step === 1 && (
                <BranchFields value={branch} change={setBranch} owner={false} />
              )}
              {step === 2 && (
                <dl>
                  <dt>องค์กร</dt>
                  <dd>
                    {organization.name} ({organization.code})
                  </dd>
                  <dt>ประเภทธุรกิจ / ติดต่อ</dt>
                  <dd>
                    {organization.business_type} ·{' '}
                    {organization.contact_email || 'ไม่ระบุ'} ·{' '}
                    {organization.contact_phone || 'ไม่ระบุ'}
                  </dd>
                  <dt>สาขาหลัก</dt>
                  <dd>
                    {branch.name} ({branch.code}) ·{' '}
                    {branch.address || 'ไม่ระบุที่อยู่'}
                  </dd>
                  <dt>Owner</dt>
                  <dd>
                    {state.session.user.display_name} ·{' '}
                    {state.session.user.email}
                  </dd>
                </dl>
              )}
              <ErrorMessage message={error} />
              <div className="tenant-actions">
                {step > 0 && (
                  <Button
                    className="button-secondary"
                    onClick={() => setStep(step - 1)}
                  >
                    ย้อนกลับ
                  </Button>
                )}
                <Button type="submit">
                  {pending
                    ? 'กำลังบันทึก…'
                    : step === 2
                      ? 'สร้างร้าน'
                      : 'ถัดไป'}
                </Button>
              </div>
            </fieldset>
          </form>
        </Card>
      )}
    </div>
  );
}
export function StorePage() {
  const tenant = useOrganization();
  const write = useWrite();
  const [value, setValue] = useState<OrganizationInput>(
    tenant.context!.organization,
  );
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError('');
    setMessage('');
    try {
      const {
        name,
        code,
        business_type,
        contact_email,
        contact_phone,
        address,
      } = value;
      await write('', 'PATCH', {
        name,
        code,
        business_type,
        contact_email,
        contact_phone,
        address,
      });
      setMessage('บันทึกข้อมูลองค์กรแล้ว');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="tenant-page">
      <header>
        <Tag tone="amber">ORGANIZATION</Tag>
        <h1>ข้อมูลองค์กร</h1>
        <p>{tenant.context?.membership.role} · THB · Asia/Bangkok</p>
      </header>
      <Card>
        <form onSubmit={(event) => void submit(event)}>
          <fieldset disabled={pending || !tenant.can('organization.update')}>
            <OrganizationFields value={value} change={setValue} />
            {tenant.can('organization.update') && (
              <Button type="submit">
                {pending ? 'กำลังบันทึก…' : 'บันทึกองค์กร'}
              </Button>
            )}
          </fieldset>
        </form>
        {!tenant.can('organization.update') && (
          <p>ข้อมูลตามสิทธิ์ปัจจุบัน · เฉพาะ Owner เปลี่ยนข้อมูลองค์กรได้</p>
        )}
        <p role="status">{message}</p>
        <ErrorMessage message={error} />
      </Card>
    </div>
  );
}
export function BranchesPage() {
  const tenant = useOrganization();
  const query = useTenantData<Branch[]>('branches');
  const write = useWrite();
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [value, setValue] = useState(blankBranch);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError('');
    try {
      await write(
        editing ? `branches/${editing}` : 'branches',
        editing ? 'PATCH' : 'POST',
        value,
      );
      setEditing(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="tenant-page">
      <header>
        <h1>สาขา</h1>
        <p>แสดงเฉพาะสาขาที่องค์กรและสิทธิ์ของคุณอนุญาต</p>
      </header>
      <Card>
        <div className="tenant-actions">
          <Field label="ค้นหาสาขา" value={search} onChange={setSearch} />
          {tenant.can('branch.create') && (
            <Button
              onClick={() => {
                setValue(blankBranch);
                setEditing('');
                setError('');
              }}
            >
              เพิ่มสาขา
            </Button>
          )}
        </div>
        {query.isPending && <Loading />}
        {query.error && <ErrorMessage message={query.error.message} />}
        <div className="tenant-list">
          {query.data
            ?.filter((item) =>
              `${item.name} ${item.code}`
                .toLowerCase()
                .includes(search.toLowerCase()),
            )
            .map((item) => (
              <article className="tenant-row" key={item.id}>
                <div>
                  <h3>{item.name}</h3>
                  <p>
                    {item.code} · {item.address || 'ไม่ระบุที่อยู่'}
                  </p>
                  <Tag tone={item.status === 'ACTIVE' ? 'success' : 'neutral'}>
                    {item.status}
                    {item.is_main ? ' · MAIN' : ''}
                  </Tag>
                </div>
                {tenant.can('branch.update') && (
                  <Button
                    className="button-secondary"
                    onClick={() => {
                      const { name, code, address, phone, email, status } =
                        item;
                      setValue({ name, code, address, phone, email, status });
                      setEditing(item.id);
                      setError('');
                    }}
                  >
                    แก้ไข {item.name}
                  </Button>
                )}
              </article>
            ))}
        </div>
        {query.data?.length === 0 && <p>ยังไม่มีสาขาที่เข้าถึงได้</p>}
      </Card>
      {editing !== null && (
        <Card>
          <h2>{editing ? 'แก้ไขสาขา' : 'สร้างสาขา'}</h2>
          <form onSubmit={(event) => void submit(event)}>
            <fieldset disabled={pending}>
              <BranchFields
                value={value}
                change={setValue}
                owner={tenant.can('branch.deactivate')}
              />
              <ErrorMessage message={error} />
              <div className="tenant-actions">
                <Button type="submit">บันทึกสาขา</Button>
                <Button
                  className="button-secondary"
                  onClick={() => setEditing(null)}
                >
                  ยกเลิก
                </Button>
              </div>
            </fieldset>
          </form>
        </Card>
      )}
    </div>
  );
}
function BranchAssignments({
  value,
  change,
}: {
  value: string[];
  change: (value: string[]) => void;
}) {
  const tenant = useOrganization();
  return (
    <fieldset className="tenant-assignments">
      <legend>สาขาที่ได้รับมอบหมาย</legend>
      {tenant.context?.branches.map((branch) => (
        <label key={branch.id}>
          <input
            type="checkbox"
            checked={value.includes(branch.id)}
            onChange={(event) =>
              change(
                event.target.checked
                  ? [...value, branch.id]
                  : value.filter((item) => item !== branch.id),
              )
            }
          />
          {branch.name}
        </label>
      ))}
    </fieldset>
  );
}
function RoleSelect({
  value,
  change,
  invite = false,
}: {
  value: Role;
  change: (role: Role) => void;
  invite?: boolean;
}) {
  const tenant = useOrganization();
  const allowed = roleNames.filter((role) =>
    tenant.context?.membership.role === 'OWNER'
      ? !invite || role !== 'OWNER'
      : ['CASHIER', 'INVENTORY_STAFF', 'PURCHASING_STAFF'].includes(role),
  );
  return (
    <label className="tenant-field">
      บทบาท
      <select
        aria-label="บทบาท"
        value={value}
        onChange={(event) => change(event.target.value as Role)}
      >
        {allowed.map((role) => (
          <option key={role} value={role}>
            {role}
          </option>
        ))}
      </select>
    </label>
  );
}
export function EmployeesPage() {
  const tenant = useOrganization();
  const query = useTenantData<Member[]>('members');
  const invitations = useTenantData<Invitation[]>('invitations');
  const write = useWrite();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('CASHIER');
  const [branchIDs, setBranchIDs] = useState<string[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!branchIDs.length) {
      setError('เลือกอย่างน้อยหนึ่งสาขา');
      return;
    }
    setPending(true);
    try {
      await write('invitations', 'POST', {
        email,
        role,
        branch_ids: branchIDs,
      });
      setMessage('ส่งคำเชิญแล้ว · อายุ 48 ชั่วโมง');
      setEmail('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'เชิญไม่สำเร็จ');
    } finally {
      setPending(false);
    }
  };
  const revoke = async (id: string) => {
    setPending(true);
    setError('');
    try {
      await write(`invitations/${id}`, 'DELETE');
      setMessage('ยกเลิกคำเชิญแล้ว');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'ยกเลิกไม่สำเร็จ');
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="tenant-page">
      <header>
        <h1>พนักงาน</h1>
        <p>บัญชีเดียวเข้าร่วมได้หลายองค์กร โดยสิทธิ์ไม่ข้ามองค์กร</p>
      </header>
      <Card>
        {query.isPending && <Loading />}
        {query.error && <ErrorMessage message={query.error.message} />}
        <div className="tenant-list">
          {query.data?.map((member) => (
            <article className="tenant-row" key={member.id}>
              <div>
                <h3>
                  <Link to={`/employees/${member.id}`}>
                    {member.display_name}
                  </Link>
                </h3>
                <p>{member.email}</p>
                <p>
                  {member.role} ·{' '}
                  {member.role === 'OWNER'
                    ? 'ทุกสาขา'
                    : member.branch_ids
                        .map(
                          (id) =>
                            tenant.context?.branches.find(
                              (item) => item.id === id,
                            )?.name ?? 'สาขาที่ปิดใช้งาน',
                        )
                        .join(', ')}
                </p>
                <Tag>{member.status}</Tag>
              </div>
              <Link
                className="button button-secondary"
                to={`/employees/${member.id}`}
              >
                รายละเอียด
              </Link>
            </article>
          ))}
        </div>
        {query.data?.length === 0 && <p>ยังไม่มีพนักงานในขอบเขตสิทธิ์</p>}
      </Card>
      {tenant.can('employee.invite') && (
        <Card>
          <h2>เชิญพนักงาน</h2>
          <form onSubmit={(event) => void submit(event)}>
            <fieldset disabled={pending}>
              <Field
                label="อีเมลพนักงาน"
                value={email}
                onChange={setEmail}
                type="email"
                required
                maxLength={254}
              />
              <RoleSelect value={role} change={setRole} invite />
              <BranchAssignments value={branchIDs} change={setBranchIDs} />
              <Button type="submit">ส่งคำเชิญ</Button>
            </fieldset>
          </form>
          <div className="tenant-list">
            {invitations.data?.map((item) => (
              <article className="tenant-row" key={item.id}>
                <p>
                  {item.email} · {item.role} · {item.status}
                </p>
                {item.status === 'PENDING' && (
                  <Button
                    className="button-secondary"
                    disabled={pending}
                    onClick={() => void revoke(item.id)}
                  >
                    ยกเลิกคำเชิญ
                  </Button>
                )}
              </article>
            ))}
          </div>
          <p role="status">{message}</p>
          <ErrorMessage message={error || invitations.error?.message || ''} />
        </Card>
      )}
    </div>
  );
}
function MemberEditor({ member }: { member: Member }) {
  const tenant = useOrganization();
  const write = useWrite();
  const [role, setRole] = useState(member.role);
  const [status, setStatus] = useState(member.status);
  const [branchIDs, setBranchIDs] = useState(member.branch_ids);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [confirm, setConfirm] = useState(false);
  const actor = tenant.context!.membership;
  const allowed =
    actor.role === 'OWNER' ||
    (actor.id !== member.id &&
      ['CASHIER', 'INVENTORY_STAFF', 'PURCHASING_STAFF'].includes(
        member.role,
      ) &&
      member.branch_ids.length > 0 &&
      member.branch_ids.every((id) => actor.branch_ids.includes(id)));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError('');
    setMessage('');
    try {
      await write(`members/${member.id}`, 'PATCH', {
        role,
        status,
        branch_ids: branchIDs,
      });
      setMessage('บันทึกสิทธิ์แล้ว');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setPending(false);
    }
  };
  const remove = async () => {
    setPending(true);
    setError('');
    try {
      await write(`members/${member.id}`, 'DELETE');
      setMessage('ถอนสิทธิ์องค์กรแล้ว');
      setConfirm(false);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'ถอนไม่สำเร็จ');
    } finally {
      setPending(false);
    }
  };
  return (
    <Card>
      <h2>การมอบหมายสิทธิ์</h2>
      <form onSubmit={(event) => void submit(event)}>
        <fieldset
          disabled={pending || !allowed || !tenant.can('employee.update')}
        >
          <RoleSelect value={role} change={setRole} />
          <label className="tenant-field">
            สถานะสมาชิก
            <select
              aria-label="สถานะสมาชิก"
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              {['ACTIVE', 'SUSPENDED', 'REMOVED'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          {role !== 'OWNER' && (
            <BranchAssignments value={branchIDs} change={setBranchIDs} />
          )}
          {allowed && <Button type="submit">บันทึกสมาชิก</Button>}
        </fieldset>
      </form>
      {allowed && tenant.can('employee.remove') && (
        <div className="tenant-actions">
          {confirm ? (
            <>
              <p>
                ถอนสิทธิ์ {member.display_name} จากองค์กรนี้?
                บัญชีผู้ใช้ยังคงอยู่
              </p>
              <Button disabled={pending} onClick={() => void remove()}>
                ยืนยันถอนสมาชิก
              </Button>
              <Button
                className="button-secondary"
                onClick={() => setConfirm(false)}
              >
                ยกเลิก
              </Button>
            </>
          ) : (
            <Button
              className="button-secondary"
              disabled={pending || member.status === 'REMOVED'}
              onClick={() => setConfirm(true)}
            >
              ถอนสมาชิก
            </Button>
          )}
        </div>
      )}
      <p role="status">{message}</p>
      <ErrorMessage message={error} />
    </Card>
  );
}
export function EmployeePage() {
  const { id } = useParams();
  const query = useTenantData<Member>(`members/${id}`);
  const history = useTenantData<AuditEvent[]>(`audit?member_id=${id}`);
  return (
    <div className="tenant-page">
      <header>
        <h1>รายละเอียดพนักงาน</h1>
        <Link to="/employees">กลับรายการพนักงาน</Link>
      </header>
      {query.isPending && <Loading />}
      {query.error && <ErrorMessage message={query.error.message} />}
      {query.data && (
        <>
          <Card>
            <h2>{query.data.display_name}</h2>
            <p>{query.data.email}</p>
            <Tag>{query.data.status}</Tag>
            <p>
              {query.data.role} ·{' '}
              {query.data.permissions.join(', ') || 'ไม่มีสิทธิ์ใช้งาน'}
            </p>
          </Card>
          <MemberEditor
            key={`${query.data.id}:${query.data.role}:${query.data.status}:${query.data.branch_ids.join(',')}`}
            member={query.data}
          />
        </>
      )}
      <Card>
        <h2>ประวัติการเปลี่ยนสิทธิ์</h2>
        {history.error && <ErrorMessage message={history.error.message} />}
        {history.data?.map((event) => (
          <p key={event.id}>
            {new Date(event.created_at).toLocaleString('th-TH')} ·{' '}
            {event.event_type} · {event.request_id}
          </p>
        ))}
        {history.data?.length === 0 && <p>ยังไม่มีรายการในขอบเขตสิทธิ์</p>}
      </Card>
    </div>
  );
}
export function RolesPage() {
  const tenant = useOrganization();
  const query = useTenantData<Record<Role, string[]>>('roles');
  const permissions = [...new Set(Object.values(query.data ?? {}).flat())];
  return (
    <div className="tenant-page">
      <header>
        <h1>บทบาทและสิทธิ์</h1>
        <p>
          สิทธิ์ปัจจุบัน: {tenant.context?.membership.role} · ใช้เฉพาะองค์กรนี้
        </p>
      </header>
      <Card>
        <p>
          Owner จัดการองค์กรและทุกสาขา; Manager
          จัดการเฉพาะพนักงานระดับปฏิบัติการที่ทุกสาขาอยู่ในขอบเขตตนเอง
          ห้ามเปลี่ยน Owner/Manager หรือตัวเอง สิทธิ์ของ
          Cashier/Inventory/Purchasing ในเฟสนี้เป็นอ่านบริบทและสาขาเท่านั้น
        </p>
        {query.isPending && <Loading />}
        {query.error && <ErrorMessage message={query.error.message} />}
        <div
          className="tenant-table-wrap"
          tabIndex={0}
          aria-label="ตารางสิทธิ์"
        >
          <table className="tenant-table">
            <thead>
              <tr>
                <th>Permission</th>
                {roleNames.map((role) => (
                  <th key={role}>{role}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {permissions.map((permission) => (
                <tr key={permission}>
                  <th>{permission}</th>
                  {roleNames.map((role) => (
                    <td key={role}>
                      {query.data?.[role].includes(permission) ? '✓' : '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
