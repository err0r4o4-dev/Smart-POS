import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../app/AuthProvider';
import { useOrganization } from '../../app/OrganizationProvider';
import { organizationRequest } from '../../lib/organization-api';
import type { Product, CatalogPage, Variant } from '../../lib/catalog-api';
import type {
  InventoryDocument,
  InventoryItem,
  InventoryOverview,
  InventoryPageData,
  ReorderPoint,
  StockBalance,
  StockLocation,
  StockMovement,
} from '../../lib/inventory-api';
import { quantityVariance, variancePercent } from '../../lib/inventory-api';
import { Button, Card } from '../../components/ui/primitives';
import { CatalogError, CatalogLoading } from '../catalog/CatalogUI';
import { BatchPicker, type BatchSelection } from '../quality/BatchPicker';
import { untrackedBatch } from '../../lib/quality-api';

const sections = [
  ['overview', 'ภาพรวม'],
  ['balances', 'ยอดสต็อก'],
  ['locations', 'สถานที่เก็บ'],
  ['movements', 'ประวัติ'],
  ['adjustments', 'ปรับปรุงสต็อก'],
  ['counts', 'ตรวจนับ'],
  ['transfers', 'โอนสินค้า'],
  ['reorder-points', 'จุดสั่งซื้อ'],
] as const;
const title = (section: string) =>
  sections.find(([name]) => name === section)?.[1] ?? 'Inventory';
