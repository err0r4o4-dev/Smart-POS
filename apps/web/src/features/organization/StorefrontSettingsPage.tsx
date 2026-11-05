import { useState, useRef, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Bike,
  Check,
  CheckCircle2,
  Copy,
  CreditCard,
  Download,
  Save,
  ShoppingBag,
  Store,
  Upload,
  Utensils,
} from 'lucide-react';
import { useOrganization } from '../../app/OrganizationProvider';
import { paths } from '../../app/routes';
import './storefront-settings.css';

// Default cafe interior thumbnail matching authentic POS mockup
const DEFAULT_STORE_THUMBNAIL =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="200" height="144" viewBox="0 0 200 144">
  <defs>
    <linearGradient id="warm" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#4a3728"/>
      <stop offset="100%" stop-color="#2b1d14"/>
    </linearGradient>
    <radialGradient id="light" cx="0.5" cy="0.3" r="0.6">
      <stop offset="0%" stop-color="#fef3c7" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#f59e0b" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="200" height="144" fill="url(#warm)"/>
  <rect x="0" y="70" width="200" height="74" fill="#382415"/>
  <circle cx="60" cy="30" r="45" fill="url(#light)"/>
  <circle cx="140" cy="30" r="45" fill="url(#light)"/>
  <line x1="60" y1="0" x2="60" y2="25" stroke="#fef08a" stroke-width="2"/>
  <polygon points="52,25 68,25 64,35 56,35" fill="#fef08a"/>
  <line x1="140" y1="0" x2="140" y2="25" stroke="#fef08a" stroke-width="2"/>
  <polygon points="132,25 148,25 144,35 136,35" fill="#fef08a"/>
  <rect x="30" y="80" width="60" height="30" rx="3" fill="#854d0e"/>
  <rect x="42" y="110" width="6" height="24" fill="#52300c"/>
  <rect x="72" y="110" width="6" height="24" fill="#52300c"/>
  <rect x="120" y="80" width="60" height="30" rx="3" fill="#854d0e"/>
  <rect x="132" y="110" width="6" height="24" fill="#52300c"/>
  <rect x="162" y="110" width="6" height="24" fill="#52300c"/>
