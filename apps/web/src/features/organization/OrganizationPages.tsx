import { useLanguage } from '../../app/language';
import { startTransition, useEffect, useRef, useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Banknote,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  CreditCard,
  GitBranch,
  Info,
  LayoutGrid,
  ListChecks,
  MapPinned,
  QrCode,
  ReceiptText,
  Store,
  Utensils,
  WalletCards,
} from 'lucide-react';
import { WorkspaceLink as Link } from '../../app/WorkspaceNavigation';
import { useWorkspaceNavigate as useNavigate } from '../../app/useWorkspaceNavigate';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../app/AuthProvider';
import { useOrganization } from '../../app/OrganizationProvider';
import { Button, Card, Loading, Tag } from '../../components/ui/primitives';
import { StandardPageHeader } from '../../components/ui/StandardPage';
import './setup.css';
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
  type SetupMenuInput,
  type SetupOrdersInput,
  type SetupPaymentsInput,
  type SetupProfileInput,
  type SetupServicesInput,
  type SetupReadinessItem,
  type SetupState,
  type SetupTablesInput,
  type IssuedTableQRToken,
} from './setup-api';

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
type SetupFormState = {
  profile: SetupProfileInput & { organization: { description?: string } };
  tables: SetupTablesInput;
  menu: SetupMenuInput;
  services: SetupServicesInput;
  payments: SetupPaymentsInput;
  orders: SetupOrdersInput;
};

const createSetupForm = (): SetupFormState => ({
  profile: {
    organization: { name: '', business_type: 'RESTAURANT', contact_email: '', contact_phone: '', address: '', description: '' },
    service_modes: { dine_in: true, takeaway: true, delivery: false },
  },
  services: { service_modes: { dine_in: true, takeaway: true, delivery: false } },
  tables: { zones: [{ name: 'โซนหลัก' }], tables: [{ name: 'โต๊ะ 1', zone: 'โซนหลัก', seats: 0 }], qr_enabled: true },
  menu: { categories: [{ name: 'เมนูหลัก' }], items: [{ name: '', price: '', category: 'เมนูหลัก' }] },
  payments: { cash: true, bank_transfer: true, promptpay: false, card: false },
  orders: { qr_ordering: true, kitchen_queue: true, auto_confirm: false, vat_percent: '0', service_charge_percent: '0' },
});

const setupMeta = [
  {
    key: 'profile',
    label: 'ข้อมูลร้าน',
    sidebarSubtitle: 'ตั้งค่าข้อมูลพื้นฐานของร้าน',
    cardSubtitle: 'กรอกข้อมูลพื้นฐานของร้านอาหาร เพื่อเริ่มใช้งานระบบ',
    description: 'กรอกข้อมูลพื้นฐานของร้านอาหาร เพื่อเริ่มใช้งานระบบ',
    icon: Store,
  },
  {
    key: 'services',
    label: 'รูปแบบบริการ',
    sidebarSubtitle: 'เลือกรูปแบบการให้บริการ',
    cardSubtitle: 'เลือกรูปแบบการให้บริการ',
    description: 'เลือกช่องทางบริการของร้าน',
    icon: Store,
  },
  {
    key: 'tables',
    label: 'พื้นที่และโต๊ะ',
    sidebarSubtitle: 'จัดการพื้นที่และโต๊ะ',
    cardSubtitle: 'จัดการพื้นที่และโต๊ะ',
    description: 'จัดโซน โต๊ะ และ QR สำหรับหน้าร้าน',
    icon: MapPinned,
  },
  {
    key: 'menu',
    label: 'เมนู',
    sidebarSubtitle: 'เพิ่มและจัดการเมนู',
    cardSubtitle: 'เพิ่มและจัดการเมนู',
    description: 'เพิ่มหมวดหมู่และเมนูแรกของร้าน',
    icon: Utensils,
  },
  {
    key: 'payments',
    label: 'การชำระเงิน',
    sidebarSubtitle: 'ตั้งค่าวิธีการรับชำระ',
    cardSubtitle: 'ตั้งค่าวิธีการรับชำระ',
    description: 'เลือกช่องทางรับชำระที่ใช้งานจริง',
    icon: WalletCards,
  },
  {
    key: 'orders',
    label: 'การสั่งซื้อ',
    sidebarSubtitle: 'ตั้งค่าช่องทางการสั่งซื้อ',
    cardSubtitle: 'ตั้งค่าช่องทางการสั่งซื้อ',
    description: 'กำหนด QR คิวครัว และค่าธรรมเนียม',
    icon: ReceiptText,
  },
  {
    key: 'review',
    label: 'ตรวจสอบความพร้อม',
    sidebarSubtitle: 'ตรวจทานข้อมูลก่อนเริ่มใช้งาน',
    cardSubtitle: 'ตรวจทานข้อมูลก่อนเริ่มใช้งาน',
    description: 'ตรวจรายการก่อนเปิดใช้งานร้าน',
    icon: ListChecks,
  },
] as const;

type SetupStepIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6;

function setupKey() {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
  min?: string;
  step?: string;
}) {
  return (
    <label className="tenant-field setup-field">
      <span className="setup-field-label">
        {label}
        {required && <span className="setup-required" aria-hidden="true"> *</span>}
      </span>
      <input
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        type={type}
        placeholder={placeholder}
        min={min}
        step={step}
      />
    </label>
  );
}

function SetupSelectOrInput({
  label,
  value,
  onChange,
  required = false,
  placeholder,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  placeholder?: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <label className="tenant-field setup-field">
      <span className="setup-field-label">
        {label}
        {required && <span className="setup-required" aria-hidden="true"> *</span>}
      </span>
      <div className="setup-select-wrapper">
        <input
          aria-label={label}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          required={required}
          type="text"
          placeholder={placeholder}
          list="setup-business-types"
          className="setup-select-input"
        />
        <ChevronDown size={18} className="setup-chevron-icon" aria-hidden="true" />
        <datalist id="setup-business-types">
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </datalist>
      </div>
    </label>
  );
}

function SetupToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="setup-toggle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}

function localReadiness(form: SetupFormState): SetupReadinessItem[] {
  const incomplete: SetupReadinessItem[] = [];
  const profile = form.profile;
  if (!profile.organization.name.trim() || !profile.organization.business_type.trim())
    incomplete.push({ key: 'profile', label: 'ข้อมูลร้าน', reason: 'กรอกชื่อและประเภทร้านให้ครบ' });
  if (!form.tables.zones.some((zone) => zone.name.trim()) || !form.tables.tables.some((table) => table.name.trim()))
    incomplete.push({ key: 'tables', label: 'พื้นที่และโต๊ะ', reason: 'เพิ่มอย่างน้อยหนึ่งโซนและหนึ่งโต๊ะ' });
  if (!form.menu.categories.some((category) => category.name.trim()) || !form.menu.items.some((item) => item.name.trim() && decimalValid(item.price)))
    incomplete.push({ key: 'menu', label: 'เมนู', reason: 'เพิ่มเมนูแรกพร้อมราคาที่ถูกต้อง' });
  if (!form.payments.cash && !form.payments.bank_transfer)
    incomplete.push({ key: 'payments', label: 'การชำระเงิน', reason: 'เลือกช่องทางรับชำระอย่างน้อยหนึ่งช่องทาง' });
  const vat = Number(form.orders.vat_percent);
  const service = Number(form.orders.service_charge_percent);
  if (!decimalValid(form.orders.vat_percent) || vat > 100 || !decimalValid(form.orders.service_charge_percent) || service > 100)
    incomplete.push({ key: 'orders', label: 'การสั่งซื้อ', reason: 'ค่าภาษีและค่าบริการต้องอยู่ระหว่าง 0 ถึง 100' });
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
}: {
  step: SetupStepIndex;
  form: SetupFormState;
  update: <Key extends keyof SetupFormState>(key: Key, value: SetupFormState[Key]) => void;
  promptPayAvailable: boolean;
}) {
  const profile = form.profile;
  if (step === 0)
    return (
      <div className="setup-form-section">
        <div className="setup-form-row">
          <SetupInput
            label="ชื่อร้าน"
            value={profile.organization.name}
            placeholder="เช่น ร้านอาหารของคุณ"
            required
            onChange={(name) =>
              update('profile', {
                ...profile,
                organization: { ...profile.organization, name },
              })
            }
          />
        </div>
        <div className="setup-form-grid">
          <SetupSelectOrInput
            label="ประเภทร้าน"
            value={profile.organization.business_type}
            placeholder="เช่น RESTAURANT"
            required
            options={[
              { value: 'RESTAURANT', label: 'RESTAURANT' },
              { value: 'CAFE', label: 'CAFE' },
              { value: 'BAKERY', label: 'BAKERY' },
              { value: 'FAST_FOOD', label: 'FAST_FOOD' },
              { value: 'BAR', label: 'BAR' },
            ]}
            onChange={(business_type) =>
              update('profile', {
                ...profile,
                organization: { ...profile.organization, business_type },
              })
            }
          />
          <SetupInput
            label="อีเมลร้าน"
            value={profile.organization.contact_email}
            placeholder="เช่น contact@velocafe.com"
            type="email"
            onChange={(contact_email) =>
              update('profile', {
                ...profile,
                organization: { ...profile.organization, contact_email },
              })
            }
          />
        </div>
        <div className="setup-form-grid">
          <SetupInput
            label="โทรศัพท์ร้าน"
            value={profile.organization.contact_phone}
            placeholder="เช่น 061-507-1665"
            onChange={(contact_phone) =>
              update('profile', {
                ...profile,
                organization: { ...profile.organization, contact_phone },
              })
            }
          />
          <SetupInput
            label="ที่อยู่ร้าน"
            value={profile.organization.address}
            placeholder="เช่น 123 ถ.สุขุมวิท ต.คลองตัน อ.คลองตัน จ.กรุงเทพฯ 26120"
            onChange={(address) =>
              update('profile', {
                ...profile,
                organization: { ...profile.organization, address },
              })
            }
          />
        </div>
        <div className="setup-form-row">
          <SetupInput
            label="คำอธิบายร้าน"
            value={profile.organization.description ?? ''}
            placeholder="เช่น ร้านอาหารและคาเฟ่ อาหารไทย เครื่องดื่ม และเบเกอรี่"
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
          <p>
            คุณสามารถแก้ไขข้อมูลเหล่านี้ได้ในภายหลัง เช่น ชื่อร้าน ที่อยู่ อีเมล หรือข้อมูลสาขา ผ่านการตั้งค่าร้านค้าในระบบ
          </p>
        </div>
      </div>
    );
  if (step === 1)
    return (
        <fieldset className="setup-choice-group">
          <legend>รูปแบบบริการ</legend>
          <div className="setup-choice-grid">
            <SetupToggle label="ทานที่ร้าน" checked={form.services.service_modes.dine_in} onChange={(dine_in) => update('services', { service_modes: { ...form.services.service_modes, dine_in } })} />
            <SetupToggle label="ซื้อกลับบ้าน" checked={form.services.service_modes.takeaway} onChange={(takeaway) => update('services', { service_modes: { ...form.services.service_modes, takeaway } })} />
            <SetupToggle label="เดลิเวอรี" checked={form.services.service_modes.delivery} onChange={(delivery) => update('services', { service_modes: { ...form.services.service_modes, delivery } })} />
          </div>
        </fieldset>
    );
  if (step === 2)
    return (
      <div className="setup-form-section">
        <div className="setup-form-grid">
          <SetupInput label="ชื่อโซนแรก" value={form.tables.zones[0]?.name ?? ''} required onChange={(name) => update('tables', { ...form.tables, zones: [{ ...form.tables.zones[0], name }, ...form.tables.zones.slice(1)], tables: form.tables.tables.map((table) => table.zone === form.tables.zones[0]?.name ? { ...table, zone: name } : table) })} />
          <SetupInput label="ชื่อโต๊ะแรก" value={form.tables.tables[0]?.name ?? ''} required onChange={(name) => update('tables', { ...form.tables, tables: [{ ...(form.tables.tables[0] ?? { zone: form.tables.zones[0]?.name ?? '', seats: 0 }), name }, ...form.tables.tables.slice(1)] })} />
          <SetupInput label="จำนวนที่นั่งโต๊ะแรก" value={form.tables.tables[0]?.seats ? String(form.tables.tables[0].seats) : ''} required type="number" min="1" step="1" onChange={(seats) => update('tables', { ...form.tables, tables: [{ ...(form.tables.tables[0] ?? { name: '', zone: form.tables.zones[0]?.name ?? '' }), seats: Number(seats) }, ...form.tables.tables.slice(1)] })} />
        </div>
        <div className="setup-choice-grid">
          <SetupToggle label="เปิดใช้ QR สำหรับโต๊ะ" checked={form.tables.qr_enabled} onChange={(qr_enabled) => update('tables', { ...form.tables, qr_enabled })} />
        </div>
        <p className="setup-hint">เมื่อเปิดใช้ QR การบันทึกจะหมุนเวียนรหัสลับของโต๊ะที่บันทึก รหัสเดิมจะใช้ไม่ได้ การส่งคำขอเดิมซ้ำอาจได้รหัสที่หมดอายุแล้วหากมีการหมุนเวียนภายหลัง</p>
        <p className="setup-hint"><QrCode size={16} aria-hidden="true" /> สามารถเพิ่มโซนและโต๊ะเพิ่มเติมได้จากเมนูจัดการหลังเปิดใช้งาน</p>
      </div>
    );
  if (step === 3)
    return (
      <div className="setup-form-section">
        <div className="setup-form-grid">
          <SetupInput label="หมวดหมู่เมนูแรก" value={form.menu.categories[0]?.name ?? ''} required onChange={(name) => update('menu', { ...form.menu, categories: [{ ...form.menu.categories[0], name }, ...form.menu.categories.slice(1)], items: form.menu.items.map((item) => item.category === form.menu.categories[0]?.name ? { ...item, category: name } : item) })} />
          <SetupInput label="ชื่อเมนูแรก" value={form.menu.items[0]?.name ?? ''} required onChange={(name) => update('menu', { ...form.menu, items: [{ ...(form.menu.items[0] ?? { price: '', category: form.menu.categories[0]?.name ?? '' }), name }, ...form.menu.items.slice(1)] })} />
          <SetupInput label="ราคาเมนูแรก (บาท)" value={form.menu.items[0]?.price ?? ''} required type="number" min="0" step="0.01" onChange={(price) => update('menu', { ...form.menu, items: [{ ...(form.menu.items[0] ?? { name: '', category: form.menu.categories[0]?.name ?? '' }), price }, ...form.menu.items.slice(1)] })} />
        </div>
        <p className="setup-hint"><Utensils size={16} aria-hidden="true" /> ราคาจะถูกตรวจสอบอีกครั้งโดยเซิร์ฟเวอร์ก่อนบันทึก</p>
      </div>
    );
  if (step === 4)
    return (
      <div className="setup-form-section">
        <p className="setup-section-lead">เลือกช่องทางที่ร้านรับเงินจริงในวันเปิดร้าน</p>
        <div className="setup-payment-grid">
          <label className="setup-payment-option">
            <input type="checkbox" checked={form.payments.cash} onChange={(event) => update('payments', { ...form.payments, cash: event.target.checked })} />
            <Banknote size={22} aria-hidden="true" />
            <span><strong>เงินสด</strong><small>พร้อมใช้งาน</small></span>
          </label>
          <label className="setup-payment-option">
            <input type="checkbox" checked={form.payments.bank_transfer} onChange={(event) => update('payments', { ...form.payments, bank_transfer: event.target.checked })} />
            <WalletCards size={22} aria-hidden="true" />
            <span><strong>โอนเงิน</strong><small>พร้อมใช้งาน</small></span>
          </label>
          <label className="setup-payment-option setup-payment-option-disabled" aria-disabled="true">
            <input type="checkbox" checked={form.payments.promptpay} disabled={!promptPayAvailable} onChange={(event) => update('payments', { ...form.payments, promptpay: event.target.checked })} />
            <QrCode size={22} aria-hidden="true" />
            <span><strong>PromptPay</strong><small>ยังไม่พร้อมใช้งาน · ต้องตั้งค่า Merchant ID</small></span>
            <Tag>ยังไม่พร้อม</Tag>
          </label>
          <label className="setup-payment-option setup-payment-option-disabled" aria-disabled="true">
            <input type="checkbox" checked={false} disabled />
            <CreditCard size={22} aria-hidden="true" />
            <span><strong>บัตรเครดิต</strong><small>ยังไม่พร้อมใช้งาน · รอเชื่อมต่อผู้ให้บริการ</small></span>
            <Tag>ยังไม่พร้อม</Tag>
          </label>
        </div>
      </div>
    );
  if (step === 5)
    return (
      <div className="setup-form-section">
        <div className="setup-choice-grid">
          <SetupToggle label="รับออเดอร์ผ่าน QR" checked={form.orders.qr_ordering} onChange={(qr_ordering) => update('orders', { ...form.orders, qr_ordering })} />
          <SetupToggle label="ใช้คิวครัว" checked={form.orders.kitchen_queue} onChange={(kitchen_queue) => update('orders', { ...form.orders, kitchen_queue })} />
          <SetupToggle label="ยืนยันออเดอร์อัตโนมัติ" checked={form.orders.auto_confirm} onChange={(auto_confirm) => update('orders', { ...form.orders, auto_confirm })} />
        </div>
        <div className="setup-form-grid">
          <SetupInput label="VAT (%)" value={form.orders.vat_percent} required type="number" min="0" step="0.01" onChange={(vat_percent) => update('orders', { ...form.orders, vat_percent })} />
          <SetupInput label="ค่าบริการ (%)" value={form.orders.service_charge_percent} required type="number" min="0" step="0.01" onChange={(service_charge_percent) => update('orders', { ...form.orders, service_charge_percent })} />
        </div>
      </div>
    );
  return null;
}

