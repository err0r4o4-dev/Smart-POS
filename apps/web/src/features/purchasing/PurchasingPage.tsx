import { useLanguage } from '../../app/language';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { WorkspaceLink as Link } from '../../app/WorkspaceNavigation';
import { useAuth } from '../../app/AuthProvider';
import { useOrganization } from '../../app/OrganizationProvider';
import { Button, Card, Tag } from '../../components/ui/primitives';
import type {
  Supplier,
  PurchaseDocument,
  PurchaseSuggestion,
  SupplyPage,
} from '../../lib/purchasing-api';
import {
  useSupplyQuery,
  useSupplyScope,
  type SupplyScope,
} from './purchasing-hooks';
import {
  Field,
  Pagination,
  QueryFeedback,
  SupplyFeedback,
  SupplyNav,
  SupplyTable,
  TextField,
} from './SupplyUI';
import { SupplierForm, SupplierProducts } from './SupplierPanel';
import { OrderForm, ReceivingForm } from './DocumentForms';

const titles = {
  suppliers: 'purchasing.supplier',
  supplier: 'purchasing.supplierDetails',
  orders: 'purchasing.purchaseOrders',
  new: 'purchasing.createPurchaseOrder',
  order: 'purchasing.purchaseOrderDetails',
  receipts: 'purchasing.receiveProducts',
  returns: 'purchasing.returnToSupplier',
  suggestions: 'purchasing.reorderSuggestions',
} as const;
export function PurchasingPage({ view }: { view: string }) {
  const tenant = useOrganization(),
    auth = useAuth(),
    { id } = useParams();
  return (
    <PurchasingScreen
      key={`${auth.state.session?.user.id}:${tenant.context?.organization.id}:${tenant.branchID}:${view}:${id ?? ''}`}
      view={view}
      id={id}
    />
  );
}
function PurchasingScreen({ view, id }: { view: string; id?: string }) {
  const { t, labelCode } = useLanguage();

  const state = useSupplyScope(),
    [search, setSearch] = useState(''),
    [status, setStatus] = useState(''),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState('');
  const resource = view === 'suppliers' ? '/suppliers' : `/purchasing/${view}`;
  const query = useSupplyQuery<
    SupplyPage<Supplier & PurchaseDocument & PurchaseSuggestion>
  >(
    `${resource}?search=${encodeURIComponent(search)}&status=${status}&page=${page}&page_size=20${view === 'suppliers' ? '' : `&branch_id=${state.branch}`}`,
    !['new', 'supplier', 'order'].includes(view) &&
      (view === 'suppliers' || !!state.branch),
  );
  const supplier = useSupplyQuery<Supplier>(
      `/suppliers/${id}`,
      view === 'supplier' && !!id,
    ),
    history = useSupplyQuery<SupplyPage<PurchaseDocument>>(
      `/purchasing/orders?supplier_id=${id}&branch_id=${state.branch}`,
      view === 'supplier' && !!id && state.tenant.can('purchasing.read'),
    );
  return (
    <section className="catalog-page supply-page">
      <header className="catalog-header">
        <div>
          <p className="eyebrow">{t('purchasing.purchasingAndReceiving')}</p>
          <h1>{t(titles[view as keyof typeof titles])}</h1>
          <p>
            {t('purchasing.manageSuppliersPurchaseOrdersAndBranchReceiving')}
          </p>
        </div>
        {view === 'orders' && state.tenant.can('purchasing.order.create') && (
          <Link className="button" to="/purchasing/orders/new">
            {t('purchasing.createPo')}
          </Link>
        )}
      </header>
      <SupplyNav />
      <SupplyFeedback state={state} />
      {view !== 'suppliers' && view !== 'supplier' && !state.branch && (
        <p role="alert">{t('purchasing.selectABranchFromTheHeaderBefore')}</p>
      )}
      {!['new', 'supplier', 'order'].includes(view) && (
        <>
          <div className="catalog-actions">
            <TextField
              label={t('customers.search')}
              value={search}
              change={(value) => {
                setSearch(value);
                setPage(1);
              }}
            />
            <Field label={t('auth.status')}>
              <select
                value={status}
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              >
                <option value="">{t('common.all')}</option>
                <option value="ACTIVE">{t('purchasing.active5')}</option>
                <option value="ORDERED">{t('purchasing.ordered')}</option>
                <option value="POSTED">{t('purchasing.posted2')}</option>
              </select>
            </Field>
          </div>
          <QueryFeedback
            retry={() => void query.refetch()}
            loading={query.isFetching}
            error={query.error}
            empty={query.data?.total === 0}
          />
        </>
      )}
      {view === 'suppliers' && (
        <>
          {state.tenant.can('supplier.create') && (
            <SupplierForm state={state} />
          )}
          <Card>
            <SupplyTable
              headers={[
                t('purchasing.code'),
                t('purchasing.supplier'),
                t('purchasing.contact'),
                t('auth.status'),
                t('inventory.details'),
              ]}
            >
              {query.data?.items.map((item) => (
                <tr key={item.id}>
                  <td>{item.code}</td>
                  <td>{item.name}</td>
                  <td>
                    {item.contact_person}
                    <br />
                    {item.email}
                    <br />
                    {item.phone}
                  </td>
                  <td>
                    <Tag>{labelCode(item.status)}</Tag>
                  </td>
                  <td>
                    <Link to={'/suppliers/' + item.id}>
                      {t('purchasing.openSupplier')}
                    </Link>
                  </td>
                </tr>
              ))}
            </SupplyTable>
            {query.data && (
              <Pagination
                page={page}
                total={query.data.total}
                change={setPage}
              />
            )}
          </Card>
        </>
      )}
      {view === 'supplier' && (
        <>
          <QueryFeedback
            retry={() => void supplier.refetch()}
            loading={supplier.isFetching}
            error={supplier.error}
          />
          {supplier.data && (
            <>
              <Card>
                <h2>{supplier.data.name}</h2>
                <p>
                  {supplier.data.code} · {labelCode(supplier.data.status)} ·{' '}
                  {supplier.data.contact_person} · {supplier.data.email} ·{' '}
                  {supplier.data.phone}
                </p>
                <p>
                  {supplier.data.address} {t('purchasing.taxIdentifier')}{' '}
                  {supplier.data.tax_identifier || t('purchasing.notSpecified')}
                </p>
              </Card>
              {state.tenant.can('supplier.update') && (
                <SupplierForm
                  key={supplier.data.revision}
                  state={state}
                  initial={supplier.data}
                />
              )}
              <SupplierProducts state={state} supplierID={supplier.data.id} />
              <Card>
                <h2>{t('purchasing.poHistoryForSelectedBranchLatest20')}</h2>
                <QueryFeedback
                  retry={() => void history.refetch()}
                  loading={history.isFetching}
                  error={history.error}
                />
                {history.data?.items.map((doc) => (
                  <p key={doc.id}>
                    <Link to={'/purchasing/orders/' + doc.id}>
                      {doc.number}
                    </Link>{' '}
                    · {labelCode(doc.status)} · {doc.total} THB
                  </p>
                ))}
              </Card>
            </>
          )}
        </>
      )}
      {view === 'new' && state.branch && <OrderForm state={state} />}
      {view === 'order' && id && (
        <DocumentDetail state={state} resource="orders" id={id} />
      )}
      {['orders', 'receipts', 'returns'].includes(view) && (
        <Card>
          <SupplyTable
            headers={[
              t('inventory.reference'),
              t('purchasing.supplier'),
              t('auth.status'),
              t('pos.total'),
              t('purchasing.expectedDate'),
              t('inventory.details'),
            ]}
          >
            {query.data?.items.map((doc) => (
              <tr key={doc.id}>
                <td>{doc.number.slice(0, 8)}</td>
                <td>{doc.supplier_snapshot.name}</td>
                <td>
                  <Tag>{labelCode(doc.status)}</Tag>
                </td>
                <td>
                  {doc.total} {doc.currency}
                </td>
                <td>{doc.expected_delivery_date ?? '—'}</td>
                <td>
                  {view === 'orders' ? (
                    <Link to={'/purchasing/orders/' + doc.id}>
                      {t('purchasing.openPo')}
                    </Link>
                  ) : (
                    <Button onClick={() => setSelected(doc.id)}>
                      {t('purchasing.open')}{' '}
                      {view === 'receipts'
                        ? t('purchasing.receipt')
                        : t('loyalty.return')}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </SupplyTable>
          {query.data && (
            <Pagination page={page} total={query.data.total} change={setPage} />
          )}
        </Card>
      )}
      {(['receipts', 'returns'] as const)
        .filter((resource) => view === resource)
        .map((resource) => (
          <div key={resource}>
            {state.tenant.can(
              resource === 'receipts'
                ? 'purchasing.receive.create'
                : 'purchasing.return.create',
            ) &&
              state.branch && (
                <ReceivingForm
                  state={state}
                  resource={resource}
                  onSave={(doc) => setSelected(doc.id)}
                />
              )}
            <Card>
              <h2>{t('purchasing.receivingDiscrepanciesTextEvidence')}</h2>
              {resource === 'receipts' && (
                <Discrepancies state={state} select={setSelected} />
              )}
            </Card>
            {selected && (
              <DocumentDetail state={state} resource={resource} id={selected} />
            )}
          </div>
        ))}
      {view === 'suggestions' && (
        <Card>
          <SupplyTable
            headers={[
              t('common.sku'),
              t('purchasing.stock'),
              'Min / Target',
              t('purchasing.incoming'),
              'Supplier / Lead time',
              t('purchasing.suggestedPurchaseQuantity'),
              t('purchasing.review'),
            ]}
          >
            {query.data?.items.map((item) => (
              <tr key={item.id}>
                <td>
                  {item.sku}
                  <br />
                  {item.name}
                </td>
                <td>{item.current_quantity}</td>
                <td>
                  {item.minimum_quantity} / {item.target_quantity}
                </td>
                <td>{item.incoming_quantity}</td>
                <td>
                  {item.supplier_name}
                  <br />
                  {item.lead_time_days} {t('purchasing.days')}
                </td>
                <td>
                  {item.suggested_quantity} {item.purchase_unit}
                  <p>{item.explanation}</p>
                </td>
                <td>
                  {state.tenant.can('purchasing.order.create') && (
                    <Button
                      disabled={state.busy}
                      onClick={() =>
                        void state
                          .run<PurchaseDocument>(
                            '/purchasing/suggestions/create-draft',
                            {
                              branch_id: state.branch,
                              supplier_id: item.supplier_id,
                              notes: 'Reviewed deterministic suggestion',
                              items: [
                                {
                                  variant_id: item.variant_id,
                                  purchase_unit_id: item.purchase_unit_id,
                                  quantity: item.suggested_quantity,
                                  unit_cost: item.unit_cost,
                                },
                              ],
                            },
                          )
                          .then((doc) => setSelected(doc.id))
                          .catch(() => {})
                      }
                    >
                      {t('purchasing.createPoDraft')}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </SupplyTable>
          {query.data && (
            <Pagination page={page} total={query.data.total} change={setPage} />
          )}
          {selected && (
            <Link to={'/purchasing/orders/' + selected}>
              {t('purchasing.openCreatedDraft')}
            </Link>
          )}
        </Card>
      )}
    </section>
  );
}
function Discrepancies({
  state,
  select,
}: {
  state: SupplyScope;
  select: (id: string) => void;
}) {
  const { labelCode } = useLanguage();

  const query = useSupplyQuery<SupplyPage<PurchaseDocument>>(
    `/purchasing/discrepancies?branch_id=${state.branch}`,
    !!state.branch,
  );
  return (
    <>
      <QueryFeedback
        retry={() => void query.refetch()}
        loading={query.isFetching}
        error={query.error}
        empty={query.data?.total === 0}
      />
      {query.data?.items.map((doc) => (
        <p key={doc.id}>
          <Button onClick={() => select(doc.id)}>
            {doc.number.slice(0, 8)} · {labelCode(doc.status)}
          </Button>
        </p>
      ))}
    </>
  );
}
const transitions: Record<string, Record<string, string[]>> = {
  ORDER: {
    DRAFT: ['submit', 'cancel'],
    PENDING_APPROVAL: ['approve', 'reject', 'cancel'],
    APPROVED: ['issue', 'cancel'],
    ORDERED: ['close', 'cancel'],
    PARTIALLY_RECEIVED: ['close'],
    RECEIVED: ['close'],
  },
  RECEIPT: {
    DRAFT: ['submit', 'cancel'],
    PENDING_REVIEW: ['approve', 'reject', 'correct', 'cancel'],
    APPROVED: ['post', 'cancel'],
  },
  RETURN: {
    DRAFT: ['submit', 'cancel'],
    PENDING_APPROVAL: ['approve', 'reject', 'cancel'],
    APPROVED: ['dispatch', 'cancel'],
  },
};
function permission(kind: string, action: string) {
  if (kind === 'ORDER')
    return (
      'purchasing.order.' +
      ({ submit: 'update', reject: 'approve', close: 'cancel' }[action] ??
        action)
    );
  if (kind === 'RECEIPT')
    return (
      'purchasing.receive.' +
      (['approve', 'reject', 'correct'].includes(action)
        ? 'review'
        : ['submit', 'cancel'].includes(action)
          ? 'create'
          : action)
    );
  return (
    'purchasing.return.' +
    ({ submit: 'create', reject: 'approve', cancel: 'create' }[action] ??
      action)
  );
}
export function DocumentDetail({
  state,
  resource,
  id,
}: {
  state: SupplyScope;
  resource: 'orders' | 'receipts' | 'returns';
  id: string;
}) {
  const { t, labelCode } = useLanguage();

  const query = useSupplyQuery<PurchaseDocument>(
    `/purchasing/${resource}/${id}`,
  );
  const [reason, setReason] = useState('');
  const doc = query.data;
  return (
    <Card>
      <QueryFeedback
        retry={() => void query.refetch()}
        loading={query.isFetching}
        error={query.error}
      />
      {doc && (
        <>
          <h2>
            {doc.number} · {labelCode(doc.status)}
          </h2>
          <p>
            {t('purchasing.supplierSnapshot')} {doc.supplier_snapshot.name} /{' '}
            {doc.supplier_snapshot.code} {t('purchasing.revision3')}
            {doc.revision} · {doc.total} {doc.currency}
          </p>
          <p>{doc.notes}</p>
          {doc.parent_id && (
            <p>
              {t('inventory.source')} {doc.parent_id}
            </p>
          )}
          <SupplyTable
            headers={[
              t('purchasing.skuSnapshot'),
              'Purchase unit / Factor',
              t('purchasing.quantity2'),
              t('purchasing.baseQty'),
              'Accepted / Outstanding',
              'Delivered / Rejected / Damaged',
              'Cost / Total',
              t('purchasing.evidence'),
            ]}
          >
            {doc.items.map((item) => (
              <tr key={item.id}>
                <td>
                  {item.sku_snapshot}
                  <br />
                  {item.name_snapshot}
                </td>
                <td>
                  {item.unit_snapshot} / {item.conversion_factor}
                </td>
                <td>{item.quantity}</td>
                <td>{item.base_quantity}</td>
                <td>
                  {item.accepted_quantity} / {item.outstanding_quantity}
                </td>
                <td>
                  {item.delivered_quantity} / {item.rejected_quantity} /{' '}
                  {item.damaged_quantity}
                </td>
                <td>
                  {item.unit_cost} / {item.line_total}
                </td>
                <td>{item.reason}</td>
              </tr>
            ))}
          </SupplyTable>
          <TextField
            label="Action reason / issuing evidence"
            value={reason}
            change={setReason}
          />
          <div className="catalog-actions">
            {(transitions[doc.kind][doc.status] ?? [])
              .filter((action) =>
                state.tenant.can(permission(doc.kind, action)),
              )
              .map((action) => (
                <Button
                  key={action}
                  disabled={
                    state.busy ||
                    (action === 'approve' &&
                      doc.created_by === state.user &&
                      state.tenant.context?.membership.role !== 'OWNER')
                  }
                  onClick={() =>
                    void state
                      .run(`/purchasing/${resource}/${doc.id}/${action}`, {
                        revision: doc.revision,
                        reason,
                      })
                      .catch(() => {})
                  }
                >
                  {labelCode(action)}
                </Button>
              ))}
          </div>
          <p>{t('purchasing.ownersMaySelfApproveWithAuditManagers')}</p>
          {doc.status === 'DRAFT' &&
            state.tenant.can(
              permission(doc.kind, doc.kind === 'ORDER' ? 'submit' : 'cancel'),
            ) &&
            (resource === 'orders' ? (
              <OrderForm key={doc.revision} state={state} initial={doc} />
            ) : (
              <ReceivingForm
                key={doc.revision}
                state={state}
                resource={resource}
                initial={doc}
                onSave={() => {}}
              />
            ))}
          <h3>{t('purchasing.timelineAuditEvidence')}</h3>
          {doc.events.map((event) => (
            <p key={event.id}>
              {event.created_at} · {event.action} {t('purchasing.revision4')}
              {event.revision} · {event.actor_id}
              <br />
              {event.reason}
            </p>
          ))}
          <h3>{t('purchasing.relatedDocuments')}</h3>
          {doc.children.map((child) => (
            <p key={child.id}>
              {child.kind} · {child.number} · {labelCode(child.status)}
            </p>
          ))}
          {['POSTED', 'DISPATCHED'].includes(doc.status) && (
            <Link to="/inventory/movements">
              {t('purchasing.viewInventoryLedgerPostingReferences')}
            </Link>
          )}
        </>
      )}
    </Card>
  );
}
