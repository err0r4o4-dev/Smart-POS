import { useLanguage } from '../../app/language';
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
  const { t, localize } = useLanguage();

  return (
    <>
      <CatalogError error={state.error} />
      {state.success && <p role="status">{localize(state.success)}</p>}
      {state.busy && <Loading>{t('purchasing.savingPleaseWait')}</Loading>}
    </>
  );
}
export function SupplyTable({
  headers,
  children,
  className = '',
}: {
  headers: string[];
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className="catalog-table-wrap"
      tabIndex={0}
      role="region"
      aria-label={headers.join(' / ')}
    >
      <table className={`catalog-table ${className}`.trim()}>
        <thead>
          <tr>
            {headers.map((header) => (
              <th scope="col" key={header}>
                {header}
              </th>
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
export function SupplyNav({ shelves = false }: { shelves?: boolean }) {
  const { t } = useLanguage();

  const links = shelves
    ? [
        ['/shelves', t('purchasing.shelf')],
        ['/shelves/layout', t('purchasing.shelfLayout')],
        ['/shelves/replenishments', t('purchasing.replenishStock')],
        ['/shelves/counts', t('inventory.stockCounts')],
        ['/shelves/discrepancies', t('purchasing.countDifferences')],
      ]
    : [
        ['/suppliers', t('purchasing.supplier')],
        ['/purchasing/orders', t('purchasing.purchaseOrders')],
        ['/purchasing/receipts', t('purchasing.receiveProducts')],
        ['/purchasing/returns', t('purchasing.returnToSupplier')],
        ['/purchasing/suggestions', t('purchasing.reorderSuggestions')],
      ];
  return (
    <nav
      className="catalog-nav"
      aria-label={
        shelves
          ? t('purchasing.shelfWorkflows')
          : t('purchasing.purchasingWorkflows')
      }
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
  const { t, labelCode } = useLanguage();

  const [search, setSearch] = useState(''),
    [page, setPage] = useState(1);
  const query = useSupplyQuery<SupplyPage<Item>>(
    `${path}${path.includes('?') ? '&' : '?'}page_size=20&page=${page}&search=${encodeURIComponent(search)}`,
  );
  return (
    <div className="supply-picker">
      <TextField
        label={t('purchasing.searchValue02', { value0: label })}
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
          <option value="">
            {t('purchasing.select')} {label}
          </option>
          {value && !query.data?.items.some((item) => item.id === value) && (
            <option value={value}>
              {t('purchasing.selected')} {labelCode(value)}
            </option>
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
  children,
}: {
  value: string;
  change: (variant: Variant) => void;
  children?: ReactNode;
}) {
  const { t, labelCode } = useLanguage();

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
      <div className="supply-picker-inputs">
        <TextField
          label={t('purchasing.searchProductSku')}
          value={search}
          change={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
        <Field label={t('inventory.productVariant')}>
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
            <option value="">{t('catalog.selectVariant')}</option>
            {value && !variants.some((variant) => variant.id === value) && (
              <option value={value}>
                {t('purchasing.selected')} {labelCode(value)}
              </option>
            )}
            {variants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.sku} · {variant.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <CatalogError error={query.error} />
      {children}
      <Pagination page={page} total={query.data?.total ?? 0} change={setPage} />
    </div>
  );
}
export { QueryFeedback } from '../../components/feedback/QueryFeedback';