type Run = <Result>(
  path: string,
  method: string,
  body: object,
) => Promise<Result>;
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="catalog-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Table({
  headers,
  children,
}: {
  headers: string[];
  children: ReactNode;
}) {
  return (
    <div className="catalog-table-wrap">
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
function Empty() {
  return (
    <p role="status">
      ยังไม่มีข้อมูลในขอบเขตนี้ — ไม่มีการแทนด้วยข้อมูลตัวอย่าง
    </p>
  );
}
function VariantPicker({
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
export function InventoryPage({
  section,
  shelfOnly = false,
}: {
  section: string;
  shelfOnly?: boolean;
}) {
  const tenant = useOrganization();
  const { id } = useParams();
  return (
    <InventoryScreen
      key={`${tenant.context?.organization.id}:${tenant.branchID}:${section}:${id ?? ''}`}
      section={section}
      id={id}
      shelfOnly={shelfOnly}
    />
  );
}
function InventoryScreen({
  section,
  id,
  shelfOnly,
}: {
  section: string;
  id?: string;
  shelfOnly?: boolean;
}) {
  const tenant = useOrganization();
  const auth = useAuth();
  const client = useQueryClient();
  const org = tenant.context?.organization.id ?? '';
  const branch = tenant.branchID;
  const csrf = auth.state.session?.csrf_token ?? '';
  const key = ['tenant', auth.state.session?.user.id, org, branch, 'inventory'];
  const base = `/organizations/${org}/inventory`;
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [stockStatus, setStockStatus] = useState('');
  const [category, setCategory] = useState('');
  const [productStatus, setProductStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [actor, setActor] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<InventoryDocument | null>(null);
  const controller = useRef(new AbortController());
  useEffect(() => {
    const current = controller.current;
    return () => current.abort();
  }, []);
  const retryKeys = useRef(new Map<string, string>());
  const parameters = new URLSearchParams({
    branch_id: branch,
    search,
    status,
    type,
    page: String(page),
    page_size: '20',
    ...(shelfOnly ? { shelf_only: 'true' } : {}),
    location_id: locationFilter,
    stock_status: stockStatus,
    category_id: category,
    product_status: productStatus,
    actor_id: actor,
    ...(from ? { from: new Date(from).toISOString() } : {}),
    ...(to ? { to: new Date(to).toISOString() } : {}),
  });
  const path = `${base}/${section}${id ? '/' + id : '?' + parameters}`;
  const query = useQuery({
    queryKey: [...key, path],
    queryFn: ({ signal }) =>
      organizationRequest<
        | InventoryPageData<
            StockBalance &
              StockLocation &
              StockMovement &
              InventoryDocument &
              ReorderPoint
          >
        | InventoryOverview
        | InventoryDocument
      >(path, { signal }),
    enabled: !!org && !!branch,
  });
  const [locationPage, setLocationPage] = useState(1);
  const [destinationPage, setDestinationPage] = useState(1);
  const locations = useQuery({
    queryKey: [...key, 'locations-for-form', locationPage],
    queryFn: ({ signal }) =>
      organizationRequest<InventoryPageData<StockLocation>>(
        `${base}/locations?branch_id=${branch}&page_size=100&page=${locationPage}${shelfOnly ? '&shelf_only=true' : ''}`,
        { signal },
      ),
    enabled: !!org && !!branch,
  });
  const [destinationBranch, setDestinationBranch] = useState(branch);
  const destinations = useQuery({
    queryKey: [
      ...key,
      'destination-locations',
      destinationBranch,
      destinationPage,
    ],
    queryFn: ({ signal }) =>
      organizationRequest<InventoryPageData<StockLocation>>(
        `${base}/locations?branch_id=${destinationBranch}&page_size=100&page=${destinationPage}`,
        { signal },
      ),
    enabled: section === 'transfers' && !!destinationBranch,
  });
  async function run<Result>(
    suffix: string,
    method: string,
    body: object,
  ): Promise<Result> {
    setBusy(true);
    setError(null);
    setSuccess('');
    const fingerprint = `${suffix}:${JSON.stringify(body)}`;
    const requestKey =
      retryKeys.current.get(fingerprint) ?? crypto.randomUUID();
    retryKeys.current.set(fingerprint, requestKey);
    try {
      const result = await organizationRequest<Result>(base + suffix, {
        method,
        body,
        csrf,
        key: requestKey,
        signal: controller.current.signal,
      });
      retryKeys.current.delete(fingerprint);
      await client.invalidateQueries({ queryKey: key });
      setSuccess('บันทึกแล้ว — stock เปลี่ยนเฉพาะเมื่อ backend commit');
      return result;
    } catch (problem) {
      setError(problem);
      throw problem;
    } finally {
      setBusy(false);
    }
  }
  const formLocations = (locations.data?.items ?? []).filter(
    (item) => item.status === 'ACTIVE' && !item.is_system,
  );
  const data = query.data;
  const rows = data && 'total' in data ? data.items : [];
  async function inspect(doc: InventoryDocument) {
    try {
      setSelected(
        await organizationRequest<InventoryDocument>(
          `${base}/${section}/${doc.id}`,
          { signal: controller.current.signal },
        ),
      );
    } catch (problem) {
      setError(problem);
    }
  }
  return (
    <section className="catalog-page inventory-page">
      <header className="catalog-header">
        <div>
          <p className="eyebrow">
            {shelfOnly
              ? 'SHELF COUNTS · INVENTORY SERVICE'
              : 'INVENTORY · PHASE 2'}
          </p>
          <h1>{title(section)}</h1>
          <p>
            Recorded Stock จาก ledger · Counted Stock คือผลตรวจนับ ·
            reservations ยังไม่มี
          </p>
        </div>
      </header>
      <nav className="catalog-nav" aria-label="Inventory">
        {sections
          .filter(
            ([name]) =>
              name !== 'movements' || tenant.can('inventory.audit.read'),
          )
          .map(([name, label]) => (
            <Link
              key={name}
              to={name === 'overview' ? '/inventory' : '/inventory/' + name}
            >
              {label}
            </Link>
          ))}
      </nav>
      <p>
        ขอบเขต:{' '}
        {tenant.context?.branches.find((item) => item.id === branch)?.name ??
          'ยังไม่ได้เลือกสาขา'}{' '}
        · ไม่มี accounting valuation ใน Phase 2
      </p>
      <CatalogError error={error || query.error} />
      {success && (
        <p role="status" className="tenant-success">
          {success}
        </p>
      )}
      {!branch ? (
        <p role="status">กรุณาเลือกสาขาที่มีสิทธิ์ใช้งานก่อน</p>
      ) : query.isPending ? (
        <CatalogLoading pending={true} />
      ) : null}
      {!id && branch && section !== 'overview' && (
        <Card>
          <form
            className="inventory-filters"
            onSubmit={(event) => {
              event.preventDefault();
              setPage(1);
            }}
          >
            <Field label="ค้นหา SKU / Product / Barcode">
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </Field>
            {['balances', 'movements', 'counts'].includes(section) && (
              <Field label="Location filter">
                <select
                  value={locationFilter}
                  onChange={(event) => {
                    setLocationFilter(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">ทั้งหมด</option>
                  {locations.data?.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {[
              'locations',
              'adjustments',
              'counts',
              'transfers',
              'reorder-points',
            ].includes(section) && (
              <Field label="Status filter">
                <input
                  value={status}
                  placeholder="ACTIVE / APPROVED"
                  onChange={(event) => {
                    setStatus(event.target.value);
                    setPage(1);
                  }}
                />
              </Field>
            )}
            {['locations', 'balances', 'movements'].includes(section) && (
              <Field label="Type / Movement type">
                <input
                  value={type}
                  onChange={(event) => {
                    setType(event.target.value);
                    setPage(1);
                  }}
                />
              </Field>
            )}
            {section === 'balances' && (
              <>
                <Field label="Stock status">
                  <select
                    value={stockStatus}
                    onChange={(event) => {
                      setStockStatus(event.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">ทั้งหมด</option>
                    {['ZERO', 'POSITIVE', 'LOW'].map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Category UUID">
                  <input
                    value={category}
                    onChange={(event) => {
                      setCategory(event.target.value);
                      setPage(1);
                    }}
                  />
                </Field>
                <Field label="Product status">
                  <select
                    value={productStatus}
                    onChange={(event) => {
                      setProductStatus(event.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">ทั้งหมด</option>
                    {['ACTIVE', 'INACTIVE', 'ARCHIVED'].map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </Field>
              </>
            )}
            {section === 'movements' && (
              <>
                <Field label="From timestamp">
                  <input
                    type="datetime-local"
                    value={from}
                    onChange={(event) => setFrom(event.target.value)}
                  />
                </Field>
                <Field label="To timestamp">
                  <input
                    type="datetime-local"
                    value={to}
                    onChange={(event) => setTo(event.target.value)}
                  />
                </Field>
                <Field label="Actor UUID">
                  <input
                    value={actor}
                    onChange={(event) => setActor(event.target.value)}
                  />
                </Field>
              </>
            )}
            <Button type="submit" className="button-secondary">
              ค้นหา
            </Button>
          </form>
        </Card>
      )}
      {section === 'overview' && data && 'stock' in data && (
        <>
          <div className="inventory-metrics">
            {[
              ['Variants with recorded balances', data.stock.recorded_variants],
              [
                'Active catalog variants (organization)',
                data.alerts.active_variants,
              ],
              [
                'Low-stock variants (branch reorder policy)',
                data.alerts.low_stock_variants,
              ],
              ['Pending adjustments', data.operations.pending_adjustments],
              ['Open counts', data.operations.open_counts],
              ['Pending transfers', data.operations.pending_transfers],
            ].map(([label, value]) => (
              <Card key={label}>
                <h2>{label}</h2>
                <strong>{value}</strong>
              </Card>
            ))}
          </div>
          <Card>
            <h2>Recorded Quantity — แยกตามหน่วยและ location type</h2>
            {data.stock.by_unit.length ? (
              <Table headers={['Unit', 'Location type', 'Recorded Quantity']}>
                {data.stock.by_unit.map((row) => (
                  <tr key={row.unit + row.type}>
                    <td>{row.unit}</td>
                    <td>{row.type}</td>
                    <td>{row.quantity}</td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty />
            )}
          </Card>
          {tenant.can('inventory.audit.read') && (
            <Card>
              <h2>Recent movements</h2>
              <Table headers={['SKU', 'Movement', 'Delta', 'Time']}>
                {data.recent_movements.map((movement) => (
                  <tr key={movement.id}>
                    <td>{movement.sku}</td>
                    <td>{movement.movement_type}</td>
                    <td>{movement.quantity_delta}</td>
                    <td>{movement.created_at}</td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}
        </>
      )}
      {!id && branch && section !== 'overview' && (
        <div
          className="catalog-actions"
          aria-label="Location options pagination"
        >
          <span>Location options: หน้า {locationPage}</span>
          <Button
            className="button-secondary"
            disabled={locationPage === 1}
            onClick={() => setLocationPage(locationPage - 1)}
          >
            Locations ก่อนหน้า
          </Button>
          <Button
            className="button-secondary"
            disabled={locationPage * 100 >= (locations.data?.total ?? 0)}
            onClick={() => setLocationPage(locationPage + 1)}
          >
            Locations ถัดไป
          </Button>
          {section === 'transfers' && (
            <>
              <span>Destination options: หน้า {destinationPage}</span>
              <Button
                className="button-secondary"
                disabled={destinationPage === 1}
                onClick={() => setDestinationPage(destinationPage - 1)}
              >
                Destinations ก่อนหน้า
              </Button>
              <Button
                className="button-secondary"
                disabled={
                  destinationPage * 100 >= (destinations.data?.total ?? 0)
                }
                onClick={() => setDestinationPage(destinationPage + 1)}
              >
                Destinations ถัดไป
              </Button>
            </>
          )}
        </div>
      )}
      {section === 'locations' && tenant.can('inventory.location.manage') && (
        <LocationEditor
          branch={branch}
          locations={formLocations}
          run={run}
          busy={busy}
        />
      )}
      {section === 'balances' &&
        tenant.can('inventory.opening_balance.create') && (
          <CommandEditor
            resource="opening-balances"
            locations={formLocations}
            run={run}
            busy={busy}
          />
        )}
      {!id &&
        ['adjustments', 'counts', 'transfers'].includes(section) &&
        tenant.can(
          `inventory.${section === 'counts' ? 'count' : section === 'transfers' ? 'transfer' : 'adjustment'}.create`,
        ) && (
          <CommandEditor
            resource={section}
            locations={formLocations}
            destinations={destinations.data?.items ?? []}
            branchChoices={tenant.context?.branches.map((item) => ({
              id: item.id,
              name: item.name,
            }))}
            destinationBranch={destinationBranch}
            setDestinationBranch={(value) => {
              setDestinationBranch(value);
              setDestinationPage(1);
            }}
            run={run}
            busy={busy}
            created={(doc) => setSelected(doc)}
          />
        )}
      {section === 'reorder-points' &&
        tenant.can('inventory.reorder_point.manage') && (
          <ReorderEditor
            key={selected?.id}
            branch={branch}
            run={run}
            busy={busy}
          />
        )}
      {id && data && 'kind' in data && (
        <DocumentDetails
          key={data.id + data.revision}
          doc={data}
          resource={section}
          run={run}
          busy={busy}
        />
      )}
      {selected && (
        <DocumentDetails
          key={selected.id + selected.revision}
          doc={selected}
          resource={section}
          run={run}
          busy={busy}
          updated={setSelected}
        />
      )}
      {!id && section !== 'overview' && data && 'total' in data && (
        <Card>
          <h2>
            {title(section)} — {data.total} รายการ
          </h2>
          {!rows.length ? (
            <Empty />
          ) : section === 'balances' ? (
            <Table
              headers={[
                'Product / Variant / SKU',
                'Barcode',
                'Branch / Location / Type',
                'Recorded / Available / Reserved',
                'Availability',
                'Updated',
              ]}
            >
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.product_name}
                    <br />
                    {row.variant_name}
                    <br />
                    {row.sku}
                  </td>
                  <td>{row.barcode ?? '—'}</td>
                  <td>
                    {row.branch_id}
                    <br />
                    {row.location_name}
                    <br />
                    {row.location_type}
                  </td>
                  <td>
                    {row.quantity} {row.unit}
                    <br />
                    {row.available} / {row.reserved}
                  </td>
                  <td>
                    {row.availability_status}
                    <br />
                    <Link to="/inventory/movements">ดูประวัติ</Link>
                  </td>
                  <td>{row.updated_at}</td>
                </tr>
              ))}
            </Table>
          ) : section === 'movements' ? (
            <Table
              headers={[
                'SKU / Location',
                'Movement',
                'Delta',
                'Before → After',
                'Reference / Reason',
                'Actor / Time',
              ]}
            >
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.sku}
                    <br />
                    {row.location_id}
                  </td>
                  <td>{row.movement_type}</td>
                  <td>{row.quantity_delta}</td>
                  <td>
                    {row.quantity_before} → {row.quantity_after}
                  </td>
                  <td>
                    {row.document_id ?? row.operation_id}
                    <br />
                    {row.reason_code}
                    <br />
                    Lot: {row.batch_id ?? 'UNTRACKED'}
                  </td>
                  <td>
                    {row.performed_by}
                    <br />
                    {row.created_at}
                  </td>
                </tr>
              ))}
            </Table>
          ) : section === 'locations' ? (
            <Table
              headers={[
                'Code / Name',
                'Branch / Parent',
                'Type',
                'Status',
                'Actions',
              ]}
            >
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.code}
                    <br />
                    {row.name}
                  </td>
                  <td>
                    {row.branch_id}
                    <br />
                    {row.parent_location_id ?? 'Physical root'}
                  </td>
                  <td>{row.type}</td>
                  <td>{row.status}</td>
                  <td>
                    {tenant.can('inventory.location.manage') &&
                      !row.is_system && (
                        <LocationEditor
                          branch={branch}
                          locations={formLocations.filter(
                            (item) => item.id !== row.id,
                          )}
                          run={run}
                          busy={busy}
                          initial={row}
                        />
                      )}
                  </td>
                </tr>
              ))}
            </Table>
          ) : section === 'reorder-points' ? (
            <Table
              headers={[
                'SKU / Branch',
                'Minimum / Target',
                'Eligible Recorded',
                'Below minimum',
                'Status / Edit',
              ]}
            >
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.sku}
                    <br />
                    {row.branch_id}
                  </td>
                  <td>
                    {row.minimum_quantity} / {row.target_quantity}
                  </td>
                  <td>{row.current_quantity}</td>
                  <td>{row.below_minimum ? 'ต่ำกว่าจุดสั่งซื้อ' : '—'}</td>
                  <td>
                    {row.status}
                    {tenant.can('inventory.reorder_point.manage') && (
                      <ReorderEditor
                        branch={branch}
                        run={run}
                        busy={busy}
                        initial={row}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          ) : (
            <Table
              headers={[
                'Reference',
                'Locations',
                'Status',
                'Items / Creator',
                'Details',
              ]}
            >
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    {row.id}
                    <br />
                    {row.reason_code}
                  </td>
                  <td>
                    {row.location_id}
                    <br />
                    {row.destination_location_id ?? '—'}
                  </td>
                  <td>{row.status}</td>
                  <td>
                    {row.items?.length}
                    <br />
                    {row.created_by}
                  </td>
                  <td>
                    {section === 'adjustments' ? (
                      <Button
                        type="button"
                        className="button-secondary"
                        onClick={() => void inspect(row)}
                      >
                        รายละเอียด
                      </Button>
                    ) : (
                      <Link to={`/inventory/${section}/${row.id}`}>
                        รายละเอียด
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          )}
          <div className="catalog-actions">
            <Button
              className="button-secondary"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              ก่อนหน้า
            </Button>
            <span>
              หน้า {page} / {Math.max(1, Math.ceil(data.total / 20))}
            </span>
            <Button
              className="button-secondary"
              disabled={page * 20 >= data.total}
              onClick={() => setPage(page + 1)}
            >
              ถัดไป
            </Button>
          </div>
        </Card>
      )}
      <CatalogError error={locations.error || destinations.error} />
    </section>
  );
}
function LocationEditor({
  branch,
  locations,
  run,
  busy,
  initial,
}: {
  branch: string;
  locations: StockLocation[];
  run: Run;
  busy: boolean;
  initial?: StockLocation;
}) {
  const [editing, setEditing] = useState(!initial);
  const [code, setCode] = useState(initial?.code ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState(initial?.type ?? 'WAREHOUSE');
  const [status, setStatus] = useState(initial?.status ?? 'ACTIVE');
  const [parent, setParent] = useState(initial?.parent_location_id ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await run(
        `/locations${initial ? '/' + initial.id : ''}`,
        initial ? 'PATCH' : 'POST',
        {
          branch_id: branch,
          code: code.toUpperCase(),
          name,
          type,
          status,
          parent_location_id: parent || null,
          description,
          revision: initial?.revision ?? 0,
        },
      );
      if (initial) setEditing(false);
      else {
        setCode('');
        setName('');
      }
    } catch {
      return;
    }
  }
  if (!editing)
    return (
      <Button
        type="button"
        className="button-secondary"
        onClick={() => setEditing(true)}
      >
        แก้ไข {initial?.code}
      </Button>
    );
  return (
    <form onSubmit={(event) => void submit(event)} className="inventory-form">
      <h3>{initial ? 'แก้ไข Location' : 'สร้าง Location'}</h3>
      <Field label="Location code">
        <input
          required
          maxLength={80}
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
      </Field>
      <Field label="Location name">
        <input
          required
          maxLength={200}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <Field label="Location type">
        <select value={type} onChange={(event) => setType(event.target.value)}>
          {['WAREHOUSE', 'SALES_FLOOR', 'SHELF', 'QUARANTINE', 'DAMAGED'].map(
            (item) => (
              <option key={item}>{item}</option>
            ),
          )}
        </select>
      </Field>
      <Field label="Parent location (navigation only)">
        <select
          value={parent}
          onChange={(event) => setParent(event.target.value)}
        >
          <option value="">ไม่มี parent</option>
          {parent && !locations.some((item) => item.id === parent) && (
            <option value={parent}>Selected parent {parent}</option>
          )}
          {locations.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Location status">
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option>ACTIVE</option>
          <option>INACTIVE</option>
        </select>
      </Field>
      <Field label="Location description">
        <textarea
          maxLength={2000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>
      <Button disabled={busy || !branch} type="submit">
        บันทึก Location
      </Button>
    </form>
  );
}
function CommandEditor({
  resource,
  locations,
  destinations = [],
  branchChoices = [],
  destinationBranch = '',
  setDestinationBranch,
  run,
  busy,
  created,
}: {
  resource: string;
  locations: StockLocation[];
  destinations?: StockLocation[];
  branchChoices?: { id: string; name: string }[];
  destinationBranch?: string;
  setDestinationBranch?: (id: string) => void;
  run: Run;
  busy: boolean;
  created?: (doc: InventoryDocument) => void;
}) {
  const [location, setLocation] = useState('');
  const [destination, setDestination] = useState('');
  const [type, setType] = useState('INCREASE');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [assigned, setAssigned] = useState('');
  const [items, setItems] = useState<
    ({ variant_id: string; quantity: string } & BatchSelection)[]
  >([{ variant_id: '', quantity: '', ...untrackedBatch }]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (
      resource === 'opening-balances' &&
      !window.confirm('ยืนยัน Opening Balance ครั้งเดียวต่อ stock identity?')
    )
      return;
    try {
      const doc = await run<InventoryDocument>(`/${resource}`, 'POST', {
        location_id: location,
        reason_code: reason,
        notes,
        items: items.map((item) => ({
          ...item,
          quantity: resource === 'counts' ? '0' : item.quantity,
        })),
        ...(resource === 'transfers'
          ? { destination_location_id: destination }
          : {}),
        ...(resource === 'adjustments' ? { adjustment_type: type } : {}),
        ...(resource === 'counts' && assigned ? { assigned_to: assigned } : {}),
      });
      if (created) created(doc);
      setReason('');
      setItems([{ variant_id: '', quantity: '', ...untrackedBatch }]);
    } catch {
      return;
    }
  }
  return (
    <Card>
      <form className="inventory-form" onSubmit={(event) => void submit(event)}>
        <h2>
          {resource === 'opening-balances'
            ? 'Opening Balance'
            : 'สร้าง ' + resource}
        </h2>
        <p>
          Draft/physical count ไม่เปลี่ยน stock; CORRECTION คือ target quantity
          แบบ snapshot-version validation
        </p>
        <Field label="Source / Count Location">
          <select
            required
            value={location}
            onChange={(event) => setLocation(event.target.value)}
          >
            <option value="">เลือก Location</option>
            {location && !locations.some((item) => item.id === location) && (
              <option value={location}>Selected location {location}</option>
            )}
            {locations.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name} · {item.type}
              </option>
            ))}
          </select>
        </Field>
        {resource === 'transfers' && (
          <>
            <Field label="Destination branch">
              <select
                value={destinationBranch}
                onChange={(event) => {
                  setDestinationBranch?.(event.target.value);
                  setDestination('');
                }}
              >
                {branchChoices.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Destination location">
              <select
                required
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
              >
                <option value="">เลือกปลายทาง</option>
                {destination &&
                  !destinations.some((item) => item.id === destination) && (
                    <option value={destination}>
                      Selected destination {destination}
                    </option>
                  )}
                {destinations
                  .filter(
                    (item) =>
                      !item.is_system &&
                      item.status === 'ACTIVE' &&
                      item.id !== location,
                  )
                  .map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </Field>
          </>
        )}
        {resource === 'adjustments' && (
          <Field label="Adjustment type">
            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              {['INCREASE', 'DECREASE', 'CORRECTION'].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
        )}
        {resource === 'counts' && (
          <Field label="Assigned counter user UUID (optional)">
            <input
              value={assigned}
              onChange={(event) => setAssigned(event.target.value)}
            />
          </Field>
        )}
        {items.map((item, index) => (
          <fieldset key={index}>
            <legend>Item {index + 1}</legend>
            <VariantPicker
              value={item.variant_id}
              change={(value) =>
                setItems(
                  items.map((row, position) =>
                    position === index
                      ? { ...row, variant_id: value, ...untrackedBatch }
                      : row,
                  ),
                )
              }
            />
            {resource !== 'counts' && (
              <BatchPicker
                key={`${item.variant_id}:${location}`}
                variant={item.variant_id}
                branch={
                  locations.find((value) => value.id === location)?.branch_id
                }
                location={
                  resource === 'transfers' || type === 'DECREASE'
                    ? location
                    : undefined
                }
                value={item}
                label={`Batch/Lot ${index + 1}`}
                change={(selection) =>
                  setItems(
                    items.map((value, position) =>
                      position === index ? { ...value, ...selection } : value,
                    ),
                  )
                }
              />
            )}
            {resource !== 'counts' && (
              <Field label={`Quantity ${index + 1}`}>
                <input
                  required
                  inputMode="decimal"
                  pattern="[0-9]+(\.[0-9]{1,3})?"
                  value={item.quantity}
                  onChange={(event) =>
                    setItems(
                      items.map((row, position) =>
                        position === index
                          ? { ...row, quantity: event.target.value }
                          : row,
                      ),
                    )
                  }
                />
              </Field>
            )}
            {items.length > 1 && (
              <Button
                type="button"
                className="button-secondary"
                onClick={() =>
                  setItems(items.filter((_, position) => position !== index))
                }
              >
                นำ Item {index + 1} ออก
              </Button>
            )}
          </fieldset>
        ))}
        <Button
          type="button"
          className="button-secondary"
          disabled={items.length >= 100}
          onClick={() =>
            setItems([
              ...items,
              { variant_id: '', quantity: '', ...untrackedBatch },
            ])
          }
        >
          เพิ่ม Item
        </Button>
        <Field label="Reason / Reference">
          <input
            required
            maxLength={100}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        <Field label="Notes">
          <textarea
            maxLength={2000}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Field>
        <Button disabled={busy} type="submit">
          {resource === 'opening-balances'
            ? 'Post Opening Balance'
            : 'สร้างเอกสาร'}
        </Button>
      </form>
    </Card>
  );
}
function DocumentDetails({
  doc,
  resource,
  run,
  busy,
  updated,
}: {
  doc: InventoryDocument;
  resource: string;
  run: Run;
  busy: boolean;
  updated?: (doc: InventoryDocument) => void;
}) {
  const tenant = useOrganization();
  const [observed, setObserved] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      doc.items.map((item) => [item.variant_id, item.counted_quantity ?? '']),
    ),
  );
  const prefix = doc.kind.toLowerCase();
  const steps: Record<string, string[]> = {
    DRAFT: ['submit', 'cancel'],
    PENDING_APPROVAL: ['approve', 'reject', 'cancel'],
    IN_PROGRESS: ['submit', 'cancel'],
    SUBMITTED: ['approve', 'cancel'],
    APPROVED: [doc.kind === 'TRANSFER' ? 'dispatch' : 'post', 'cancel'],
    DISPATCHED: ['receive'],
  };
  async function act(action: string) {
    if (
      ['post', 'dispatch', 'receive'].includes(action) &&
      !window.confirm(
        `ยืนยัน ${action}? การเปลี่ยน stock ต้องใช้ compensating operation เพื่อแก้ไข`,
      )
    )
      return;
    try {
      const result = await run<InventoryDocument>(
        `/${resource}/${doc.id}/${action}`,
        'POST',
        { revision: doc.revision },
      );
      updated?.(result);
    } catch {
      return;
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await run<InventoryDocument>(
        `/counts/${doc.id}/items`,
        'PATCH',
        {
          revision: doc.revision,
          items: doc.items.map((item) => ({
            variant_id: item.variant_id,
            counted_quantity: observed[item.variant_id],
          })),
        },
      );
      updated?.(result);
    } catch {
      return;
    }
  }
  const canSave =
    doc.kind === 'COUNT' &&
    doc.status === 'IN_PROGRESS' &&
    tenant.can('inventory.count.update') &&
    branchAllowed(doc.branch_id) &&
    (!doc.assigned_to ||
      doc.assigned_to === tenant.context?.membership.user_id ||
      ['OWNER', 'MANAGER'].includes(tenant.context?.membership.role ?? ''));
  function branchAllowed(branchID: string | null) {
    return (
      tenant.context?.branches.some(
        (branch) => branch.id === branchID && branch.status === 'ACTIVE',
      ) ?? false
    );
  }
  function actionAllowed(action: string) {
    const elevated = ['OWNER', 'MANAGER'].includes(
      tenant.context?.membership.role ?? '',
    );
    if (
      action === 'cancel' &&
      doc.created_by !== tenant.context?.membership.user_id &&
      !elevated
    )
      return false;
    if (
      action === 'submit' &&
      doc.kind === 'COUNT' &&
      doc.assigned_to &&
      doc.assigned_to !== tenant.context?.membership.user_id &&
      !elevated
    )
      return false;
    if (action === 'receive') return branchAllowed(doc.destination_branch_id);
    if (!branchAllowed(doc.branch_id)) return false;
    return (
      doc.kind !== 'TRANSFER' ||
      action === 'dispatch' ||
      branchAllowed(doc.destination_branch_id)
    );
  }
  return (
    <Card>
      <h2>
        {doc.kind} · {doc.id}
      </h2>
      <p>
        Status: <strong>{doc.status}</strong> · Revision: {doc.revision}
      </p>
      <p>
        Reason: {doc.reason_code} · {doc.notes}
      </p>
      <p>
        Source: {doc.location_id} · Destination:{' '}
        {doc.destination_location_id ?? '—'} · Transit:{' '}
        {doc.transit_location_id ?? '—'}
      </p>
      <p>
        Creator: {doc.created_by} · Assigned: {doc.assigned_to ?? '—'} ·
        Approver: {doc.approved_by ?? '—'}
      </p>
      <p>
        Dispatched: {doc.dispatched_by ?? '—'} · Received:{' '}
        {doc.received_by ?? '—'} · Posted: {doc.posted_by ?? '—'}
      </p>
      <form onSubmit={(event) => void save(event)}>
        <Table
          headers={[
            'SKU / Unit',
            'Quantity / Expected',
            'Counted',
            'Variance / %',
            'Counter / Time',
          ]}
        >
          {doc.items.map((item: InventoryItem) => (
            <tr key={item.variant_id}>
              <td>
                {item.sku ?? item.variant_id}
                <br />
                {item.unit}
              </td>
              <td>
                {doc.kind === 'COUNT' ? item.expected_quantity : item.quantity}
              </td>
              <td>
                {canSave ? (
                  <Field label={`Counted ${item.sku ?? item.variant_id}`}>
                    <input
                      required
                      inputMode="decimal"
                      pattern="[0-9]+(\.[0-9]{1,3})?"
                      value={observed[item.variant_id]}
                      onChange={(event) =>
                        setObserved({
                          ...observed,
                          [item.variant_id]: event.target.value,
                        })
                      }
                    />
                  </Field>
                ) : (
                  (item.counted_quantity ?? '—')
                )}
              </td>
              <td>
                {item.expected_quantity && item.counted_quantity ? (
                  <>
                    {quantityVariance(
                      item.expected_quantity,
                      item.counted_quantity,
                    )}
                    <br />
                    {variancePercent(
                      item.expected_quantity,
                      item.counted_quantity,
                    )}
                  </>
                ) : (
                  '—'
                )}
              </td>
              <td>
                {item.counted_by ?? '—'}
                <br />
                {item.counted_at ?? '—'}
              </td>
            </tr>
          ))}
        </Table>
        {canSave && (
          <Button disabled={busy} type="submit">
            Save Physical Count
          </Button>
        )}
      </form>
      <div className="catalog-actions">
        {(steps[doc.status] ?? [])
          .filter(actionAllowed)
          .filter(
            (action) => !(doc.kind !== 'ADJUSTMENT' && action === 'reject'),
          )
          .filter((action) =>
            tenant.can(
              `inventory.${prefix}.${action === 'submit' ? (doc.kind === 'COUNT' ? 'update' : 'create') : action === 'cancel' ? 'create' : action === 'reject' ? 'approve' : action}`,
            ),
          )
          .map((action) => (
            <Button
              key={action}
              disabled={busy}
              onClick={() => void act(action)}
            >
              {action}
            </Button>
          ))}
      </div>
      <Link to="/inventory/movements">
        Related immutable ledger — filter by Variant / location
      </Link>
      <h3>Audit history</h3>
      {doc.history?.length ? (
        <ul>
          {doc.history.map((event, index) => (
            <li key={index}>
              {event.event_type} · {event.actor_id} · {event.created_at}
            </li>
          ))}
        </ul>
      ) : (
        <p>
          ประวัติจะโหลดใหม่หลังบันทึก; ไม่ใช่ comprehensive denied-request audit
        </p>
      )}
    </Card>
  );
}
function ReorderEditor({
  branch,
  run,
  busy,
  initial,
}: {
  branch: string;
  run: Run;
  busy: boolean;
  initial?: ReorderPoint;
}) {
  const [variant, setVariant] = useState(initial?.variant_id ?? '');
  const [minimum, setMinimum] = useState(initial?.minimum_quantity ?? '');
  const [target, setTarget] = useState(initial?.target_quantity ?? '');
  const [status, setStatus] = useState(initial?.status ?? 'ACTIVE');
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await run('/reorder-points', 'PUT', {
        branch_id: branch,
        variant_id: variant,
        minimum_quantity: minimum,
        target_quantity: target,
        status,
      });
    } catch {
      return;
    }
  }
  return (
    <form className="inventory-form" onSubmit={(event) => void submit(event)}>
      <h3>{initial ? 'แก้ไข' : 'ตั้งค่า'} Reorder Point</h3>
      <p>
        ประเมิน active WAREHOUSE + SALES_FLOOR + SHELF; ไม่รวม
        quarantine/damaged/transit
      </p>
      <VariantPicker value={variant} change={setVariant} />
      <Field label="Minimum Quantity">
        <input
          required
          inputMode="decimal"
          value={minimum}
          onChange={(event) => setMinimum(event.target.value)}
        />
      </Field>
      <Field label="Target Quantity">
        <input
          required
          inputMode="decimal"
          value={target}
          onChange={(event) => setTarget(event.target.value)}
        />
      </Field>
      <Field label="Reorder status">
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option>ACTIVE</option>
          <option>INACTIVE</option>
        </select>
      </Field>
      <Button disabled={busy} type="submit">
        Save Reorder Point
      </Button>
    </form>
  );
}
