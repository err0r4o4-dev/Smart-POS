import { useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { WorkspaceLink as Link } from '../../app/WorkspaceNavigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../app/AuthProvider';
import { useOrganization } from '../../app/OrganizationProvider';
import { Button, Card, Loading, Tag } from '../../components/ui/primitives';
import { moneyText } from '../../lib/pos-api';
import { Field, SupplyTable } from '../purchasing/SupplyUI';
import {
  customerRequest,
  type Customer,
  type CustomerPage,
} from '../../lib/customers-api';
import {
  loyaltyRequest,
  type LoyaltyProgram,
  type LoyaltyAccount,
  type LoyaltyEntry,
  type LoyaltyPage as Page,
} from '../../lib/loyalty-api';
import './loyalty.css';

const copy = {
  title: 'สมาชิกและรางวัล / Loyalty & Rewards',
  history: 'ประวัติแต้ม / Points history',
  program: 'โปรแกรมสะสมแต้ม / Loyalty program',
  name: 'ชื่อโปรแกรม / Program name',
  spend: 'ยอดซื้อสุทธิต่อหน่วยแต้ม (THB) / Net spend per earning unit',
  rate: 'แต้มต่อหน่วย / Points per unit',
  value: 'มูลค่าต่อแต้ม (THB) / Redemption value per point',
  active: 'เปิดใช้งาน / Active',
  suspended: 'ระงับ / Suspended',
  save: 'บันทึก / Save',
  edit: 'แก้ไข / Edit',
  enroll: 'สมัครสมาชิก / Enroll',
  customer: 'ลูกค้า / Customer',
  choose: 'เลือกลูกค้า / Choose customer',
  search: 'ค้นหารหัสหรือชื่อ / Search code or name',
  balance: 'แต้มคงเหลือ / Points balance',
  available: 'แต้มใช้ได้ / Available points',
  reason: 'เหตุผล (จำเป็น) / Reason (required)',
  adjust: 'ปรับแต้ม / Adjust points',
  points: 'แต้มจำนวนเต็ม (+/−) / Integer points (+/−)',
  empty: 'ไม่มีรายการ / No entries',
  retry: 'ลองใหม่ / Retry',
  success: 'บันทึกสำเร็จ / Saved',
  policy:
    'แลกแต้มเป็นส่วนลด ไม่ใช่การชำระเงิน และไม่ซ้อนโปรโมชั่น / Rewards are discounts, not payments; no promotion stacking.',
  debt: 'แต้มที่ใช้ไปแล้วอาจเกิดหนี้เมื่อคืนสินค้า แต้มใหม่จะชดเชยก่อนใช้ได้ / Spent earnings reversed by returns become debt, offset by future earnings.',
  previous: 'ก่อนหน้า / Previous',
  next: 'ถัดไป / Next',
  details: 'รายละเอียดกฎ / Rule snapshot',
  loading: 'กำลังโหลด / Loading',
  suspend: 'ระงับบัญชี / Suspend account',
  activate: 'เปิดบัญชี / Activate account',
} as const;
const entryLabels: Record<string, string> = {
  ADJUST: 'ปรับแต้ม',
  EARN: 'ได้รับแต้มจากการซื้อ',
  REDEEM: 'ใช้แต้มเป็นส่วนลด',
  EARN_REVERSAL: 'หักแต้มที่เคยได้รับ',
  REDEEM_REVERSAL: 'คืนแต้มที่ใช้เป็นส่วนลด',
};
function pointsText(value: string) {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function MemberStatus({ status }: { status: string }) {
  return (
    <Tag tone={status === 'ACTIVE' ? 'success' : 'neutral'}>
      {status === 'ACTIVE'
        ? copy.active
        : status === 'SUSPENDED'
          ? copy.suspended
          : status}
    </Tag>
  );
}
function useScope() {
  const tenant = useOrganization(),
    { state } = useAuth();
  return {
    tenant,
    org: tenant.context?.organization.id ?? '',
    user: state.session?.user.id ?? '',
    csrf: state.session?.csrf_token,
    branch: tenant.branchID,
  };
}
function useRead<Item>(path: string) {
  const scope = useScope();
  return useQuery({
    queryKey: [
      'tenant',
      scope.user,
      scope.org,
      scope.branch,
      'loyalty',
      scope.tenant.context?.permissions,
      path,
    ],
    queryFn: ({ signal }) =>
      loyaltyRequest<Page<Item>>(scope.org, path, { signal }),
    enabled: !!scope.org && scope.tenant.can('loyalty.read'),
    retry: false,
  });
}
function useCommand() {
  const scope = useScope(),
    client = useQueryClient(),
    pending = useRef<{ body: string; key: string } | undefined>(undefined);
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
      const fingerprint = JSON.stringify({ path, body, method });
      if (pending.current?.body !== fingerprint)
        pending.current = { body: fingerprint, key: crypto.randomUUID() };
      return loyaltyRequest(scope.org, path, {
        method,
        body,
        csrf: scope.csrf,
        key: pending.current.key,
      });
    },
    onSuccess: async () => {
      pending.current = undefined;
      await client.invalidateQueries({
        queryKey: ['tenant', scope.user, scope.org],
      });
    },
  });
}
function Feedback({ error }: { error: Error | null }) {
  return error ? <p role="alert">{error.message}</p> : null;
}