export function SetupPage() {
  const { state } = useAuth();
  const tenant = useOrganization();
  const scope = JSON.stringify([state.session?.user.id ?? null, tenant.context?.organization?.id ?? null, tenant.branchID || null, tenant.context?.membership.role ?? null]);
  return <ScopedSetupPage key={scope} />;
}

function ScopedSetupPage() {
  const { t, localize } = useLanguage();
  const { state } = useAuth();
  const tenant = useOrganization();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SetupFormState>(createSetupForm);
  const [step, setStep] = useState<SetupStepIndex>(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [serverState, setServerState] = useState<SetupState | null>(null);
  const [issuedTokens, setIssuedTokens] = useState<IssuedTableQRToken[]>([]);
  const [copyStatus, setCopyStatus] = useState('');
  const [createdContext, setCreatedContext] = useState<{
    organizationID: string;
    branchID: string;
  } | null>(null);
  const creationRef = useRef({ key: '', payload: '' });
  const stepRetryRef = useRef({ step: '', payload: '', key: '' });
  const completionRef = useRef({ key: '', orgID: '' });
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const activeRef = useRef(true);
  useEffect(() => {
    activeRef.current = true;
    return () => { activeRef.current = false; };
  }, []);
  const [hydratedScope, setHydratedScope] = useState('');
  const [isDirty, setIsDirty] = useState(false);
  const orgID = tenant.context?.organization?.id ?? createdContext?.organizationID ?? '';
  const branchID = tenant.branchID || createdContext?.branchID || '';
  const setupContext = orgID && branchID ? { organizationID: orgID, branchID } : null;
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
        setServerState(null);
        setStep(0);
        setError('');
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
    startTransition(() => {
      setServerState(setupQuery.data);
      if (!isDirty) setForm((current) => ({
        ...current,
        ...(data.profile ? { profile: data.profile } : {}),
        ...(data.services ? { services: data.services } : {}),
        ...(data.tables ? { tables: data.tables } : {}),
        ...(data.menu ? { menu: data.menu } : {}),
        ...(data.payments ? { payments: data.payments } : {}),
        ...(data.orders ? { orders: data.orders } : {}),
      }));
      const resume = setupMeta.findIndex((item) => item.key === data.current_step);
      if (resume >= 0) setStep(resume as SetupStepIndex);
    });
  }, [setupQuery.data, orgID, branchID, hydratedScope, isDirty]);

  useEffect(() => {
    stepHeadingRef.current?.focus();
  }, [step]);

  if (state.status === 'loading')
    return <Loading>{t('organization.checkingAccount')}</Loading>;
  if (state.status !== 'authenticated')
    return (
      <Card className="tenant-page">
        <h1>{t('organization.setUpStore')}</h1>
        <p>{t('organization.signInWithTheRecipientSEmail')}</p>
        <Link className="button" to="/login?returnTo=%2Fsetup">{t('auth.signIn')}</Link>
        <Link className="button button-secondary" to="/register">{t('organization.registerAccount')}</Link>
      </Card>
    );
  if (tenant.loading)
    return <Loading>{t('organization.checkingStoreModeAndAccess')}</Loading>;
  if (tenant.error)
    return (
      <div className="tenant-page">
        <ErrorMessage message={localize(tenant.error)} />
        <Button onClick={() => void tenant.refresh()}>{t('organization.refreshPermissions')}</Button>
      </div>
    );
  if (
    (tenant.context && tenant.context.membership.role !== 'OWNER') ||
    (!tenant.context && tenant.storeMode !== 'multi')
  ) return <Navigate to="/account" replace />;
  if (setupQuery.data?.complete)
    return <Navigate to="/manage/dashboard" replace />;

  const localIncomplete = localReadiness(form);
  const readinessItems = serverState?.readiness?.incomplete ?? localIncomplete;
  const isReady = Boolean(hydratedScope === `${orgID}:${branchID}` && serverState?.readiness?.ready && !setupQuery.isError && !isDirty);
  const update = <Key extends keyof SetupFormState>(key: Key, value: SetupFormState[Key]) => {
    setIsDirty(true);
    setForm((current) => ({ ...current, [key]: value }));
    setError('');
  };
  const validationMessage = () => {
    if (step === 0) {
      const { organization } = form.profile;
      if (!organization.name.trim()) return 'กรอกชื่อร้านให้ครบ';
      if (!organization.business_type.trim()) return 'กรอกประเภทร้านให้ครบ';
    }
    if (step === 1 && !Object.values(form.services.service_modes).some(Boolean)) return 'เลือกช่องทางบริการอย่างน้อยหนึ่งรูปแบบ';
    if (step === 2 && (!form.tables.zones[0]?.name.trim() || !form.tables.tables[0]?.name.trim() || !Number.isSafeInteger(form.tables.tables[0]?.seats) || form.tables.tables[0].seats < 1)) return 'กรอกชื่อโซน โต๊ะ และจำนวนที่นั่งให้ครบ';
    if (step === 3 && (!form.menu.categories[0]?.name.trim() || !form.menu.items[0]?.name.trim() || !decimalValid(form.menu.items[0]?.price ?? ''))) return 'กรอกหมวดหมู่ เมนู และราคาที่ถูกต้อง';
    if (step === 4 && !form.payments.cash && !form.payments.bank_transfer) return 'เลือกช่องทางรับชำระอย่างน้อยหนึ่งช่องทาง';
    if (step === 5 && localReadiness(form).some((item) => item.key === 'orders')) return 'VAT และค่าบริการต้องอยู่ระหว่าง 0 ถึง 100';
    return '';
  };
  const downloadIssuedTokens = () => {
    const payload = JSON.stringify(issuedTokens, null, 2);
    let objectURL: string | null = null;
    try {
      objectURL = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = objectURL;
      link.download = 'table-qr-secrets.json';
      link.click();
      if (activeRef.current) setCopyStatus('ดาวน์โหลดแล้ว');
    } catch {
      if (activeRef.current) setCopyStatus('ดาวน์โหลดไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      if (objectURL) {
        const issuedURL = objectURL;
        setTimeout(() => {
          try {
            URL.revokeObjectURL(issuedURL);
          } catch {
            if (activeRef.current) setCopyStatus('ดาวน์โหลดไม่สำเร็จ กรุณาลองใหม่');
          }
        }, 0);
      }
    }
  };
  const saveStep = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (step === 6) {
      if (!isReady) {
        setError('ยังมีรายการที่ต้องทำให้ครบก่อนเปิดใช้งานร้าน');
        return;
      }
      if (!setupContext) {
        setError('ไม่พบองค์กรหรือสาขาที่ใช้งาน กรุณาโหลดข้อมูลร้านใหม่');
        return;
      }
      setPending(true);
      if (completionRef.current.orgID !== setupContext.organizationID)
        completionRef.current = { key: setupKey(), orgID: setupContext.organizationID };
      try {
        const result = await completeSetup(setupContext, state.session.csrf_token, completionRef.current.key);
        if (!activeRef.current) return;
        if (!result.ready) {
          setError('เซิร์ฟเวอร์ยังไม่ยืนยันความพร้อมของร้าน กรุณาตรวจสอบรายการอีกครั้ง');
          await setupQuery.refetch();
          return;
        }
        await tenant.refresh();
        if (!activeRef.current) return;
        navigate(result.dashboard || '/manage/dashboard', { replace: true });
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : 'เปิดใช้งานร้านไม่สำเร็จ กรุณาลองใหม่');
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
    try {
      let requestContext = setupContext;
      if (step === 0 && !tenant.context) {
        if (tenant.storeMode !== 'multi') throw new Error(t('organization.singleStoreModeDoesNotAllowAdditional'));
        const { name, business_type, contact_email, contact_phone, address } = form.profile.organization;
        const payload = { name, business_type, contact_email, contact_phone, address };
        const encoded = JSON.stringify(payload);
        if (creationRef.current.payload !== encoded)
          creationRef.current = { key: setupKey(), payload: encoded };
        let nextContext = setupContext;
        if (!nextContext) {
          const result = await createOrganization(payload, state.session.csrf_token, creationRef.current.key);
          if (!activeRef.current) return;
          nextContext = {
            organizationID: result.organization.id,
            branchID: result.branches?.[0]?.id ?? tenant.branchID,
          };
          setCreatedContext(nextContext);
        }
        requestContext = nextContext;
      }
      const stepKey = (['profile', 'services', 'tables', 'menu', 'payments', 'orders'] as const)[step];
      const cleanOrg = { ...form.profile.organization };
      delete cleanOrg.description;
      const stepPayload = stepKey === 'profile'
        ? { ...form.profile, organization: cleanOrg, service_modes: form.services.service_modes }
        : form[stepKey];
      if (stepKey === 'tables') {
        setIssuedTokens([]);
        setCopyStatus('');
      }
      const encodedStep = JSON.stringify({ step: stepKey, payload: stepPayload });
      if (stepRetryRef.current.step !== stepKey || stepRetryRef.current.payload !== encodedStep)
        stepRetryRef.current = { step: stepKey, payload: encodedStep, key: setupKey() };
      if (!requestContext) throw new Error('ไม่พบองค์กรหรือสาขาที่ใช้งาน กรุณาโหลดข้อมูลร้านใหม่');
      const result = await saveSetupStep(stepKey, stepPayload, requestContext, state.session.csrf_token, stepRetryRef.current.key);
      if (!activeRef.current) return;
      const { issued_table_qr_tokens, ...safeResult } = result;
      if (stepKey === 'tables') setIssuedTokens(issued_table_qr_tokens ?? []);
      if (step === 0 && !tenant.context) {
        await tenant.refresh();
        if (!activeRef.current) return;
        tenant.select(requestContext.organizationID, requestContext.branchID);
      }
      setIsDirty(false);
      setServerState(safeResult);
      await queryClient.invalidateQueries({ queryKey: ['restaurant-setup'] });
      if (!activeRef.current) return;
      setStep((current) => (current + 1) as SetupStepIndex);
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'บันทึกขั้นตอนไม่สำเร็จ กรุณาลองใหม่';
      setError(step === 2 ? `${message} สถานะการหมุนเวียนรหัสอาจไม่แน่นอน กรุณาลองคำขอเดิมอีกครั้ง และตรวจสอบว่ารหัสที่ได้รับยังเป็นรหัสล่าสุด` : message);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="setup-page-wrapper">
      <main className="setup-page" aria-labelledby="setup-title">
        <header>
          <StandardPageHeader
            icon={<Store size={26} />}
            title={<span id="setup-title">เริ่มต้นใช้งานร้านอาหาร</span>}
            description="ตั้งค่าร้านอาหารครั้งแรกเพื่อเริ่มใช้งานร้านของคุณ"
          />
        </header>

        {tenant.organizations.length > 0 && !tenant.context && (
          <Card className="setup-existing-card">
            <div><strong>มีร้านที่เข้าถึงได้อยู่แล้ว</strong><p>เลือกร้านเพื่อตรวจสอบการตั้งค่า</p></div>
            <div className="tenant-actions">
              {tenant.organizations.map((item) => <Button key={item.id} className="button-secondary" onClick={() => tenant.select(item.id)}>{item.name}</Button>)}
            </div>
          </Card>
        )}
        {setupQuery.error && <ErrorMessage message={setupQuery.error.message} />}

        <div className="setup-layout">
          <aside className="card setup-rail" aria-label="ความคืบหน้าการตั้งค่า">
            <div className="setup-rail-header">
              <h2 className="setup-rail-title">ขั้นตอนตั้งค่าร้าน</h2>
              <p className="setup-rail-subtitle">ตั้งค่า 7 ขั้นตอน เพื่อเริ่มใช้งานร้านอาหาร</p>
            </div>
            <div className="setup-stepper-container">
              <div className="setup-stepper-line" aria-hidden="true" />
              <ol className="setup-stepper-list">
                {setupMeta.map((item, index) => {
                  const StepIcon = item.icon;
                  const complete = index < step || Boolean(serverState?.steps?.find((entry) => entry.key === item.key)?.complete);
                  const isActive = index === step;
                  return (
                    <li key={item.key} className={`setup-step-item ${isActive ? 'is-active' : ''} ${complete ? 'is-complete' : ''}`}>
                      <button
                        type="button"
                        onClick={() => index <= step && setStep(index as SetupStepIndex)}
                        disabled={pending || index > step}
                        aria-current={isActive ? 'step' : undefined}
                        className="setup-step-button"
                      >
                        <span className="setup-step-circle">
                          {complete && !isActive ? <Check size={14} strokeWidth={3} aria-hidden="true" /> : index + 1}
                        </span>
                        <span className="setup-step-icon" aria-hidden="true">
                          <StepIcon size={22} strokeWidth={1.8} />
                        </span>
                        <div className="setup-step-text">
                          <strong className="setup-step-name">{item.label}</strong>
                          <small className="setup-step-desc">{item.sidebarSubtitle}</small>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          </aside>

          <section className="setup-main">
            <Card className="setup-card">
              <div className="setup-card-top-row">
                <span className="setup-step-pill">ขั้นตอนที่ {step + 1} จาก 7</span>
              </div>
              <div className="setup-card-heading">
                <div className="setup-card-heading-left">
                  <span className="setup-card-icon-squircle" aria-hidden="true">
                    {(() => {
                      const Icon = setupMeta[step].icon;
                      return <Icon size={24} strokeWidth={2} />;
                    })()}
                  </span>
                  <div>
                    <h2 ref={stepHeadingRef} tabIndex={-1} className="setup-card-title">
                      {setupMeta[step].label}
                    </h2>
                    <p className="setup-card-subtitle">{setupMeta[step].cardSubtitle}</p>
                  </div>
                </div>
              </div>

              {setupQuery.isPending && orgID && <Loading>กำลังโหลดความคืบหน้าที่บันทึกไว้…</Loading>}
              {setupQuery.error && (
                <div className="setup-retry">
                  <CircleAlert size={18} aria-hidden="true" />
                  <span>{hydratedScope ? 'โหลดความคืบหน้าไม่สำเร็จ คุณยังกรอกข้อมูลต่อได้' : 'โหลดความคืบหน้าไม่สำเร็จ กรุณาลองใหม่ก่อนแก้ไขข้อมูล'}</span>
                  <Button className="button-secondary" onClick={() => void setupQuery.refetch()}>ลองใหม่</Button>
                </div>
              )}

              <form noValidate onSubmit={(event) => void saveStep(event)}>
                <fieldset disabled={pending || (Boolean(setupContext) && !hydratedScope)}>
                  {step < 6 ? (
                    <SetupStepFields step={step} form={form} update={update} promptPayAvailable={Boolean(serverState?.capabilities.promptPay)} />
                  ) : (
                    <>
                      <ReadinessReview items={readinessItems} form={form} ready={isReady} />
                      <ul>{readinessItems.map((item, index) => <li key={`${item.key}-${index}`}>{item.label}: {item.reason}</li>)}</ul>
                    </>
                  )}
                  {issuedTokens.length > 0 && (
                    <section aria-labelledby="issued-table-tokens">
                      <h3 id="issued-table-tokens">รหัสลับ QR โต๊ะที่ออกให้</h3>
                      <p>เก็บรหัสลับนี้อย่างปลอดภัย คัดลอกหรือดาวน์โหลดก่อนออกจากหน้านี้ รหัสจากการส่งคำขอเดิมซ้ำอาจใช้ไม่ได้หากมีการหมุนเวียนภายหลัง</p>
                      <label className="tenant-field setup-field"><span>รหัสลับโต๊ะ</span><textarea readOnly rows={5} value={JSON.stringify(issuedTokens, null, 2)} /></label>
                      <div className="tenant-actions">
                        <Button className="button-secondary" onClick={() => { void (async () => { try { await navigator.clipboard.writeText(JSON.stringify(issuedTokens, null, 2)); if (activeRef.current) setCopyStatus('คัดลอกแล้ว'); } catch { if (activeRef.current) setCopyStatus('คัดลอกไม่สำเร็จ กรุณาเลือกข้อความเพื่อคัดลอก'); } })(); }}>คัดลอกรหัสลับ</Button>
                        <Button className="button-secondary" onClick={downloadIssuedTokens}>ดาวน์โหลดรหัสลับ</Button>
                      </div>
                      <p role="status">{copyStatus}</p>
                    </section>
                  )}
                  {error && <ErrorMessage message={localize(error)} />}
                  <div className="setup-actions">
                    <Button
                      type="button"
                      className="button-secondary setup-btn-back"
                      onClick={() => { setError(''); setStep((current) => Math.max(0, current - 1) as SetupStepIndex); }}
                      disabled={step === 0 || pending}
                    >
                      <ArrowLeft size={16} aria-hidden="true" /> ย้อนกลับ
                    </Button>
                    <Button
                      type="submit"
                      className="setup-btn-next"
                      disabled={pending || (Boolean(setupContext) && setupQuery.isPending) || (step === 6 && !isReady)}
                    >
                      {pending ? 'กำลังบันทึก…' : step === 6 ? 'เปิดใช้งานร้าน' : 'บันทึกและถัดไป'}
                      {step === 6 ? <CheckCircle2 size={16} aria-hidden="true" /> : <ArrowRight size={16} aria-hidden="true" />}
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

function ReadinessReview({ items, form, ready }: { items: SetupReadinessItem[]; form: SetupFormState; ready: boolean }) {
  const checks = [
    { key: 'profile', label: 'ข้อมูลร้าน', done: !items.some((item) => item.key === 'profile'), detail: form.profile.organization.name || 'ยังไม่ได้ระบุชื่อร้าน' },
    { key: 'tables', label: 'พื้นที่และโต๊ะ', done: !items.some((item) => item.key === 'tables'), detail: `${form.tables.zones[0]?.name || 'ยังไม่มีโซน'} · ${form.tables.tables[0]?.name || 'ยังไม่มีโต๊ะ'}` },
    { key: 'menu', label: 'เมนูและราคา', done: !items.some((item) => item.key === 'menu'), detail: form.menu.items[0]?.name || 'ยังไม่มีเมนู' },
    { key: 'payments', label: 'ช่องทางการชำระเงิน', done: !items.some((item) => item.key === 'payments'), detail: form.payments.cash ? 'เงินสด' : form.payments.bank_transfer ? 'โอนเงิน' : 'ยังไม่ได้เลือก' },
    { key: 'orders', label: 'การสั่งซื้อและค่าบริการ', done: !items.some((item) => item.key === 'orders'), detail: `VAT ${form.orders.vat_percent}% · ค่าบริการ ${form.orders.service_charge_percent}%` },
  ];
  return <div className="setup-review"><div className={`setup-readiness-banner ${ready ? 'is-ready' : ''}`}><span>{ready ? <CheckCircle2 size={22} aria-hidden="true" /> : <CircleAlert size={22} aria-hidden="true" />}</span><div><strong>{ready ? 'ร้านพร้อมเปิดใช้งาน' : 'ยังตั้งค่าไม่ครบ'}</strong><p>{ready ? 'ข้อมูลสำคัญครบแล้ว ตรวจสอบรายการด้านล่างก่อนเปิดร้าน' : 'แก้ไขรายการที่ยังไม่พร้อม แล้วกลับมาที่หน้านี้อีกครั้ง'}</p></div></div><div className="setup-checklist" aria-label="รายการตรวจความพร้อม">{checks.map((check) => <div className={`setup-check ${check.done ? 'is-done' : ''}`} key={check.key}><span>{check.done ? <Check size={16} aria-hidden="true" /> : <CircleAlert size={16} aria-hidden="true" />}</span><div><strong>{check.label}</strong><small>{check.done ? check.detail : items.find((item) => item.key === check.key)?.reason}</small></div><Tag tone={check.done ? 'success' : 'amber'}>{check.done ? 'พร้อม' : 'ต้องแก้ไข'}</Tag></div>)}</div><p className="setup-review-note"><LayoutGrid size={16} aria-hidden="true" /> หลังเปิดใช้งาน คุณยังแก้ไขรายละเอียดร้าน เมนู และการตั้งค่าได้จากแดชบอร์ด</p></div>;
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
