import type { ReactNode } from 'react';
import { WorkspaceLink as Link } from '../../app/WorkspaceNavigation';
import { Button, Loading } from '../../components/ui/primitives';
import type { CatalogStatus, Taxonomy } from '../../lib/catalog-api';
export function CatalogHeader({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="catalog-header">
      <div>
        <p className="eyebrow">จัดการสินค้า</p>
        <h1>{title}</h1>
        <p>
          แค็ตตาล็อกร่วมขององค์กร •{' '}
          <Link to="/inventory/balances">ดูสต็อกตามสาขา</Link>
        </p>
      </div>
      <div className="catalog-actions">{children}</div>
    </div>
  );
}
export function CatalogNav() {
  return (
    <nav className="catalog-nav" aria-label="Catalog">
      <Link to="/products">สินค้า</Link>
      <Link to="/categories">หมวดหมู่</Link>
      <Link to="/brands">แบรนด์</Link>
      <Link to="/units">หน่วยนับ</Link>
    </nav>
  );
}
export function CatalogError({ error }: { error: unknown }) {
  return error ? (
    <p role="alert" className="tenant-error">
      {error instanceof Error ? error.message : String(error)}
    </p>
  ) : null;
}
export function CatalogField({
  label,
  value,
  change,
  required = false,
  type = 'text',
  maxLength = 200,
  disabled = false,
  pattern,
}: {
  label: string;
  value: string;
  change: (value: string) => void;
  required?: boolean;
  type?: string;
  maxLength?: number;
  disabled?: boolean;
  pattern?: string;
}) {
  return (
    <label className="tenant-field">
      {label}
      <input
        value={value}
        onChange={(event) => change(event.target.value)}
        required={required}
        type={type}
        maxLength={maxLength}
        disabled={disabled}
        pattern={pattern}
      />
    </label>
  );
}
export function TaxonomySelect({
  label,
  value,
  change,
  items,
  required = false,
}: {
  label: string;
  value: string | null;
  change: (value: string | null) => void;
  items: Taxonomy[];
  required?: boolean;
}) {
  return (
    <label className="tenant-field">
      {label}
      <select
        aria-label={label}
        value={value ?? ''}
        required={required}
        onChange={(event) => change(event.target.value || null)}
      >
        <option value="">{required ? 'เลือกหน่วยนับ' : 'ไม่ระบุ'}</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
            {item.code ? ` (${item.code})` : ''}
          </option>
        ))}
      </select>
    </label>
  );
}
export function StatusSelect({
  value,
  change,
  archive = true,
  label = 'สถานะ',
}: {
  value: CatalogStatus;
  change: (value: CatalogStatus) => void;
  archive?: boolean;
  label?: string;
}) {
  return (
    <label className="tenant-field">
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(event) => change(event.target.value as CatalogStatus)}
      >
        <option value="ACTIVE">ACTIVE</option>
        <option value="INACTIVE">INACTIVE</option>
        {(archive || value === 'ARCHIVED') && (
          <option value="ARCHIVED">ARCHIVED</option>
        )}
      </select>
    </label>
  );
}
export function Pagination({
  page,
  total,
  size = 20,
  change,
}: {
  page: number;
  total: number;
  size?: number;
  change: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="catalog-pagination">
      <Button
        className="button-secondary"
        disabled={page <= 1}
        onClick={() => change(page - 1)}
      >
        ก่อนหน้า
      </Button>
      <span>
        หน้า {page} / {pages} • {total} รายการ
      </span>
      <Button
        className="button-secondary"
        disabled={page >= pages}
        onClick={() => change(page + 1)}
      >
        ถัดไป
      </Button>
    </div>
  );
}
export function CatalogLoading({ pending }: { pending: boolean }) {
  return pending ? <Loading>กำลังโหลดแค็ตตาล็อก…</Loading> : null;
}
