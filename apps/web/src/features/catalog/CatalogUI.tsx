import { useLanguage } from '../../app/language';
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
  const { t } = useLanguage();

  return (
    <div className="catalog-header">
      <div>
        <p className="eyebrow">{t('catalog.manageProducts')}</p>
        <h1>{title}</h1>
        <p>
          {t('catalog.sharedOrganizationCatalog')}{' '}
          <Link to="/inventory/balances">{t('catalog.viewBranchStock')}</Link>
        </p>
      </div>
      <div className="catalog-actions">{children}</div>
    </div>
  );
}
export function CatalogNav() {
  const { t } = useLanguage();

  return (
    <nav className="catalog-nav" aria-label={t('catalog.catalog')}>
      <Link to="/products">{t('common.products')}</Link>
      <Link to="/categories">{t('catalog.categories')}</Link>
      <Link to="/brands">{t('catalog.brands')}</Link>
      <Link to="/units">{t('catalog.units')}</Link>
    </nav>
  );
}
export function CatalogError({ error }: { error: unknown }) {
  const { localize } = useLanguage();

  return error ? (
    <p role="alert" className="tenant-error">
      {localize((error instanceof Error ? error.message : String(error)) ?? '')}
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
  const { t } = useLanguage();

  return (
    <label className="tenant-field">
      {label}
      <select
        aria-label={label}
        value={value ?? ''}
        required={required}
        onChange={(event) => change(event.target.value || null)}
      >
        <option value="">
          {required ? t('catalog.selectUnit') : t('catalog.notProvided')}
        </option>
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
  label,
}: {
  value: CatalogStatus;
  change: (value: CatalogStatus) => void;
  archive?: boolean;
  label?: string;
}) {
  const { t } = useLanguage();
  const fieldLabel = label ?? t('common.status');

  return (
    <label className="tenant-field">
      {fieldLabel}
      <select
        aria-label={fieldLabel}
        value={value}
        onChange={(event) => change(event.target.value as CatalogStatus)}
      >
        <option value="ACTIVE">{t('catalog.active')}</option>
        <option value="INACTIVE">{t('catalog.inactive')}</option>
        {(archive || value === 'ARCHIVED') && (
          <option value="ARCHIVED">{t('catalog.archived2')}</option>
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
  const { t } = useLanguage();

  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="catalog-pagination">
      <Button
        className="button-secondary"
        disabled={page <= 1}
        onClick={() => change(page - 1)}
      >
        {t('catalog.previous')}
      </Button>
      <span>
        {t('catalog.page')} {page} / {pages} • {total}{' '}
        {t('catalog.definitions')}
      </span>
      <Button
        className="button-secondary"
        disabled={page >= pages}
        onClick={() => change(page + 1)}
      >
        {t('catalog.next')}
      </Button>
    </div>
  );
}
export function CatalogLoading({ pending }: { pending: boolean }) {
  const { t } = useLanguage();

  return pending ? <Loading>{t('catalog.loadingCatalog')}</Loading> : null;
}
