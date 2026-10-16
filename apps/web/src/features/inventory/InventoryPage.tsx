import { useLanguage } from '../../app/language';
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

function getStatusOptions(section: string) {
  if (['locations', 'reorder-points'].includes(section)) {
    return ['ACTIVE', 'INACTIVE'];
  }
  return [
    'DRAFT',
    'SUBMITTED',
    'IN_PROGRESS',
    'APPROVED',
    'POSTED',
    'RECEIVED',
    'CANCELLED',
    'REJECTED',
  ];
}

function movementTypeTone(
  type: string,
): 'success' | 'amber' | 'error' | 'neutral' {
  if (
    [
      'OPENING_BALANCE',
      'TRANSFER_IN',
      'ADJUSTMENT_IN',
      'PURCHASE_RECEIVE',
      'COUNT_CORRECTION',
    ].includes(type)
  ) {
    return 'success';
  }
  if (['TRANSFER_OUT', 'TRANSFER_DISPATCH', 'ADJUSTMENT_OUT'].includes(type)) {
    return 'amber';
  }
  if (['SALE', 'SUPPLIER_RETURN'].includes(type)) {
    return 'error';
  }
  return 'neutral';
}

function inventoryStatusTone(
  status: string,
): 'success' | 'amber' | 'error' | 'neutral' {
  if (['ACTIVE', 'POSTED', 'RECEIVED', 'APPROVED'].includes(status))
    return 'success';
  if (['INACTIVE', 'DRAFT', 'SUBMITTED', 'IN_PROGRESS'].includes(status))
    return 'amber';
  if (['CANCELLED', 'REJECTED'].includes(status)) return 'error';
  return 'neutral';
}

