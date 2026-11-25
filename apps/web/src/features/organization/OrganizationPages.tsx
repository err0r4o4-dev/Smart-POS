import { useLanguage } from '../../app/language';
import {
  startTransition,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import { Navigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Coins,
  CreditCard,
  GitBranch,
  House,
  Info,
  LayoutGrid,
  LoaderCircle,
  QrCode,
  Store,
  WalletCards,
} from 'lucide-react';
import { WorkspaceLink as Link } from '../../app/WorkspaceNavigation';
import { useWorkspaceNavigate as useNavigate } from '../../app/useWorkspaceNavigate';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../app/AuthProvider';
import { useOrganization } from '../../app/OrganizationProvider';
import { paths } from '../../app/routes';
import {
  Brand,
  Button,
  Card,
  Loading,
  Tag,
} from '../../components/ui/primitives';
import { LanguageSwitcher } from '../../components/ui/LanguageSwitcher';
import { AccountMenu } from '../../components/ui/AccountMenu';
import { HelpDropdown } from '../../components/ui/HelpDropdown';
import { StandardPageHeader } from '../../components/ui/StandardPage';
import './setup.css';
import { SetupAddressFields } from './SetupAddressFields';
import { SetupTablesEditor } from './SetupTablesEditor';
import {
  saveSetupSections,
  seedSavedSetupSection,
  setupScreenForStep,
  type SetupSaveCache,
} from './setup-flow';
import { SettingsPage } from './SettingsPage';
import { StorefrontSettingsPage } from './StorefrontSettingsPage';
import {
  organizationRequest,
  type BranchInput,
  type Branch,
} from '../../lib/organization-api';
import {
  completeSetup,
  createOrganization,
  getSetup,
  saveSetupStep,
  type SetupOrdersInput,
  type SetupPaymentsInput,
  type SetupProfileInput,
  type SetupServicesInput,
  type SetupReadinessItem,
  type SetupState,
  type SetupTablesInput,
  type IssuedTableQRToken,
} from './setup-api';
import { validateStoreProfile, type ProfileErrors } from './setup-validation';
import { ApiError } from '../../lib/api';
import { getMFAStatus } from '../auth/mfa-api';
import { MFARequiredState } from './MFARequiredState';
import {
  CreationRecoveryError,
  finishCreation,
  reserveCreationKey,
} from './creation-operation';
import {
  CompletionRecoveryError,
  finishCompletion,
  reserveCompletionKey,
} from './completion-operation';

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
  const { t } = useLanguage();
  const auth = useAuth();
  const tenant = useOrganization();
  const csrf = auth.state.session?.csrf_token;
  return async <Result,>(resource: string, method: string, body?: object) => {
    if (!tenant.context || !csrf)
      throw new Error(t('organization.signInAndSelectAnOrganization'));
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
type SetupFormState = {
  profile: SetupProfileInput & { organization: { description?: string } };
  tables: SetupTablesInput;
  services: SetupServicesInput;
  payments: SetupPaymentsInput;
  orders: SetupOrdersInput;
};

const createSetupForm = (): SetupFormState => ({
  profile: {
    organization: {
      name: '',
      business_type: 'RESTAURANT',
      contact_email: '',
      contact_phone: '',
      address: '',
      description: '',
    },
    service_modes: { dine_in: true, takeaway: true, delivery: false },
  },
  services: {
    service_modes: { dine_in: true, takeaway: true, delivery: false },
  },
  tables: {
    zones: [{ name: 'พื้นที่หลัก' }],
    tables: [{ name: 'โต๊ะ 1', zone: 'พื้นที่หลัก', seats: 2 }],
    qr_enabled: true,
  },
  payments: { cash: true, bank_transfer: true, promptpay: false, card: false },
  orders: {
    qr_ordering: true,
    kitchen_queue: true,
    auto_confirm: false,
    vat_percent: '0',
    service_charge_percent: '0',
  },
});

const setupMeta = [
  {
    key: 'profile',
    label: 'organization.metaStoreServices',
    sidebarSubtitle: 'organization.metaProfileSidebar',
    cardSubtitle: 'organization.metaProfileCard',
    description: 'organization.metaProfileCard',
    icon: Store,
  },
  {
    key: 'payments',
    label: 'organization.metaPayments',
    sidebarSubtitle: 'organization.metaPayments',
    cardSubtitle: 'organization.setupPaymentLead',
    description: 'organization.setupPaymentLead',
    icon: CreditCard,
  },
  {
    key: 'review',
    label: 'organization.metaReview',
    sidebarSubtitle: 'organization.metaReviewSidebar',
    cardSubtitle: 'organization.metaReviewCard',
    description: 'organization.metaReviewDescription',
    icon: CheckCircle2,
  },
] as const;

type SetupStepIndex = 0 | 1 | 2;

export function setupKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
    return crypto.randomUUID();

  const bytes = new Uint8Array(16);
  if (
    typeof crypto !== 'undefined' &&
    typeof crypto.getRandomValues === 'function'
  )
    crypto.getRandomValues(bytes);
  else {
    for (let index = 0; index < bytes.length; index += 1)
      bytes[index] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function SetupInput({
  label,
  value,
  onChange,
  required = false,
  type = 'text',
  placeholder,
  min,
  step,
  error,
  id,
  onBlur,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
  min?: string;
  step?: string;
  error?: string;
  id?: string;
  onBlur?: () => void;
}) {
  const errorID = error && id ? `${id}-error` : undefined;
  return (
    <label className="tenant-field setup-field">
      <span className="setup-field-label">
        {label}
        {required && (
          <span className="setup-required" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </span>
      <input
        id={id}
        aria-label={label}
        aria-invalid={Boolean(error)}
        aria-describedby={errorID}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        type={type}
        placeholder={placeholder}
        min={min}
        step={step}
        onBlur={onBlur}
      />
      {error && (
        <span id={errorID} className="setup-field-error" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}

function SetupSelect({
  label,
  value,
  onChange,
  required = false,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  options: Array<{ value: string; label: string }>;
}) {
  const [open, setOpen] = useState(false);
  const matchedOption = options.find((opt) => opt.value === value);
  return (
    <div className="tenant-field setup-field">
      <label htmlFor="setup-business-type-input" className="setup-field-label">
        {label}
        {required && (
          <span className="setup-required" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      <div className="setup-select-wrapper">
        <input
          id="setup-business-type-input"
          aria-label={label}
          value={value}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          type="text"
          list="setup-business-types"
          className={`setup-select-element ${!open && matchedOption ? 'has-display-overlay' : ''}`}
        />
        {!open && matchedOption && (
          <span className="setup-select-overlay" aria-hidden="true">
            {matchedOption.label}
          </span>
        )}
        <ChevronDown
          size={18}
          className="setup-chevron-icon"
          aria-hidden="true"
        />
        <datalist id="setup-business-types">
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </datalist>
        {open && (
          <ul
            className="setup-select-dropdown"
            role="listbox"
            aria-label={label}
          >
            {options.map((opt) => (
              <li
                key={opt.value}
                role="option"
                aria-selected={opt.value === value}
              >
                <button
                  type="button"
                  className={`setup-select-option ${opt.value === value ? 'is-selected' : ''}`}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onChange(opt.value);
                    setOpen(false);
                  }}
                >
                  {opt.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function SetupToggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const descriptionID = useId();
  return (
    <label className="setup-toggle">
      <input
        type="checkbox"
        aria-label={label}
        aria-describedby={description ? descriptionID : undefined}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>
        {label}
        {description && (
          <small className="setup-toggle-description" id={descriptionID}>
            {description}
          </small>
        )}
      </span>
    </label>
  );
}

function localReadiness(
  form: SetupFormState,
  t: ReturnType<typeof useLanguage>['t'],
): SetupReadinessItem[] {
  const incomplete: SetupReadinessItem[] = [];
  const profile = form.profile;
  if (
    Object.keys(validateStoreProfile(profile.organization)).length > 0 ||
    profile.organization.business_type !== 'RESTAURANT'
  )
    incomplete.push({
      key: 'profile',
      label: t('organization.metaProfile'),
      reason: t('organization.setupProfileIncomplete'),
    });
  if (
    form.services.service_modes.dine_in &&
    !form.tables.tables.some((table) => table.name.trim())
  )
    incomplete.push({
      key: 'tables',
      label: t('organization.metaTables'),
      reason: t('organization.setupTablesIncomplete'),
    });
  if (!form.payments.cash && !form.payments.bank_transfer)
    incomplete.push({
      key: 'payments',
      label: t('organization.metaPayments'),
      reason: t('organization.setupPaymentRequired'),
    });
  const vat = Number(form.orders.vat_percent);
  const service = Number(form.orders.service_charge_percent);
  if (
    !decimalValid(form.orders.vat_percent) ||
    vat > 100 ||
    !decimalValid(form.orders.service_charge_percent) ||
    service > 100
  )
    incomplete.push({
      key: 'orders',
      label: t('organization.metaOrders'),
      reason: t('organization.setupPercentIncomplete'),
    });
  return incomplete;
}

function decimalValid(value: string) {
  return /^\d+(?:\.\d{1,2})?$/.test(value);
}

function SetupStepFields({
  step,
  form,
  update,
  promptPayAvailable,
  pickupAvailable,
  savedTableCount,
  profileErrors,
  onValidateProfile,
}: {
  step: number;
  form: SetupFormState;
  update: <Key extends keyof SetupFormState>(
    key: Key,
    value: SetupFormState[Key],
  ) => void;
  promptPayAvailable: boolean;
  pickupAvailable: boolean;
  savedTableCount: number;
  profileErrors: ProfileErrors;
  onValidateProfile: () => void;
}) {
  const profile = form.profile;
  const { t } = useLanguage();
  if (step === 0)
    return (
      <div className="setup-form-section">
        <div className="setup-form-row">
          <SetupInput
            label={t('organization.setupStoreName')}
            value={profile.organization.name}
            placeholder={t('organization.setupStoreNameExample')}
            required
            id="setup-store-name"
            error={
              profileErrors.name
                ? t(`organization.${profileErrors.name}`)
                : undefined
            }
            onBlur={onValidateProfile}
            onChange={(name) =>
              update('profile', {
                ...profile,
                organization: { ...profile.organization, name },
              })
            }
          />
        </div>
        <div className="setup-form-grid">
          <SetupSelect
            label={t('organization.setupStoreType')}
            value={profile.organization.business_type}
            required
            options={[
              { value: 'RESTAURANT', label: t('organization.setupRestaurant') },
            ]}
            onChange={(business_type) =>
              update('profile', {
                ...profile,
                organization: { ...profile.organization, business_type },
              })
            }
          />
          <SetupInput
            label={t('organization.setupStorePhone')}
            value={profile.organization.contact_phone}
            placeholder={t('organization.setupPhoneExample')}
            id="setup-store-phone"
            required
            type="tel"
            error={
              profileErrors.contact_phone
                ? t(`organization.${profileErrors.contact_phone}`)
                : undefined
            }
            onBlur={onValidateProfile}
            onChange={(contact_phone) =>
              update('profile', {
                ...profile,
                organization: { ...profile.organization, contact_phone },
              })
            }
          />
        </div>
        <SetupAddressFields
          value={profile.organization.address}
          errors={profileErrors}
          onBlur={onValidateProfile}
          onChange={(address) =>
            update('profile', {
              ...profile,
              organization: { ...profile.organization, address },
            })
          }
        />
        <div className="setup-form-row">
          <SetupInput
            label={t('organization.setupStoreDescription')}
            value={profile.organization.description ?? ''}
            placeholder={t('organization.setupDescriptionExample')}
            onChange={(description) =>
              update('profile', {
                ...profile,
                organization: { ...profile.organization, description },
              })
            }
          />
        </div>
        <div className="setup-notice-callout">
          <div className="setup-notice-icon">
            <Info size={18} aria-hidden="true" />
          </div>
          <p>{t('organization.setupProfileHint')}</p>
        </div>
      </div>
    );
  if (step === 1)
    return (
      <fieldset
        className="setup-choice-group"
        aria-describedby="setup-services-hint"
      >
        <legend>{t('organization.setupServiceModes')}</legend>
        <p id="setup-services-hint" className="setup-hint">
          {t('organization.setupServicesHint')}
        </p>
        <div className="setup-choice-grid">
          <SetupToggle
            label={t('organization.setupDineIn')}
            description={t('organization.setupDineInHint')}
            checked={form.services.service_modes.dine_in}
            onChange={(dine_in) =>
              update('services', {
                service_modes: { ...form.services.service_modes, dine_in },
              })
            }
          />
          <SetupToggle
            label={t('organization.setupTakeaway')}
            description={t('organization.setupTakeawayHint')}
            checked={form.services.service_modes.takeaway}
            onChange={(takeaway) =>
              update('services', {
                service_modes: { ...form.services.service_modes, takeaway },
              })
            }
          />
          {pickupAvailable && (
            <SetupToggle
              label={t('organization.setupPickup')}
              description={t('organization.setupPickupHint')}
              checked={form.services.service_modes.pickup ?? false}
              onChange={(pickup) =>
                update('services', {
                  service_modes: { ...form.services.service_modes, pickup },
                })
              }
            />
          )}
          <SetupToggle
            label={t('organization.setupDelivery')}
            description={t('organization.setupDeliveryHint')}
            checked={form.services.service_modes.delivery}
            onChange={(delivery) =>
              update('services', {
                service_modes: { ...form.services.service_modes, delivery },
              })
            }
          />
        </div>
      </fieldset>
    );
  if (step === 2)
    return (
      <div className="setup-form-section">
        <SetupTablesEditor
          value={form.tables}
          savedTableCount={savedTableCount}
          onChange={(tables) => update('tables', tables)}
        />
        <p className="setup-hint">
          <QrCode size={16} aria-hidden="true" />{' '}
          {t('organization.setupAddTablesHint')}
        </p>
      </div>
    );
  if (step === 3)
    return (
      <div className="setup-form-section">
        <SetupToggle
          label={t('organization.setupQrOrders')}
          checked={form.orders.qr_ordering}
          onChange={(qr_ordering) =>
            update('orders', { ...form.orders, qr_ordering })
          }
        />
        <p className="setup-section-lead">
          {t('organization.setupPaymentLead')}
        </p>
        <div className="setup-payment-grid">
          <label className="setup-payment-option">
            <input
              type="checkbox"
              checked={form.payments.cash}
              onChange={(event) =>
                update('payments', {
                  ...form.payments,
                  cash: event.target.checked,
                })
              }
            />
            <Banknote size={22} aria-hidden="true" />
            <span>
              <strong>{t('organization.setupCash')}</strong>
              <small>{t('organization.setupAvailable')}</small>
            </span>
          </label>
          <label className="setup-payment-option">
            <input
              type="checkbox"
              checked={form.payments.bank_transfer}
              onChange={(event) =>
                update('payments', {
                  ...form.payments,
                  bank_transfer: event.target.checked,
                })
              }
            />
            <WalletCards size={22} aria-hidden="true" />
            <span>
              <strong>{t('organization.setupTransfer')}</strong>
              <small>{t('organization.setupAvailable')}</small>
            </span>
          </label>
          <label
            className="setup-payment-option setup-payment-option-disabled"
            aria-disabled="true"
          >
            <input
              type="checkbox"
              checked={form.payments.promptpay}
              disabled={!promptPayAvailable}
              onChange={(event) =>
                update('payments', {
                  ...form.payments,
                  promptpay: event.target.checked,
                })
              }
            />
            <QrCode size={22} aria-hidden="true" />
            <span>
              <strong>PromptPay</strong>
              <small>{t('organization.setupPromptpayUnavailable')}</small>
            </span>
            <Tag>{t('organization.setupUnavailable')}</Tag>
          </label>
          <label
            className="setup-payment-option setup-payment-option-disabled"
            aria-disabled="true"
          >
            <input type="checkbox" checked={false} disabled />
            <CreditCard size={22} aria-hidden="true" />
            <span>
              <strong>{t('organization.setupCard')}</strong>
              <small>{t('organization.setupCardUnavailable')}</small>
            </span>
            <Tag>{t('organization.setupUnavailable')}</Tag>
          </label>
        </div>
      </div>
    );
  return null;
}

export function SetupPage() {
  const { state } = useAuth();
  const tenant = useOrganization();
  const scope = JSON.stringify([
    state.session?.user.id ?? null,
    tenant.context?.organization?.id ?? null,
    tenant.branchID || null,
    tenant.context?.membership.role ?? null,
  ]);
  return <ScopedSetupPage key={scope} />;
}

function ScopedSetupPage() {
  const { t, localize } = useLanguage();
  const { state } = useAuth();
  const tenant = useOrganization();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SetupFormState>(createSetupForm);
  const [savedTableCount, setSavedTableCount] = useState(0);
  const [step, setStep] = useState<SetupStepIndex>(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [profileErrors, setProfileErrors] = useState<ProfileErrors>({});
  const [recovery, setRecovery] = useState<
    'mfa' | 'signin' | 'creation' | null
  >(null);
  const [rotationUncertain, setRotationUncertain] = useState(false);
  const [serverState, setServerState] = useState<SetupState | null>(null);
  const [issuedTokens, setIssuedTokens] = useState<IssuedTableQRToken[]>([]);
  const [copyStatus, setCopyStatus] = useState('');
  const [createdContext, setCreatedContext] = useState<{
    organizationID: string;
    branchID: string;
  } | null>(null);
  const moveToStep = (nextStep: SetupStepIndex) => {
    setStep(nextStep);
  };
  const saveCache = useRef<SetupSaveCache>({});
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    stepHeadingRef.current?.focus();
  }, [step]);
  const activeRef = useRef(true);
  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);
  const [hydratedScope, setHydratedScope] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const orgID =
    tenant.context?.organization?.id ?? createdContext?.organizationID ?? '';
  const branchID = tenant.branchID || createdContext?.branchID || '';
  const setupContext = orgID ? { organizationID: orgID, branchID } : null;
  const setupQuery = useQuery({
    queryKey: ['restaurant-setup', state.session?.user.id, orgID, branchID],
    queryFn: ({ signal }) => getSetup(setupContext!, signal),
    enabled: Boolean(setupContext),
    retry: false,
  });

  useEffect(() => {
    const scope = `${orgID}:${branchID}`;
    if (hydratedScope && hydratedScope !== scope) {
      startTransition(() => {
        setHydratedScope('');
        setIsDirty(false);
        setForm(createSetupForm());
        setSavedTableCount(0);
        setServerState(null);
        setStep(0);
        setError('');
        setRotationUncertain(false);
      });
    }
  }, [orgID, branchID, hydratedScope]);

  useEffect(() => {
    if (!setupQuery.data) return;
    const scope = `${orgID}:${branchID}`;
    if (hydratedScope === scope) {
      if (!isDirty) startTransition(() => setServerState(setupQuery.data));
      return;
    }
    startTransition(() => setHydratedScope(scope));
    const data = setupQuery.data as SetupState & Partial<SetupFormState>;
    if (
      !isDirty &&
      data.tables &&
      data.steps.some((section) => section.key === 'tables' && section.complete)
    ) {
      seedSavedSetupSection(saveCache.current, 'tables', data.tables);
    }
    startTransition(() => {
      setServerState(setupQuery.data);
      setSavedTableCount(data.tables?.tables.length ?? 0);
      if (!isDirty)
        setForm((current) => ({
          ...current,
          ...(data.profile ? { profile: data.profile } : {}),
          ...(data.services ? { services: data.services } : {}),
          ...(data.tables ? { tables: data.tables } : {}),
          ...(data.payments ? { payments: data.payments } : {}),
          ...(data.orders ? { orders: data.orders } : {}),
        }));
      setStep(setupScreenForStep(data.current_step));
    });
  }, [setupQuery.data, orgID, branchID, hydratedScope, isDirty]);

  useEffect(() => {
    stepHeadingRef.current?.focus();
  }, [step]);

  if (state.status === 'loading')
    return (
      <main className="setup-page-wrapper">
        <Loading>{t('organization.checkingAccount')}</Loading>
      </main>
    );
  if (state.status !== 'authenticated')
    return (
      <main className="setup-page-wrapper">
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
      </main>
    );
  if (tenant.loading)
    return (
      <main className="setup-page-wrapper">
        <Loading>{t('organization.checkingStoreModeAndAccess')}</Loading>
      </main>
    );
  if (tenant.errorCode === 'MFA_REQUIRED') return <MFARequiredState />;
  if (tenant.error)
    return (
      <main className="setup-page-wrapper">
        <div className="tenant-page">
          <ErrorMessage message={localize(tenant.error)} />
          <Button onClick={() => void tenant.refresh()}>
            {t('organization.refreshPermissions')}
          </Button>
        </div>
      </main>
    );
  if (
    (tenant.context && tenant.context.membership.role !== 'OWNER') ||
    (!tenant.context && tenant.storeMode !== 'multi')
  )
    return <Navigate to="/account" replace />;
  if (setupQuery.data?.complete === true)
    return (
      <Navigate to={branchID ? paths.dashboard : paths.settings} replace />
    );

  const localIncomplete = localReadiness(form, t);
  const readinessItems = [
    ...(serverState?.readiness.incomplete ?? []),
    ...localIncomplete.filter(
      (item) =>
        !serverState?.readiness.incomplete.some(
          (serverItem) => serverItem.key === item.key,
        ),
    ),
  ];
  const isReady = Boolean(
    hydratedScope === `${orgID}:${branchID}` &&
    serverState?.readiness.ready &&
    readinessItems.length === 0 &&
    localIncomplete.length === 0 &&
    !setupQuery.isFetching &&
    !setupQuery.isError &&
    !isDirty,
  );
  const update = <Key extends keyof SetupFormState>(
    key: Key,
    value: SetupFormState[Key],
  ) => {
    setIsDirty(true);
    setForm((current) => {
      const next = { ...current, [key]: value };
      if (
        key === 'profile' &&
        next.profile.location &&
        next.profile.organization.address !== next.profile.location.address
      ) {
        next.profile = {
          ...next.profile,
          location: {
            ...next.profile.location,
            address: next.profile.organization.address,
            confirmed: false,
          },
        };
      }
      return next;
    });
    setError('');
    if (key === 'profile') setProfileErrors({});
    setRotationUncertain(false);
  };
  const validateProfile = () => {
    const errors = validateStoreProfile({
      name: form.profile.organization.name,
      contact_phone: form.profile.organization.contact_phone,
      address: form.profile.organization.address,
    });
    setProfileErrors(errors);
    return errors;
  };
  const validationMessage = () => {
    if (step === 0) {
      const profileValidation = validateProfile();
      const firstError = Object.values(profileValidation)[0];
      if (firstError) return t(`organization.${firstError}`);
      const { organization } = form.profile;
      if (!organization.name.trim()) return t('organization.setupNameRequired');
      if (!organization.business_type.trim())
        return t('organization.setupTypeRequired');
      if (organization.business_type !== 'RESTAURANT')
        return t('organization.setupRestaurantOnly');
    }
    if (step === 0 && !Object.values(form.services.service_modes).some(Boolean))
      return t('organization.setupServiceRequired');
    if (
      step === 0 &&
      form.services.service_modes.dine_in &&
      (!form.tables.tables.length ||
        form.tables.tables.some((table) => !table.name.trim()))
    )
      return t('organization.setupTableRequired');
    if (step === 1 && !form.payments.cash && !form.payments.bank_transfer)
      return t('organization.setupPaymentRequired');
    if (
      step === 1 &&
      localReadiness(form, t).some((item) => item.key === 'orders')
    )
      return t('organization.setupChargesInvalid');
    return '';
  };
  const downloadIssuedTokens = () => {
    const payload = JSON.stringify(issuedTokens, null, 2);
    let objectURL: string | null = null;
    try {
      objectURL = URL.createObjectURL(
        new Blob([payload], { type: 'application/json' }),
      );
      const link = document.createElement('a');
      link.href = objectURL;
      link.download = 'table-qr-secrets.json';
      link.click();
      if (activeRef.current) setCopyStatus(t('organization.setupDownloaded'));
    } catch {
      if (activeRef.current)
        setCopyStatus(t('organization.setupDownloadFailed'));
    } finally {
      if (objectURL) {
        const issuedURL = objectURL;
        setTimeout(() => {
          try {
            URL.revokeObjectURL(issuedURL);
          } catch {
            if (activeRef.current)
              setCopyStatus(t('organization.setupDownloadFailed'));
          }
        }, 0);
      }
    }
  };
  const saveStep = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setRotationUncertain(false);
    if (step === 2) {
      if (!isReady) {
        setError(t('organization.setupIncomplete'));
        return;
      }
      if (!setupContext) {
        setError(t('organization.setupNoContext'));
        return;
      }
      setPending(true);
      setRecovery(null);
      try {
        const completionKey = reserveCompletionKey(
          state.session.user.id,
          setupContext,
          setupKey,
        );
        const result = await completeSetup(
          setupContext,
          state.session.csrf_token,
          completionKey,
        );
        if (!activeRef.current) return;
        if (!result.ready) {
          setError(t('organization.setupServerNotReady'));
          await setupQuery.refetch();
          return;
        }
        finishCompletion(state.session.user.id, setupContext, completionKey);
        await tenant.refresh();
        if (!activeRef.current) return;
        await queryClient.invalidateQueries({
          queryKey: [
            'restaurant-setup',
            state.session.user.id,
            orgID,
            branchID,
          ],
        });
        if (!activeRef.current) return;
        navigate(
          branchID ? result.dashboard || paths.dashboard : paths.settings,
          { replace: true },
        );
      } catch (failure) {
        if (!activeRef.current) return;
        if (failure instanceof CompletionRecoveryError) {
          setError(t('mfa.completionStorage'));
          return;
        }
        if (failure instanceof ApiError && failure.code === 'MFA_REQUIRED') {
          setRecovery('mfa');
          setError('');
          return;
        }
        if (failure instanceof ApiError && failure.status === 401)
          setRecovery('signin');
        setError(
          failure instanceof Error
            ? failure.message
            : t('organization.setupCompleteFailed'),
        );
      } finally {
        setPending(false);
      }
      return;
    }
    const invalid = validationMessage();
    if (invalid) {
      setError(invalid);
      return;
    }
    setPending(true);
    setRecovery(null);
    let creating = false;
    let freshCreationKey = '';
    try {
      let requestContext = setupContext;
      if (step === 0 && !tenant.context) {
        if (tenant.storeMode !== 'multi')
          throw new Error(
            t('organization.singleStoreModeDoesNotAllowAdditional'),
          );
        const { name, business_type, contact_email, contact_phone, address } =
          form.profile.organization;
        const payload = {
          name,
          business_type,
          contact_email,
          contact_phone,
          address,
        };
        let nextContext = setupContext;
        if (!nextContext) {
          const assurance = await getMFAStatus();
          if (!activeRef.current) return;
          if (!assurance.session_verified)
            throw new ApiError(403, '', undefined, 'MFA_REQUIRED');
          const key = await reserveCreationKey(
            state.session.user.id,
            JSON.stringify(payload),
            () => {
              freshCreationKey = setupKey();
              return freshCreationKey;
            },
          );
          if (!activeRef.current) return;
          creating = true;
          const result = await createOrganization(
            payload,
            state.session.csrf_token,
            key,
          );
          if (!activeRef.current) return;
          if (
            typeof result?.organization?.id !== 'string' ||
            !result.organization.id
          )
            throw new ApiError(502, t('mfa.creationUnknown'));
          finishCreation(state.session.user.id, key);
          creating = false;
          nextContext = {
            organizationID: result.organization.id,
            branchID: result.branches?.[0]?.id ?? tenant.branchID,
          };
          setCreatedContext(nextContext);
        }
        requestContext = nextContext;
      }
      const cleanOrg = { ...form.profile.organization };
      delete cleanOrg.description;
      if (!requestContext) throw new Error(t('organization.setupNoContext'));
      const profilePayload: SetupProfileInput = {
        organization: cleanOrg,
        service_modes: form.services.service_modes,
        ...(form.profile.location?.confirmed
          ? { location: form.profile.location }
          : {}),
      };
      const sections: Array<{
        key: Parameters<typeof saveSetupStep>[0];
        payload: Parameters<typeof saveSetupStep>[1];
      }> =
        step === 0
          ? [
              { key: 'profile' as const, payload: profilePayload },
              { key: 'services' as const, payload: form.services },
              ...(form.services.service_modes.dine_in
                ? [
                    {
                      key: 'tables' as const,
                      payload: {
                        ...form.tables,
                        qr_enabled: form.tables.tables.length > 0,
                      },
                    },
                  ]
                : [
                    {
                      key: 'tables' as const,
                      payload: { zones: [], tables: [], qr_enabled: false },
                    },
                  ]),
              { key: 'orders' as const, payload: form.orders },
            ]
          : [
              { key: 'payments' as const, payload: form.payments },
              { key: 'orders' as const, payload: form.orders },
            ];
      let safeResult: SetupState | null = null;
      await saveSetupSections(
        sections,
        saveCache.current,
        setupKey,
        async (section, key) => {
          if (!activeRef.current)
            throw new Error(t('organization.setupNoContext'));
          if (section.key === 'tables') {
            setIssuedTokens([]);
            setCopyStatus('');
          }
          let result: SetupState;
          try {
            result = await saveSetupStep(
              section.key,
              section.payload,
              requestContext,
              state.session.csrf_token,
              key,
            );
          } catch (failure) {
            if (
              activeRef.current &&
              section.key === 'tables' &&
              form.tables.qr_enabled &&
              form.services.service_modes.dine_in
            )
              setRotationUncertain(true);
            throw failure;
          }
          if (!activeRef.current) return;
          const { issued_table_qr_tokens, ...saved } = result;
          safeResult = saved;
          if (section.key === 'tables') {
            setIssuedTokens(issued_table_qr_tokens ?? []);
            if (form.services.service_modes.dine_in)
              setSavedTableCount(form.tables.tables.length);
            setCopyStatus('');
          }
        },
      );
      if (!activeRef.current) return;
      if (step === 0 && !tenant.context) {
        await tenant.refresh();
        if (!activeRef.current) return;
        tenant.select(requestContext.organizationID, requestContext.branchID);
      }
      setIsDirty(false);
      if (safeResult) setServerState(safeResult);
      await queryClient.invalidateQueries({ queryKey: ['restaurant-setup'] });
      if (!activeRef.current) return;
      moveToStep((step + 1) as SetupStepIndex);
    } catch (failure) {
      if (!activeRef.current) return;
      // Only a first submission's explicit pre-write rejection permits new details.
      if (
        creating &&
        freshCreationKey &&
        failure instanceof ApiError &&
        failure.status === 400 &&
        failure.code === 'INVALID_INPUT'
      ) {
        finishCreation(state.session.user.id, freshCreationKey);
        creating = false;
      }
      if (failure instanceof ApiError && failure.code === 'MFA_REQUIRED') {
        setRecovery('mfa');
        setError('');
        return;
      }
      if (failure instanceof ApiError && failure.status === 401) {
        setRecovery('signin');
        setError(t('mfa.creationSignin'));
        return;
      }
      if (failure instanceof CreationRecoveryError) {
        setRecovery('creation');
        setError(
          t(
            failure.reason === 'changed'
              ? 'mfa.creationChanged'
              : 'mfa.creationStorage',
          ),
        );
        return;
      }
      const message =
        failure instanceof Error
          ? failure.message
          : t('organization.setupSaveFailed');
      if (creating) setRecovery('creation');
      setError(creating ? t('mfa.creationUnknown') : message);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="setup-page-wrapper">
      <header className="topbar setup-topbar">
        <div className="setup-topbar-left">
          <Link
            to="/"
            className="setup-topbar-brand"
            aria-label={`VELO SmartPOS · ${t('shell.accountAndAccess')}`}
          >
            <Brand />
          </Link>
          <span className="setup-topbar-divider" aria-hidden="true" />
          <div className="breadcrumb">
            <Link
              to="/"
              className="breadcrumb-home"
              aria-label={t('shell.homeAndEntrances')}
            >
              <House size={15} aria-hidden="true" />
            </Link>
            <span>{t('shell.accountAndAccess')}</span>
            <ChevronRight
              size={15}
              className="breadcrumb-separator"
              aria-hidden="true"
            />
            <strong>{t('organization.setupHeading')}</strong>
          </div>
        </div>
        <div className="topbar-right setup-topbar-actions">
          <LanguageSwitcher />
          <HelpDropdown />
          <AccountMenu />
        </div>
      </header>

      <main className="setup-page" aria-labelledby="setup-title">
        <h1 id="setup-title" className="visually-hidden">
          {t('organization.setupHeading')}
        </h1>

        {tenant.organizations.length > 0 && !tenant.context && (
          <Card className="setup-existing-card">
            <div>
              <strong>{t('organization.setupExistingStore')}</strong>
              <p>{t('organization.setupChooseStore')}</p>
            </div>
            <div className="tenant-actions">
              {tenant.organizations.map((item) => (
                <Button
                  key={item.id}
                  className="button-secondary"
                  onClick={() => tenant.select(item.id)}
                >
                  {item.name}
                </Button>
              ))}
            </div>
          </Card>
        )}
        {setupQuery.error && (
          <ErrorMessage message={setupQuery.error.message} />
        )}

        <aside
          className="setup-top-stepper"
          aria-label={t('organization.setupProgress')}
        >
          <div className="setup-top-stepper-line" aria-hidden="true">
            <div
              className="setup-top-stepper-line-fill"
              style={{ width: `${(step / (setupMeta.length - 1)) * 100}%` }}
            />
          </div>
          <ol className="setup-top-stepper-list">
            {setupMeta.map((item, index) => {
              const StepIcon = item.icon;
              const complete =
                index < step ||
                Boolean(
                  serverState?.steps?.find((entry) => entry.key === item.key)
                    ?.complete,
                );
              const isActive = index === step;
              return (
                <li
                  key={item.key}
                  className={`setup-top-step-item ${isActive ? 'is-active' : ''} ${complete ? 'is-complete' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      index <= step && moveToStep(index as SetupStepIndex)
                    }
                    disabled={pending || index > step}
                    aria-current={isActive ? 'step' : undefined}
                    className="setup-top-step-button"
                  >
                    <span className="setup-top-step-media">
                      <span className="setup-top-step-badge" aria-hidden="true">
                        {complete && !isActive ? (
                          <Check size={14} />
                        ) : (
                          index + 1
                        )}
                      </span>
                      <span className="setup-top-step-icon" aria-hidden="true">
                        <StepIcon size={20} strokeWidth={1.9} />
                      </span>
                    </span>
                    <span className="setup-top-step-copy">
                      <strong className="setup-top-step-title">
                        {t(item.label)}
                      </strong>{' '}
                      <small className="setup-top-step-subtitle">
                        {t(item.sidebarSubtitle)}
                      </small>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>
        </aside>

        <div className="setup-layout">
          <section className="setup-main">
            <Card className="setup-card">
              <span className="visually-hidden">
                {t('organization.setupStepCount', { step: step + 1 })}
              </span>
              <div className="setup-card-heading">
                <div className="setup-card-heading-left">
                  <span className="setup-card-icon-squircle" aria-hidden="true">
                    {(() => {
                      const Icon = setupMeta[step].icon;
                      return <Icon size={24} strokeWidth={2} />;
                    })()}
                  </span>
                  <div>
                    <h2
                      ref={stepHeadingRef}
                      tabIndex={-1}
                      className="setup-card-title"
                    >
                      {t(setupMeta[step].label)}
                    </h2>
                    <p className="setup-card-subtitle">
                      {t(setupMeta[step].cardSubtitle)}
                    </p>
                  </div>
                </div>
              </div>

              {setupQuery.isPending && orgID && (
                <Loading>{t('organization.setupLoading')}</Loading>
              )}
              {setupQuery.error && (
                <div className="setup-retry">
                  <CircleAlert size={18} aria-hidden="true" />
                  <span>
                    {hydratedScope
                      ? t('organization.setupLoadFailedEditable')
                      : t('organization.setupLoadFailedRetry')}
                  </span>
                  <Button
                    className="button-secondary"
                    onClick={() => void setupQuery.refetch()}
                  >
                    {t('organization.setupRetry')}
                  </Button>
                </div>
              )}

              <form noValidate onSubmit={(event) => void saveStep(event)}>
                <fieldset
                  disabled={
                    pending || (Boolean(setupContext) && !hydratedScope)
                  }
                >
                  {step < 2 ? (
                    <div className="setup-grouped-fields">
                      {(step === 0
                        ? [
                            0,
                            1,
                            ...(form.services.service_modes.dine_in ? [2] : []),
                          ]
                        : [3]
                      ).map((section) => (
                        <section key={section}>
                          {section === 2 && (
                            <h3>{t('organization.metaTables')}</h3>
                          )}
                          <SetupStepFields
                            step={section}
                            savedTableCount={savedTableCount}
                            form={form}
                            update={update}
                            profileErrors={profileErrors}
                            onValidateProfile={validateProfile}
                            pickupAvailable={Boolean(orgID) && !branchID}
                            promptPayAvailable={Boolean(
                              serverState?.capabilities.promptPay,
                            )}
                          />
                        </section>
                      ))}
                    </div>
                  ) : (
                    <>
                      <ReadinessReview
                        items={readinessItems}
                        form={form}
                        ready={isReady}
                      />
                      <ul className="setup-readiness-issues">
                        {readinessItems.map((item, index) => (
                          <li key={`${item.key}-${index}`}>
                            {item.label}: {item.reason}
                          </li>
                        ))}
                      </ul>
                      <Button
                        className="button-secondary setup-recheck-button"
                        disabled={pending || setupQuery.isFetching}
                        onClick={() => void setupQuery.refetch()}
                      >
                        {t('organization.setupRecheckReadiness')}
                      </Button>
                    </>
                  )}
                  {issuedTokens.length > 0 && (
                    <section aria-labelledby="issued-table-tokens">
                      <h3 id="issued-table-tokens">
                        {t('organization.setupIssuedTokens')}
                      </h3>
                      <p>{t('organization.setupTokenInstructions')}</p>
                      <label className="tenant-field setup-field">
                        <span>{t('organization.setupTableSecret')}</span>
                        <textarea
                          readOnly
                          rows={5}
                          value={JSON.stringify(issuedTokens, null, 2)}
                        />
                      </label>
                      <div className="tenant-actions">
                        <Button
                          className="button-secondary"
                          onClick={() => {
                            void (async () => {
                              try {
                                await navigator.clipboard.writeText(
                                  JSON.stringify(issuedTokens, null, 2),
                                );
                                if (activeRef.current)
                                  setCopyStatus(t('organization.setupCopied'));
                              } catch {
                                if (activeRef.current)
                                  setCopyStatus(
                                    t('organization.setupCopyFailed'),
                                  );
                              }
                            })();
                          }}
                        >
                          {t('organization.setupCopyTokens')}
                        </Button>
                        <Button
                          className="button-secondary"
                          onClick={downloadIssuedTokens}
                        >
                          {t('organization.setupDownloadTokens')}
                        </Button>
                      </div>
                      <p role="status">{localize(copyStatus)}</p>
                    </section>
                  )}
                  {(error || rotationUncertain) && (
                    <ErrorMessage
                      message={`${localize(error)}${rotationUncertain ? ` ${t('organization.setupRotationUncertain')}` : ''}`}
                    />
                  )}
                  {recovery === 'mfa' && <MFARequiredState newTab />}
                  {recovery === 'signin' && (
                    <Link
                      className="button button-secondary"
                      to="/login?returnTo=%2Fsetup"
                    >
                      {t('mfa.signin')}
                    </Link>
                  )}
                  {recovery === 'creation' && (
                    <Link className="button button-secondary" to="/workspace">
                      {t('mfa.workspace')}
                    </Link>
                  )}
                  <div className="setup-actions">
                    <Button
                      type="button"
                      className="button-secondary setup-btn-back"
                      onClick={() => {
                        setError('');
                        setRotationUncertain(false);
                        moveToStep(Math.max(0, step - 1) as SetupStepIndex);
                      }}
                      disabled={step === 0 || pending}
                    >
                      <ArrowLeft size={16} aria-hidden="true" />{' '}
                      {t('organization.setupBack')}
                    </Button>
                    <Button
                      type="submit"
                      className="setup-btn-next"
                      aria-label={
                        pending
                          ? t('organization.setupSaving')
                          : step === 2
                            ? t('organization.setupActivate')
                            : t('organization.setupSaveContinue')
                      }
                      aria-busy={pending}
                      disabled={
                        pending ||
                        (Boolean(setupContext) && setupQuery.isPending) ||
                        (step === 2 && !isReady)
                      }
                    >
                      <span>
                        {pending
                          ? t('organization.setupSaving')
                          : step === 2
                            ? t('organization.setupActivate')
                            : t('organization.setupNext')}
                      </span>
                      {pending ? (
                        <LoaderCircle
                          className="spin"
                          size={16}
                          aria-hidden="true"
                        />
                      ) : step === 2 ? (
                        <CheckCircle2 size={16} aria-hidden="true" />
                      ) : (
                        <ArrowRight size={16} aria-hidden="true" />
                      )}
                    </Button>
                  </div>
                </fieldset>
              </form>
            </Card>
          </section>
        </div>
      </main>
    </div>
  );
}

function ReadinessReview({
  items,
  form,
  ready,
}: {
  items: SetupReadinessItem[];
  form: SetupFormState;
  ready: boolean;
}) {
  const { t } = useLanguage();
  const checks = [
    {
      key: 'profile',
      label: t('organization.metaProfile'),
      icon: Store,
      done: !items.some((item) => item.key === 'profile'),
      detail:
        form.profile.organization.name || t('organization.setupNoStoreName'),
    },
    {
      key: 'tables',
      label: t('organization.metaTables'),
      icon: LayoutGrid,
      done: !items.some((item) => item.key === 'tables'),
      detail: form.tables.tables[0]?.name || t('organization.setupNoTable'),
    },
    {
      key: 'payments',
      label: t('organization.setupPaymentMethods'),
      icon: CreditCard,
      done: !items.some((item) => item.key === 'payments'),
      detail: form.payments.cash
        ? t('organization.setupCash')
        : form.payments.bank_transfer
          ? t('organization.setupTransfer')
          : t('organization.setupNotSelected'),
    },
    {
      key: 'orders',
      label: t('organization.setupOrdersFees'),
      icon: Coins,
      done: !items.some((item) => item.key === 'orders'),
      detail: t('organization.setupFeeSummary', {
        vat: form.orders.vat_percent,
        service: form.orders.service_charge_percent,
      }),
    },
  ];
  return (
    <div className="setup-review">
      <div className={`setup-readiness-banner ${ready ? 'is-ready' : ''}`}>
        <span className="setup-readiness-symbol">
          {ready ? (
            <Check size={28} strokeWidth={3} aria-hidden="true" />
          ) : (
            <CircleAlert size={22} aria-hidden="true" />
          )}
        </span>
        <div className="setup-readiness-copy">
          <strong>
            {ready
              ? t('organization.setupReady')
              : t('organization.setupNotReady')}
          </strong>
          <p>
            {ready
              ? t('organization.setupReadyDetails')
              : t('organization.setupNotReadyDetails')}
          </p>
        </div>
        {ready && (
          <img
            className="setup-readiness-decoration"
            src="/images/shop-directory.svg"
            alt=""
            aria-hidden="true"
            width={160}
            height={100}
          />
        )}
      </div>
      <div
        className="setup-checklist"
        aria-label={t('organization.setupChecklist')}
      >
        {checks
          .filter(
            (check) =>
              check.key !== 'tables' || form.services.service_modes.dine_in,
          )
          .map((check) => (
            <div
              className={`setup-check ${check.done ? 'is-done' : ''}`}
              key={check.key}
            >
              <span className="setup-check-status">
                {check.done ? (
                  <Check size={16} aria-hidden="true" />
                ) : (
                  <CircleAlert size={16} aria-hidden="true" />
                )}
              </span>
              <span className="setup-check-icon" aria-hidden="true">
                <check.icon size={23} strokeWidth={1.8} />
              </span>
              <div>
                <strong>{check.label}</strong>
                <small>
                  {check.done
                    ? check.detail
                    : items.find((item) => item.key === check.key)?.reason}
                </small>
              </div>
              <Tag tone={check.done ? 'success' : 'amber'}>
                {check.done && <Check size={14} aria-hidden="true" />}
                {check.done
                  ? t('organization.setupReadyTag')
                  : t('organization.setupNeedsAttention')}
              </Tag>
            </div>
          ))}
      </div>
      <p className="setup-review-note">
        <Info size={16} aria-hidden="true" />{' '}
        {t('organization.setupReviewNote')}
      </p>
    </div>
  );
}
export { SettingsPage, StorefrontSettingsPage };

export function StorePage() {
  return <SettingsPage />;
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
