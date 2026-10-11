import { useState, type ReactNode } from 'react';
import { WorkspaceLink as Link } from '../../app/WorkspaceNavigation';
import { Button, Loading } from '../../components/ui/primitives';
import { CatalogError } from '../catalog/CatalogUI';
import type { Product, Variant } from '../../lib/catalog-api';
import type { SupplyPage } from '../../lib/purchasing-api';
import { useSupplyQuery, type SupplyScope } from './purchasing-hooks';

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="tenant-field">
      {label}
      {children}
    </label>
  );
}
export function TextField({
  label,
  value,
  change,
  required = false,
  type = 'text',
}: {
  label: string;
  value: string;
  change: (value: string) => void;
  required?: boolean;
  type?: string;
}) {
  return (
    <Field label={label}>
      <input
        type={type}
        value={value}
        onChange={(event) => change(event.target.value)}
        required={required}
        maxLength={type === 'text' ? 2000 : undefined}
      />
    </Field>
  );
}
export function SupplyFeedback({ state }: { state: SupplyScope }) {
  return (
    <>
      <CatalogError error={state.error} />
      {state.success && <p role="status">{state.success}</p>}
      {state.busy && <Loading>กำลังบันทึก กรุณารอ</Loading>}
    </>
  );
}
export function SupplyTable({
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
export function SupplyNav({ shelves = false }: { shelves?: boolean }) {
  const links = shelves
    ? [
        ['/shelves', 'ชั้นวาง'],
        ['/shelves/layout', 'ผังชั้นวาง'],
        ['/shelves/replenishments', 'เติมสินค้า'],
        ['/shelves/counts', 'ตรวจนับ'],
        ['/shelves/discrepancies', 'ผลต่างตรวจนับ'],
      ]
    : [
        ['/suppliers', 'Supplier'],
        ['/purchasing/orders', 'ใบสั่งซื้อ'],
        ['/purchasing/receipts', 'รับสินค้า'],
        ['/purchasing/returns', 'คืน Supplier'],
        ['/purchasing/suggestions', 'คำแนะนำสั่งซื้อ'],
      ];
  return (
    <nav
      className="catalog-nav"
      aria-label={shelves ? 'Shelf workflows' : 'Purchasing workflows'}
    >
      {links.map(([path, label]) => (
        <Link key={path} to={path}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
export function RemoteSelect<Item extends { id: string }>({
  label,
  path,
  value,
  change,
  display,
  required = true,
}: {
  label: string;
  path: string;
  value: string;
  change: (id: string) => void;
  display: (item: Item) => string;
  required?: boolean;
}) {
  const [search, setSearch] = useState(''),
    [page, setPage] = useState(1);
  const query = useSupplyQuery<SupplyPage<Item>>(
    `${path}${path.includes('?') ? '&' : '?'}page_size=20&page=${page}&search=${encodeURIComponent(search)}`,
  );
  return (
    <div className="supply-picker">
      <TextField
        label={`ค้นหา ${label}`}
        value={search}
        change={(value) => {
          setSearch(value);
          setPage(1);
        }}
      />
      <Field label={label}>
        <select
          required={required}
          value={value}
          onChange={(event) => change(event.target.value)}
        >
          <option value="">เลือก {label}</option>
          {value && !query.data?.items.some((item) => item.id === value) && (
            <option value={value}>Selected · {value}</option>
          )}
          {query.data?.items.map((item) => (
            <option key={item.id} value={item.id}>
              {display(item)}
            </option>
          ))}
        </select>
      </Field>
      {query.isLoading && <Loading />}
      <CatalogError error={query.error} />
      <Pagination page={page} total={query.data?.total ?? 0} change={setPage} />
    </div>
  );
}
export function VariantPicker({
  value,
  change,
}: {
  value: string;
  change: (variant: Variant) => void;
}) {
  const [search, setSearch] = useState(''),
    [page, setPage] = useState(1);
  const query = useSupplyQuery<SupplyPage<Product>>(
    `/products?status=ACTIVE&page_size=20&page=${page}&search=${encodeURIComponent(search)}`,
  );
  const variants =
    query.data?.items.flatMap((product) =>
      product.variants.filter((variant) => variant.status === 'ACTIVE'),
    ) ?? [];
  return (
    <div className="supply-picker">
      <TextField
        label="ค้นหาสินค้า / SKU"
        value={search}
        change={(value) => {
          setSearch(value);
          setPage(1);
        }}
      />
      <Field label="Product Variant">
        <select
          value={value}
          required
          onChange={(event) => {
            const variant = variants.find(
              (item) => item.id === event.target.value,
            );
            if (variant) change(variant);
          }}
        >
          <option value="">เลือก Variant</option>
          {value && !variants.some((variant) => variant.id === value) && (
            <option value={value}>Selected · {value}</option>
          )}
          {variants.map((variant) => (
            <option key={variant.id} value={variant.id}>
              {variant.sku} · {variant.name}
            </option>
          ))}
        </select>
      </Field>
      <CatalogError error={query.error} />
      <Pagination page={page} total={query.data?.total ?? 0} change={setPage} />
    </div>
  );
}
export { QueryFeedback } from '../../components/feedback/QueryFeedback';