const sections = [
  ['overview', 'inventory.overview'],
  ['balances', 'catalog.stockBalances'],
  ['locations', 'inventory.storageLocations'],
  ['movements', 'inventory.history'],
  ['adjustments', 'inventory.stockAdjustments'],
  ['counts', 'inventory.stockCounts'],
  ['transfers', 'inventory.transfers'],
  ['reorder-points', 'inventory.reorderPoints'],
] as const;
const title = (section: string) =>
  sections.find(([name]) => name === section)?.[1] ?? 'dashboard.inventory';
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
  const { t, localize, labelCode } = useLanguage();

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
            {shelfOnly
              ? t('inventory.shelfCounts')
              : t('inventory.manageStock')}
          </p>
          <h1>{t(title(section))}</h1>
          <p>{t('inventory.reviewBranchBalancesMovementsAndStockCount')}</p>
        </div>
      </header>
      <nav className="catalog-nav" aria-label={t('dashboard.inventory')}>
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
              {t(label)}
            </Link>
          ))}
      </nav>
      <p>
        {t('inventory.scope')}{' '}
        {tenant.context?.branches.find((item) => item.id === branch)?.name ??
          t('inventory.noBranchSelected')}{' '}
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
          {localize(success ?? '')}
        </p>
      )}
      {!branch ? (
        <p role="status">{t('inventory.selectAnAuthorizedBranchFirst')}</p>
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
            <Field label={t('inventory.searchSkuProductBarcode')}>
              <input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
              />
            </Field>
            {['balances', 'movements', 'counts'].includes(section) && (
              <Field label={t('inventory.locationFilter')}>
                <select
                  value={locationFilter}
                  onChange={(event) => {
                    setLocationFilter(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">{t('common.all')}</option>
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
              <Field label={t('inventory.statusFilter')}>
                <select
                  aria-label={t('inventory.statusFilter')}
                  value={status}
                  onChange={(event) => {
                    setStatus(event.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">{t('common.all')}</option>
                  {getStatusOptions(section).map((item) => (
                    <option key={item} value={item}>
                      {labelCode(item)}
                    </option>
                  ))}
                </select>
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
                <Field label={t('inventory.stockStatus')}>
                  <select
                    value={stockStatus}
                    onChange={(event) => {
                      setStockStatus(event.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">{t('common.all')}</option>
                    {['ZERO', 'POSITIVE', 'LOW'].map((item) => (
                      <option key={item} value={item}>
                        {labelCode(item)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t('inventory.categoryUuid')}>
                  <input
                    value={category}
                    onChange={(event) => {
                      setCategory(event.target.value);
                      setPage(1);
                    }}
                  />
                </Field>
                <Field label={t('inventory.productStatus')}>
                  <select
                    value={productStatus}
                    onChange={(event) => {
                      setProductStatus(event.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">{t('common.all')}</option>
                    {['ACTIVE', 'INACTIVE', 'ARCHIVED'].map((item) => (
                      <option key={item} value={item}>
                        {labelCode(item)}
                      </option>
                    ))}
                  </select>
                </Field>
              </>
            )}
            {section === 'movements' && (
              <>
                <Field label={t('inventory.fromTimestamp')}>
                  <input
                    type="datetime-local"
                    value={from}
                    onChange={(event) => setFrom(event.target.value)}
                  />
                </Field>
                <Field label={t('inventory.toTimestamp')}>
                  <input
                    type="datetime-local"
                    value={to}
                    onChange={(event) => setTo(event.target.value)}
                  />
                </Field>
                <Field label={t('inventory.actorUuid')}>
                  <input
                    value={actor}
                    onChange={(event) => setActor(event.target.value)}
                  />
                </Field>
              </>
            )}
            <Button type="submit" className="button-secondary">
              {t('customers.search')}
            </Button>
          </form>
        </Card>
      )}
      {section === 'overview' && data && 'stock' in data && (
        <>
          <div className="inventory-metrics">
            {[
              [
                t('inventory.variantsWithRecordedBalances'),
                data.stock.recorded_variants,
              ],
              [
                t('inventory.activeCatalogVariantsOrganization'),
                data.alerts.active_variants,
              ],
              [
                t('inventory.lowStockVariantsBranchReorderPolicy'),
                data.alerts.low_stock_variants,
              ],
              [
                t('inventory.pendingAdjustments'),
                data.operations.pending_adjustments,
              ],
              [t('inventory.openCounts'), data.operations.open_counts],
              [
                t('inventory.pendingTransfers'),
                data.operations.pending_transfers,
              ],
            ].map(([label, value]) => (
              <Card key={label}>
                <h2>{label}</h2>
                <strong>{value}</strong>
              </Card>
            ))}
          </div>
          <Card>
            <h2>{t('inventory.recordedQuantityByUnitAndLocationType')}</h2>
            {data.stock.by_unit.length ? (
              <Table
                headers={[
                  t('inventory.unit'),
                  t('inventory.locationType'),
                  t('inventory.recordedQuantity'),
                ]}
              >
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
              <h2>{t('inventory.recentMovements')}</h2>
              <Table
                headers={[
                  t('common.sku'),
                  t('inventory.movement'),
                  t('inventory.delta'),
                  t('inventory.time'),
                ]}
              >
                {data.recent_movements.map((movement) => (
                  <tr key={movement.id}>
                    <td>{movement.sku}</td>
                    <td>{labelCode(movement.movement_type)}</td>
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
          aria-label={t('inventory.locationOptionsPagination')}
        >
          <div className="inventory-options-group">
            <div className="inventory-options-info">
              <MapPin size={16} aria-hidden="true" />
              <span>
                {t('inventory.locationOptionsPage')} {locationPage}
              </span>
              {locations.data?.total ? (
                <span className="inventory-options-total">
                  • {locations.data.total} {t('inventory.locations')}
                </span>
              ) : null}
            </div>
            <div className="inventory-options-actions">
              <Button
                className="button-secondary button-compact"
                disabled={locationPage === 1}
                onClick={() => setLocationPage(locationPage - 1)}
              >
                {t('inventory.previousLocations')}
              </Button>
              <Button
                className="button-secondary button-compact"
                disabled={locationPage * 100 >= (locations.data?.total ?? 0)}
                onClick={() => setLocationPage(locationPage + 1)}
              >
                {t('inventory.nextLocations')}
              </Button>
            </div>
          </div>
          {section === 'transfers' && (
            <div className="inventory-options-group">
              <div className="inventory-options-info">
                <MapPin size={16} aria-hidden="true" />
                <span>
                  {t('inventory.destinationOptionsPage')} {destinationPage}
                </span>
                {destinations.data?.total ? (
                  <span className="inventory-options-total">
                    • {destinations.data.total} {t('inventory.destinations')}
                  </span>
                ) : null}
              </div>
              <div className="inventory-options-actions">
                <Button
                  className="button-secondary button-compact"
                  disabled={destinationPage === 1}
                  onClick={() => setDestinationPage(destinationPage - 1)}
                >
                  {t('inventory.previousDestinations')}
                </Button>
                <Button
                  className="button-secondary button-compact"
                  disabled={
                    destinationPage * 100 >= (destinations.data?.total ?? 0)
                  }
                  onClick={() => setDestinationPage(destinationPage + 1)}
                >
                  {t('inventory.nextDestinations')}
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
            {t(title(section))} — {data.total} {t('catalog.definitions')}
          </h2>
          {!rows.length ? (
            <Empty />
          ) : section === 'balances' ? (
            <Table
              headers={[
                'Product / Variant / SKU',
                t('catalog.barcode2'),
                'Branch / Location / Type',
                'Recorded / Available / Reserved',
                t('inventory.availability'),
                t('catalog.updated2'),
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
                        {t('inventory.viewHistory')}
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
                t('inventory.movement'),
                t('inventory.delta'),
                t('inventory.beforeAfter'),
                'Reference / Reason',
                'Actor / Time',
              ]}
            >
              {rows.map((row) => {
                const deltaNum = Number(row.quantity_delta);
                const deltaDisplay =
                  deltaNum > 0 ? `+${row.quantity_delta}` : row.quantity_delta;
                return (
                  <tr key={row.id}>
                    <td>
                      <strong>{row.sku}</strong>
                      <br />
                      <span className="inventory-text-muted">
                        {row.location_id}
                      </span>
                    </td>
                    <td>
                      <Tag tone={movementTypeTone(row.movement_type)}>
                        {labelCode(row.movement_type)}
                      </Tag>
                    </td>
                    <td>
                      <span
                        className={
                          deltaNum > 0
                            ? 'inventory-delta-positive'
                            : 'inventory-delta-negative'
                        }
                      >
                        {deltaDisplay}
                      </span>
                    </td>
                    <td>
                      {row.quantity_before} → {row.quantity_after}
                    </td>
                    <td>
                      {row.reason_code}
                      <br />
                      <span className="inventory-text-muted">
                        {t('inventory.ref')}{' '}
                        {row.document_id ?? row.operation_id}
                        {row.batch_id ? ` • Lot: ${row.batch_id}` : ''}
                      </span>
                    </td>
                    <td>
                      {row.performed_by}
                      <br />
                      <span className="inventory-text-muted">
                        {row.created_at}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </Table>
          ) : section === 'locations' ? (
            <Table
              headers={[
                'Code / Name',
                'Branch / Parent',
                t('inventory.type'),
                t('auth.status'),
                t('inventory.actions'),
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
                    {row.parent_location_id ?? t('inventory.physicalRoot')}
                  </td>
                  <td>{row.type}</td>
                  <td>
                    <Tag tone={inventoryStatusTone(row.status)}>
                      {labelCode(row.status)}
                    </Tag>
                  </td>
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
                t('inventory.eligibleRecorded'),
                t('inventory.belowMinimum'),
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
                  <td>
                    {row.below_minimum ? t('inventory.belowReorderPoint') : '—'}
                  </td>
                  <td>
                    <Tag tone={inventoryStatusTone(row.status)}>
                      {labelCode(row.status)}
                    </Tag>
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
                t('inventory.reference'),
                t('inventory.locations2'),
                t('auth.status'),
                'Items / Creator',
                t('inventory.details'),
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
                  <td>
                    <Tag tone={inventoryStatusTone(row.status)}>
                      {labelCode(row.status)}
                    </Tag>
                  </td>
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
                        {t('inventory.details')}
                      </Button>
                    ) : (
                      <Link to={`/inventory/${section}/${row.id}`}>
                        {t('inventory.details')}
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
