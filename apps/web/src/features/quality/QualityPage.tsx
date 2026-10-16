import { useLanguage } from '../../app/language';
import { useState, type FormEvent } from 'react';
import { WorkspaceLink as Link } from '../../app/WorkspaceNavigation';
import { useAuth } from '../../app/AuthProvider';
import { useOrganization } from '../../app/OrganizationProvider';
import { Button, Card, Tag } from '../../components/ui/primitives';
import { useSupplyQuery, useSupplyScope } from '../purchasing/purchasing-hooks';
import {
  Field,
  Pagination,
  QueryFeedback,
  SupplyFeedback,
  TextField,
  VariantPicker,
} from '../purchasing/SupplyUI';
import type {
  ProductBatch,
  QualityBalance,
  QualityRecall,
  QualityWriteOff,
} from '../../lib/quality-api';
import '../loyalty/loyalty.css';
import './quality.css';

const titles = {
  batches: 'quality.batchLot',
  expiry: 'quality.expiry',
  'write-offs': 'quality.writeOffs',
  recalls: 'quality.recalls',
} as const;
type View = keyof typeof titles;
export function QualityPage({ view = 'batches' }: { view?: View }) {
  const tenant = useOrganization(),
    { state } = useAuth();
  return (
    <QualityWorkspace
      key={[
        state.session?.user.id,
        tenant.context?.organization.id,
        tenant.branchID,
        tenant.context?.permissions.join(','),
        view,
      ].join(':')}
      view={view}
    />
  );
}
function QualityWorkspace({ view }: { view: View }) {
  const { t, formatDateTime, labelCode } = useLanguage();

  const state = useSupplyScope(),
    [variant, setVariant] = useState(''),
    [page, setPage] = useState(1);
  const allowed = state.tenant.can('quality.read') && !!state.branch;
  const queryString = `branch_id=${state.branch}&variant_id=${variant}&page=${page}`;
  const lots = useSupplyQuery<ProductBatch[]>(
    `/quality/lots?${queryString}`,
    allowed,
  );
  const stock = useSupplyQuery<QualityBalance[]>(
    `/quality/${view === 'expiry' ? 'expiry' : 'batches'}?${queryString}`,
    allowed,
  );
  const offs = useSupplyQuery<QualityWriteOff[]>(
    `/quality/write-offs?${queryString}`,
    allowed && view === 'write-offs',
  );
  const recalls = useSupplyQuery<QualityRecall[]>(
    `/quality/recalls?${queryString}`,
    allowed && view === 'recalls',
  );
  const [editing, setEditing] = useState<ProductBatch>();
  const currentCount =
    (view === 'write-offs'
      ? offs.data?.length
      : view === 'recalls'
        ? recalls.data?.length
        : Math.max(lots.data?.length ?? 0, stock.data?.length ?? 0)) ?? 0;
  const hasMore = currentCount === 100;
  const totalItems = (page - 1) * 100 + currentCount + (hasMore ? 1 : 0);
  async function action(doc: QualityWriteOff, command: string) {
    try {
      await state.run(`/quality/write-offs/${doc.id}/${command}`, {
        revision: doc.revision,
      });
    } catch {
      return;
    }
  }
  return (
    <div className="catalog-page quality-page">
      <h1>{t(titles[view])}</h1>
      <nav className="catalog-nav" aria-label={t('quality.qualityNavigation')}>
        {Object.entries(titles).map(([name, label]) => (
          <Link key={name} to={`/inventory/${name}`}>
            {t(label)}
          </Link>
        ))}
      </nav>
      <div className="quality-guidance">
        <p>{t('quality.theStockLedgerIsAuthoritativeAggregateTracked')}</p>
        <p>{t('quality.fefoIsAdvisoryPhysicallyVerifyAndSelect')}</p>
      </div>
      <Card>
        <VariantPicker
          value={variant}
          change={(value) => {
            setVariant(value.id);
            setPage(1);
          }}
        />
        {variant && (
          <div className="quality-filter-actions">
            <Button
              className="button-secondary"
              onClick={() => {
                setVariant('');
                setPage(1);
              }}
            >
              {t('catalog.clearFilter')}
            </Button>
          </div>
        )}
      </Card>
      <SupplyFeedback state={state} />
      {!state.branch && <p role="alert">{t('quality.selectBranch')}</p>}
      {view === 'batches' && state.tenant.can('quality.batch.create') && (
        <BatchForm
          key={editing?.id ?? 'new'}
          initial={editing}
          state={state}
          done={() => setEditing(undefined)}
        />
      )}
      {view === 'batches' && (
        <>
          <QueryFeedback loading={lots.isLoading} error={lots.error} />
          {lots.data?.map((batch) => (
            <Card key={batch.id} className="quality-item-card">
              <div className="quality-card-header">
                <h2>{batch.lot_number}</h2>
                <Tag tone={batch.status === 'ACTIVE' ? 'success' : 'error'}>
                  {labelCode(batch.status)}
                </Tag>
              </div>
              <div className="quality-meta-grid">
                <div className="quality-meta-item">
                  <span className="quality-meta-label">
                    {t('quality.expiry2')}
                  </span>
                  <span className="quality-meta-value">
                    {batch.expires_on ?? t('quality.unknown')}
                  </span>
                </div>
                <div className="quality-meta-item">
                  <span className="quality-meta-label">
                    {t('quality.manufactured')}
                  </span>
                  <span className="quality-meta-value">
                    {batch.manufactured_on ?? t('quality.unknown')}
                  </span>
                </div>
              </div>
              {batch.reason && (
                <div className="quality-reason">
                  <span className="quality-meta-label">
                    {t('pricing.reason')}
                  </span>
                  <p>{batch.reason}</p>
                </div>
              )}
              <details className="quality-history">
                <summary>{t('quality.qualityHistory')}</summary>
                <div className="quality-history-list">
                  {batch.history && batch.history.length > 0 ? (
                    batch.history.map((entry) => (
                      <div
                        key={entry.revision}
                        className="quality-history-item"
                      >
                        <div className="quality-history-top">
                          <span className="quality-history-rev">
                            {t('quality.revision')} {entry.revision}
                          </span>
                          <Tag
                            tone={
                              entry.status === 'ACTIVE' ? 'success' : 'error'
                            }
                          >
                            {labelCode(entry.status)}
                          </Tag>
                          <span className="quality-history-date">
                            {entry.recorded_at}
                          </span>
                        </div>
                        <p className="quality-history-desc">{entry.reason}</p>
                        <small className="quality-history-actor">
                          {t('quality.actor')} {entry.actor_id}
                        </small>
                      </div>
                    ))
                  ) : (
                    <p className="quality-history-empty">
                      {t('quality.noHistoryRecorded')}
                    </p>
                  )}
                </div>
              </details>
              {state.tenant.can('quality.batch.manage') && (
                <div className="quality-card-actions">
                  <Button onClick={() => setEditing(batch)}>
                    {t('quality.reviewStatus')} {batch.lot_number}
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </>
      )}
      {view === 'write-offs' &&
        state.tenant.can('quality.write_off.create') && (
          <WriteOffForm state={state} balances={stock.data ?? []} />
        )}
      {view === 'recalls' && state.tenant.can('quality.recall.manage') && (
        <RecallForm state={state} lots={lots.data ?? []} />
      )}
      <QueryFeedback
        loading={stock.isLoading || offs.isLoading || recalls.isLoading}
        error={stock.error ?? offs.error ?? recalls.error}
      />
      {(view === 'batches' || view === 'expiry') && (
        <>
          <h2>{t('quality.stockByLotLocation')}</h2>
          {stock.data?.length === 0 && <p>{t('quality.noStock')}</p>}
          {stock.data?.map((balance) => (
            <Card key={balance.id} className="quality-item-card">
              <div className="quality-card-header">
                <h3>
                  {balance.lot_number ?? t('quality.untrackedUnknownLot')}
                </h3>
                <Tag tone={balance.sellable ? 'success' : 'error'}>
                  {balance.sellable
                    ? t('quality.eligible')
                    : t('quality.notSellable')}
                </Tag>
              </div>
              <div className="quality-meta-grid">
                <div className="quality-meta-item">
                  <span className="quality-meta-label">
                    {t('pos.quantity')}
                  </span>
                  <span className="quality-meta-value quality-highlight">
                    {balance.quantity}
                  </span>
                </div>
                <div className="quality-meta-item">
                  <span className="quality-meta-label">
                    {t('quality.expiry2')}
                  </span>
                  <span className="quality-meta-value">
                    {balance.expires_on ?? t('quality.unknown')}
                  </span>
                </div>
                <div className="quality-meta-item">
                  <span className="quality-meta-label">
                    {t('quality.batchStatus')}
                  </span>
                  <span className="quality-meta-value">
                    {balance.batch_status ?? 'UNTRACKED'}
                  </span>
                </div>
                <div className="quality-meta-item">
                  <span className="quality-meta-label">
                    {t('quality.locationVariant')}
                  </span>
                  <span className="quality-meta-value">
                    {balance.location_id} · {balance.variant_id}
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </>
      )}
      {view === 'write-offs' &&
        offs.data?.map((doc) => (
          <Card key={doc.id} className="quality-item-card">
            <div className="quality-card-header">
              <h2>
                {labelCode(doc.status)} · {doc.quantity}
              </h2>
              <Tag
                tone={
                  doc.status === 'APPROVED'
                    ? 'success'
                    : doc.status === 'PENDING_APPROVAL'
                      ? 'amber'
                      : 'neutral'
                }
              >
                {labelCode(doc.status)}
              </Tag>
            </div>
            {doc.reason && (
              <div className="quality-reason">
                <span className="quality-meta-label">
                  {t('pricing.reason')}
                </span>
                <p>{doc.reason}</p>
              </div>
            )}
            <div className="quality-meta-grid">
              <div className="quality-meta-item">
                <span className="quality-meta-label">{t('quality.lot')}</span>
                <span className="quality-meta-value">
                  {doc.batch_id ?? 'UNTRACKED'}
                </span>
              </div>
              <div className="quality-meta-item">
                <span className="quality-meta-label">
                  {t('quality.location')}
                </span>
                <span className="quality-meta-value">{doc.location_id}</span>
              </div>
            </div>
            {doc.status === 'PENDING_APPROVAL' &&
              state.tenant.can('quality.write_off.approve') && (
                <div className="quality-card-actions">
                  <Button
                    disabled={state.busy}
                    onClick={() => void action(doc, 'approve')}
                  >
                    {t('quality.approve')}
                  </Button>
                  <Button
                    className="button-secondary"
                    disabled={state.busy}
                    onClick={() => void action(doc, 'reject')}
                  >
                    {t('quality.reject')}
                  </Button>
                </div>
              )}
            {doc.status === 'APPROVED' &&
              state.tenant.can('quality.write_off.post') && (
                <div className="quality-card-actions">
                  <Button
                    disabled={state.busy}
                    onClick={() => void action(doc, 'post')}
                  >
                    {t('quality.postWriteOff')}
                  </Button>
                </div>
              )}
            {doc.operation_id && (
              <p className="quality-operation-id">
                {t('quality.inventoryOperation')} {doc.operation_id}
              </p>
            )}
          </Card>
        ))}
      {view === 'recalls' &&
        recalls.data?.map((recall) => (
          <Card key={recall.id} className="quality-item-card">
            <div className="quality-card-header">
              <h2>
                {t('quality.activeRecall')}{' '}
                {recall.batch_id ?? t('quality.allLotsIncludingUnknown')}
              </h2>
              <Tag tone="error">{t('quality.recall')}</Tag>
            </div>
            {recall.reason && (
              <div className="quality-reason">
                <span className="quality-meta-label">
                  {t('quality.recallReason')}
                </span>
                <p>{recall.reason}</p>
              </div>
            )}
            <div className="quality-meta-grid">
              <div className="quality-meta-item">
                <span className="quality-meta-label">
                  {t('quality.createdAt')}
                </span>
                <span className="quality-meta-value">
                  {formatDateTime(recall.created_at)}
                </span>
              </div>
            </div>
            {recall.affected_locations &&
              recall.affected_locations.length > 0 && (
                <div className="quality-affected-locations">
                  <span className="quality-meta-label">
                    {t('quality.affectedLocations')}
                  </span>
                  <div className="quality-location-list">
                    {recall.affected_locations.map((place, index) => (
                      <div key={index} className="quality-location-item">
                        <span>
                          {t('quality.location2')}{' '}
                          <strong>{place.location_id}</strong>
                        </span>
                        <span>
                          {t('quality.lot2')}{' '}
                          <strong>{place.batch_id ?? 'UNTRACKED'}</strong>
                        </span>
                        <span>
                          {t('quality.quantity')}{' '}
                          <strong>{place.quantity}</strong>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            <p className="quality-recall-notice">
              {t('quality.recallHistoryCannotBeErasedOrAutomatically')}
            </p>
          </Card>
        ))}
      <Card>
        <Pagination
          page={page}
          total={totalItems}
          size={100}
          change={setPage}
        />
      </Card>
    </div>
  );
}
type Scope = ReturnType<typeof useSupplyScope>;
function BatchForm({
  initial,
  state,
  done,
}: {
  initial?: ProductBatch;
  state: Scope;
  done: () => void;
}) {
  const { t } = useLanguage();

  const [variant, setVariant] = useState(initial?.variant_id ?? ''),
    [lot, setLot] = useState(initial?.lot_number ?? ''),
    [manufactured, setManufactured] = useState(initial?.manufactured_on ?? ''),
    [expiry, setExpiry] = useState(initial?.expires_on ?? ''),
    [status, setStatus] = useState(initial?.status ?? 'ACTIVE'),
    [reason, setReason] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await state.run(
        `/quality/batches${initial ? '/' + initial.id : ''}`,
        {
          variant_id: variant,
          lot_number: lot,
          manufactured_on: manufactured || null,
          expires_on: expiry || null,
          status,
          reason,
          revision: initial?.revision ?? 0,
        },
        initial ? 'PUT' : 'POST',
      );
      done();
      setReason('');
      if (!initial) setLot('');
    } catch {
      return;
    }
  }
  return (
    <Card>
      <h2>
        {initial ? t('quality.qualityStatus') : t('quality.recordObservedLot')}
      </h2>
      <form onSubmit={(event) => void submit(event)}>
        {!initial ? (
          <VariantPicker
            value={variant}
            change={(value) => setVariant(value.id)}
          >
            <div className="loyalty-form">
              <Field label={t('quality.lotNumber')}>
                <input
                  required
                  maxLength={100}
                  value={lot}
                  disabled={!!initial}
                  onChange={(event) => setLot(event.target.value)}
                />
              </Field>
              <Field label={t('quality.manufacturedOn')}>
                <input
                  type="date"
                  value={manufactured}
                  disabled={!!initial}
                  onChange={(event) => setManufactured(event.target.value)}
                />
              </Field>
              <Field label={t('quality.expiresOn')}>
                <input
                  type="date"
                  value={expiry}
                  disabled={!!initial}
                  onChange={(event) => setExpiry(event.target.value)}
                />
              </Field>
              <Field label={t('quality.qualityStatus2')}>
                <select
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as ProductBatch['status'])
                  }
                >
                  <option value="ACTIVE">{t('quality.active8')}</option>
                  <option value="QUARANTINED">
                    {t('quality.quarantined')}
                  </option>
                </select>
              </Field>
              <TextField
                label={t('quality.batchReason')}
                value={reason}
                change={setReason}
                required
              />
            </div>
          </VariantPicker>
        ) : (
          <div className="loyalty-form">
            <Field label={t('quality.lotNumber')}>
              <input
                required
                maxLength={100}
                value={lot}
                disabled={!!initial}
                onChange={(event) => setLot(event.target.value)}
              />
            </Field>
            <Field label={t('quality.manufacturedOn')}>
              <input
                type="date"
                value={manufactured}
                disabled={!!initial}
                onChange={(event) => setManufactured(event.target.value)}
              />
            </Field>
            <Field label={t('quality.expiresOn')}>
              <input
                type="date"
                value={expiry}
                disabled={!!initial}
                onChange={(event) => setExpiry(event.target.value)}
              />
            </Field>
            <Field label={t('quality.qualityStatus2')}>
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as ProductBatch['status'])
                }
              >
                <option value="ACTIVE">{t('quality.active9')}</option>
                <option value="QUARANTINED">{t('quality.quarantined2')}</option>
              </select>
            </Field>
            <TextField
              label={t('quality.batchReason')}
              value={reason}
              change={setReason}
              required
            />
          </div>
        )}
        <div className="quality-form-actions">
          <Button type="submit" disabled={state.busy || !variant}>
            {t('quality.saveBatch')}
          </Button>
          {initial && <Button onClick={done}>{t('customers.cancel')}</Button>}
        </div>
      </form>
      <p>{t('quality.leaveUnknownDatesBlankLotIdentityAnd')}</p>
    </Card>
  );
}
function WriteOffForm({
  state,
  balances,
}: {
  state: Scope;
  balances: QualityBalance[];
}) {
  const { t } = useLanguage();

  const [selected, setSelected] = useState(''),
    [quantity, setQuantity] = useState('1'),
    [reason, setReason] = useState(''),
    [verified, setVerified] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const stock = balances.find((value) => value.id === selected);
    if (!stock || !verified) return;
    try {
      await state.run('/quality/write-offs', {
        location_id: stock.location_id,
        variant_id: stock.variant_id,
        batch_id: stock.batch_id,
        quantity,
        reason,
      });
      setReason('');
      setVerified(false);
    } catch {
      return;
    }
  }
  return (
    <Card>
      <h2>{t('quality.requestWriteOff')}</h2>
      <form className="loyalty-form" onSubmit={(event) => void submit(event)}>
        <Field label={t('quality.stockFound')}>
          <select
            required
            value={selected}
            onChange={(event) => {
              setSelected(event.target.value);
              setVerified(false);
            }}
          >
            <option value="">{t('quality.selectStock')}</option>
            {balances.map((stock) => (
              <option key={stock.id} value={stock.id}>
                {stock.lot_number ?? 'UNTRACKED'} · {stock.quantity} ·{' '}
                {stock.location_id}
              </option>
            ))}
          </select>
        </Field>
        <TextField
          label={t('purchasing.quantity')}
          value={quantity}
          change={setQuantity}
          required
        />
        <TextField
          label={t('quality.writeOffReason')}
          value={reason}
          change={setReason}
          required
        />
        <label>
          <input
            type="checkbox"
            checked={verified}
            onChange={(event) => setVerified(event.target.checked)}
          />
          {t('quality.physicallyVerified')}
        </label>
        <Button type="submit" disabled={state.busy || !verified}>
          {t('quality.requestApproval')}
        </Button>
      </form>
    </Card>
  );
}
function RecallForm({ state, lots }: { state: Scope; lots: ProductBatch[] }) {
  const { t } = useLanguage();

  const [variant, setVariant] = useState(''),
    [batch, setBatch] = useState(''),
    [reason, setReason] = useState(''),
    [confirmed, setConfirmed] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!confirmed) return;
    try {
      await state.run('/quality/recalls', {
        variant_id: variant,
        batch_id: batch || null,
        reason,
      });
      setReason('');
      setConfirmed(false);
    } catch {
      return;
    }
  }
  return (
    <Card>
      <h2>{t('quality.activateRecall')}</h2>
      <form onSubmit={(event) => void submit(event)}>
        <VariantPicker
          value={variant}
          change={(value) => {
            setVariant(value.id);
            setBatch('');
            setConfirmed(false);
          }}
        >
          <div className="loyalty-form">
            <Field label={t('quality.recallScope')}>
              <select
                value={batch}
                onChange={(event) => {
                  setBatch(event.target.value);
                  setConfirmed(false);
                }}
              >
                <option value="">{t('quality.entireProduct')}</option>
                {lots
                  .filter((lot) => lot.variant_id === variant)
                  .map((lot) => (
                    <option key={lot.id} value={lot.id}>
                      {lot.lot_number}
                    </option>
                  ))}
              </select>
            </Field>
            <TextField
              label={t('loyalty.recallReason')}
              value={reason}
              change={setReason}
              required
            />
            <label>
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
              />
              {t('quality.confirmAnImmediateSaleBlockRecallsAre')}
            </label>
          </div>
        </VariantPicker>
        <div className="quality-form-actions">
          <Button type="submit" disabled={state.busy || !confirmed || !variant}>
            {t('quality.activateRecall2')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
