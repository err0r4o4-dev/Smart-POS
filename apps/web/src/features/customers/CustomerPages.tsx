import { useRef, useState, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { WorkspaceLink as Link } from '../../app/WorkspaceNavigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../app/AuthProvider';
import { useOrganization } from '../../app/OrganizationProvider';
import { Button, Card, Loading, Tag } from '../../components/ui/primitives';
import { Field } from '../purchasing/SupplyUI';
import { moneyText } from '../../lib/pos-api';
import {
  customerInput,
  customerRequest,
  type Customer,
  type CustomerInput,
  type CustomerGroup,
  type CustomerPage,
  type CustomerHistory,
} from '../../lib/customers-api';
import './customers.css';

type Text = (thai: string, english: string) => string;
function useScope() {
  const tenant = useOrganization(),
    { state } = useAuth();
  return {
    org: tenant.context?.organization.id ?? '',
    user: state.session?.user.id ?? '',
    branch: tenant.branchID,
    csrf: state.session?.csrf_token,
    tenant,
  };
}
function useCustomerQuery<Result>(path: string, enabled = true, body?: object) {
  const scope = useScope();
  return useQuery({
    queryKey: [
      'tenant',
      scope.user,
      scope.org,
      scope.branch,
      'customers',
      scope.tenant.can('customers.manage'),
      path,
      body,
    ],
    queryFn: ({ signal }) =>
      customerRequest<Result>(scope.org, path, {
        signal,
        ...(body ? { method: 'POST', body, csrf: scope.csrf } : {}),
      }),
    enabled: !!scope.org && enabled,
    retry: false,
  });
}
function useCommand() {
  const scope = useScope(),
    client = useQueryClient(),
    last = useRef({ identity: '', key: '' });
  return useMutation({
    mutationFn: ({
      path,
      body,
      method = 'POST',
    }: {
      path: string;
      body: object;
      method?: string;
    }) => {
      const identity = JSON.stringify({ path, body, method });
      if (last.current.identity !== identity)
        last.current = { identity, key: crypto.randomUUID() };
      return customerRequest<unknown>(scope.org, path, {
        method,
        body,
        csrf: scope.csrf,
        key: last.current.key,
      });
    },
    onSettled: () =>
      client.invalidateQueries({ queryKey: ['tenant', scope.user, scope.org] }),
  });
}
type Command = ReturnType<typeof useCommand>;
function Feedback({ error, text }: { error: unknown; text: Text }) {
  return error ? (
    <p role="alert" className="error-state">
      {text(
        'ทำรายการไม่สำเร็จ: ตรวจสอบสิทธิ์ รหัส/ข้อมูลซ้ำ หรือ revision แล้วลองใหม่',
        'Request failed: check permissions, duplicate identifiers or stale revision and retry',
      )}{' '}
      {error instanceof Error ? error.message : ''}
    </p>
  ) : null;
}
function Pager({
  page,
  total,
  size = 25,
  change,
  text,
}: {
  page: number;
  total: number;
  size?: number;
  change: (page: number) => void;
  text: Text;
}) {
  return (
    <div className="customer-pagination">
      <Button disabled={page === 1} onClick={() => change(page - 1)}>
        {text('ก่อนหน้า', 'Previous')}
      </Button>
      <span>
        {text('หน้า', 'Page')} {page} / {Math.max(1, Math.ceil(total / size))} ·{' '}
        {total} {text('รายการ', 'records')}
      </span>
      <Button disabled={page * size >= total} onClick={() => change(page + 1)}>
        {text('ถัดไป', 'Next')}
      </Button>
    </div>
  );
}
export function CustomersPage({
  view = 'list',
}: {
  view?: 'list' | 'detail' | 'groups';
}) {
  const scope = useScope();
  return (
    <CustomerWorkspace
      key={[
        scope.user,
        scope.org,
        scope.branch,
        scope.tenant.can('customers.manage'),
        scope.tenant.can('customers.history.read'),
      ].join(':')}
      view={view}
    />
  );
}
function CustomerWorkspace({ view }: { view: 'list' | 'detail' | 'groups' }) {
  const [language, setLanguage] = useState<'th' | 'en'>('th');
  const text: Text = (thai, english) => (language === 'th' ? thai : english);
  return (
    <div className="catalog-page customer-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">CUSTOMER RELATIONSHIPS</p>
          <h1>
            {text(
              view === 'groups'
                ? 'กลุ่มลูกค้า'
                : view === 'detail'
                  ? 'รายละเอียดลูกค้า'
                  : 'ลูกค้า',
              view === 'groups'
                ? 'Customer groups'
                : view === 'detail'
                  ? 'Customer details'
                  : 'Customers',
            )}
          </h1>
          <p>
            {text(
              'ลูกค้าร่วมทุกสาขาที่มีสิทธิ์ในองค์กร • ไม่ใช่บัญชีเข้าสู่ระบบ',
              'Shared within authorized organization branches • Not authentication accounts',
            )}
          </p>
        </div>
        <Field label="Language">
          <select
            value={language}
            onChange={(event) =>
              setLanguage(event.target.value === 'en' ? 'en' : 'th')
            }
          >
            <option value="th">ไทย</option>
            <option value="en">English</option>
          </select>
        </Field>
      </div>
      <nav className="catalog-nav">
        <Link to="/customers">{text('ลูกค้า', 'Customers')}</Link>
        <Link to="/customers/groups">
          {text('กลุ่มลูกค้า', 'Customer groups')}
        </Link>
        <Link to="/pos">{text('ไปขายสินค้า', 'Open POS')}</Link>
      </nav>
      {view === 'list' ? (
        <CustomerList text={text} />
      ) : view === 'groups' ? (
        <Groups text={text} />
      ) : (
        <CustomerDetail text={text} />
      )}
    </div>
  );
}
function CustomerList({ text }: { text: Text }) {
  const scope = useScope(),
    [params] = useSearchParams(),
    [page, setPage] = useState(1),
    [search, setSearch] = useState(''),
    [term, setTerm] = useState(''),
    [status, setStatus] = useState('ACTIVE'),
    [group, setGroup] = useState(params.get('group_id') ?? ''),
    [creating, setCreating] = useState(false);
  const query = useCustomerQuery<CustomerPage<Customer>>(
    '/customers/search',
    true,
    {
      search: term,
      status,
      ...(group ? { group_id: group } : {}),
      page,
      page_size: 25,
    },
  );
  const groups = useCustomerQuery<CustomerPage<CustomerGroup>>(
    '/customers/groups?page_size=100',
  );
  const command = useCommand();
  return (
    <>
      <Card>
        <form
          className="customer-filters"
          onSubmit={(event) => {
            event.preventDefault();
            setPage(1);
            setTerm(search.trim());
          }}
        >
          <Field
            label={text(
              'ค้นหารหัส ชื่อ โทรศัพท์ อีเมล',
              'Search code, name, phone, email',
            )}
          >
            <input
              value={search}
              maxLength={200}
              onChange={(event) => setSearch(event.target.value)}
            />
          </Field>
          <Button type="submit">{text('ค้นหา', 'Search')}</Button>
          <Field label={text('สถานะ', 'Status')}>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="ACTIVE">{text('ใช้งาน', 'Active')}</option>
              <option value="ARCHIVED">{text('เก็บถาวร', 'Archived')}</option>
              <option value="">{text('ทั้งหมด', 'All')}</option>
            </select>
          </Field>
          <Field label={text('กลุ่ม', 'Group')}>
            <select
              value={group}
              onChange={(event) => {
                setGroup(event.target.value);
                setPage(1);
              }}
            >
              <option value="">{text('ทุกกลุ่ม', 'All groups')}</option>
              {groups.data?.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({item.status})
                </option>
              ))}
            </select>
          </Field>
          {scope.tenant.can('customers.manage') && (
            <Button onClick={() => setCreating(!creating)}>
              {text('เพิ่มลูกค้า', 'Create customer')}
            </Button>
          )}
        </form>
        {query.isPending && (
          <Loading>{text('กำลังโหลดลูกค้า', 'Loading customers')}</Loading>
        )}
        <Feedback error={query.error} text={text} />
        {query.isError && (
          <Button onClick={() => void query.refetch()}>
            {text('ลองใหม่', 'Retry')}
          </Button>
        )}
        {query.data?.total === 0 && (
          <p>
            {text(
              'ไม่พบลูกค้า ลองเปลี่ยนคำค้นหาหรือเพิ่มลูกค้า',
              'No customers. Change filters or create a customer.',
            )}
          </p>
        )}
        <div className="customer-cards">
          {query.data?.items.map((item) => (
            <article className="customer-record" key={item.id}>
              <Link to={`/customers/${item.id}`}>
                <strong>{item.code}</strong> ·{' '}
                {item.name || text('ไม่ระบุชื่อ', 'Unnamed')}
              </Link>
              <Tag tone={item.status === 'ACTIVE' ? 'success' : 'neutral'}>
                {item.status}
              </Tag>
              <p>
                {item.phone || '—'} · {item.email || '—'}
              </p>
              <small>
                {item.groups.map((entry) => entry.name).join(', ') ||
                  text('ยังไม่มีกลุ่ม', 'No groups')}
              </small>
            </article>
          ))}
        </div>
        {query.data && (
          <Pager
            page={page}
            total={query.data.total}
            change={setPage}
            text={text}
          />
        )}
      </Card>
      {creating && scope.tenant.can('customers.manage') && (
        <Card>
          <h2>{text('เพิ่มลูกค้า', 'Create customer')}</h2>
          <CustomerForm
            text={text}
            command={command}
            onSaved={() => setCreating(false)}
          />
        </Card>
      )}
    </>
  );
}
function CustomerForm({
  value,
  text,
  command,
  onSaved,
}: {
  value?: Customer;
  text: Text;
  command: Command;
  onSaved?: () => void;
}) {
  const [form, setForm] = useState<CustomerInput>(
    value
      ? customerInput(value)
      : {
          code: '',
          name: '',
          phone: '',
          email: '',
          notes: '',
          marketing_consent: false,
        },
  );
  const [saved, setSaved] = useState(false);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSaved(false);
    command.mutate(
      {
        path: value ? `/customers/${value.id}` : '/customers',
        method: value ? 'PUT' : 'POST',
        body: form,
      },
      {
        onSuccess: () => {
          setSaved(true);
          onSaved?.();
        },
      },
    );
  };
  return (
    <form onSubmit={submit} className="customer-form">
      <p>
        {text(
          'กรอกเฉพาะที่จำเป็น โทรศัพท์/อีเมลไม่บังคับ และไม่สมัครการตลาดอัตโนมัติ',
          'Collect only necessary information. Contact details are optional; marketing is opt-in.',
        )}
      </p>
      {(['code', 'name', 'phone', 'email'] as const).map((field) => (
        <Field
          key={field}
          label={text(
            {
              code: 'รหัสลูกค้า',
              name: 'ชื่อ',
              phone: 'โทรศัพท์',
              email: 'อีเมล',
            }[field],
            {
              code: 'Customer code',
              name: 'Name',
              phone: 'Phone',
              email: 'Email',
            }[field],
          )}
        >
          <input
            required={field === 'code'}
            type={
              field === 'email' ? 'email' : field === 'phone' ? 'tel' : 'text'
            }
            maxLength={
              field === 'code'
                ? 40
                : field === 'email'
                  ? 254
                  : field === 'phone'
                    ? 40
                    : 200
            }
            value={form[field]}
            onChange={(event) =>
              setForm({ ...form, [field]: event.target.value })
            }
          />
        </Field>
      ))}
      <Field
        label={text(
          'บันทึก (ไม่เก็บข้อมูลอ่อนไหว)',
          'Notes (no sensitive information)',
        )}
      >
        <input
          maxLength={2000}
          value={form.notes}
          onChange={(event) => setForm({ ...form, notes: event.target.value })}
        />
      </Field>
      <label className="customer-consent">
        <input
          type="checkbox"
          checked={form.marketing_consent}
          onChange={(event) =>
            setForm({ ...form, marketing_consent: event.target.checked })
          }
        />
        {text(
          'ลูกค้ายินยอมรับการตลาดอย่างชัดเจน',
          'Customer explicitly consents to marketing',
        )}
      </label>
      <Button type="submit" disabled={command.isPending}>
        {text('บันทึก', 'Save')}
      </Button>
      <Feedback error={command.error} text={text} />
      {saved && <p role="status">{text('บันทึกแล้ว', 'Saved')}</p>}
    </form>
  );
}
function Archive({
  path,
  revision,
  command,
  text,
}: {
  path: string;
  revision: number;
  command: Command;
  text: Text;
}) {
  const [confirm, setConfirm] = useState(false);
  return confirm ? (
    <div className="customer-archive">
      <p>
        {text(
          'เก็บถาวรโดยไม่ลบประวัติธุรกรรม ย้อนกลับไม่ได้ในหน้านี้',
          'Archive without deleting transactions. This screen cannot restore records.',
        )}
      </p>
      <Button
        disabled={command.isPending}
        onClick={() =>
          command.mutate(
            { path: path + '/archive', body: { revision } },
            { onSuccess: () => setConfirm(false) },
          )
        }
      >
        {text('ยืนยันเก็บถาวร', 'Confirm archive')}
      </Button>
      <Button onClick={() => setConfirm(false)}>
        {text('ยกเลิก', 'Cancel')}
      </Button>
    </div>
  ) : (
    <Button className="button-secondary" onClick={() => setConfirm(true)}>
      {text('เก็บถาวร', 'Archive')}
    </Button>
  );
}
function CustomerDetail({ text }: { text: Text }) {
  const { id = '' } = useParams(),
    scope = useScope(),
    query = useCustomerQuery<Customer>(`/customers/${id}`),
    command = useCommand();
  if (query.isPending)
    return <Loading>{text('กำลังโหลดรายละเอียด', 'Loading customer')}</Loading>;
  if (!query.data)
    return (
      <>
        <Feedback error={query.error} text={text} />
        <Button onClick={() => void query.refetch()}>
          {text('ลองใหม่', 'Retry')}
        </Button>
      </>
    );
  const value = query.data;
  return (
    <>
      {scope.tenant.can('loyalty.read') && (
        <nav className="catalog-nav">
          <Link to={`/loyalty?customer_id=${value.id}`}>
            สมาชิกและแต้ม / Loyalty
          </Link>
          <Link to={`/loyalty/history?customer_id=${value.id}`}>
            ประวัติแต้ม / Points history
          </Link>
        </nav>
      )}
      <Card>
        <h2>
          {value.code} · {value.name || text('ไม่ระบุชื่อ', 'Unnamed')}
        </h2>
        <Tag>{value.status}</Tag>
        <p>
          {text('แก้ไขล่าสุด', 'Updated')}{' '}
          {new Date(value.updated_at).toLocaleString()} · revision{' '}
          {value.revision}
        </p>
        <p>
          {text(
            'ประวัติขายอ้างอิงรหัส ณ เวลาขาย ไม่เปลี่ยนตามข้อมูลปัจจุบัน',
            'Sales retain the customer code recorded at checkout.',
          )}
        </p>
        {scope.tenant.can('customers.manage') && value.status === 'ACTIVE' ? (
          <>
            <CustomerForm
              key={value.revision}
              value={value}
              command={command}
              text={text}
            />
            <Archive
              path={`/customers/${value.id}`}
              revision={value.revision}
              command={command}
              text={text}
            />
          </>
        ) : (
          <p>
            {value.phone || '—'} · {value.email || '—'}
          </p>
        )}
        <Feedback error={command.error} text={text} />
      </Card>
      <Memberships value={value} text={text} />
      {scope.tenant.can('customers.history.read') ? (
        <>
          <History id={id} text={text} />
          <Audit id={id} text={text} />
        </>
      ) : (
        <Card>
          <p>
            {text(
              'ไม่มีสิทธิ์ดูประวัติธุรกรรมลูกค้า',
              'Customer history permission required',
            )}
          </p>
        </Card>
      )}
    </>
  );
}
function Memberships({ value, text }: { value: Customer; text: Text }) {
  const scope = useScope(),
    [page, setPage] = useState(1),
    query = useCustomerQuery<CustomerPage<CustomerGroup>>(
      `/customers/groups?page=${page}&page_size=25`,
    ),
    command = useCommand(),
    can =
      scope.tenant.can('customers.groups.manage') &&
      scope.tenant.can('customers.manage') &&
      value.status === 'ACTIVE';
  const change = (group: CustomerGroup, present: boolean) =>
    command.mutate({
      path: `/customers/${value.id}/groups/${group.id}`,
      method: 'PUT',
      body: {
        revision: value.revision,
        group_revision: group.revision,
        present,
      },
    });
  return (
    <Card>
      <h2>{text('สมาชิกกลุ่ม', 'Group memberships')}</h2>
      {value.groups.length === 0 && <p>{text('ยังไม่มีกลุ่ม', 'No groups')}</p>}
      {value.groups.map((group) => (
        <div className="customer-membership" key={group.id}>
          <span>
            {group.name} · {group.status}
          </span>
          {can && (
            <Button
              disabled={command.isPending}
              onClick={() => change(group, false)}
            >
              {text('นำออก', 'Remove')}
            </Button>
          )}
        </div>
      ))}
      {can && (
        <>
          <h3>{text('เลือกกลุ่ม', 'Choose group')}</h3>
          {query.isPending && <Loading />}
          <Feedback error={query.error} text={text} />
          {query.data?.items
            .filter(
              (group) =>
                group.status === 'ACTIVE' &&
                !value.groups.some((item) => item.id === group.id),
            )
            .map((group) => (
              <Button
                className="button-secondary"
                key={group.id}
                disabled={command.isPending}
                onClick={() => change(group, true)}
              >
                {text('เพิ่มเข้ากลุ่ม', 'Add to')} {group.name}
              </Button>
            ))}
          {query.data && (
            <Pager
              page={page}
              total={query.data.total}
              change={setPage}
              text={text}
            />
          )}
        </>
      )}
      <Feedback error={command.error} text={text} />
    </Card>
  );
}
function History({ id, text }: { id: string; text: Text }) {
  const scope = useScope(),
    [page, setPage] = useState(1),
    [from, setFrom] = useState(''),
    [to, setTo] = useState('');
  const filters = new URLSearchParams({
    page: String(page),
    page_size: '25',
    branch_id: scope.branch,
  });
  if (from) filters.set('from', new Date(from + 'T00:00:00').toISOString());
  if (to) filters.set('to', new Date(to + 'T23:59:59.999').toISOString());
  const query = useCustomerQuery<CustomerHistory>(
    `/customers/${id}/history?${filters}`,
  );
  return (
    <Card>
      <h2>{text('ประวัติธุรกรรม', 'Transaction history')}</h2>
      <p>
        {text(
          'เฉพาะสาขาที่มีสิทธิ์ ยอดเงินรับใหม่จาก sale_payments.amount เท่านั้น เครดิตเปลี่ยนสินค้าไม่ใช่เงินรับใหม่',
          'Authorized branches only. Collected funds use sale_payments.amount; exchange credits are not new money.',
        )}
      </p>
      <div className="customer-filters">
        <Field label={text('ตั้งแต่', 'From')}>
          <input
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setPage(1);
            }}
          />
        </Field>
        <Field label={text('ถึง', 'To')}>
          <input
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              setPage(1);
            }}
          />
        </Field>
      </div>
      {query.isPending && <Loading />}
      <Feedback error={query.error} text={text} />
      {query.data && (
        <>
          <div className="customer-summary">
            <p>
              {text('เงินรับใหม่', 'Collected')}
              <strong>{moneyText(query.data.summary.paid)}</strong>
            </p>
            <p>
              {text('คืนเงินยืนยันแล้ว', 'Confirmed refunds')}
              <strong>{moneyText(query.data.summary.refunded)}</strong>
            </p>
            <p>
              {text('รอคืนเงิน', 'Pending refunds')}
              <strong>{moneyText(query.data.summary.pending_refund)}</strong>
            </p>
            <p>
              {text('เงินรับสุทธิ', 'Net collected')}
              <strong>{moneyText(query.data.summary.net_collected)}</strong>
            </p>
          </div>
          {query.data.total === 0 && (
            <p>{text('ยังไม่มีธุรกรรม', 'No transactions yet')}</p>
          )}
          <div className="customer-cards">
            {query.data.items.map((item) => (
              <article className="customer-record" key={item.kind + item.id}>
                <strong>
                  {item.kind} · {item.number}
                </strong>
                <Tag>{item.status}</Tag>
                <p>
                  {new Date(item.occurred_at).toLocaleString()} ·{' '}
                  {item.branch_name}
                </p>
                <p>
                  {text('ยอดเอกสาร', 'Document amount')}{' '}
                  {moneyText(item.amount)} · {text('รับใหม่', 'Collected')}{' '}
                  {moneyText(item.paid)} · {text('คืนยืนยัน', 'Refunded')}{' '}
                  {moneyText(item.refunded)}
                </p>
                <Link to={`/sales/${item.sale_id}`}>
                  {text('รายละเอียดการขายต้นทาง', 'Source sale details')}
                </Link>
              </article>
            ))}
          </div>
          <Pager
            page={page}
            total={query.data.total}
            change={setPage}
            text={text}
          />
        </>
      )}
    </Card>
  );
}
function Audit({ id, text }: { id: string; text: Text }) {
  const [page, setPage] = useState(1),
    query = useCustomerQuery<
      CustomerPage<{ id: number; event_type: string; created_at: string }>
    >(`/customers/${id}/audit?page=${page}`);
  return (
    <Card>
      <h2>{text('ประวัติการเปลี่ยนแปลง', 'Change history')}</h2>
      <p>
        {text(
          'บันทึกเหตุการณ์และผู้กระทำ โดยไม่สำเนาโทรศัพท์ อีเมล หรือบันทึกส่วนตัว',
          'Events and actor references only; no contact details or private notes copied into audit.',
        )}
      </p>
      <Feedback error={query.error} text={text} />
      {query.isPending && <Loading />}
      {query.data?.items.map((item) => (
        <p key={item.id}>
          {item.event_type} · {new Date(item.created_at).toLocaleString()}
        </p>
      ))}
      {query.data && (
        <Pager
          page={page}
          total={query.data.total}
          change={setPage}
          text={text}
        />
      )}
    </Card>
  );
}
function Groups({ text }: { text: Text }) {
  const scope = useScope(),
    [page, setPage] = useState(1),
    [status, setStatus] = useState(''),
    [selected, setSelected] = useState<CustomerGroup | null>(null),
    query = useCustomerQuery<CustomerPage<CustomerGroup>>(
      `/customers/groups?page=${page}&status=${status}`,
    ),
    command = useCommand();
  const current =
    query.data?.items.find((item) => item.id === selected?.id) ?? selected;
  return (
    <>
      <Card>
        <Field label={text('สถานะกลุ่ม', 'Group status')}>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
              setSelected(null);
            }}
          >
            <option value="">{text('ทั้งหมด', 'All')}</option>
            <option value="ACTIVE">{text('ใช้งาน', 'Active')}</option>
            <option value="ARCHIVED">{text('เก็บถาวร', 'Archived')}</option>
          </select>
        </Field>
        {query.isPending && <Loading />}
        <Feedback error={query.error} text={text} />
        {query.data?.total === 0 && (
          <p>{text('ไม่พบกลุ่มลูกค้า', 'No customer groups')}</p>
        )}
        <div className="customer-cards">
          {query.data?.items.map((item) => (
            <article className="customer-record" key={item.id}>
              <strong>
                {item.code} · {item.name}
              </strong>
              <Tag>{item.status}</Tag>
              <Link to={`/customers?group_id=${item.id}`}>
                {item.member_count} {text('สมาชิก', 'members')}
              </Link>
              {scope.tenant.can('customers.groups.manage') &&
                item.status === 'ACTIVE' && (
                  <Button onClick={() => setSelected(item)}>
                    {text('แก้ไขกลุ่ม', 'Edit group')}
                  </Button>
                )}
            </article>
          ))}
        </div>
        {query.data && (
          <Pager
            page={page}
            total={query.data.total}
            change={setPage}
            text={text}
          />
        )}
      </Card>
      {scope.tenant.can('customers.groups.manage') && (
        <Card>
          <h2>
            {text(
              current ? 'แก้ไขกลุ่ม' : 'เพิ่มกลุ่ม',
              current ? 'Edit group' : 'Create group',
            )}
          </h2>
          {current?.status !== 'ARCHIVED' && (
            <GroupForm
              key={current ? current.id + current.revision : 'new'}
              value={current ?? undefined}
              command={command}
              text={text}
              done={() => setSelected(null)}
            />
          )}
          <Button
            className="button-secondary"
            onClick={() => setSelected(null)}
          >
            {text('กลุ่มใหม่', 'New group')}
          </Button>
          {current?.status === 'ACTIVE' && (
            <Archive
              path={`/customers/groups/${current.id}`}
              revision={current.revision}
              command={command}
              text={text}
            />
          )}
          <Feedback error={command.error} text={text} />
        </Card>
      )}
    </>
  );
}
function GroupForm({
  value,
  command,
  text,
  done,
}: {
  value?: CustomerGroup;
  command: Command;
  text: Text;
  done: () => void;
}) {
  const [code, setCode] = useState(value?.code ?? ''),
    [name, setName] = useState(value?.name ?? '');
  return (
    <form
      className="customer-form"
      onSubmit={(event) => {
        event.preventDefault();
        command.mutate(
          {
            path: value ? `/customers/groups/${value.id}` : '/customers/groups',
            method: value ? 'PUT' : 'POST',
            body: {
              code,
              name,
              ...(value ? { revision: value.revision } : {}),
            },
          },
          {
            onSuccess: () => {
              setCode('');
              setName('');
              done();
            },
          },
        );
      }}
    >
      <Field label={text('รหัสกลุ่ม', 'Group code')}>
        <input
          required
          maxLength={40}
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
      </Field>
      <Field label={text('ชื่อกลุ่ม', 'Group name')}>
        <input
          required
          maxLength={200}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <Button type="submit" disabled={command.isPending}>
        {text('บันทึกกลุ่ม', 'Save group')}
      </Button>
    </form>
  );
}
