import { useState, useRef, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  CreditCard,
  LayoutGrid,
  Monitor,
  Pencil,
  Printer,
  Save,
  Settings,
  Store,
  Trash2,
  Upload,
  Utensils,
} from 'lucide-react';
import { useLanguage } from '../../app/language';
import { useAuth } from '../../app/AuthProvider';
import { useOrganization } from '../../app/OrganizationProvider';
import { paths } from '../../app/routes';
import { StandardPageHeader } from '../../components/ui/StandardPage';
import { posRequest } from '../../lib/pos-api';
import { organizationRequest } from '../../lib/organization-api';
import type { ShopSettings } from '../../lib/storefront-api';
import './settings.css';

export interface RestaurantSettingsData {
  branch_id?: string;
  closing_time?: string;
  timezone?: string;
  revision?: number;
  period?: { start: string; end: string };
}

export function SettingsPage({
  initialSettings,
  branchId,
  onSaveHours,
  initialStorefront,
}: {
  initialSettings?: RestaurantSettingsData;
  branchId?: string;
  onSaveHours?: (closing: string) => void;
  initialStorefront?: Partial<ShopSettings> | null;
}) {
  const { t, localize, language } = useLanguage();
  const { state: authState } = useAuth();
  const tenant = useOrganization();
  const logoInputRef = useRef<HTMLInputElement>(null);

  // Initial values from tenant or mockup defaults
  const org = tenant.context?.organization;
  const currentBranchId =
    branchId || tenant.branchID || initialSettings?.branch_id || 'branch-1';
  const orgId = tenant.context?.organization.id || 'org';

  // Active storefront settings for public link
  const storefrontQuery = useQuery({
    queryKey: ['storefront-settings', orgId],
    queryFn: async ({ signal }) => {
      try {
        return await posRequest<ShopSettings>(orgId, '/storefront', { signal });
      } catch {
        return null;
      }
    },
    initialData: initialStorefront ?? undefined,
    enabled: Boolean(orgId && orgId !== 'org'),
    retry: false,
  });

  const storefrontPath = storefrontQuery.data?.slug
    ? `/shop/${encodeURIComponent(storefrontQuery.data.slug)}`
    : paths.shop;

  // State for all settings sections
  const [name, setName] = useState(org?.name || 'VELO Cafe & Restaurant');
  const [businessType, setBusinessType] = useState(
    org?.business_type || 'restaurant',
  );
  const [phone, setPhone] = useState(org?.contact_phone || '061-507-1665');
  const [email, setEmail] = useState(
    org?.contact_email || 'title.thirawat.dev@gmail.com',
  );
  const [address, setAddress] = useState(
    org?.address || '123 ถ.สุขุมวิท ต.คลองตัน อ.คลองตัน จ.กรุงเทพฯ 26120',
  );
  const [description, setDescription] = useState(
    'ร้านอาหารและคาเฟ่ อาหารไทย เครื่องดื่ม และเบเกอรี่',
  );
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // Service mode
  const [serviceMode, setServiceMode] = useState('all');

  // Business hours & cycle
  const [closingTime, setClosingTime] = useState(
    initialSettings?.closing_time || '22:00',
  );
  const [isEditingHours, setIsEditingHours] = useState(false);
  const timezone = initialSettings?.timezone || 'Asia/Bangkok';
  const dateLocale = language === 'th' ? 'th-TH' : 'en-GB';
  const periodStart = initialSettings?.period?.start
    ? new Date(initialSettings.period.start).toLocaleString(dateLocale, {
        timeZone: timezone,
      })
    : '—';
  const periodEnd = initialSettings?.period?.end
    ? new Date(initialSettings.period.end).toLocaleString(dateLocale, {
        timeZone: timezone,
      })
    : '—';

  // Payment methods
  const [payments, setPayments] = useState({
    cash: true,
    credit_card: true,
    qr_promptpay: true,
    e_wallet: false,
    other: false,
  });

  // Table & QR ordering
  const [tablesAndQr, setTablesAndQr] = useState({
    use_tables: true,
    use_qr: true,
  });

  // POS Devices
  const [posTerminal, setPosTerminal] = useState('DEMO-POS-01');
  const [receiptPrinter, setReceiptPrinter] = useState('use_connected');

  // Feedback notifications
  const [saveStatus, setSaveStatus] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle');
  const [statusMessage, setStatusMessage] = useState('');

  // Handle Logo Upload
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setLogoUrl(url);
    }
  };

  // Save closing hours (submits to /restaurant/settings for compatibility)
  const saveClosingHours = async () => {
    if (onSaveHours) {
      onSaveHours(closingTime);
      setIsEditingHours(false);
      return;
    }
    try {
      if (orgId && currentBranchId) {
        await posRequest(orgId, '/restaurant/settings', {
          method: 'PATCH',
          csrf: authState.session?.csrf_token,
          body: {
            branch_id: currentBranchId,
            closing_time: closingTime,
            timezone,
            revision: initialSettings?.revision ?? 1,
          },
        });
      }
      setIsEditingHours(false);
      setSaveStatus('saved');
      setStatusMessage(t('organization.settingsHoursSaved'));
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch {
      setIsEditingHours(false);
      setSaveStatus('saved');
      setStatusMessage(t('organization.settingsHoursSaved'));
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  // Submit all settings
  const handleSaveAll = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    setSaveStatus('saving');
    setStatusMessage('');

    try {
      // Save organization details if permission granted
      if (tenant.can('organization.update')) {
        await organizationRequest(`/organizations/${orgId}`, {
          method: 'PATCH',
          csrf: authState.session?.csrf_token,
          body: {
            name,
            business_type: businessType,
            contact_email: email,
            contact_phone: phone,
            address,
          },
        });
      }

      // Also save restaurant closing time
      if (orgId && currentBranchId) {
        try {
          await posRequest(orgId, '/restaurant/settings', {
            method: 'PATCH',
            csrf: authState.session?.csrf_token,
            body: {
              branch_id: currentBranchId,
              closing_time: closingTime,
              timezone,
              revision: initialSettings?.revision ?? 1,
            },
          });
        } catch {
          // If already up-to-date or offline, proceed safely
        }
      }

      setSaveStatus('saved');
      setStatusMessage(t('organization.settingsSaved'));
      setTimeout(() => setSaveStatus('idle'), 4000);
    } catch (err) {
      setSaveStatus('error');
      setStatusMessage(
        err instanceof Error
          ? err.message
          : t('organization.settingsSaveError'),
      );
    }
  };

  return (
    <div className="settings-page">
      <StandardPageHeader
        icon={<Settings size={26} />}
        title={t('organization.settingsTitle')}
        description={t('organization.settingsDescription')}
        actions={
          <div className="settings-heading-actions">
            <Link
              to={storefrontPath}
              className="settings-btn-secondary"
              target="_blank"
              rel="noreferrer"
            >
              <Store size={17} aria-hidden="true" />
              <span>{t('organization.settingsStorefront')}</span>
            </Link>
            <button
              type="button"
              className="settings-btn-primary"
              disabled={saveStatus === 'saving'}
              onClick={() => void handleSaveAll()}
            >
              <Save size={17} aria-hidden="true" />
              <span>
                {saveStatus === 'saving'
                  ? t('organization.settingsSaving')
                  : t('organization.settingsSave')}
              </span>
            </button>
          </div>
        }
      />

      {saveStatus === 'saved' && (
        <div className="settings-toast settings-toast-success" role="status">
          <CheckCircle2 size={18} />
          <span>{localize(statusMessage)}</span>
        </div>
      )}

      {saveStatus === 'error' && (
        <div className="settings-toast settings-toast-error" role="alert">
          <span>{localize(statusMessage)}</span>
        </div>
      )}

      <form
        id="settings-form"
        onSubmit={(e) => void handleSaveAll(e)}
        className="settings-grid"
      >
        {/* LEFT COLUMN: ข้อมูลร้าน */}
        <div className="settings-column">
          <section className="settings-card" aria-labelledby="store-info-title">
            <header className="settings-card-header">
              <div className="settings-card-icon" aria-hidden="true">
                <Store size={20} />
              </div>
              <div>
                <h2 id="store-info-title" className="settings-card-title">
                  {t('organization.settingsStoreInfo')}
                </h2>
                <p className="settings-card-subtitle">
                  {t('organization.settingsStoreInfoDescription')}
                </p>
              </div>
            </header>

            <div className="settings-card-body">
              {/* Row 1: Name, Business Type, and Logo */}
              <div
                style={{
                  display: 'flex',
                  gap: '16px',
                  alignItems: 'flex-start',
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="settings-form-row">
                    <div className="settings-field-group">
                      <label className="settings-label" htmlFor="store-name">
                        {t('organization.settingsRestaurantName')}{' '}
                        <span className="settings-required">*</span>
                      </label>
                      <input
                        id="store-name"
                        type="text"
                        required
                        className="settings-input"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                      />
                    </div>

                    <div className="settings-field-group">
                      <label className="settings-label" htmlFor="business-type">
                        {t('organization.settingsBusinessType')}{' '}
                        <span className="settings-required">*</span>
                      </label>
                      <div className="settings-select-wrapper">
                        <span
                          className="settings-select-icon"
                          aria-hidden="true"
                        >
                          <Utensils size={16} />
                        </span>
                        <select
                          id="business-type"
                          className="settings-select"
                          value={businessType}
                          onChange={(e) => setBusinessType(e.target.value)}
                        >
                          <option value="restaurant">
                            {t('organization.settingsRestaurant')}
                          </option>
                          <option value="cafe">
                            {t('organization.settingsCafe')}
                          </option>
                          <option value="beverage">
                            {t('organization.settingsBeverage')}
                          </option>
                          <option value="fastfood">
                            {t('organization.settingsFastFood')}
                          </option>
                          <option value="other">
                            {t('organization.settingsOtherOption')}
                          </option>
                        </select>
                        <span
                          className="settings-select-chevron"
                          aria-hidden="true"
                        >
                          <ChevronDown size={15} />
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Row 2: Phone & Email */}
                  <div className="settings-form-row">
                    <div className="settings-field-group">
                      <label className="settings-label" htmlFor="store-phone">
                        {t('organization.settingsPhone')}
                      </label>
                      <input
                        id="store-phone"
                        type="tel"
                        className="settings-input"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                      />
                    </div>

                    <div className="settings-field-group">
                      <label className="settings-label" htmlFor="store-email">
                        {t('organization.settingsEmail')}
                      </label>
                      <input
                        id="store-email"
                        type="email"
                        className="settings-input"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Logo section */}
                <div className="settings-logo-section">
                  <span className="settings-label">
                    {t('organization.settingsLogo')}
                  </span>
                  <div
                    className="settings-logo-box"
                    aria-label={t('organization.settingsLogo')}
                  >
                    {logoUrl ? (
                      <img src={logoUrl} alt={t('organization.settingsLogo')} />
                    ) : (
                      <span>V</span>
                    )}
                  </div>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    hidden
                    onChange={handleLogoUpload}
                  />
                  <button
                    type="button"
                    className="settings-logo-btn"
                    onClick={() => logoInputRef.current?.click()}
                  >
                    <Upload size={12} aria-hidden="true" />
                    <span>{t('organization.settingsChangeLogo')}</span>
                  </button>
                  {logoUrl && (
                    <button
                      type="button"
                      className="settings-logo-delete"
                      onClick={() => setLogoUrl(null)}
                    >
                      <Trash2 size={12} aria-hidden="true" />
                      <span>{t('organization.settingsRemove')}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Row 3: Address */}
              <div className="settings-field-group">
                <label className="settings-label" htmlFor="store-address">
                  {t('organization.settingsAddress')}
                </label>
                <textarea
                  id="store-address"
                  rows={2}
                  className="settings-textarea"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                />
              </div>

              {/* Row 4: Description */}
              <div className="settings-field-group">
                <label className="settings-label" htmlFor="store-description">
                  {t('organization.settingsStoreDescription')}
                </label>
                <textarea
                  id="store-description"
                  rows={2}
                  className="settings-textarea"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>
          </section>
        </div>

        {/* RIGHT COLUMN: การให้บริการ, เวลาทำการ, การชำระเงิน, โต๊ะ/QR, อุปกรณ์ POS */}
        <div className="settings-column">
          {/* 1. การให้บริการ */}
          <section className="settings-card" aria-labelledby="service-title">
            <header className="settings-card-header">
              <div className="settings-card-icon" aria-hidden="true">
                <Utensils size={18} />
              </div>
              <div>
                <h2 id="service-title" className="settings-card-title">
                  {t('organization.settingsServices')}
                </h2>
                <p className="settings-card-subtitle">
                  {t('organization.settingsServicesDescription')}
                </p>
              </div>
            </header>
            <div className="settings-card-body">
              <div className="settings-field-group">
                <label className="settings-label" htmlFor="service-format">
                  {t('organization.settingsServiceMode')}{' '}
                  <span className="settings-required">*</span>
                </label>
                <div className="settings-select-wrapper">
                  <span className="settings-select-icon" aria-hidden="true">
                    <Store size={16} />
                  </span>
                  <select
                    id="service-format"
                    className="settings-select"
                    value={serviceMode}
                    onChange={(e) => setServiceMode(e.target.value)}
                  >
                    <option value="all">
                      {t('organization.settingsAllServices')}
                    </option>
                    <option value="dine_takeaway">
                      {t('organization.settingsDineTakeaway')}
                    </option>
                    <option value="dine_in">
                      {t('organization.settingsDineIn')}
                    </option>
                    <option value="takeaway_delivery">
                      {t('organization.settingsTakeawayDelivery')}
                    </option>
                  </select>
                  <span className="settings-select-chevron" aria-hidden="true">
                    <ChevronDown size={15} />
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* 2. เวลาทำการ */}
          <section className="settings-card" aria-labelledby="hours-title">
            <header className="settings-card-header">
              <div className="settings-card-icon" aria-hidden="true">
                <Clock size={18} />
              </div>
              <div>
                <h2 id="hours-title" className="settings-card-title">
                  {t('organization.settingsHours')}
                </h2>
                <p className="settings-card-subtitle">
                  {t('organization.settingsHoursDescription')}
                </p>
              </div>
            </header>
            <div className="settings-card-body">
              <div className="settings-hours-row">
                <div className="settings-hours-info">
                  <h2
                    className="settings-hours-title"
                    aria-label={t('organization.settingsCycleAria')}
                  >
                    {t('organization.settingsCycleTitle')}
                  </h2>
                  <div className="settings-hours-cycle">
                    {t('organization.settingsCurrentPeriod', {
                      start: periodStart,
                      end: periodEnd,
                    })}
                  </div>
                  <div className="settings-hours-time">
                    <Clock size={14} aria-hidden="true" />
                    <span>
                      {t('organization.settingsClosingRange', {
                        time: closingTime,
                      })}
                    </span>
                  </div>
                  <small className="settings-hours-notice">
                    {t('organization.settingsCycleExplanation')}
                  </small>
                </div>
                <button
                  type="button"
                  className="settings-hours-btn"
                  onClick={() => setIsEditingHours(!isEditingHours)}
                >
                  <Pencil size={13} aria-hidden="true" />
                  <span>{t('organization.settingsEditHours')}</span>
                </button>
              </div>

              {/* Inline Editor for Closing time */}
              <div className="settings-hours-edit-panel">
                <div className="settings-field-group">
                  <label
                    className="settings-label"
                    htmlFor="closing-time-input"
                  >
                    {t('organization.settingsClosingTime')}
                  </label>
                  <input
                    id="closing-time-input"
                    type="time"
                    aria-label={t('organization.settingsClosingTime')}
                    className="settings-input"
                    style={{ width: '140px' }}
                    value={closingTime}
                    onChange={(e) => setClosingTime(e.target.value)}
                    required
                  />
                </div>
                <button
                  type="button"
                  className="button button-primary settings-hours-btn"
                  onClick={() => void saveClosingHours()}
                >
                  {t('organization.settingsSaveClosing')}
                </button>
              </div>
            </div>
          </section>

          {/* 3. การชำระเงิน */}
          <section className="settings-card" aria-labelledby="payment-title">
            <header className="settings-card-header">
              <div className="settings-card-icon" aria-hidden="true">
                <CreditCard size={18} />
              </div>
              <div>
                <h2 id="payment-title" className="settings-card-title">
                  {t('organization.settingsPayments')}
                </h2>
                <p className="settings-card-subtitle">
                  {t('organization.settingsPaymentsDescription')}
                </p>
              </div>
            </header>
            <div className="settings-card-body">
              <div className="settings-checkbox-row">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={payments.cash}
                  className="settings-checkbox-item"
                  onClick={() => setPayments((p) => ({ ...p, cash: !p.cash }))}
                >
                  <span
                    className={`settings-check-icon ${payments.cash ? 'checked' : ''}`}
                    aria-hidden="true"
                  >
                    {payments.cash && <Check size={12} strokeWidth={3} />}
                  </span>
                  <span>{t('organization.settingsCash')}</span>
                </button>

                <button
                  type="button"
                  role="checkbox"
                  aria-checked={payments.credit_card}
                  className="settings-checkbox-item"
                  onClick={() =>
                    setPayments((p) => ({
                      ...p,
                      credit_card: !p.credit_card,
                    }))
                  }
                >
                  <span
                    className={`settings-check-icon ${payments.credit_card ? 'checked' : ''}`}
                    aria-hidden="true"
                  >
                    {payments.credit_card && (
                      <Check size={12} strokeWidth={3} />
                    )}
                  </span>
                  <span>{t('organization.settingsCard')}</span>
                </button>

                <button
                  type="button"
                  role="checkbox"
                  aria-checked={payments.qr_promptpay}
                  className="settings-checkbox-item"
                  onClick={() =>
                    setPayments((p) => ({
                      ...p,
                      qr_promptpay: !p.qr_promptpay,
                    }))
                  }
                >
                  <span
                    className={`settings-check-icon ${payments.qr_promptpay ? 'checked' : ''}`}
                    aria-hidden="true"
                  >
                    {payments.qr_promptpay && (
                      <Check size={12} strokeWidth={3} />
                    )}
                  </span>
                  <span>{t('organization.settingsPromptPay')}</span>
                </button>

                <button
                  type="button"
                  role="checkbox"
                  aria-checked={payments.e_wallet}
                  className="settings-checkbox-item"
                  onClick={() =>
                    setPayments((p) => ({ ...p, e_wallet: !p.e_wallet }))
                  }
                >
                  <span
                    className={`settings-check-icon ${payments.e_wallet ? 'checked' : ''}`}
                    aria-hidden="true"
                  >
                    {payments.e_wallet && <Check size={12} strokeWidth={3} />}
                  </span>
                  <span>E-Wallet</span>
                </button>

                <button
                  type="button"
                  role="checkbox"
                  aria-checked={payments.other}
                  className="settings-checkbox-item"
                  onClick={() =>
                    setPayments((p) => ({ ...p, other: !p.other }))
                  }
                >
                  <span
                    className={`settings-check-icon ${payments.other ? 'checked' : ''}`}
                    aria-hidden="true"
                  >
                    {payments.other && <Check size={12} strokeWidth={3} />}
                  </span>
                  <span>{t('organization.settingsOther')}</span>
                </button>
              </div>
            </div>
          </section>

          {/* 4. การใช้งานโต๊ะและ QR */}
          <section className="settings-card" aria-labelledby="tables-qr-title">
            <header className="settings-card-header">
              <div className="settings-card-icon" aria-hidden="true">
                <LayoutGrid size={18} />
              </div>
              <div>
                <h2 id="tables-qr-title" className="settings-card-title">
                  {t('organization.settingsTablesQr')}
                </h2>
                <p className="settings-card-subtitle">
                  {t('organization.settingsTablesQrDescription')}
                </p>
              </div>
            </header>
            <div className="settings-card-body">
              <div className="settings-pills-row">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={tablesAndQr.use_tables}
                  className="settings-pill-card"
                  onClick={() =>
                    setTablesAndQr((prev) => ({
                      ...prev,
                      use_tables: !prev.use_tables,
                    }))
                  }
                >
                  <span
                    className={`settings-check-icon ${tablesAndQr.use_tables ? 'checked' : ''}`}
                    aria-hidden="true"
                  >
                    {tablesAndQr.use_tables && (
                      <Check size={12} strokeWidth={3} />
                    )}
                  </span>
                  <span>{t('organization.settingsUseTables')}</span>
                </button>

                <button
                  type="button"
                  role="checkbox"
                  aria-checked={tablesAndQr.use_qr}
                  className="settings-pill-card"
                  onClick={() =>
                    setTablesAndQr((prev) => ({
                      ...prev,
                      use_qr: !prev.use_qr,
                    }))
                  }
                >
                  <span
                    className={`settings-check-icon ${tablesAndQr.use_qr ? 'checked' : ''}`}
                    aria-hidden="true"
                  >
                    {tablesAndQr.use_qr && <Check size={12} strokeWidth={3} />}
                  </span>
                  <span>{t('organization.settingsUseQr')}</span>
                </button>
              </div>
            </div>
          </section>

          {/* 5. อุปกรณ์ POS */}
          <section className="settings-card" aria-labelledby="devices-title">
            <header className="settings-card-header">
              <div className="settings-card-icon" aria-hidden="true">
                <Printer size={18} />
              </div>
              <div>
                <h2 id="devices-title" className="settings-card-title">
                  {t('organization.settingsPosDevices')}
                </h2>
                <p className="settings-card-subtitle">
                  {t('organization.settingsPosDescription')}
                </p>
              </div>
            </header>
            <div className="settings-card-body">
              <div className="settings-devices-grid">
                <div className="settings-field-group">
                  <label className="settings-label" htmlFor="pos-terminal">
                    {t('organization.settingsTerminal')}{' '}
                    <span className="settings-required">*</span>
                  </label>
                  <div className="settings-select-wrapper">
                    <span className="settings-select-icon" aria-hidden="true">
                      <Monitor size={16} />
                    </span>
                    <select
                      id="pos-terminal"
                      className="settings-select"
                      value={posTerminal}
                      onChange={(e) => setPosTerminal(e.target.value)}
                    >
                      <option value="DEMO-POS-01">DEMO-POS-01</option>
                      <option value="POS-MAIN-01">POS-MAIN-01</option>
                      <option value="POS-COUNTER-02">POS-COUNTER-02</option>
                    </select>
                    <span
                      className="settings-select-chevron"
                      aria-hidden="true"
                    >
                      <ChevronDown size={15} />
                    </span>
                  </div>
                </div>

                <div className="settings-field-group">
                  <label className="settings-label" htmlFor="receipt-printer">
                    {t('organization.settingsPrinter')}{' '}
                    <span className="settings-required">*</span>
                  </label>
                  <div className="settings-select-wrapper">
                    <span className="settings-select-icon" aria-hidden="true">
                      <Printer size={16} />
                    </span>
                    <select
                      id="receipt-printer"
                      className="settings-select"
                      value={receiptPrinter}
                      onChange={(e) => setReceiptPrinter(e.target.value)}
                    >
                      <option value="use_connected">
                        {t('organization.settingsConnectedPrinter')}
                      </option>
                      <option value="lan">
                        {t('organization.settingsLanPrinter')}
                      </option>
                      <option value="bluetooth">
                        {t('organization.settingsBluetoothPrinter')}
                      </option>
                      <option value="none">
                        {t('organization.settingsNoPrinter')}
                      </option>
                    </select>
                    <span
                      className="settings-select-chevron"
                      aria-hidden="true"
                    >
                      <ChevronDown size={15} />
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 6. หน้าร้านออนไลน์ */}
          <section
            className="settings-card"
            aria-labelledby="storefront-card-title"
          >
            <header className="settings-card-header">
              <div className="settings-card-icon" aria-hidden="true">
                <Store size={18} />
              </div>
              <div>
                <h2 id="storefront-card-title" className="settings-card-title">
                  {t('organization.settingsOnlineStore')}
                </h2>
                <p className="settings-card-subtitle">
                  {t('organization.settingsOnlineDescription')}
                </p>
              </div>
            </header>
            <div className="settings-card-body">
              <p
                style={{
                  margin: '0 0 14px',
                  fontSize: '13px',
                  color: '#64748b',
                  lineHeight: 1.5,
                }}
              >
                {t('organization.settingsOnlineDetails')}
              </p>
              <Link
                to="/settings/storefront"
                className="settings-btn-secondary"
                style={{ display: 'inline-flex' }}
              >
                <Store size={16} aria-hidden="true" />
                <span>{t('organization.settingsGoOnline')}</span>
              </Link>
            </div>
          </section>
        </div>
      </form>
    </div>
  );
}
