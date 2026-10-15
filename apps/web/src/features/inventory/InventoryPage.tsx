import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { WorkspaceLink as Link } from '../../app/WorkspaceNavigation';
import { useQuery } from '@tanstack/react-query';
import { MapPin, History } from 'lucide-react';
import { useInventoryCommand } from './inventory-hooks';
import { QueryFeedback } from '../../components/feedback/QueryFeedback';
import { useOrganization } from '../../app/OrganizationProvider';
import { organizationRequest } from '../../lib/organization-api';
import type {
  InventoryDocument,
  InventoryOverview,
  InventoryPageData,
  ReorderPoint,
  StockBalance,
  StockLocation,
  StockMovement,
} from '../../lib/inventory-api';
import { Button, Card, Tag } from '../../components/ui/primitives';
import { CatalogError, Pagination } from '../catalog/CatalogUI';
import { Field, Table, Empty } from './InventoryUI';
import {
  LocationEditor,
  CommandEditor,
  DocumentDetails,
  ReorderEditor,
} from './InventoryForms';

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
  const org = tenant.context?.organization.id ?? '';
  const branch = tenant.branchID;
  const { key, base, run, read, error, success, busy } = useInventoryCommand();
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
  const [selected, setSelected] = useState<InventoryDocument | null>(null);
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
  const formLocations = (locations.data?.items ?? []).filter(
    (item) => item.status === 'ACTIVE' && !item.is_system,
  );
  const data = query.data;
  const rows = data && 'total' in data ? data.items : [];
  async function inspect(doc: InventoryDocument) {
    try {
      setSelected(await read<InventoryDocument>(`/${section}/${doc.id}`));
    } catch {
      return;
    }
  }
  return (
    <section className="catalog-page inventory-page">
      <header className="catalog-header">
        <div>
          <p className="eyebrow">
            {shelfOnly ? 'ตรวจนับสินค้าบนชั้นวาง' : 'จัดการสต็อก'}
          </p>
          <h1>{title(section)}</h1>
          <p>ตรวจสอบยอดคงเหลือ การเคลื่อนไหว และผลตรวจนับของสาขา</p>
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
      </p>
      <CatalogError error={error} />
      <QueryFeedback
        loading={
          query.isFetching || locations.isFetching || destinations.isFetching
        }
        error={query.error ?? locations.error ?? destinations.error}
        retry={() => {
          if (org && branch) {
            void query.refetch();
            void locations.refetch();
          }
          if (section === 'transfers' && destinationBranch)
            void destinations.refetch();
        }}
      />
      {success && (
        <p role="status" className="tenant-success">
          {success}
        </p>
      )}
      {!branch ? (
        <p role="status">กรุณาเลือกสาขาที่มีสิทธิ์ใช้งานก่อน</p>
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
          className="inventory-options-toolbar"
          aria-label="Location options pagination"
        >
          <div className="inventory-options-group">
            <div className="inventory-options-info">
              <MapPin size={16} aria-hidden="true" />
              <span>Location options: หน้า {locationPage}</span>
              {locations.data?.total ? (
                <span className="inventory-options-total">
                  • {locations.data.total} สถานที่
                </span>
              ) : null}
            </div>
            <div className="inventory-options-actions">
              <Button
                className="button-secondary button-compact"
                disabled={locationPage === 1}
                onClick={() => setLocationPage(locationPage - 1)}
              >
                Locations ก่อนหน้า
              </Button>
              <Button
                className="button-secondary button-compact"
                disabled={locationPage * 100 >= (locations.data?.total ?? 0)}
                onClick={() => setLocationPage(locationPage + 1)}
              >
                Locations ถัดไป
              </Button>
            </div>
          </div>
          {section === 'transfers' && (
            <div className="inventory-options-group">
              <div className="inventory-options-info">
                <MapPin size={16} aria-hidden="true" />
                <span>Destination options: หน้า {destinationPage}</span>
                {destinations.data?.total ? (
                  <span className="inventory-options-total">
                    • {destinations.data.total} ปลายทาง
                  </span>
                ) : null}
              </div>
              <div className="inventory-options-actions">
                <Button
                  className="button-secondary button-compact"
                  disabled={destinationPage === 1}
                  onClick={() => setDestinationPage(destinationPage - 1)}
                >
                  Destinations ก่อนหน้า
                </Button>
                <Button
                  className="button-secondary button-compact"
                  disabled={
                    destinationPage * 100 >= (destinations.data?.total ?? 0)
                  }
                  onClick={() => setDestinationPage(destinationPage + 1)}
                >
                  Destinations ถัดไป
                </Button>
              </div>
            </div>
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
                    <div className="inventory-availability-cell">
                      <Tag
                        tone={
                          row.availability_status === 'POS_ELIGIBLE'
                            ? 'success'
                            : row.availability_status === 'RESTRICTED'
                              ? 'amber'
                              : 'neutral'
                        }
                      >
                        {row.availability_status}
                      </Tag>
                      <Link
                        className="button button-secondary button-compact inventory-history-btn"
                        to="/inventory/movements"
                      >
                        <History size={14} aria-hidden="true" />
                        ดูประวัติ
                      </Link>
                    </div>
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
          <Pagination
            page={page}
            total={data.total}
            size={20}
            change={setPage}
          />
        </Card>
      )}
    </section>
  );
}
