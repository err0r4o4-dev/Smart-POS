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

const titles: Record<string, string> = {
  suppliers: 'Supplier',
  supplier: 'รายละเอียด Supplier',
  orders: 'ใบสั่งซื้อ',
  new: 'สร้างใบสั่งซื้อ',
  order: 'รายละเอียดใบสั่งซื้อ',
  receipts: 'รับสินค้า',
  returns: 'คืน Supplier',
  suggestions: 'คำแนะนำสั่งซื้อ',
};
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
          <p className="eyebrow">PURCHASING · PHASE 4</p>
          <h1>{titles[view]}</h1>
          <p>
            เอกสารจริง · สต็อกจาก Inventory Ledger · คำแนะนำแบบ deterministic
            ไม่ใช่ AI
          </p>
        </div>
        {view === 'orders' && state.tenant.can('purchasing.order.create') && (
          <Link className="button" to="/purchasing/orders/new">
            สร้าง PO
          </Link>
        )}
      </header>
      <SupplyNav />
      <SupplyFeedback state={state} />
      {view !== 'suppliers' && view !== 'supplier' && !state.branch && (
        <p role="alert">เลือกสาขาจาก header ก่อนทำรายการ</p>
      )}
      {!['new', 'supplier', 'order'].includes(view) && (
        <>
          <div className="catalog-actions">
            <TextField
              label="ค้นหา"
              value={search}
              change={(value) => {
                setSearch(value);
                setPage(1);
              }}
            />
            <Field label="สถานะ">
              <input
                value={status}
                placeholder="ACTIVE / ORDERED / POSTED"
                onChange={(event) => {
                  setStatus(event.target.value);
                  setPage(1);
                }}
              />
            </Field>
          </div>
          <QueryFeedback
            loading={query.isLoading}
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
              headers={['Code', 'Supplier', 'Contact', 'Status', 'รายละเอียด']}
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
                    <Tag>{item.status}</Tag>
                  </td>
                  <td>
                    <Link to={'/suppliers/' + item.id}>เปิด Supplier</Link>
                  </td>
                </tr>
              ))}
            </SupplyTable>
          </Card>
        </>
      )}
      {view === 'supplier' && (
        <>
          <QueryFeedback loading={supplier.isLoading} error={supplier.error} />
          {supplier.data && (
            <>
              <Card>
                <h2>{supplier.data.name}</h2>
                <p>
                  {supplier.data.code} · {supplier.data.status} ·{' '}
                  {supplier.data.contact_person} · {supplier.data.email} ·{' '}
                  {supplier.data.phone}
                </p>
                <p>
                  {supplier.data.address} · Tax identifier:{' '}
                  {supplier.data.tax_identifier || 'ไม่ได้ระบุ'}
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
                <h2>ประวัติ PO ในสาขาที่เลือก · ล่าสุด 20 รายการ</h2>
                <QueryFeedback
                  loading={history.isLoading}
                  error={history.error}
                />
                {history.data?.items.map((doc) => (
                  <p key={doc.id}>
                    <Link to={'/purchasing/orders/' + doc.id}>
                      {doc.number}
                    </Link>{' '}
                    · {doc.status} · {doc.total} THB
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
              'Reference',
              'Supplier',
              'Status',
              'Total',
              'Expected date',
              'รายละเอียด',
            ]}
          >
            {query.data?.items.map((doc) => (
              <tr key={doc.id}>
                <td>{doc.number.slice(0, 8)}</td>
                <td>{doc.supplier_snapshot.name}</td>
                <td>
                  <Tag>{doc.status}</Tag>
                </td>
                <td>
                  {doc.total} {doc.currency}
                </td>
                <td>{doc.expected_delivery_date ?? '—'}</td>
                <td>
                  {view === 'orders' ? (
                    <Link to={'/purchasing/orders/' + doc.id}>เปิด PO</Link>
                  ) : (
                    <Button onClick={() => setSelected(doc.id)}>
                      เปิด {view === 'receipts' ? 'Receipt' : 'Return'}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </SupplyTable>
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
              <h2>Receiving discrepancies · text evidence</h2>
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
              'SKU',
              'Stock',
              'Min / Target',
              'Incoming',
              'Supplier / Lead time',
              'Suggested purchase quantity',
              'Review',
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
                  {item.lead_time_days} วัน
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
                      สร้าง PO Draft
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </SupplyTable>
          {selected && (
            <Link to={'/purchasing/orders/' + selected}>
              เปิด Draft ที่สร้าง
            </Link>
          )}
        </Card>
      )}
      {query.data && (
        <Pagination page={page} total={query.data.total} change={setPage} />
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
  const query = useSupplyQuery<SupplyPage<PurchaseDocument>>(
    `/purchasing/discrepancies?branch_id=${state.branch}`,
    !!state.branch,
  );
  return (
    <>
      <QueryFeedback
        loading={query.isLoading}
        error={query.error}
        empty={query.data?.total === 0}
      />
      {query.data?.items.map((doc) => (
        <p key={doc.id}>
          <Button onClick={() => select(doc.id)}>
            {doc.number.slice(0, 8)} · {doc.status}
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
  const query = useSupplyQuery<PurchaseDocument>(
    `/purchasing/${resource}/${id}`,
  );
  const [reason, setReason] = useState('');
  const doc = query.data;
  return (
    <Card>
      <QueryFeedback loading={query.isLoading} error={query.error} />
      {doc && (
        <>
          <h2>
            {doc.number} · {doc.status}
          </h2>
          <p>
            Supplier snapshot: {doc.supplier_snapshot.name} /{' '}
            {doc.supplier_snapshot.code} · revision {doc.revision} · {doc.total}{' '}
            {doc.currency}
          </p>
          <p>{doc.notes}</p>
          {doc.parent_id && <p>ต้นทาง: {doc.parent_id}</p>}
          <SupplyTable
            headers={[
              'SKU snapshot',
              'Purchase unit / Factor',
              'Quantity',
              'Base Qty',
              'Accepted / Outstanding',
              'Delivered / Rejected / Damaged',
              'Cost / Total',
              'Evidence',
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
                  {action}
                </Button>
              ))}
          </div>
          <p>
            Owner self-approval อนุญาตพร้อม audit; Manager ต้องไม่ใช่ผู้สร้าง ·
            issue เป็น operator-recorded ไม่ยืนยัน email delivery
          </p>
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
          <h3>Timeline / Audit evidence</h3>
          {doc.events.map((event) => (
            <p key={event.id}>
              {event.created_at} · {event.action} · revision {event.revision} ·{' '}
              {event.actor_id}
              <br />
              {event.reason}
            </p>
          ))}
          <h3>เอกสารต่อเนื่อง</h3>
          {doc.children.map((child) => (
            <p key={child.id}>
              {child.kind} · {child.number} · {child.status}
            </p>
          ))}
          {['POSTED', 'DISPATCHED'].includes(doc.status) && (
            <Link to="/inventory/movements">
              ดู Inventory Ledger / posting references
            </Link>
          )}
        </>
      )}
    </Card>
  );
}
