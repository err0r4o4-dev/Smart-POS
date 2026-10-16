import { useLanguage } from '../../app/language';
import { useRef, useState, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { WorkspaceLink as Link } from '../../app/WorkspaceNavigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../app/AuthProvider';
import { useOrganization } from '../../app/OrganizationProvider';
import { Button, Card, Loading, Tag } from '../../components/ui/primitives';
import { Field, SupplyTable } from '../purchasing/SupplyUI';
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
function Feedback({ error }: { error: unknown }) {
  const { t, localize } = useLanguage();

  return error ? (
    <p role="alert" className="error-state">
      {t('customers.requestFailedCheckPermissionsDuplicateIdentifiersOr')}{' '}
      {localize((error instanceof Error ? error.message : '') ?? '')}
    </p>
  ) : null;
}
function Pager({
  page,
  total,
  size = 25,
  change,
}: {
  page: number;
  total: number;
  size?: number;
  change: (page: number) => void;
}) {
  const { t } = useLanguage();

  return (
    <div className="customer-pagination">
      <Button disabled={page === 1} onClick={() => change(page - 1)}>
        {t('catalog.previous')}
      </Button>
      <span>
        {t('catalog.page')} {page} / {Math.max(1, Math.ceil(total / size))} ·{' '}
        {total} {t('catalog.definitions')}
      </span>
      <Button disabled={page * size >= total} onClick={() => change(page + 1)}>
        {t('catalog.next')}
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
  const { t } = useLanguage();
  return (
    <div className="catalog-page customer-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t('customers.customerRelationships')}</p>
          <h1>
            {view === 'groups'
              ? t('customers.customerGroups')
              : view === 'detail'
                ? t('customers.customerDetails')
                : t('customers.customer')}
          </h1>
          <p>
            {t(
              'customers.sharedWithinAuthorizedOrganizationBranchesNotAuthentication',
            )}
          </p>
        </div>
      </div>
      <nav className="catalog-nav">
        <Link to="/customers">{t('customers.customer')}</Link>
        <Link to="/customers/groups">{t('customers.customerGroups')}</Link>
        <Link to="/pos">{t('customers.openPos')}</Link>
      </nav>
      {view === 'list' ? (
        <CustomerList />
      ) : view === 'groups' ? (
        <Groups />
      ) : (
        <CustomerDetail />
      )}
    </div>
  );
}
function CustomerList() {
  const { t, labelCode } = useLanguage();

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
          <Field label={t('customers.searchCodeNamePhoneEmail')}>
            <input
              value={search}
              maxLength={200}
              onChange={(event) => setSearch(event.target.value)}
            />
          </Field>
          <Button type="submit">{t('customers.search')}</Button>
          <Field label={t('auth.status')}>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="ACTIVE">{t('customers.active')}</option>
              <option value="ARCHIVED">{t('customers.archived')}</option>
              <option value="">{t('common.all')}</option>
            </select>
          </Field>
          <Field label={t('customers.group')}>
            <select
              value={group}
              onChange={(event) => {
                setGroup(event.target.value);
                setPage(1);
              }}
            >
              <option value="">{t('customers.allGroups')}</option>
              {groups.data?.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} ({labelCode(item.status)})
                </option>
              ))}
            </select>
          </Field>
          {scope.tenant.can('customers.manage') && (
            <Button onClick={() => setCreating(!creating)}>
              {t('customers.createCustomer')}
            </Button>
          )}
        </form>
        {query.isPending && (
          <Loading>{t('customers.loadingCustomers')}</Loading>
        )}
        <Feedback error={query.error} />
        {query.isError && (
          <Button onClick={() => void query.refetch()}>
            {t('customers.retry')}
          </Button>
        )}
        {query.data?.total === 0 && (
          <p>{t('customers.noCustomersChangeFiltersOrCreateA')}</p>
        )}
        <SupplyTable
          className="record-table"
          headers={[
            t('customers.codeCustomerName'),
            t('auth.status'),
            t('customers.phone'),
            t('auth.email'),
            t('customers.customerGroups'),
          ]}
        >
          {query.data?.items.map((item) => (
            <tr key={item.id}>
              <td>
                <Link to={`/customers/${item.id}`}>
                  <strong>{item.name || t('customers.unnamed')}</strong>
                  <span className="record-secondary">{item.code}</span>
                </Link>
              </td>
              <td>
                <Tag tone={item.status === 'ACTIVE' ? 'success' : 'neutral'}>
                  {item.status === 'ACTIVE'
                    ? t('customers.active3')
                    : item.status === 'ARCHIVED'
                      ? t('customers.archived')
                      : item.status}
                </Tag>
              </td>
              <td>{item.phone || t('catalog.notProvided')}</td>
              <td>{item.email || t('catalog.notProvided')}</td>
              <td>
                {item.groups.map((entry) => entry.name).join(', ') ||
                  t('customers.noGroups')}
              </td>
            </tr>
          ))}
        </SupplyTable>
        {query.data && (
          <Pager page={page} total={query.data.total} change={setPage} />
        )}
      </Card>
      {creating && scope.tenant.can('customers.manage') && (
        <Card>
          <h2>{t('customers.createCustomer')}</h2>
          <CustomerForm command={command} onSaved={() => setCreating(false)} />
        </Card>
      )}
    </>
  );
}
function CustomerForm({
  value,
  command,
  onSaved,
}: {
  value?: Customer;
  command: Command;
  onSaved?: () => void;
}) {
  const { t } = useLanguage();

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
      <p>{t('customers.collectOnlyNecessaryInformationContactDetailsAre')}</p>
      {(['code', 'name', 'phone', 'email'] as const).map((field) => (
        <Field
          key={field}
          label={
            {
              code: t('customers.customerCode'),
              name: t('common.name'),
              phone: t('customers.phone'),
              email: t('auth.email'),
            }[field]
          }
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
      <Field label={t('customers.notesNoSensitiveInformation')}>
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
        {t('customers.customerExplicitlyConsentsToMarketing')}
      </label>
      <Button type="submit" disabled={command.isPending}>
        {t('customers.save')}
      </Button>
      <Feedback error={command.error} />
      {saved && <p role="status">{t('catalog.saved')}</p>}
    </form>
  );
}
function Archive({
  path,
  revision,
  command,
}: {
  path: string;
  revision: number;
  command: Command;
}) {
  const { t } = useLanguage();

  const [confirm, setConfirm] = useState(false);
  return confirm ? (
    <div className="customer-archive">
      <p>{t('customers.archiveWithoutDeletingTransactionsThisScreenCannot')}</p>
      <Button
        disabled={command.isPending}
        onClick={() =>
          command.mutate(
            { path: path + '/archive', body: { revision } },
            { onSuccess: () => setConfirm(false) },
          )
        }
      >
        {t('customers.confirmArchive')}
      </Button>
      <Button onClick={() => setConfirm(false)}>{t('customers.cancel')}</Button>
    </div>
  ) : (
    <Button className="button-secondary" onClick={() => setConfirm(true)}>
      {t('customers.archived')}
    </Button>
  );
}
function CustomerDetail() {
  const { t, formatDateTime, labelCode } = useLanguage();

  const { id = '' } = useParams(),
    scope = useScope(),
    query = useCustomerQuery<Customer>(`/customers/${id}`),
    command = useCommand();
  if (query.isPending)
    return <Loading>{t('customers.loadingCustomer')}</Loading>;
  if (!query.data)
    return (
      <>
        <Feedback error={query.error} />
        <Button onClick={() => void query.refetch()}>
          {t('customers.retry')}
        </Button>
      </>
    );
  const value = query.data;
  return (
    <>
      {scope.tenant.can('loyalty.read') && (
        <nav className="catalog-nav">
          <Link to={`/loyalty?customer_id=${value.id}`}>
            {t('customers.loyalty')}
          </Link>
          <Link to={`/loyalty/history?customer_id=${value.id}`}>
            {t('customers.pointsHistory')}
          </Link>
        </nav>
      )}
      <Card>
        <h2>
          {value.code} · {value.name || t('customers.unnamed')}
        </h2>
        <Tag>{labelCode(value.status)}</Tag>
        <p>
          {t('catalog.updated2')} {formatDateTime(value.updated_at)}{' '}
          {t('customers.revision')} {value.revision}
        </p>
        <p>{t('customers.salesRetainTheCustomerCodeRecordedAt')}</p>
        {scope.tenant.can('customers.manage') && value.status === 'ACTIVE' ? (
          <>
            <CustomerForm
              key={value.revision}
              value={value}
              command={command}
            />
            <Archive
              path={`/customers/${value.id}`}
              revision={value.revision}
              command={command}
            />
          </>
        ) : (
          <p>
            {value.phone || '—'} · {value.email || '—'}
          </p>
        )}
        <Feedback error={command.error} />
      </Card>
      <Memberships value={value} />
      {scope.tenant.can('customers.history.read') ? (
        <>
          <History id={id} />
          <Audit id={id} />
        </>
      ) : (
        <Card>
          <p>{t('customers.customerHistoryPermissionRequired')}</p>
        </Card>
      )}
    </>
  );
}
function Memberships({ value }: { value: Customer }) {
  const { t, labelCode } = useLanguage();

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
      <h2>{t('customers.groupMemberships')}</h2>
      {value.groups.length === 0 && <p>{t('customers.noGroups')}</p>}
      {value.groups.map((group) => (
        <div className="customer-membership" key={group.id}>
          <span>
            {group.name} · {labelCode(group.status)}
          </span>
          {can && (
            <Button
              disabled={command.isPending}
              onClick={() => change(group, false)}
            >
              {t('catalog.remove')}
            </Button>
          )}
        </div>
      ))}
      {can && (
        <>
          <h3>{t('customers.chooseGroup')}</h3>
          {query.isPending && <Loading />}
          <Feedback error={query.error} />
          <div className="catalog-actions">
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
                  {t('customers.addTo')} {group.name}
                </Button>
              ))}
          </div>
          {query.data && (
            <Pager page={page} total={query.data.total} change={setPage} />
          )}
        </>
      )}
      <Feedback error={command.error} />
    </Card>
  );
}
function History({ id }: { id: string }) {
  const { t, formatDateTime, labelCode } = useLanguage();

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
      <h2>{t('customers.transactionHistory')}</h2>
      <p>{t('customers.authorizedBranchesOnlyCollectedFundsUseSale')}</p>
      <div className="customer-filters">
        <Field label={t('customers.from')}>
          <input
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setPage(1);
            }}
          />
        </Field>
        <Field label={t('customers.to')}>
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
      <Feedback error={query.error} />
      {query.data && (
        <>
          <div className="customer-summary">
            <p>
              {t('customers.collected')}
              <strong>{moneyText(query.data.summary.paid)}</strong>
            </p>
            <p>
              {t('customers.confirmedRefunds')}
              <strong>{moneyText(query.data.summary.refunded)}</strong>
            </p>
            <p>
              {t('customers.pendingRefunds')}
              <strong>{moneyText(query.data.summary.pending_refund)}</strong>
            </p>
            <p>
              {t('customers.netCollected')}
              <strong>{moneyText(query.data.summary.net_collected)}</strong>
            </p>
          </div>
          {query.data.total === 0 && <p>{t('customers.noTransactionsYet')}</p>}
          <div className="customer-cards">
            {query.data.items.map((item) => (
              <article className="customer-record" key={item.kind + item.id}>
                <strong>
                  {item.kind} · {item.number}
                </strong>
                <Tag>{labelCode(item.status)}</Tag>
                <p>
                  {formatDateTime(item.occurred_at)} · {item.branch_name}
                </p>
                <p>
                  {t('customers.documentAmount')} {moneyText(item.amount)} ·{' '}
                  {t('customers.collected2')} {moneyText(item.paid)} ·{' '}
                  {t('customers.refunded')} {moneyText(item.refunded)}
                </p>
                <Link to={`/sales/${item.sale_id}`}>
                  {t('customers.sourceSaleDetails')}
                </Link>
              </article>
            ))}
          </div>
          <Pager page={page} total={query.data.total} change={setPage} />
        </>
      )}
    </Card>
  );
}
function Audit({ id }: { id: string }) {
  const { t, formatDateTime } = useLanguage();

  const [page, setPage] = useState(1),
    query = useCustomerQuery<
      CustomerPage<{ id: number; event_type: string; created_at: string }>
    >(`/customers/${id}/audit?page=${page}`);
  return (
    <Card>
      <h2>{t('customers.changeHistory')}</h2>
      <p>{t('customers.eventsAndActorReferencesOnlyNoContact')}</p>
      <Feedback error={query.error} />
      {query.isPending && <Loading />}
      {query.data?.items.map((item) => (
        <p key={item.id}>
          {item.event_type} · {formatDateTime(item.created_at)}
        </p>
      ))}
      {query.data && (
        <Pager page={page} total={query.data.total} change={setPage} />
      )}
    </Card>
  );
}
function Groups() {
  const { t, labelCode } = useLanguage();

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
        <Field label={t('customers.groupStatus')}>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
              setSelected(null);
            }}
          >
            <option value="">{t('common.all')}</option>
            <option value="ACTIVE">{t('customers.active')}</option>
            <option value="ARCHIVED">{t('customers.archived')}</option>
          </select>
        </Field>
        {query.isPending && <Loading />}
        <Feedback error={query.error} />
        {query.data?.total === 0 && <p>{t('customers.noCustomerGroups')}</p>}
        <div className="customer-cards">
          {query.data?.items.map((item) => (
            <article className="customer-record" key={item.id}>
              <strong>
                {item.code} · {item.name}
              </strong>
              <Tag>{labelCode(item.status)}</Tag>
              <Link to={`/customers?group_id=${item.id}`}>
                {item.member_count} {t('customers.members')}
              </Link>
              {scope.tenant.can('customers.groups.manage') &&
                item.status === 'ACTIVE' && (
                  <Button onClick={() => setSelected(item)}>
                    {t('customers.editGroup')}
                  </Button>
                )}
            </article>
          ))}
        </div>
        {query.data && (
          <Pager page={page} total={query.data.total} change={setPage} />
        )}
      </Card>
      {scope.tenant.can('customers.groups.manage') && (
        <Card>
          <h2>
            {current ? t('customers.editGroup') : t('customers.createGroup')}
          </h2>
          {current?.status !== 'ARCHIVED' && (
            <GroupForm
              key={current ? current.id + current.revision : 'new'}
              value={current ?? undefined}
              command={command}
              done={() => setSelected(null)}
            />
          )}
          <div className="catalog-actions">
            <Button
              className="button-secondary"
              onClick={() => setSelected(null)}
            >
              {t('customers.newGroup')}
            </Button>
            {current?.status === 'ACTIVE' && (
              <Archive
                path={`/customers/groups/${current.id}`}
                revision={current.revision}
                command={command}
              />
            )}
          </div>
          <Feedback error={command.error} />
        </Card>
      )}
    </>
  );
}
function GroupForm({
  value,
  command,
  done,
}: {
  value?: CustomerGroup;
  command: Command;
  done: () => void;
}) {
  const { t } = useLanguage();

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
      <Field label={t('customers.groupCode')}>
        <input
          required
          maxLength={40}
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
      </Field>
      <Field label={t('customers.groupName')}>
        <input
          required
          maxLength={200}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <Button type="submit" disabled={command.isPending}>
        {t('customers.saveGroup')}
      </Button>
    </form>
  );
}
