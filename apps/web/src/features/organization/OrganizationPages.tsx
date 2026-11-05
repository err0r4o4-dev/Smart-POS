import { useLanguage } from '../../app/language';
import { useRef, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { Building2, GitBranch, Store } from 'lucide-react';
import { WorkspaceLink as Link } from '../../app/WorkspaceNavigation';
import { useWorkspaceNavigate as useNavigate } from '../../app/useWorkspaceNavigate';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../app/AuthProvider';
import { useOrganization } from '../../app/OrganizationProvider';
import { Button, Card, Loading, Tag } from '../../components/ui/primitives';
import { StandardPageHeader } from '../../components/ui/StandardPage';
import {
  organizationRequest,
  type OrganizationInput,
  type OrganizationContext,
  type BranchInput,
  type Branch,
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
function ErrorMessage({ message }: { message: string }) {
  const { localize } = useLanguage();

  return message ? (
    <p className="tenant-error" role="alert">
      {localize(message ?? '')}
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
  const { t } = useLanguage();

  return (
    <div className="tenant-form-grid">
      <Field
        label={t('organization.organizationName')}
        value={value.name}
        required
        onChange={(name) => change({ ...value, name })}
      />
      <Field
        label={t('organization.organizationCode')}
        value={value.code}
        maxLength={50}
        required
        onChange={(code) => change({ ...value, code })}
      />
      <Field
        label={t('organization.businessType')}
        value={value.business_type}
        maxLength={80}
        required
        onChange={(business_type) => change({ ...value, business_type })}
      />
      <Field
        label={t('organization.contactEmail')}
        value={value.contact_email}
        type="email"
        maxLength={254}
        onChange={(contact_email) => change({ ...value, contact_email })}
      />
      <Field
        label={t('organization.contactPhone')}
        value={value.contact_phone}
        maxLength={30}
        onChange={(contact_phone) => change({ ...value, contact_phone })}
      />
      <Field
        label={t('organization.organizationAddress')}
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
  const { t } = useLanguage();

  return (
    <div className="tenant-form-grid">
      <Field
        label={t('organization.branchName')}
        value={value.name}
        required
        onChange={(name) => change({ ...value, name })}
      />
      <Field
        label={t('organization.branchCode')}
        value={value.code}
        maxLength={50}
        required
        onChange={(code) => change({ ...value, code })}
      />
      <Field
        label={t('organization.branchAddress')}
        value={value.address}
        maxLength={1000}
        onChange={(address) => change({ ...value, address })}
      />
      <Field
        label={t('organization.branchPhone')}
        value={value.phone}
        maxLength={30}
        onChange={(phone) => change({ ...value, phone })}
      />
      <Field
        label={t('organization.branchEmail')}
        value={value.email}
        type="email"
        maxLength={254}
        onChange={(email) => change({ ...value, email })}
      />
      {owner && (
        <label className="tenant-field">
          {t('organization.branchStatus')}
          <select
            aria-label={t('organization.branchStatus')}
            value={value.status}
            onChange={(event) =>
              change({ ...value, status: event.target.value })
            }
          >
            <option value="ACTIVE">{t('organization.active4')}</option>
            <option value="INACTIVE">{t('organization.inactive4')}</option>
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
  const { t, localize } = useLanguage();

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
  if (state.status === 'loading')
    return <Loading>{t('organization.checkingAccount')}</Loading>;
  if (state.status !== 'authenticated')
    return (
      <Card className="tenant-page">
        <h1>{t('organization.setUpStore')}</h1>
        <p>{t('organization.signInWithTheRecipientSEmail')}</p>
        <Link className="button" to="/login?returnTo=%2Fsetup">
          {t('auth.signIn')}
        </Link>
        <Link className="button button-secondary" to="/register">
          {t('organization.registerAccount')}
        </Link>
      </Card>
    );
  if (tenant.loading)
    return <Loading>{t('organization.checkingStoreModeAndAccess')}</Loading>;
  if (tenant.error)
    return (
      <div className="tenant-page">
        <ErrorMessage message={localize(tenant.error ?? '')} />
        <Button onClick={() => void tenant.refresh()}>
          {t('organization.refreshPermissions')}
        </Button>
      </div>
    );
  if (
    (tenant.context && tenant.context.membership.role !== 'OWNER') ||
    (!tenant.context && tenant.storeMode !== 'multi')
  )
    return <Navigate to="/account" replace />;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (tenant.storeMode !== 'multi') {
      setError(t('organization.singleStoreModeDoesNotAllowAdditional'));
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
        failure instanceof Error
          ? failure.message
          : t('organization.unableToCreateOrganization'),
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="tenant-page">
      <StandardPageHeader
        icon={<Building2 size={24} />}
        eyebrow={t('organization.storeOnboarding')}
        title={t('organization.setUpStore')}
        description={
          tenant.storeMode === 'single'
            ? t('organization.singleStoreModeUsesMembershipsOfThe')
            : t('organization.createOrganizationOwnerMembershipAndMainBranch')
        }
      />
      {tenant.organizations.length > 0 && (
        <Card>
          <h2>
            {tenant.storeMode === 'single'
              ? t('organization.yourStore')
              : t('organization.yourOrganization')}
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
      {tenant.storeMode === 'single' && (
        <ErrorMessage message={localize(error ?? '')} />
      )}
      {tenant.storeMode === 'multi' && (
        <Card>
          <p className="tenant-step" role="status">
            {t('organization.step')} {step + 1} / 3 ·{' '}
            {
              [
                t('organization.businessInformation'),
                t('organization.mainBranch'),
                t('organization.reviewDetails'),
              ][step]
            }
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
                  <dt>{t('organization.organization')}</dt>
                  <dd>
                    {organization.name} ({organization.code})
                  </dd>
                  <dt>{t('organization.businessTypeContact')}</dt>
                  <dd>
                    {organization.business_type} ·{' '}
                    {organization.contact_email || t('catalog.notProvided')} ·{' '}
                    {organization.contact_phone || t('catalog.notProvided')}
                  </dd>
                  <dt>{t('organization.mainBranch')}</dt>
                  <dd>
                    {branch.name} ({branch.code}) ·{' '}
                    {branch.address || t('organization.noAddressProvided')}
                  </dd>
                  <dt>{t('organization.owner')}</dt>
                  <dd>
                    {state.session.user.display_name} ·{' '}
                    {state.session.user.email}
                  </dd>
                </dl>
              )}
              <ErrorMessage message={localize(error ?? '')} />
              <div className="tenant-actions">
                {step > 0 && (
                  <Button
                    className="button-secondary"
                    onClick={() => setStep(step - 1)}
                  >
                    {t('organization.back')}
                  </Button>
                )}
                <Button type="submit">
                  {pending
                    ? t('catalog.saving')
                    : step === 2
                      ? t('organization.createStore')
                      : t('catalog.next')}
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
  const { t, localize } = useLanguage();

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
      setMessage(t('organization.organizationSaved'));
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : t('organization.unableToSave'),
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="tenant-page">
      <StandardPageHeader
        icon={<Store size={24} />}
        eyebrow={t('organization.organization2')}
        title={t('organization.organizationDetails')}
        description={`${tenant.context?.membership.role} · THB · Asia/Bangkok`}
      />
      <Card>
        <form onSubmit={(event) => void submit(event)}>
          <fieldset disabled={pending || !tenant.can('organization.update')}>
            <OrganizationFields value={value} change={setValue} />
            {tenant.can('organization.update') && (
              <Button type="submit">
                {pending
                  ? t('catalog.saving')
                  : t('organization.saveOrganization')}
              </Button>
            )}
          </fieldset>
        </form>
        {!tenant.can('organization.update') && (
          <p>{t('organization.dataFollowsCurrentPermissionsOnlyTheOwner')}</p>
        )}
        <p role="status">{localize(message)}</p>
        <ErrorMessage message={localize(error ?? '')} />
      </Card>
    </div>
  );
}
export function BranchesPage() {
  const { t, localize, labelCode } = useLanguage();

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
      setError(
        failure instanceof Error
          ? failure.message
          : t('organization.unableToSave'),
      );
    } finally {
      setPending(false);
    }
  };
  return (
    <div className="tenant-page">
      <StandardPageHeader
        icon={<GitBranch size={24} />}
        eyebrow={t('organization.branch')}
        title={t('organization.branch')}
        description={t('organization.onlyBranchesAllowedByYourOrganizationAnd')}
      />
      <Card>
        <div className="tenant-actions">
          <Field
            label={t('organization.findBranch')}
            value={search}
            onChange={setSearch}
          />
          {tenant.can('branch.create') && (
            <Button
              onClick={() => {
                setValue(blankBranch);
                setEditing('');
                setError('');
              }}
            >
              {t('organization.addBranch')}
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
                    {item.code} ·{' '}
                    {item.address || t('organization.noAddressProvided')}
                  </p>
                  <Tag tone={item.status === 'ACTIVE' ? 'success' : 'neutral'}>
                    {labelCode(item.status)}
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
                    {t('catalog.edit')} {item.name}
                  </Button>
                )}
              </article>
            ))}
        </div>
        {query.data?.length === 0 && (
          <p>{t('organization.noAccessibleBranchesYet')}</p>
        )}
      </Card>
      {editing !== null && (
        <Card>
          <h2>
            {editing
              ? t('organization.editBranch')
              : t('organization.createBranch')}
          </h2>
          <form onSubmit={(event) => void submit(event)}>
            <fieldset disabled={pending}>
              <BranchFields
                value={value}
                change={setValue}
                owner={tenant.can('branch.deactivate')}
              />
              <ErrorMessage message={localize(error ?? '')} />
              <div className="tenant-actions">
                <Button type="submit">{t('organization.saveBranch')}</Button>
                <Button
                  className="button-secondary"
                  onClick={() => setEditing(null)}
                >
                  {t('customers.cancel')}
                </Button>
              </div>
            </fieldset>
          </form>
        </Card>
      )}
    </div>
  );
}