</svg>`);

// Theme color definitions
export const THEME_COLORS = [
  { id: 'yellow', label: 'สีเหลือง', bg: '#facc15' },
  { id: 'red', label: 'สีแดง', bg: '#ef4444' },
  { id: 'green', label: 'สีเขียว', bg: '#22c55e' },
  { id: 'blue', label: 'สีน้ำเงิน', bg: '#3b82f6' },
  { id: 'purple', label: 'สีม่วง', bg: '#a855f7' },
  {
    id: 'gradient',
    label: 'สีเกรเดียนต์',
    bg: 'linear-gradient(135deg, #f43f5e 0%, #ec4899 50%, #facc15 100%)',
  },
] as const;

export interface StorefrontConfig {
  isEnabled: boolean;
  name: string;
  slug: string;
  description: string;
  channels: {
    takeaway: boolean;
    delivery: boolean;
    dineIn: boolean;
  };
  themeColor: string;
  logoUrl?: string;
  hoursMode: 'store_hours' | 'custom_online';
}

export function StorefrontSettingsPage({
  initialSettings,
  onSave,
}: {
  initialSettings?: Partial<StorefrontConfig>;
  onSave?: (config: StorefrontConfig) => Promise<void> | void;
}) {
  const tenant = useOrganization();
  const org = tenant.context?.organization;
  const fileInputRef = useRef<HTMLInputElement>(null);

  // States initialized with props or sensible defaults
  const [isEnabled, setIsEnabled] = useState(
    initialSettings?.isEnabled ?? true,
  );
  const [name, setName] = useState(
    initialSettings?.name || org?.name || 'VELO Cafe & Restaurant',
  );
  const [slug, setSlug] = useState(
    initialSettings?.slug || 'velocafe',
  );
  const [description, setDescription] = useState(
    initialSettings?.description ||
      'ร้านอาหารและคาเฟ่ อาหารไทย เครื่องดื่ม และเบเกอรี่',
  );
  const [channels, setChannels] = useState(
    initialSettings?.channels ?? {
      takeaway: true,
      delivery: true,
      dineIn: false,
    },
  );
  const [themeColor, setThemeColor] = useState(
    initialSettings?.themeColor || 'yellow',
  );
  const [logoUrl, setLogoUrl] = useState<string>(
    initialSettings?.logoUrl || DEFAULT_STORE_THUMBNAIL,
  );
  const [hoursMode, setHoursMode] = useState<'store_hours' | 'custom_online'>(
    initialSettings?.hoursMode || 'store_hours',
  );

  // Status & feedback
  const [isCopied, setIsCopied] = useState(false);
  const [saveStatus, setSaveStatus] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle');
  const [statusMessage, setStatusMessage] = useState('');

  const fullStoreUrl = `https://${slug || 'shop'}.velopos.com`;

  // Handle Copy Link
  const handleCopyLink = async () => {
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(fullStoreUrl);
      }
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  // Handle Photo Upload
  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setLogoUrl(url);
    }
  };

  // Handle QR Download
  const handleDownloadQR = () => {
    const svgElement = document.getElementById('storefront-qr-svg');
    if (!svgElement) return;
    const svgData = new XMLSerializer().serializeToString(svgElement);
    const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `qr-${slug || 'storefront'}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Handle Save
  const handleSave = async (e?: FormEvent | React.MouseEvent) => {
    e?.preventDefault();
    setSaveStatus('saving');
    const config: StorefrontConfig = {
      isEnabled,
      name,
      slug,
      description,
      channels,
      themeColor,
      logoUrl,
      hoursMode,
    };

    try {
      if (onSave) {
        await onSave(config);
      }
      setSaveStatus('saved');
      setStatusMessage('บันทึกการตั้งค่าหน้าร้านออนไลน์สำเร็จ');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch {
      setSaveStatus('error');
      setStatusMessage('เกิดข้อผิดพลาดในการบันทึก กรุณาลองใหม่อีกครั้ง');
    }
  };

  return (
    <div className="storefront-settings-page">
      {/* Header */}
      <header className="storefront-header-card">
        <div className="storefront-header-left">
          <div className="storefront-header-icon" aria-hidden="true">
            <Store size={26} />
          </div>
          <div>
            <h1 className="storefront-header-title">หน้าร้านออนไลน์</h1>
            <p className="storefront-header-subtitle">
              ตั้งค่าหน้าร้านสำหรับรับออเดอร์ออนไลน์ (ซื้อกลับบ้าน / เดลิเวอรี)
            </p>
          </div>
        </div>
        <div className="storefront-header-actions">
          <Link
            to={paths.settings}
            className="storefront-btn-back"
            aria-label="กลับไปการตั้งค่า"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            <span>กลับไปการตั้งค่า</span>
          </Link>
          <button
            type="button"
            className="storefront-btn-save"
            disabled={saveStatus === 'saving'}
            onClick={handleSave}
          >
            <Save size={16} aria-hidden="true" />
            <span>
              {saveStatus === 'saving'
                ? 'กำลังบันทึก...'
                : 'บันทึกการตั้งค่า'}
            </span>
          </button>
        </div>
      </header>

      {/* Success/Error Toast */}
      {saveStatus === 'saved' && (
        <div className="storefront-toast storefront-toast-success" role="status">
          <CheckCircle2 size={18} />
          <span>{statusMessage}</span>
        </div>
      )}

      <form onSubmit={handleSave}>
        <div className="storefront-grid">
          {/* LEFT COLUMN */}
          <div className="storefront-column">
            {/* 1. เปิดใช้งานหน้าร้านออนไลน์ */}
            <section
              className="storefront-card"
              aria-labelledby="storefront-toggle-title"
            >
              <div className="storefront-toggle-row">
                <div className="storefront-toggle-info">
                  <div className="storefront-toggle-icon" aria-hidden="true">
                    <CreditCard size={20} />
                  </div>
                  <div>
                    <h2
                      id="storefront-toggle-title"
                      className="storefront-toggle-label"
                    >
                      เปิดใช้งานหน้าร้านออนไลน์
                    </h2>
                    <p className="storefront-toggle-desc">
                      ให้ลูกค้าสั่งอาหารผ่านลิงก์ของร้านได้
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isEnabled}
                  aria-label="เปิดใช้งานหน้าร้านออนไลน์"
                  className={`storefront-switch ${isEnabled ? 'checked' : ''}`}
                  onClick={() => setIsEnabled(!isEnabled)}
                >
                  <span className="storefront-switch-thumb" />
                </button>
              </div>
            </section>

            {/* 2. รายละเอียดหน้าร้านออนไลน์ */}
            <section
              className="storefront-card"
              aria-labelledby="storefront-details-title"
            >
              <header className="storefront-card-header">
                <h2
                  id="storefront-details-title"
                  className="storefront-card-title"
                >
                  รายละเอียดหน้าร้านออนไลน์
                </h2>
              </header>

              <div className="storefront-form-row">
                <div className="storefront-field-group">
                  <label
                    className="storefront-label"
                    htmlFor="storefront-name"
                  >
                    ชื่อหน้าร้าน (แสดงบนเว็บ){' '}
                    <span className="storefront-required">*</span>
                  </label>
                  <input
                    id="storefront-name"
                    type="text"
                    className="storefront-input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>

                <div className="storefront-field-group">
                  <label
                    className="storefront-label"
                    htmlFor="storefront-slug"
                  >
                    ลิงก์หน้าร้าน (URL){' '}
                    <span className="storefront-required">*</span>
                  </label>
                  <div className="storefront-url-group">
                    <input
                      id="storefront-slug"
                      type="text"
                      className="storefront-slug-input"
                      value={slug}
                      onChange={(e) =>
                        setSlug(
                          e.target.value
                            .toLowerCase()
                            .replace(/[^a-z0-9-]/g, ''),
                        )
                      }
                      required
                    />
                    <span className="storefront-url-suffix">.velopos.com</span>
                  </div>
                </div>
              </div>

              <div className="storefront-field-group">
                <label
                  className="storefront-label"
                  htmlFor="storefront-desc"
                >
                  คำอธิบายร้าน (ไม่บังคับ)
                </label>
                <textarea
                  id="storefront-desc"
                  rows={2}
                  maxLength={200}
                  className="storefront-textarea"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
                <div className="storefront-counter-row">
                  <span>{description.length} / 200</span>
                </div>
              </div>
            </section>

            {/* 3. ช่องทางรับออเดอร์ */}
            <section
              className="storefront-card"
              aria-labelledby="storefront-channels-title"
            >
              <header className="storefront-card-header">
                <h2
                  id="storefront-channels-title"
                  className="storefront-card-title"
                >
                  ช่องทางรับออเดอร์
                </h2>
                <p className="storefront-card-subtitle">
                  เลือกช่องทางที่ต้องการให้ลูกค้าสั่งผ่านหน้าร้านออนไลน์
                </p>
              </header>

              <div className="storefront-channels-row">
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={channels.takeaway}
                  aria-label="ซื้อกลับบ้าน (Takeaway)"
                  className={`storefront-channel-chip ${channels.takeaway ? 'active' : ''}`}
                  onClick={() =>
                    setChannels((c) => ({ ...c, takeaway: !c.takeaway }))
                  }
                >
                  <span
                    className={`storefront-check-box ${channels.takeaway ? 'checked' : ''}`}
                    aria-hidden="true"
                  >
                    {channels.takeaway && <Check size={12} strokeWidth={3} />}
                  </span>
                  <ShoppingBag size={15} aria-hidden="true" />
                  <span>ซื้อกลับบ้าน (Takeaway)</span>
                </button>

                <button
                  type="button"
                  role="checkbox"
                  aria-checked={channels.delivery}
                  aria-label="เดลิเวอรี (Delivery)"
                  className={`storefront-channel-chip ${channels.delivery ? 'active' : ''}`}
                  onClick={() =>
                    setChannels((c) => ({ ...c, delivery: !c.delivery }))
                  }
                >
                  <span
                    className={`storefront-check-box ${channels.delivery ? 'checked' : ''}`}
                    aria-hidden="true"
                  >
                    {channels.delivery && <Check size={12} strokeWidth={3} />}
                  </span>
                  <Bike size={15} aria-hidden="true" />
                  <span>เดลิเวอรี (Delivery)</span>
                </button>

                <button
                  type="button"
                  role="checkbox"
                  aria-checked={channels.dineIn}
                  aria-label="ทานที่ร้าน (Dine-in)"
                  className={`storefront-channel-chip ${channels.dineIn ? 'active' : ''}`}
                  onClick={() =>
                    setChannels((c) => ({ ...c, dineIn: !c.dineIn }))
                  }
                >
                  <span
                    className={`storefront-check-box ${channels.dineIn ? 'checked' : ''}`}
                    aria-hidden="true"
                  >
                    {channels.dineIn && <Check size={12} strokeWidth={3} />}
                  </span>
                  <Utensils size={15} aria-hidden="true" />
                  <span>ทานที่ร้าน (Dine-in)</span>
                </button>
              </div>
            </section>

            {/* 4. การแสดงผลหน้าร้าน */}
            <section
              className="storefront-card"
              aria-labelledby="storefront-appearance-title"
            >
              <header className="storefront-card-header">
                <h2
                  id="storefront-appearance-title"
                  className="storefront-card-title"
                >
                  การแสดงผลหน้าร้าน
                </h2>
              </header>

              <div className="storefront-appearance-grid">
                <div>
                  <label className="storefront-label">สีธีมหน้าร้าน</label>
                  <div className="storefront-swatches-row">
                    {THEME_COLORS.map((color) => (
                      <button
                        key={color.id}
                        type="button"
                        aria-label={color.label}
                        aria-pressed={themeColor === color.id}
                        className={`storefront-color-swatch ${themeColor === color.id ? 'active' : ''}`}
                        style={{ background: color.bg }}
                        onClick={() => setThemeColor(color.id)}
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <label className="storefront-label">
                    โลโก้/ภาพหน้าปก (ไม่บังคับ)
                  </label>
                  <div className="storefront-logo-row">
                    <img
                      src={logoUrl}
                      alt="พรีวิวโลโก้หรือภาพหน้าปก"
                      className="storefront-logo-thumb"
                    />
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={handlePhotoUpload}
                    />
                    <button
                      type="button"
                      className="storefront-upload-btn"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload size={14} aria-hidden="true" />
                      <span>อัปโหลดภาพ</span>
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* RIGHT COLUMN */}
          <div className="storefront-column">
            {/* 5. เวลารับออเดอร์ออนไลน์ */}
            <section
              className="storefront-card"
              aria-labelledby="storefront-hours-title"
            >
              <header className="storefront-card-header">
                <h2
                  id="storefront-hours-title"
                  className="storefront-card-title"
                >
                  เวลารับออเดอร์ออนไลน์
                </h2>
                <p className="storefront-card-subtitle">
                  กำหนดช่วงเวลาที่ลูกค้าสามารถสั่งผ่านหน้าร้านออนไลน์ได้
                </p>
              </header>

              <div className="storefront-radio-group">
                <button
                  type="button"
                  role="radio"
                  aria-checked={hoursMode === 'store_hours'}
                  className={`storefront-radio-card ${hoursMode === 'store_hours' ? 'active' : ''}`}
                  onClick={() => setHoursMode('store_hours')}
                >
                  <span className="storefront-radio-circle">
                    {hoursMode === 'store_hours' && (
                      <span className="storefront-radio-dot" />
                    )}
                  </span>
                  <div className="storefront-radio-content">
                    <span className="storefront-radio-title">
                      ตามเวลาเปิด-ปิดร้าน
                    </span>
                    <span className="storefront-radio-subtitle">
                      ใช้เวลาจาก &ldquo;เวลาทำการ&rdquo; ของร้าน
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  role="radio"
                  aria-checked={hoursMode === 'custom_online'}
                  className={`storefront-radio-card ${hoursMode === 'custom_online' ? 'active' : ''}`}
                  onClick={() => setHoursMode('custom_online')}
                >
                  <span className="storefront-radio-circle">
                    {hoursMode === 'custom_online' && (
                      <span className="storefront-radio-dot" />
                    )}
                  </span>
                  <div className="storefront-radio-content">
                    <span className="storefront-radio-title">
                      กำหนดแยกสำหรับออนไลน์
                    </span>
                    <span className="storefront-radio-subtitle">
                      ตั้งเวลาเฉพาะการรับออเดอร์ออนไลน์
                    </span>
                  </div>
                </button>
              </div>
            </section>

            {/* 6. ลิงก์และ QR */}
            <section
              className="storefront-card"
              aria-labelledby="storefront-link-qr-title"
            >
              <header className="storefront-card-header">
                <h2
                  id="storefront-link-qr-title"
                  className="storefront-card-title"
                >
                  ลิงก์และ QR
                </h2>
              </header>

              <div>
                <label className="storefront-label">ลิงก์หน้าร้าน</label>
                <div className="storefront-link-box">
                  <span className="storefront-link-text">{fullStoreUrl}</span>
                  <button
                    type="button"
                    className={`storefront-copy-btn ${isCopied ? 'copied' : ''}`}
                    title={isCopied ? 'คัดลอกแล้ว!' : 'คัดลอกลิงก์'}
                    aria-label={isCopied ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์'}
                    onClick={() => void handleCopyLink()}
                  >
                    {isCopied ? (
                      <Check size={16} strokeWidth={2.5} />
                    ) : (
                      <Copy size={16} />
                    )}
                  </button>
                </div>

                <div className="storefront-qr-section">
                  <div className="storefront-qr-preview">
                    {/* Clean authentic SVG QR Code */}
                    <svg
                      id="storefront-qr-svg"
                      viewBox="0 0 100 100"
                      width="64"
                      height="64"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <rect width="100" height="100" fill="#ffffff" />
                      {/* Top-Left Finder */}
                      <rect x="10" y="10" width="28" height="28" fill="#0f172a" rx="4" />
                      <rect x="15" y="15" width="18" height="18" fill="#ffffff" rx="2" />
                      <rect x="19" y="19" width="10" height="10" fill="#0f172a" rx="1.5" />
                      {/* Top-Right Finder */}
                      <rect x="62" y="10" width="28" height="28" fill="#0f172a" rx="4" />
                      <rect x="67" y="15" width="18" height="18" fill="#ffffff" rx="2" />
                      <rect x="71" y="19" width="10" height="10" fill="#0f172a" rx="1.5" />
                      {/* Bottom-Left Finder */}
                      <rect x="10" y="62" width="28" height="28" fill="#0f172a" rx="4" />
                      <rect x="15" y="67" width="18" height="18" fill="#ffffff" rx="2" />
                      <rect x="19" y="71" width="10" height="10" fill="#0f172a" rx="1.5" />
                      {/* Data dots */}
                      <rect x="44" y="12" width="6" height="6" fill="#0f172a" rx="1" />
                      <rect x="52" y="20" width="6" height="6" fill="#0f172a" rx="1" />
                      <rect x="44" y="28" width="6" height="6" fill="#0f172a" rx="1" />
                      <rect x="14" y="44" width="6" height="6" fill="#0f172a" rx="1" />
                      <rect x="22" y="52" width="6" height="6" fill="#0f172a" rx="1" />
                      <rect x="44" y="44" width="8" height="8" fill="#facc15" rx="2" />
                      <rect x="54" y="44" width="6" height="6" fill="#0f172a" rx="1" />
                      <rect x="64" y="52" width="6" height="6" fill="#0f172a" rx="1" />
                      <rect x="74" y="44" width="6" height="6" fill="#0f172a" rx="1" />
                      <rect x="82" y="52" width="6" height="6" fill="#0f172a" rx="1" />
                      <rect x="44" y="64" width="6" height="6" fill="#0f172a" rx="1" />
                      <rect x="52" y="72" width="6" height="6" fill="#0f172a" rx="1" />
                      <rect x="62" y="64" width="6" height="6" fill="#0f172a" rx="1" />
                      <rect x="72" y="72" width="6" height="6" fill="#0f172a" rx="1" />
                      <rect x="80" y="80" width="8" height="8" fill="#0f172a" rx="1.5" />
                      <rect x="44" y="80" width="6" height="6" fill="#0f172a" rx="1" />
                      <rect x="54" y="82" width="6" height="6" fill="#0f172a" rx="1" />
                      <rect x="64" y="80" width="6" height="6" fill="#0f172a" rx="1" />
                    </svg>
                  </div>
                  <div className="storefront-qr-info">
                    <h3 className="storefront-qr-title">QR หน้าร้านออนไลน์</h3>
                    <p className="storefront-qr-desc">
                      ให้ลูกค้าสแกนเพื่อสั่งอาหาร
                    </p>
                    <button
                      type="button"
                      className="storefront-download-btn"
                      onClick={handleDownloadQR}
                    >
                      <Download size={14} aria-hidden="true" />
                      <span>ดาวน์โหลด</span>
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </form>
    </div>
  );
}
