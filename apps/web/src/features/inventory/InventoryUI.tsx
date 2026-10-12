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
  return <p role="status">ไม่พบข้อมูล ลองปรับเงื่อนไขค้นหาหรือเลือกสาขาอื่น</p>;
}
export function VariantPicker({
  value,
  change,
}: {
  value: string;
  change: (value: string) => void;
}) {
  const tenant = useOrganization();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const path = `/organizations/${tenant.context?.organization.id}/products?page_size=20&page=${page}&search=${encodeURIComponent(search)}&status=${status}`;
  const query = useQuery({
    queryKey: [
      'tenant',
      tenant.context?.membership.user_id,
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
      <Field label="ค้นหา Product / SKU / Barcode">
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
      </Field>
      <Field label="สถานะ Catalog">
        <select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="">ACTIVE / INACTIVE</option>
          {['ACTIVE', 'INACTIVE', 'ARCHIVED'].map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
      </Field>
      <Field label="Product Variant">
        <select
          required
          value={value}
          onChange={(event) => change(event.target.value)}
        >
          <option value="">เลือก Variant</option>
          {value && !variants.some((variant) => variant.id === value) && (
            <option value={value}>Selected Variant {value}</option>
          )}
          {variants.map((variant) => (
            <option key={variant.id} value={variant.id}>
              {variant.sku} · {variant.name}
            </option>
          ))}
        </select>
      </Field>
      <CatalogError error={query.error} />
      <div className="catalog-actions">
        <Button
          type="button"
          className="button-secondary"
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
        >
          Catalog ก่อนหน้า
        </Button>
        <Button
          type="button"
          className="button-secondary"
          disabled={!query.data || page * 20 >= query.data.total}
          onClick={() => setPage(page + 1)}
        >
          Catalog ถัดไป
        </Button>
      </div>
    </div>
  );
}