export function LoyaltyPage({ history = false }: { history?: boolean }) {
  const [params] = useSearchParams(),
    customer = params.get('customer_id') ?? '',
    [page, setPage] = useState(1);
  const accounts = useRead<LoyaltyAccount>(
    `/loyalty/accounts?customer_id=${encodeURIComponent(customer)}&page=${page}`,
  );
  const entries = useRead<LoyaltyEntry>(
    `/loyalty/history?customer_id=${encodeURIComponent(customer)}&page=${page}`,
  );
  const query = history ? entries : accounts;
  return (
    <div className="catalog-page loyalty-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">LOYALTY & REWARDS</p>
          <h1>{history ? copy.history : copy.title}</h1>
          <p>
            {history
              ? 'ตรวจสอบแต้มเข้า แต้มออก และรายการที่เกี่ยวข้อง'
              : 'ตรวจสอบสถานะสมาชิก โปรแกรมสะสมแต้ม และแต้มที่ใช้ได้'}
          </p>
        </div>
      </div>
      <nav className="catalog-nav">
        <Link to="/loyalty">{copy.title}</Link>
        <Link
          to={`/loyalty/history${customer ? `?customer_id=${customer}` : ''}`}
        >
          {copy.history}
        </Link>
      </nav>
      <p>{copy.policy}</p>
      <p>{copy.debt}</p>
      {!history && (
        <>
          <Programs />
          <Enrollment customerID={customer} />
        </>
      )}
      <Feedback error={query.error} />
      {query.error && (
        <Button onClick={() => void query.refetch()}>{copy.retry}</Button>
      )}
      {query.isPending && <Loading>{copy.loading}</Loading>}
      {query.data?.items.length === 0 && <p>{copy.empty}</p>}
      <Card>
        <h2>{history ? copy.history : 'รายชื่อสมาชิก'}</h2>
        {history ? (
          <SupplyTable
            className="record-table"
            headers={[
              'วัน / เวลา',
              'ประเภท',
              'แต้มเข้า / ออก',
              'เหตุผล',
              'รายการที่เกี่ยวข้อง',
            ]}
          >
            {entries.data?.items.map((entry) => (
              <tr key={entry.id}>
                <td>
                  <time dateTime={entry.created_at}>
                    {new Date(entry.created_at).toLocaleString('th-TH', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </time>
                </td>
                <td>
                  <strong>{entryLabels[entry.kind] ?? entry.kind}</strong>
                </td>
                <td className="record-number">
                  <strong className="loyalty-points">
                    {entry.points.startsWith('-') || entry.points === '0'
                      ? ''
                      : '+'}
                    {pointsText(entry.points)} แต้ม
                  </strong>
                </td>
                <td>{entry.reason || '—'}</td>
                <td>
                  <div className="record-actions">
                    {entry.sale_id && (
                      <Link to={`/sales/${entry.sale_id}`}>
                        ดูรายการขาย / Sale
                      </Link>
                    )}{' '}
                    {entry.return_id && (
                      <Link to={`/pos/returns?return_id=${entry.return_id}`}>
                        ดูรายการคืนสินค้า / Return
                      </Link>
                    )}
                  </div>
                  <details>
                    <summary>{copy.details}</summary>
                    <pre className="loyalty-snapshot">
                      {JSON.stringify(entry.snapshot, null, 2)}
                    </pre>
                  </details>
                </td>
              </tr>
            ))}
          </SupplyTable>
        ) : (
          <SupplyTable
            className="record-table"
            headers={[
              'รหัส / ชื่อสมาชิก',
              'โปรแกรมสะสมแต้ม',
              'สถานะสมาชิก',
              'แต้มคงเหลือ',
              'แต้มใช้ได้',
              'รายการ',
            ]}
          >
            {accounts.data?.items.map((account) => (
              <Account key={account.id} account={account} />
            ))}
          </SupplyTable>
        )}
        <div className="loyalty-actions loyalty-pagination">
          <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
            {copy.previous}
          </Button>
          <span>{page}</span>
          <Button
            disabled={(query.data?.items.length ?? 0) < 25}
            onClick={() => setPage(page + 1)}
          >
            {copy.next}
          </Button>
        </div>
      </Card>
    </div>
  );
}
function Programs() {
  const scope = useScope(),
    query = useRead<LoyaltyProgram>('/loyalty/programs'),
    command = useCommand();
  const [editing, setEditing] = useState<LoyaltyProgram>();
  const [form, setForm] = useState({
    name: '',
    spend: '100.00',
    earn_points: 1,
    point_value: '1.00',
    status: 'ACTIVE',
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    command.mutate(
      {
        path: `/loyalty/programs${editing ? `/${editing.id}` : ''}`,
        method: editing ? 'PUT' : 'POST',
        body: { ...form, ...(editing ? { revision: editing.revision } : {}) },
      },
      { onSuccess: () => setEditing(undefined) },
    );
  };
  return (
    <Card>
      <h2>{copy.program}</h2>
      <Feedback error={query.error} />
      <SupplyTable
        className="record-table"
        headers={[
          'ชื่อโปรแกรม',
          'สถานะ',
          'อัตราสะสมแต้ม',
          'มูลค่าต่อแต้ม',
          'รายการ',
        ]}
      >
        {query.data?.items.map((program) => (
          <tr className="loyalty-program" key={program.id}>
            <td>
              <strong>{program.name}</strong>
            </td>
            <td>
              <MemberStatus status={program.status} />
            </td>
            <td>
              ยอดซื้อทุก {moneyText(program.spend)} บาท ได้{' '}
              {program.earn_points.toLocaleString('th-TH')} แต้ม
            </td>
            <td className="record-number">
              {moneyText(program.point_value)} บาท
            </td>
            <td>
              {scope.tenant.can('loyalty.manage') && (
                <Button
                  onClick={() => {
                    setEditing(program);
                    setForm({
                      name: program.name,
                      spend: program.spend,
                      earn_points: program.earn_points,
                      point_value: program.point_value,
                      status: program.status,
                    });
                  }}
                >
                  {copy.edit}
                </Button>
              )}
            </td>
          </tr>
        ))}
      </SupplyTable>
      {scope.tenant.can('loyalty.manage') && (
        <form className="loyalty-form" onSubmit={submit}>
          <Field label={copy.name}>
            <input
              required
              maxLength={200}
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
            />
          </Field>
          <Field label={copy.spend}>
            <input
              required
              inputMode="decimal"
              pattern="[0-9]+(\.[0-9]{1,2})?"
              value={form.spend}
              onChange={(event) =>
                setForm({ ...form, spend: event.target.value })
              }
            />
          </Field>
          <Field label={copy.rate}>
            <input
              required
              type="number"
              min={0}
              max={1000000}
              step={1}
              value={form.earn_points}
              onChange={(event) =>
                setForm({ ...form, earn_points: Number(event.target.value) })
              }
            />
          </Field>
          <Field label={copy.value}>
            <input
              required
              inputMode="decimal"
              pattern="[0-9]+(\.[0-9]{1,2})?"
              value={form.point_value}
              onChange={(event) =>
                setForm({ ...form, point_value: event.target.value })
              }
            />
          </Field>
          <Field label="Status">
            <select
              value={form.status}
              onChange={(event) =>
                setForm({ ...form, status: event.target.value })
              }
            >
              <option value="ACTIVE">{copy.active}</option>
              <option value="SUSPENDED">{copy.suspended}</option>
            </select>
          </Field>
          <Button type="submit" disabled={command.isPending}>
            {copy.save}
          </Button>
          <Feedback error={command.error} />
          {command.isSuccess && <p role="status">{copy.success}</p>}
        </form>
      )}
    </Card>
  );
}
function Enrollment({ customerID }: { customerID: string }) {
  const scope = useScope(),
    programs = useRead<LoyaltyProgram>('/loyalty/programs'),
    command = useCommand();
  const [search, setSearch] = useState(''),
    [term, setTerm] = useState(''),
    [selected, setSelected] = useState(customerID),
    [program, setProgram] = useState('');
  const customers = useQuery({
    queryKey: [
      'tenant',
      scope.user,
      scope.org,
      scope.branch,
      'loyalty-customers',
      term,
    ],
    queryFn: ({ signal }) =>
      customerRequest<CustomerPage<Customer>>(scope.org, '/customers/search', {
        method: 'POST',
        body: { search: term, status: 'ACTIVE', page: 1, page_size: 25 },
        csrf: scope.csrf,
        signal,
      }),
    enabled:
      !!scope.org &&
      scope.tenant.can('loyalty.enroll') &&
      scope.tenant.can('customers.read'),
    retry: false,
  });
  if (!scope.tenant.can('loyalty.enroll')) return null;
  return (
    <Card>
      <h2>{copy.enroll}</h2>
      <form
        className="loyalty-form"
        onSubmit={(event) => {
          event.preventDefault();
          setTerm(search.trim());
        }}
      >
        <Field label={copy.search}>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </Field>
        <Button type="submit">{copy.search}</Button>
      </form>
      <form
        className="loyalty-form"
        onSubmit={(event) => {
          event.preventDefault();
          command.mutate({
            path: '/loyalty/accounts',
            body: {
              customer_id: selected,
              program_id: program,
              status: 'ACTIVE',
            },
          });
        }}
      >
        <Field label={copy.customer}>
          <select
            required
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          >
            <option value="">{copy.choose}</option>
            {customerID &&
              !customers.data?.items.some((item) => item.id === customerID) && (
                <option value={customerID}>{customerID}</option>
              )}
            {customers.data?.items.map((item) => (
              <option value={item.id} key={item.id}>
                {item.code} · {item.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={copy.program}>
          <select
            required
            value={program}
            onChange={(event) => setProgram(event.target.value)}
          >
            <option value="">—</option>
            {programs.data?.items
              .filter((item) => item.status === 'ACTIVE')
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </Field>
        <Button type="submit" disabled={command.isPending}>
          {copy.enroll}
        </Button>
        <Feedback error={command.error ?? customers.error} />
        {command.isSuccess && <p role="status">{copy.success}</p>}
      </form>
    </Card>
  );
}
function Account({ account }: { account: LoyaltyAccount }) {
  const scope = useScope(),
    command = useCommand(),
    [points, setPoints] = useState(''),
    [reason, setReason] = useState('');
  return (
    <tr className="loyalty-account">
      <td>
        <strong>
          {account.customer_code} · {account.customer_name}
        </strong>
      </td>
      <td>
        {account.program_name}
        <span className="record-secondary">
          <MemberStatus status={account.program_status} />
        </span>
      </td>
      <td>
        <MemberStatus status={account.status} />
      </td>
      <td className="record-number loyalty-balance">
        {pointsText(account.balance)}
      </td>
      <td className="record-number loyalty-available">
        {pointsText(account.available)}
      </td>
      <td>
        <div className="loyalty-actions loyalty-account-actions">
          <Link to={`/loyalty/history?customer_id=${account.customer_id}`}>
            {copy.history}
          </Link>
          <Link to={`/customers/${account.customer_id}`}>{copy.customer}</Link>
          {scope.tenant.can('loyalty.manage') && (
            <Button
              disabled={command.isPending}
              onClick={() =>
                command.mutate({
                  path: `/loyalty/accounts/${account.id}`,
                  method: 'PUT',
                  body: {
                    customer_id: account.customer_id,
                    program_id: account.program_id,
                    status:
                      account.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE',
                    revision: account.revision,
                  },
                })
              }
            >
              {account.status === 'ACTIVE' ? copy.suspend : copy.activate}
            </Button>
          )}
        </div>
        {scope.tenant.can('loyalty.adjust') && account.status === 'ACTIVE' && (
          <details className="loyalty-adjustment">
            <summary>{copy.adjust}</summary>
            <form
              className="loyalty-form"
              onSubmit={(event) => {
                event.preventDefault();
                command.mutate({
                  path: `/loyalty/accounts/${account.id}/adjust`,
                  body: {
                    points: Number(points),
                    reason,
                    branch_id: scope.branch,
                  },
                });
              }}
            >
              <Field label={copy.points}>
                <input
                  required
                  type="number"
                  min={-1000000000000}
                  max={1000000000000}
                  step={1}
                  value={points}
                  onChange={(event) => setPoints(event.target.value)}
                />
              </Field>
              <Field label={copy.reason}>
                <input
                  required
                  maxLength={2000}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </Field>
              <Button
                type="submit"
                disabled={command.isPending || !scope.branch}
              >
                {copy.adjust}
              </Button>
            </form>
          </details>
        )}
        <Feedback error={command.error} />
        {command.isSuccess && <p role="status">{copy.success}</p>}
      </td>
    </tr>
  );
}
