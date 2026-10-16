import { useLanguage } from '../../app/language';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { WorkspaceLink as Link } from '../../app/WorkspaceNavigation';
import { useWorkspaceNavigate as useNavigate } from '../../app/useWorkspaceNavigate';
import { useAuth } from '../../app/AuthProvider';
import { useOrganization } from '../../app/OrganizationProvider';
import { Button, Card, Tag } from '../../components/ui/primitives';
import {
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ChevronRight,
  Layers,
} from 'lucide-react';
import { CartBatchPicker } from '../quality/BatchPicker';
import { untrackedBatch } from '../../lib/quality-api';
import type { StockLocation } from '../../lib/inventory-api';
import type { Member } from '../../lib/organization-api';
import type {
  Shelf,
  ShelfAssignment,
  ReplenishmentTask,
  ReplenishmentSuggestion,
  SupplyPage,
} from '../../lib/purchasing-api';
import {
  useSupplyScope,
  useSupplyQuery,
  type SupplyScope,
} from './purchasing-hooks';
import {
  Field,
  TextField,
  SupplyNav,
  SupplyFeedback,
  SupplyTable,
  Pagination,
  QueryFeedback,
  RemoteSelect,
  VariantPicker,
} from './SupplyUI';

const titles = {
  overview: 'purchasing.shelves',
  new: 'purchasing.addShelf',
  detail: 'purchasing.shelfDetails',
  layout: 'purchasing.shelfLayout',
  replenishments: 'purchasing.replenishShelves',
  discrepancies: 'purchasing.shelfCountDifferences',
} as const;
export function ShelfPage({ view }: { view: string }) {
  const auth = useAuth(),
    tenant = useOrganization(),
    { id } = useParams();
  return (
    <ShelfScreen
      key={`${auth.state.session?.user.id}:${tenant.context?.organization.id}:${tenant.branchID}:${view}:${id ?? ''}`}
      view={view}
      id={id}
    />
  );
}
function ShelfScreen({ view, id }: { view: string; id?: string }) {
  const { t, labelCode } = useLanguage();

  const state = useSupplyScope(),
    [search, setSearch] = useState(''),
    [page, setPage] = useState(1),
    [status, setStatus] = useState(''),
    [selected, setSelected] = useState('');
  const list = useSupplyQuery<SupplyPage<Shelf>>(
    `/shelves?branch_id=${state.branch}&search=${encodeURIComponent(search)}&status=${status}&page=${page}&page_size=20`,
    !!state.branch && ['overview', 'layout'].includes(view),
  );
  return (
    <section className="catalog-page supply-page">
      <header className="catalog-header">
        <div>
          <p className="eyebrow">{t('purchasing.shelvesPhase4')}</p>
          <h1>{t(titles[view as keyof typeof titles])}</h1>
          <p>{t('purchasing.recordedStockIsTheInventoryLedgerBalance')}</p>
        </div>
        {state.tenant.can('shelf.manage') && (
          <Link className="button" to="/shelves/new">
            {t('purchasing.addShelf')}
          </Link>
        )}
      </header>
      <SupplyNav shelves />
      <SupplyFeedback state={state} />
      {!state.branch ? (
        <p role="alert">{t('purchasing.selectABranchFromTheHeaderBefore')}</p>
      ) : (
        <>
          {view === 'new' && <ShelfForm state={state} />}
          {view === 'detail' && id && <ShelfDetail state={state} id={id} />}
          {['overview', 'layout'].includes(view) && (
            <>
              <div className="catalog-actions">
                <TextField
                  label={t('purchasing.searchShelfZone')}
                  value={search}
                  change={(value) => {
                    setSearch(value);
                    setPage(1);
                  }}
                />
                <Field label={t('purchasing.shelfStatus')}>
                  <select
                    value={status}
                    onChange={(event) => {
                      setStatus(event.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">{t('purchasing.allStatuses')}</option>
                    {['ACTIVE', 'INACTIVE', 'ARCHIVED'].map((value) => (
                      <option key={value} value={value}>
                        {labelCode(value)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <QueryFeedback
                retry={() => void list.refetch()}
                loading={list.isFetching}
                error={list.error}
                empty={list.data?.total === 0}
              />
              {view === 'overview' ? (
                <>
                  {list.data?.items && list.data.items.length > 0 && (
                    <div
                      className="supply-layout"
                      style={{ marginBottom: '16px' }}
                    >
                      <Card className="shelf-metric-card">
                        <div className="shelf-metric-header">
                          <span>{t('purchasing.allShelves')}</span>
                          <Layers size={18} aria-hidden="true" />
                        </div>
                        <div className="shelf-metric-value">
                          <span>
                            {list.data.total ?? list.data.items.length}
                          </span>
                          <small>{t('purchasing.shelfLocations')}</small>
                        </div>
                      </Card>
                      <Card className="shelf-metric-card">
                        <div className="shelf-metric-header">
                          <span>{t('purchasing.assignedProducts')}</span>
                          <Boxes size={18} aria-hidden="true" />
                        </div>
                        <div className="shelf-metric-value">
                          <span>
                            {list.data.items.reduce(
                              (acc, s) => acc + (s.assignment_count ?? 0),
                              0,
                            )}
                          </span>
                          <small>{t('purchasing.assignments')}</small>
                        </div>
                      </Card>
                      <Card
                        className={`shelf-metric-card ${
                          list.data.items.some(
                            (s) => (s.low_stock_count ?? 0) > 0,
                          )
                            ? 'warning-card'
                            : ''
                        }`}
                      >
                        <div className="shelf-metric-header">
                          <span>
                            {t(
                              'purchasing.locationsNeedingUrgentReplenishment',
                            )}
                          </span>
                          <AlertTriangle
                            size={18}
                            aria-hidden="true"
                            color={
                              list.data.items.some(
                                (s) => (s.low_stock_count ?? 0) > 0,
                              )
                                ? 'var(--primary-strong)'
                                : 'var(--text-secondary)'
                            }
                          />
                        </div>
                        <div className="shelf-metric-value">
                          <span
                            style={{
                              color: list.data.items.some(
                                (s) => (s.low_stock_count ?? 0) > 0,
                              )
                                ? 'var(--primary-strong)'
                                : 'inherit',
                            }}
                          >
                            {
                              list.data.items.filter(
                                (s) => (s.low_stock_count ?? 0) > 0,
                              ).length
                            }
                          </span>
                          <small>
                            {list.data.items.some(
                              (s) => (s.low_stock_count ?? 0) > 0,
                            )
                              ? t('purchasing.shelvesRunningLow')
                              : t('purchasing.allShelvesAreStockedForSales')}
                          </small>
                        </div>
                        {list.data.items.some(
                          (s) => (s.low_stock_count ?? 0) > 0,
                        ) && (
                          <Link
                            to="/shelves/replenishments"
                            className="button button-secondary"
                            style={{
                              marginTop: '6px',
                              minHeight: '32px',
                              padding: '4px 10px',
                              fontSize: '12px',
                              alignSelf: 'flex-start',
                            }}
                          >
                            {t('purchasing.goToReplenishment')}
                          </Link>
                        )}
                      </Card>
                    </div>
                  )}
                  <Card>
                    <SupplyTable
                      headers={[
                        t('purchasing.code'),
                        'Shelf / Zone',
                        t('purchasing.assignments2'),
                        t('purchasing.lowStock'),
                        t('auth.status'),
                        t('inventory.actions'),
                      ]}
                    >
                      {list.data?.items.map((shelf) => (
                        <tr key={shelf.id}>
                          <td>
                            <span className="shelf-code">{shelf.code}</span>
                          </td>
                          <td>
                            <div className="shelf-cell-zone">
                              <strong>{shelf.name}</strong>
                              {shelf.zone ? (
                                <span
                                  className="tag"
                                  style={{
                                    alignSelf: 'flex-start',
                                    fontSize: '12px',
                                    padding: '1px 8px',
                                  }}
                                >
                                  {t('purchasing.zone2')} {shelf.zone}
                                </span>
                              ) : (
                                <small
                                  style={{ color: 'var(--text-tertiary)' }}
                                >
                                  {t('purchasing.noZoneSpecified')}
                                </small>
                              )}
                            </div>
                          </td>
                          <td>
                            <span style={{ fontWeight: 600 }}>
                              {shelf.assignment_count}
                            </span>{' '}
                            <small
                              style={{
                                display: 'inline',
                                color: 'var(--text-secondary)',
                              }}
                            >
                              {t('catalog.definitions')}
                            </small>
                          </td>
                          <td>
                            {shelf.low_stock_count > 0 ? (
                              <Tag tone="amber">
                                <AlertTriangle
                                  size={14}
                                  aria-hidden="true"
                                  style={{
                                    display: 'inline',
                                    marginRight: '4px',
                                    verticalAlign: '-2px',
                                  }}
                                />
                                {shelf.low_stock_count}{' '}
                                {t('purchasing.needReplenishment')}
                              </Tag>
                            ) : (
                              <Tag tone="success">
                                <CheckCircle2
                                  size={14}
                                  aria-hidden="true"
                                  style={{
                                    display: 'inline',
                                    marginRight: '4px',
                                    verticalAlign: '-2px',
                                  }}
                                />
                                {t('purchasing.normal')}
                              </Tag>
                            )}
                          </td>
                          <td>
                            <Tag
                              tone={
                                shelf.status === 'ACTIVE'
                                  ? 'success'
                                  : shelf.status === 'ARCHIVED'
                                    ? 'error'
                                    : 'neutral'
                              }
                            >
                              {labelCode(shelf.status)}
                            </Tag>
                          </td>
                          <td>
                            <div className="shelf-table-actions">
                              <Link
                                className="button button-secondary"
                                to={'/shelves/' + shelf.id}
                              >
                                {t('purchasing.openShelf')}
                                <ChevronRight size={14} aria-hidden="true" />
                              </Link>
                              {shelf.low_stock_count > 0 && (
                                <Link
                                  className="button"
                                  to="/shelves/replenishments"
                                  title={t(
                                    'purchasing.createReplenishmentTask',
                                  )}
                                >
                                  {t('purchasing.replenish')}
                                </Link>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </SupplyTable>
                    <Pagination
                      page={page}
                      total={list.data?.total ?? 0}
                      change={setPage}
                    />
                  </Card>
                </>
              ) : (
                <>
                  <p>{t('purchasing.dataBased2dLayoutByZoneCode')}</p>
                  <div className="supply-layout">
                    {list.data?.items.map((shelf) => (
                      <Card key={shelf.id}>
                        <h2>
                          {shelf.zone || t('purchasing.noZoneSpecified2')} ·{' '}
                          {shelf.code}
                        </h2>
                        <p>
                          {shelf.name} · {labelCode(shelf.status)}
                        </p>
                        <p>
                          {shelf.assignment_count}{' '}
                          {t('purchasing.assignments3')} {shelf.low_stock_count}{' '}
                          {t('purchasing.belowMinimum')}
                        </p>
                        <Button onClick={() => setSelected(shelf.id)}>
                          {t('purchasing.viewSlotsProducts')}
                        </Button>
                        <Link to={'/shelves/' + shelf.id}>
                          {' '}
                          {t('catalog.manage')}
                        </Link>
                      </Card>
                    ))}
                  </div>
                  {selected && (
                    <ShelfDetail
                      key={selected}
                      state={state}
                      id={selected}
                      readonly
                    />
                  )}
                  <Pagination
                    page={page}
                    total={list.data?.total ?? 0}
                    change={setPage}
                  />
                </>
              )}
            </>
          )}
          {view === 'replenishments' && <Replenishments state={state} />}
          {view === 'discrepancies' && (
            <>
              <RemoteSelect<Shelf>
                label={t('purchasing.shelf')}
                path={`/shelves?branch_id=${state.branch}`}
                value={selected}
                change={setSelected}
                display={(shelf) => `${shelf.code} · ${shelf.name}`}
              />
              <p>{t('purchasing.latestCountsAreSnapshotsApprovalAndStock')}</p>
              {selected && (
                <ShelfDetail
                  key={selected}
                  state={state}
                  id={selected}
                  readonly
                  discrepancies
                />
              )}
              <Link to="/shelves/counts">
                {t('purchasing.createReviewCount')}
              </Link>
            </>
          )}
        </>
      )}
    </section>
  );
}
function ShelfForm({
  state,
  initial,
}: {
  state: SupplyScope;
  initial?: Shelf;
}) {
  const { t, labelCode } = useLanguage();

  const navigate = useNavigate(),
    [code, setCode] = useState(initial?.code ?? ''),
    [name, setName] = useState(initial?.name ?? ''),
    [zone, setZone] = useState(initial?.zone ?? ''),
    [description, setDescription] = useState(initial?.description ?? ''),
    [status, setStatus] = useState(initial?.status ?? 'ACTIVE'),
    [location, setLocation] = useState(initial?.stock_location_id ?? '');
  return (
    <Card>
      <h2>
        {initial
          ? t('purchasing.editShelf')
          : t('purchasing.createShelfFromInventoryLocation')}
      </h2>
      <form
        className="inventory-form"
        onSubmit={(event) => {
          event.preventDefault();
          void state
            .run<Shelf>(
              initial ? `/shelves/${initial.id}` : '/shelves',
              {
                branch_id: initial?.branch_id ?? state.branch,
                stock_location_id: location,
                code,
                name,
                zone,
                description,
                status,
                revision: initial?.revision ?? 0,
              },
              initial ? 'PATCH' : 'POST',
            )
            .then((result) => {
              if (!initial) navigate('/shelves/' + result.id);
            })
            .catch(() => {});
        }}
      >
        <TextField
          label={t('purchasing.shelfCode')}
          value={code}
          change={setCode}
          required
        />
        <TextField
          label={t('purchasing.shelfName')}
          value={name}
          change={setName}
          required
        />
        <TextField
          label={t('purchasing.zone3')}
          value={zone}
          change={setZone}
        />
        <TextField
          label={t('purchasing.shelfDetails')}
          value={description}
          change={setDescription}
        />
        {initial ? (
          <p>
            {t('purchasing.inventoryLocation')} <code>{location}</code>{' '}
            {t('purchasing.linkedLocationsCannotBeMoved')}
          </p>
        ) : (
          <RemoteSelect<StockLocation>
            label={t('purchasing.inventoryShelfLocation')}
            path={`/inventory/locations?branch_id=${state.branch}&status=ACTIVE`}
            value={location}
            change={setLocation}
            display={(item) => `${item.code} · ${item.name} · ${item.type}`}
          />
        )}
        <Field label={t('purchasing.shelfStatus2')}>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {['ACTIVE', 'INACTIVE', 'ARCHIVED'].map((value) => (
              <option key={value} value={value}>
                {labelCode(value)}
              </option>
            ))}
          </select>
        </Field>
        <p>{t('purchasing.onlyActiveShelfSalesFloorLocationsCan')}</p>
        <Button type="submit" disabled={state.busy || !state.branch}>
          {t('purchasing.saveShelf')}
        </Button>
      </form>
    </Card>
  );
}
function ShelfDetail({
  state,
  id,
  readonly = false,
  discrepancies = false,
}: {
  state: SupplyScope;
  id: string;
  readonly?: boolean;
  discrepancies?: boolean;
}) {
  const { t, labelCode } = useLanguage();

  const query = useSupplyQuery<Shelf>(`/shelves/${id}`);
  const shelf = query.data;
  return (
    <>
      <QueryFeedback
        retry={() => void query.refetch()}
        loading={query.isFetching}
        error={query.error}
      />
      {shelf && (
        <>
          <Card>
            <h2>
              {shelf.code} · {shelf.name}
            </h2>
            <p>
              {shelf.zone} · {labelCode(shelf.status)}{' '}
              {t('purchasing.location')} <code>{shelf.stock_location_id}</code>
            </p>
            <SupplyTable
              headers={
                discrepancies
                  ? [
                      'Slot / SKU',
                      t('purchasing.recordedNow'),
                      t('purchasing.countSnapshot'),
                      'Expected / Counted / Variance',
                      t('purchasing.countReview'),
                    ]
                  : [
                      'Slot / SKU',
                      t('purchasing.recorded'),
                      'Min / Target / Capacity',
                      t('auth.status'),
                      t('purchasing.latestCount'),
                    ]
              }
            >
              {shelf.assignments.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.slot_code}
                    <br />
                    {item.sku} · {item.name}
                  </td>
                  <td>
                    {item.recorded_quantity} {item.unit}
                  </td>
                  {discrepancies ? (
                    <>
                      <td>
                        {item.last_count?.counted_at ??
                          t('purchasing.notCountedYet')}
                        <br />
                        {labelCode(item.last_count?.status)}
                      </td>
                      <td>
                        {item.last_count
                          ? `${item.last_count.expected_quantity} / ${item.last_count.counted_quantity} / ${item.last_count.variance}`
                          : '—'}
                      </td>
                      <td>
                        {item.last_count && (
                          <Link
                            to={
                              '/inventory/counts/' + item.last_count.document_id
                            }
                          >
                            {t('purchasing.openCount')}
                          </Link>
                        )}
                      </td>
                    </>
                  ) : (
                    <>
                      <td>
                        {item.minimum_quantity} / {item.target_quantity} /{' '}
                        {item.capacity_quantity} {item.unit}
                      </td>
                      <td>
                        <Tag>{labelCode(item.status)}</Tag>
                      </td>
                      <td>
                        {item.last_count ? (
                          <Link
                            to={
                              '/inventory/counts/' + item.last_count.document_id
                            }
                          >
                            {labelCode(item.last_count.status)} · Δ{' '}
                            {item.last_count.variance}
                          </Link>
                        ) : (
                          t('purchasing.notCountedYet')
                        )}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </SupplyTable>
            {shelf.assignments.length === 0 && (
              <p>{t('purchasing.noProductsOnThisShelfYet')}</p>
            )}
          </Card>
          {!readonly && (
            <>
              {state.tenant.can('shelf.manage') && (
                <ShelfForm key={shelf.revision} state={state} initial={shelf} />
              )}
              <Card>
                <h2>{t('purchasing.slotsInOrder')}</h2>
                {shelf.slots.map((slot) => (
                  <Tag key={slot.id}>
                    {slot.position} · {slot.code}
                  </Tag>
                ))}
                {shelf.status === 'ACTIVE' &&
                  state.tenant.can('shelf.manage') && (
                    <SlotForm state={state} shelfID={id} />
                  )}
              </Card>
              {shelf.status === 'ACTIVE' &&
                state.tenant.can('shelf.assignment.manage') && (
                  <>
                    <AssignmentForm state={state} shelf={shelf} />
                    {shelf.assignments.map((item) => (
                      <AssignmentForm
                        key={`${item.id}:${item.revision}`}
                        state={state}
                        shelf={shelf}
                        initial={item}
                      />
                    ))}
                  </>
                )}
            </>
          )}
        </>
      )}
    </>
  );
}
function SlotForm({ state, shelfID }: { state: SupplyScope; shelfID: string }) {
  const { t } = useLanguage();

  const [code, setCode] = useState(''),
    [position, setPosition] = useState('0');
  return (
    <form
      className="inventory-form"
      onSubmit={(event) => {
        event.preventDefault();
        void state
          .run(`/shelves/${shelfID}/slots`, {
            code,
            position: Number(position),
          })
          .then(() => setCode(''))
          .catch(() => {});
      }}
    >
      <TextField
        label={t('purchasing.slotCode')}
        value={code}
        change={setCode}
        required
      />
      <TextField
        label={t('purchasing.slotPosition')}
        value={position}
        change={setPosition}
        type="number"
        required
      />
      <Button type="submit" disabled={state.busy}>
        {t('purchasing.addSlot')}
      </Button>
    </form>
  );
}
function AssignmentForm({
  state,
  shelf,
  initial,
}: {
  state: SupplyScope;
  shelf: Shelf;
  initial?: ShelfAssignment;
}) {
  const { t } = useLanguage();

  const [slot, setSlot] = useState(initial?.slot_id ?? ''),
    [variant, setVariant] = useState(initial?.variant_id ?? ''),
    [minimum, setMinimum] = useState(initial?.minimum_quantity ?? '0'),
    [target, setTarget] = useState(initial?.target_quantity ?? '1'),
    [capacity, setCapacity] = useState(initial?.capacity_quantity ?? '1'),
    [status, setStatus] = useState(initial?.status ?? 'ACTIVE');
  return (
    <Card>
      <h2>
        {initial
          ? t('purchasing.editAssignmentValue0', { value0: initial.sku })
          : t('purchasing.assignProductToSlot')}
      </h2>
      <form
        className="inventory-form"
        onSubmit={(event) => {
          event.preventDefault();
          void state
            .run(
              `/shelves/${shelf.id}/assignments${initial ? '/' + initial.id : ''}`,
              {
                slot_id: slot,
                variant_id: variant,
                minimum_quantity: minimum,
                target_quantity: target,
                capacity_quantity: capacity,
                status,
                revision: initial?.revision ?? 0,
              },
              initial ? 'PATCH' : 'POST',
            )
            .catch(() => {});
        }}
      >
        {initial ? (
          <p>
            {initial.slot_code} · {initial.sku}{' '}
            {t('purchasing.identityIsUnchanged')}
          </p>
        ) : (
          <>
            <Field label={t('purchasing.slot')}>
              <select
                required
                value={slot}
                onChange={(event) => setSlot(event.target.value)}
              >
                <option value="">{t('purchasing.selectSlot')}</option>
                {shelf.slots
                  .filter(
                    (item) =>
                      !shelf.assignments.some(
                        (assignment) => assignment.slot_id === item.id,
                      ),
                  )
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code}
                    </option>
                  ))}
              </select>
            </Field>
            <VariantPicker
              value={variant}
              change={(item) => setVariant(item.id)}
            />
          </>
        )}
        <TextField
          label={t('purchasing.minimumQuantity')}
          value={minimum}
          change={setMinimum}
          required
        />
        <TextField
          label={t('purchasing.targetQuantity')}
          value={target}
          change={setTarget}
          required
        />
        <TextField
          label={t('purchasing.capacityQuantity')}
          value={capacity}
          change={setCapacity}
          required
        />
        <Field label={t('purchasing.assignmentStatus')}>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option>{t('purchasing.active6')}</option>
            <option>{t('purchasing.inactive5')}</option>
          </select>
        </Field>
        <p>{t('purchasing.inventoryUnitsOnly0MinimumTargetCapacity')}</p>
        <Button type="submit" disabled={state.busy}>
          {t('purchasing.saveAssignment')}
        </Button>
      </form>
    </Card>
  );
}
function Replenishments({ state }: { state: SupplyScope }) {
  const { t, labelCode } = useLanguage();

  const [page, setPage] = useState(1),
    [suggestionPage, setSuggestionPage] = useState(1),
    [status, setStatus] = useState(''),
    [search, setSearch] = useState(''),
    [selected, setSelected] = useState('');
  const tasks = useSupplyQuery<SupplyPage<ReplenishmentTask>>(
      `/shelves/replenishments?branch_id=${state.branch}&page=${page}&page_size=20&status=${status}&search=${encodeURIComponent(search)}`,
    ),
    suggestions = useSupplyQuery<SupplyPage<ReplenishmentSuggestion>>(
      `/shelves/replenishments/suggestions?branch_id=${state.branch}&page=${suggestionPage}&page_size=20`,
    );
  return (
    <>
      <Card>
        <h2>{t('purchasing.replenishmentSuggestions')}</h2>
        <p>{t('purchasing.targetMinusRecordedLimitedByWarehouseStock')}</p>
        <QueryFeedback
          retry={() => void suggestions.refetch()}
          loading={suggestions.isFetching}
          error={suggestions.error}
          empty={suggestions.data?.total === 0}
        />
        <SupplyTable
          headers={[
            'Shelf / SKU',
            'Recorded / Minimum',
            'Target / Capacity',
            t('purchasing.warehouseAvailable'),
            t('purchasing.suggested'),
            t('purchasing.review'),
          ]}
        >
          {suggestions.data?.items.map((item) => (
            <tr key={item.id}>
              <td>
                {item.shelf_name}
                <br />
                {item.sku}
              </td>
              <td>
                {item.recorded_quantity} / {item.minimum_quantity}
              </td>
              <td>
                {item.target_quantity} / {item.capacity_quantity}
              </td>
              <td>
                {item.source_name} · {item.available_quantity}
              </td>
              <td>
                {item.suggested_quantity}
                <br />
                {item.explanation}
              </td>
              <td>
                {state.tenant.can('shelf.replenishment.create') && (
                  <CartBatchPicker
                    actionLabel={t('purchasing.createTask')}
                    variant={item.variant_id}
                    location={item.source_location_id}
                    label={`Batch/Lot ${item.sku}`}
                    initial={untrackedBatch}
                    busy={state.busy}
                    sellableOnly
                    save={(selection) =>
                      state
                        .run<ReplenishmentTask>('/shelves/replenishments', {
                          assignment_id: item.assignment_id,
                          source_location_id: item.source_location_id,
                          quantity: item.suggested_quantity,
                          ...selection,
                        })
                        .then((task) => setSelected(task.id))
                        .catch(() => {})
                    }
                  />
                )}
              </td>
            </tr>
          ))}
        </SupplyTable>
        <Pagination
          page={suggestionPage}
          total={suggestions.data?.total ?? 0}
          change={setSuggestionPage}
        />
      </Card>
      <Card>
        <h2>{t('purchasing.replenishmentTasks')}</h2>
        <div className="catalog-actions">
          <TextField
            label={t('purchasing.searchTaskSku')}
            value={search}
            change={(value) => {
              setSearch(value);
              setPage(1);
            }}
          />
          <Field label={t('purchasing.taskStatus')}>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">{t('purchasing.allStatuses')}</option>
              {[
                'OPEN',
                'ASSIGNED',
                'IN_PROGRESS',
                'COMPLETED',
                'CANCELLED',
              ].map((value) => (
                <option key={value} value={value}>
                  {labelCode(value)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <QueryFeedback
          retry={() => void tasks.refetch()}
          loading={tasks.isFetching}
          error={tasks.error}
          empty={tasks.data?.total === 0}
        />
        <SupplyTable
          headers={[
            'Shelf / SKU',
            t('purchasing.source'),
            t('purchasing.quantity2'),
            t('auth.status'),
            t('purchasing.assignee'),
            t('inventory.details'),
          ]}
        >
          {tasks.data?.items.map((task) => (
            <tr key={task.id}>
              <td>
                {task.shelf_name}
                <br />
                {task.sku}
              </td>
              <td>{task.source_name}</td>
              <td>{task.quantity}</td>
              <td>
                <Tag>{labelCode(task.status)}</Tag>
              </td>
              <td>
                <code>{task.assigned_to ?? t('purchasing.unassigned')}</code>
              </td>
              <td>
                <Button onClick={() => setSelected(task.id)}>
                  {t('purchasing.openTask')}
                </Button>
              </td>
            </tr>
          ))}
        </SupplyTable>
        <Pagination
          page={page}
          total={tasks.data?.total ?? 0}
          change={setPage}
        />
      </Card>
      {selected && <TaskDetail key={selected} state={state} id={selected} />}
    </>
  );
}
function TaskDetail({ state, id }: { state: SupplyScope; id: string }) {
  const { t, labelCode } = useLanguage();

  const query = useSupplyQuery<ReplenishmentTask>(
      `/shelves/replenishments/${id}`,
    ),
    members = useSupplyQuery<Member[]>(
      '/members',
      state.tenant.can('employee.read') &&
        state.tenant.can('shelf.replenishment.assign'),
    ),
    [assignee, setAssignee] = useState(''),
    [reason, setReason] = useState(''),
    [confirm, setConfirm] = useState(false);
  const task = query.data;
  async function act(action: string) {
    if (!task) return;
    await state.run(`/shelves/replenishments/${id}/${action}`, {
      revision: task.revision,
      reason,
      ...(action === 'assign' ? { assigned_to: assignee } : {}),
    });
    setConfirm(false);
  }
  return (
    <Card>
      <h2>{t('purchasing.taskDetail')}</h2>
      <QueryFeedback
        retry={() => void query.refetch()}
        loading={query.isFetching}
        error={query.error}
      />
      {task && (
        <>
          <p>
            <code>{task.id}</code> · {labelCode(task.status)} · {task.quantity}{' '}
            {t('purchasing.inventoryUnits')}
          </p>
          <p>
            {t('purchasing.assignment')} <code>{task.assignment_id}</code>{' '}
            {t('purchasing.source2')} <code>{task.source_location_id}</code>
          </p>
          <Link to={'/shelves/' + task.shelf_id}>
            {t('purchasing.openShelf2')}
          </Link>
          <TextField
            label={t('purchasing.taskReason')}
            value={reason}
            change={setReason}
          />
          {state.tenant.can('shelf.replenishment.assign') &&
            ['OPEN', 'ASSIGNED'].includes(task.status) && (
              <>
                <QueryFeedback
                  retry={() => void members.refetch()}
                  loading={members.isFetching}
                  error={members.error}
                />
                <Field label={t('purchasing.taskAssignee')}>
                  <select
                    value={assignee}
                    onChange={(event) => setAssignee(event.target.value)}
                  >
                    <option value="">{t('purchasing.selectEmployee')}</option>
                    {members.data
                      ?.filter(
                        (member) =>
                          member.status === 'ACTIVE' &&
                          (member.role === 'OWNER' ||
                            member.branch_ids.includes(state.branch)) &&
                          member.permissions.includes(
                            'shelf.replenishment.complete',
                          ),
                      )
                      .map((member) => (
                        <option key={member.user_id} value={member.user_id}>
                          {member.display_name} · {member.role}
                        </option>
                      ))}
                  </select>
                </Field>
                <Button
                  disabled={state.busy || !assignee}
                  onClick={() => {
                    void act('assign').catch(() => {});
                  }}
                >
                  {t('purchasing.assignTask')}
                </Button>
              </>
            )}
          {state.tenant.can('shelf.replenishment.complete') &&
            ['OPEN', 'ASSIGNED'].includes(task.status) && (
              <Button
                disabled={state.busy}
                onClick={() => {
                  void act('start').catch(() => {});
                }}
              >
                {t('purchasing.startTask')}
              </Button>
            )}
          {state.tenant.can('shelf.replenishment.complete') &&
            task.status === 'IN_PROGRESS' && (
              <>
                <Field label={t('purchasing.confirmPhysicalStockTransfer')}>
                  <input
                    type="checkbox"
                    checked={confirm}
                    onChange={(event) => setConfirm(event.target.checked)}
                  />
                  {t('purchasing.iVerifiedTheStockTransfer')}
                </Field>
                <Button
                  disabled={state.busy || !confirm}
                  onClick={() => {
                    void act('complete').catch(() => {});
                  }}
                >
                  {t('purchasing.completeTaskPostTransfer')}
                </Button>
              </>
            )}
          {state.tenant.can('shelf.replenishment.create') &&
            ['OPEN', 'ASSIGNED', 'IN_PROGRESS'].includes(task.status) && (
              <Button
                disabled={state.busy || !reason.trim()}
                onClick={() => {
                  void act('cancel').catch(() => {});
                }}
              >
                {t('purchasing.cancelTask')}
              </Button>
            )}
          {task.transfer_id && (
            <p>
              <Link to={'/inventory/transfers/' + task.transfer_id}>
                {t('purchasing.openInventoryTransfer')}
              </Link>
            </p>
          )}
        </>
      )}
    </Card>
  );
}
