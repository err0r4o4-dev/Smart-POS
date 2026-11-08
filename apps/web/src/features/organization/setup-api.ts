import {
  organizationRequest,
  type OrganizationInput,
  type OrganizationCreateInput,
  type BranchInput,
  type OrganizationContext,
} from '../../lib/organization-api';

export const setupStepKeys = [
  'profile',
  'services',
  'tables',
  'menu',
  'payments',
  'orders',
  'review',
] as const;
export type SetupStepKey = (typeof setupStepKeys)[number];

export interface SetupStepState {
  key: SetupStepKey;
  complete: boolean;
  label?: string;
  reason?: string;
}

export interface SetupReadinessItem {
  key: string;
  label: string;
  reason: string;
}

export interface IssuedTableQRToken {
  table_id: string;
  code: string;
  qr_token: string;
}

export interface SetupProfileInput {
  organization: Pick<
    OrganizationInput,
    'name' | 'business_type' | 'contact_email' | 'contact_phone' | 'address'
  >;
  service_modes: { dine_in: boolean; takeaway: boolean; delivery: boolean };
}

interface SetupProfileState extends SetupProfileInput {
  organization: SetupProfileInput['organization'] &
    Pick<OrganizationInput, 'code'>;
  branch: Pick<BranchInput, 'name' | 'code' | 'address' | 'phone' | 'email'>;
}

export interface SetupServicesInput {
  service_modes: { dine_in: boolean; takeaway: boolean; delivery: boolean };
}

export interface SetupTablesInput {
  zones: Array<{ name: string; code?: string }>;
  tables: Array<{
    name: string;
    zone: string;
    seats: number;
    code?: string;
    zone_code?: string;
  }>;
  qr_enabled: boolean;
}

export interface SetupMenuInput {
  categories: Array<{ name: string }>;
  items: Array<{ name: string; price: string; category: string }>;
}

export interface SetupPaymentsInput {
  cash: boolean;
  bank_transfer: boolean;
  promptpay: boolean;
  card: boolean;
}

export interface SetupOrdersInput {
  qr_ordering: boolean;
  kitchen_queue: boolean;
  auto_confirm: boolean;
  vat_percent: string;
  service_charge_percent: string;
}

export interface SetupState {
  current_step: string;
  complete: boolean;
  steps: SetupStepState[];
  readiness: { ready: boolean; incomplete: SetupReadinessItem[] };
  capabilities: { cardPayments: boolean; promptPay: boolean };
  profile?: SetupProfileState;
  services?: SetupServicesInput;
  tables?: SetupTablesInput;
  menu?: SetupMenuInput;
  payments?: SetupPaymentsInput;
  orders?: SetupOrdersInput;
  issued_table_qr_tokens?: IssuedTableQRToken[];
}

export interface SetupContext {
  organizationID: string;
  branchID: string;
}

export interface SetupCompletion {
  ready: boolean;
  dashboard: string;
}

interface BackendSetupStep {
  key: string;
  status: string;
  ready: boolean;
  reasons?: string[];
}

interface BackendSetupState {
  organization_id: string;
  branch_id: string;
  current_step: string;
  ready: boolean;
  completed: boolean;
  readiness: { ready: boolean; incomplete: SetupReadinessItem[] };
  steps: BackendSetupStep[];
  profile?: SetupProfileState;
  services?: SetupServicesInput['service_modes'];
  tables?: SetupTablesInput;
  menu?: SetupMenuInput;
  orders?: SetupOrdersInput;
  payments?: Partial<SetupPaymentsInput> & { qr_manual?: boolean };
  capabilities?: { cardPayments?: boolean; promptPay?: boolean };
  issued_table_qr_tokens?: IssuedTableQRToken[];
}

const stepPaths: Record<Exclude<SetupStepKey, 'review'>, string> = {
  profile: '/profile',
  services: '/services',
  tables: '/tables',
  menu: '/menu',
  payments: '/payments',
  orders: '/orders',
};

export function setupPath(context: SetupContext, suffix = '') {
  return `/organizations/${encodeURIComponent(context.organizationID)}/restaurant/setup${suffix}`;
}

function branchQuery(context: SetupContext) {
  return `?branch_id=${encodeURIComponent(context.branchID)}`;
}

function normalizeState(raw: BackendSetupState): SetupState {
  if (
    !raw ||
    !raw.readiness ||
    typeof raw.readiness.ready !== 'boolean' ||
    !Array.isArray(raw.readiness.incomplete) ||
    !Array.isArray(raw.steps)
  )
    throw new Error('รูปแบบผลตอบกลับสถานะการตั้งค่าไม่ถูกต้อง กรุณาลองใหม่');
  return {
    current_step: raw.current_step,
    complete: raw.completed,
    steps: raw.steps.map((step) => ({
      key: setupStepKeys.includes(step.key as SetupStepKey)
        ? (step.key as SetupStepKey)
        : 'review',
      complete: step.status === 'COMPLETE' || step.status === 'COMPLETED',
      reason: step.reasons?.join(' '),
    })),
    readiness: raw.readiness,
    capabilities: {
      cardPayments: Boolean(raw.capabilities?.cardPayments),
      promptPay: Boolean(raw.capabilities?.promptPay),
    },
    profile: raw.profile,
    services: raw.services
      ? { service_modes: raw.services }
      : raw.profile?.service_modes
        ? { service_modes: raw.profile.service_modes }
        : undefined,
    tables: raw.tables,
    menu: raw.menu,
    payments: raw.payments
      ? {
          cash: Boolean(raw.payments.cash),
          bank_transfer: Boolean(raw.payments.bank_transfer),
          promptpay: Boolean(
            raw.payments.promptpay && raw.capabilities?.promptPay,
          ),
          card: false,
        }
      : undefined,
    orders: raw.orders,
  };
}

