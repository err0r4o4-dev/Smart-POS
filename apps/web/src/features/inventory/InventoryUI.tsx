import { useLanguage } from '../../app/language';
import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useOrganization } from '../../app/OrganizationProvider';
import { organizationRequest } from '../../lib/organization-api';
import type { Product, CatalogPage, Variant } from '../../lib/catalog-api';
import { Button } from '../../components/ui/primitives';
import { CatalogError } from '../catalog/CatalogUI';

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="catalog-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
export function Table({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div
      className="catalog-table-wrap"
      tabIndex={0}
      role="region"
      aria-label={headers.join(' / ')}
    >
      <table className="catalog-table">
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
export function Empty() {
  const { t } = useLanguage();

  return <p role="status">{t('shell.noResultsAdjustYourSearchOrSelect')}</p>;
}
export function VariantPicker({
  value,
  change,
}: {
  value: string;
  change: (value: string) => void;
}) {
  const { t, labelCode } = useLanguage();

  const tenant = useOrganization();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const path = `/organizations/${tenant.context?.organization.id}/products?page_size=20&page=${page}&search=${encodeURIComponent(search)}&status=${status}`;
  const query = useQuery({
    queryKey: [
      'tenant',
      tenant.context?.membership?.user_id,
      tenant.context?.organization.id,
      'catalog',
      path,
    ],
    queryFn: ({ signal }) =>
      organizationRequest<CatalogPage<Product>>(path, { signal }),
    enabled: !!tenant.context,
  });
  const variants: Variant[] = (query.data?.items ?? []).flatMap(
    (product) => product.variants,
  );
  return (
    <div className="inventory-picker">
      <div className="inventory-picker-filters">
        <Field label={t('inventory.searchProductSkuBarcode')}>
          <input
            value={search}
            placeholder={t('inventory.searchNameSkuOrBarcode')}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </Field>
        <Field label={t('inventory.catalogStatus')}>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">{t('inventory.activeInactive3')}</option>
            {['ACTIVE', 'INACTIVE', 'ARCHIVED'].map((item) => (
              <option key={item} value={item}>
                {labelCode(item)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label={t('inventory.productVariant')}>
        <select
          required
          value={value}
          onChange={(event) => change(event.target.value)}
        >
          <option value="">{t('catalog.selectVariant')}</option>
          {value && !variants.some((variant) => variant.id === value) && (
            <option value={value}>
              {t('inventory.selectedVariant')} {labelCode(value)}
            </option>
          )}
          {variants.map((variant) => (
            <option key={variant.id} value={variant.id}>
              {variant.sku} · {variant.name}
            </option>
          ))}
        </select>
      </Field>
      <CatalogError error={query.error} />
      <div className="inventory-picker-pagination">
        <Button
          type="button"
          className="button-secondary button-compact"
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          {t('inventory.previousCatalogPage')}
        </Button>
        <Button
          type="button"
          className="button-secondary button-compact"
          disabled={!query.data || page * 20 >= query.data.total}
          onClick={() => setPage(page + 1)}
        >
          {t('inventory.nextCatalogPage')}
        </Button>
      </div>
    </div>
  );
}
