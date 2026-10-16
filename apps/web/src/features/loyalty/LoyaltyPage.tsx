import { useLanguage } from '../../app/language';
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
  title: 'loyalty.loyaltyRewards',
  history: 'customers.pointsHistory',
  program: 'loyalty.loyaltyProgram',
  name: 'loyalty.programName',
  spend: 'loyalty.netSpendPerEarningUnit',
  rate: 'loyalty.pointsPerUnit',
  value: 'loyalty.redemptionValuePerPoint',
  active: 'customers.active2',
  suspended: 'loyalty.suspended',
  save: 'customers.save',
  edit: 'catalog.edit',
  enroll: 'loyalty.enroll',
  customer: 'customers.customer2',
  choose: 'loyalty.chooseCustomer',
  search: 'loyalty.searchCodeOrName',
  balance: 'loyalty.pointsBalance',
  available: 'loyalty.availablePoints',
  reason: 'loyalty.reasonRequired',
  adjust: 'loyalty.adjustPoints',
  points: 'loyalty.integerPoints2',
  empty: 'loyalty.noEntries',
  retry: 'customers.retry',
  success: 'customers.saved',
  policy: 'loyalty.rewardsAreDiscountsNotPaymentsNoPromotion',
  debt: 'loyalty.spentEarningsReversedByReturnsBecomeDebt',
  previous: 'catalog.previous',
  next: 'catalog.next',
  details: 'loyalty.ruleSnapshot',
  loading: 'loyalty.loading',
  suspend: 'loyalty.suspendAccount',
  activate: 'loyalty.activateAccount',
} as const;
const entryLabels = {
  ADJUST: 'loyalty.adjustPoints',
  EARN: 'loyalty.pointsEarnedFromPurchases',
  REDEEM: 'loyalty.pointsRedeemedAsDiscount',
  EARN_REVERSAL: 'loyalty.previouslyEarnedPointsReversed',
  REDEEM_REVERSAL: 'loyalty.redeemedPointsRestored',
} as const;
function pointsText(value: string) {
  return value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function MemberStatus({ status }: { status: string }) {
  const { t } = useLanguage();
  return (
    <Tag tone={status === 'ACTIVE' ? 'success' : 'neutral'}>
      {status === 'ACTIVE'
        ? t(copy.active)
        : status === 'SUSPENDED'
          ? t(copy.suspended)
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
  const { localize } = useLanguage();

  return error ? <p role="alert">{localize(error.message ?? '')}</p> : null;
}

export function LoyaltyPage({ history = false }: { history?: boolean }) {
  const { t, formatDateTime } = useLanguage();

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
          <p className="eyebrow">{t('loyalty.loyaltyRewards2')}</p>
          <h1>{history ? t(copy.history) : t(copy.title)}</h1>
          <p>
            {history
              ? t('loyalty.reviewPointsEarnedSpentAndRelatedTransactions')
              : t('loyalty.reviewMembershipLoyaltyProgramsAndAvailablePoints')}
          </p>
        </div>
      </div>
      <nav className="catalog-nav">
        <Link to="/loyalty">{t(copy.title)}</Link>
        <Link
          to={`/loyalty/history${customer ? `?customer_id=${customer}` : ''}`}
        >
          {t(copy.history)}
        </Link>
      </nav>
      <p>{t(copy.policy)}</p>
      <p>{t(copy.debt)}</p>
      {!history && (
        <>
          <Programs />
          <Enrollment customerID={customer} />
        </>
      )}
      <Feedback error={query.error} />
      {query.error && (
        <Button onClick={() => void query.refetch()}>{t(copy.retry)}</Button>
      )}
      {query.isPending && <Loading>{t(copy.loading)}</Loading>}
      {query.data?.items.length === 0 && <p>{t(copy.empty)}</p>}
      <Card>
        <h2>{history ? t(copy.history) : t('loyalty.members')}</h2>
        {history ? (
          <SupplyTable
            className="record-table"
            headers={[
              t('loyalty.dateTime'),
              t('common.type'),
              t('loyalty.pointsInOut'),
              t('loyalty.reason'),
              t('loyalty.relatedTransaction'),
            ]}
          >
            {entries.data?.items.map((entry) => (
              <tr key={entry.id}>
                <td>
                  <time dateTime={entry.created_at}>
                    {formatDateTime(entry.created_at)}
                  </time>
                </td>
                <td>
                  <strong>
                    {Object.hasOwn(entryLabels, entry.kind)
                      ? t(entryLabels[entry.kind as keyof typeof entryLabels])
                      : entry.kind}
                  </strong>
                </td>
                <td className="record-number">
                  <strong className="loyalty-points">
                    {entry.points.startsWith('-') || entry.points === '0'
                      ? ''
                      : '+'}
                    {pointsText(entry.points)} {t('loyalty.points')}
                  </strong>
                </td>
                <td>{entry.reason || '—'}</td>
                <td>
                  <div className="record-actions">
                    {entry.sale_id && (
                      <Link to={`/sales/${entry.sale_id}`}>
                        {t('loyalty.sale')}
                      </Link>
                    )}{' '}
                    {entry.return_id && (
                      <Link to={`/pos/returns?return_id=${entry.return_id}`}>
                        {t('loyalty.return')}
                      </Link>
                    )}
                  </div>
                  <details>
                    <summary>{t(copy.details)}</summary>
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
              t('loyalty.memberCodeName'),
              t('loyalty.loyaltyProgram'),
              t('loyalty.membershipStatus'),
              t('loyalty.pointsBalance'),
              t('loyalty.availablePoints'),
              t('catalog.definitions'),
            ]}
          >
            {accounts.data?.items.map((account) => (
              <Account key={account.id} account={account} />
            ))}
          </SupplyTable>
        )}
        <div className="loyalty-actions loyalty-pagination">
          <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
            {t(copy.previous)}
          </Button>
          <span>{page}</span>
          <Button
            disabled={(query.data?.items.length ?? 0) < 25}
            onClick={() => setPage(page + 1)}
          >
            {t(copy.next)}
          </Button>
        </div>
      </Card>
    </div>
  );
}
function Programs() {
  const { t } = useLanguage();

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
      <h2>{t(copy.program)}</h2>
      <Feedback error={query.error} />
      {scope.tenant.can('loyalty.manage') && (
        <form className="loyalty-form" onSubmit={submit}>
          <Field label={t(copy.name)}>
            <input
              required
              maxLength={200}
              value={form.name}
              onChange={(event) =>
                setForm({ ...form, name: event.target.value })
              }
            />
          </Field>
          <Field label={t(copy.spend)}>
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
          <Field label={t(copy.rate)}>
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
          <Field label={t(copy.value)}>
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
          <Field label={t('auth.status')}>
            <select
              value={form.status}
              onChange={(event) =>
                setForm({ ...form, status: event.target.value })
              }
            >
              <option value="ACTIVE">{t(copy.active)}</option>
              <option value="SUSPENDED">{t(copy.suspended)}</option>
            </select>
          </Field>
          <Button type="submit" disabled={command.isPending}>
            {t(copy.save)}
          </Button>
          <Feedback error={command.error} />
          {command.isSuccess && <p role="status">{t(copy.success)}</p>}
        </form>
      )}
      <SupplyTable
        className="record-table"
        headers={[
          t('loyalty.programName'),
          t('auth.status'),
          t('loyalty.earningRate'),
          t('loyalty.valuePerPoint'),
          t('catalog.definitions'),
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
              {t('loyalty.every')} {moneyText(program.spend)}{' '}
              {t('loyalty.thbEarns')}{' '}
              {program.earn_points.toLocaleString('th-TH')}{' '}
              {t('loyalty.points')}
            </td>
            <td className="record-number">
              {moneyText(program.point_value)} {t('loyalty.thb')}
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
                  {t(copy.edit)}
                </Button>
              )}
            </td>
          </tr>
        ))}
      </SupplyTable>
    </Card>
  );
}
function Enrollment({ customerID }: { customerID: string }) {
  const { t } = useLanguage();

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
      <h2>{t(copy.enroll)}</h2>
      <form
        className="loyalty-form"
        onSubmit={(event) => {
          event.preventDefault();
          setTerm(search.trim());
        }}
      >
        <Field label={t(copy.search)}>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </Field>
        <Button type="submit">{t(copy.search)}</Button>
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
        <Field label={t(copy.customer)}>
          <select
            required
            value={selected}
            onChange={(event) => setSelected(event.target.value)}
          >
            <option value="">{t(copy.choose)}</option>
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
        <Field label={t(copy.program)}>
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
          {t(copy.enroll)}
        </Button>
        <Feedback error={command.error ?? customers.error} />
        {command.isSuccess && <p role="status">{t(copy.success)}</p>}
      </form>
    </Card>
  );
}
function Account({ account }: { account: LoyaltyAccount }) {
  const { t } = useLanguage();

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
            {t(copy.history)}
          </Link>
          <Link to={`/customers/${account.customer_id}`}>
            {t(copy.customer)}
          </Link>
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
              {account.status === 'ACTIVE' ? t(copy.suspend) : t(copy.activate)}
            </Button>
          )}
        </div>
        {scope.tenant.can('loyalty.adjust') && account.status === 'ACTIVE' && (
          <details className="loyalty-adjustment">
            <summary>{t(copy.adjust)}</summary>
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
              <Field label={t(copy.points)}>
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
              <Field label={t(copy.reason)}>
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
                {t(copy.adjust)}
              </Button>
            </form>
          </details>
        )}
        <Feedback error={command.error} />
        {command.isSuccess && <p role="status">{t(copy.success)}</p>}
      </td>
    </tr>
  );
}