export function getSetup(context: SetupContext, signal?: AbortSignal) {
  return organizationRequest<BackendSetupState>(
    setupPath(context) + branchQuery(context),
    { signal },
  ).then(normalizeState);
}

export function createOrganization(
  body: OrganizationCreateInput,
  csrf: string,
  key: string,
) {
  return organizationRequest<OrganizationContext>('/organizations', {
    method: 'POST',
    body,
    csrf,
    key,
  });
}

function toBackendPayload(
  step: Exclude<SetupStepKey, 'review'>,
  body:
    | SetupProfileInput
    | SetupServicesInput
    | SetupTablesInput
    | SetupMenuInput
    | SetupPaymentsInput
    | SetupOrdersInput,
  branchID: string,
) {
  if (step === 'profile') {
    const input = body as SetupProfileInput;
    const { name, business_type, contact_email, contact_phone, address } =
      input.organization;
    const organization = {
      name,
      business_type,
      contact_email,
      contact_phone,
      address,
    };
    return {
      branch_id: branchID,
      organization,
      ...organization,
      service_modes: input.service_modes,
    };
  }
  if (step === 'services') {
    const input = body as SetupServicesInput;
    return { branch_id: branchID, service_modes: input.service_modes };
  }
  if (step === 'tables') {
    const input = body as SetupTablesInput;
    if (
      input.tables.some(
        (table) => !input.zones.some((zone) => zone.name === table.zone),
      )
    )
      throw new Error('ไม่พบโซนของโต๊ะ กรุณาตรวจสอบข้อมูล');
    const assignCodes = (entries: Array<{ code?: string }>, prefix: string) => {
      const used = new Set(
        entries.flatMap((entry) => (entry.code ? [entry.code] : [])),
      );
      let next = 1;
      return entries.map((entry) => {
        if (entry.code) return entry.code;
        while (used.has(`${prefix}_${next}`)) next++;
        const code = `${prefix}_${next++}`;
        used.add(code);
        return code;
      });
    };
    const zoneCodes = assignCodes(input.zones, 'ZONE');
    const tableCodes = assignCodes(input.tables, 'TABLE');
    return {
      branch_id: branchID,
      zones: input.zones.map((zone, index) => ({
        code: zoneCodes[index],
        name: zone.name,
      })),
      tables: input.tables.map((table, index) => ({
        code: tableCodes[index],
        name: table.name,
        seats: table.seats,
        zone_code:
          zoneCodes[input.zones.findIndex((zone) => zone.name === table.zone)],
      })),
      generate_qr: input.qr_enabled,
    };
  }
  if (step === 'menu')
    return { ...(body as SetupMenuInput), branch_id: branchID };
  if (step === 'payments') {
    const input = body as SetupPaymentsInput;
    return {
      branch_id: branchID,
      cash: input.cash,
      bank_transfer: input.bank_transfer,
      promptpay: input.promptpay,
      card: false,
    };
  }
  const input = body as SetupOrdersInput;
  return {
    branch_id: branchID,
    qr_ordering: input.qr_ordering,
    kitchen_queue: input.kitchen_queue,
    auto_confirm: input.auto_confirm,
    vat_rate: input.vat_percent,
    service_charge_rate: input.service_charge_percent,
  };
}

export function saveSetupStep(
  step: Exclude<SetupStepKey, 'review'>,
  body:
    | SetupProfileInput
    | SetupServicesInput
    | SetupTablesInput
    | SetupMenuInput
    | SetupPaymentsInput
    | SetupOrdersInput,
  context: SetupContext,
  csrf: string,
  key: string,
) {
  return organizationRequest<BackendSetupState>(
    setupPath(context, stepPaths[step]),
    {
      method: 'PUT',
      body: toBackendPayload(step, body, context.branchID),
      csrf,
      key,
    },
  ).then((raw) => ({
    ...normalizeState(raw),
    issued_table_qr_tokens:
      step === 'tables' ? raw.issued_table_qr_tokens : undefined,
  }));
}

export function completeSetup(context: SetupContext, csrf: string, key: string) {
  return organizationRequest<BackendSetupState>(setupPath(context, '/complete'), {
    method: 'POST',
    body: { branch_id: context.branchID },
    csrf,
    key,
  }).then((state) => ({ ready: normalizeState(state).complete && state.readiness.ready, dashboard: '/dashboard' }));
}
