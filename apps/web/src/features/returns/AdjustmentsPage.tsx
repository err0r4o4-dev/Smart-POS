import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { WorkspaceLink as Link } from '../../app/WorkspaceNavigation';
import { useAuth } from '../../app/AuthProvider';
import { useOrganization } from '../../app/OrganizationProvider';
import { Button, Card, Loading, Tag } from '../../components/ui/primitives';
import { CatalogError } from '../catalog/CatalogUI';
import { Field } from '../purchasing/SupplyUI';
import type { POSPage, POSShift, SaleSummary } from '../../lib/pos-api';
import type { ReturnableSale } from '../../lib/returns-api';
import {
  settlementMethods,
  type SaleAdjustment,
} from '../../lib/adjustments-api';
import { useReturnsCommand, useReturnsQuery } from './returns-hooks';
import { adjustmentsCopy, type AdjustmentsCopy } from './adjustments-copy';
import { AdjustmentBuilder } from './AdjustmentBuilder';

export function AdjustmentsPage({ reversal = false }: { reversal?: boolean }) {
  const tenant = useOrganization(),
    { state } = useAuth();
  return (
    <Workspace
      key={[
        state.session?.user.id,
        tenant.context?.organization.id,
        tenant.branchID,
        reversal,
      ].join(':')}
      reversal={reversal}
    />
  );
}
function Workspace({ reversal }: { reversal: boolean }) {
  const tenant = useOrganization(),
    command = useReturnsCommand(),
    [params] = useSearchParams();
  const [language, setLanguage] = useState<'th' | 'en'>('th'),
    [search, setSearch] = useState(''),
    [saleID, setSaleID] = useState(params.get('sale_id') ?? ''),
    [selected, setSelected] = useState(params.get('document_id') ?? ''),
    [page, setPage] = useState(1),
    [status, setStatus] = useState(''),
    [historySearch, setHistorySearch] = useState(''),
    [editing, setEditing] = useState<SaleAdjustment | null>(null);
  const text = adjustmentsCopy[language],
    path = reversal ? '/sales/voids' : '/exchanges';
  const canCreate = tenant.can(
    reversal ? 'sales.void.request' : 'exchange.create',
  );
  const branch: Record<string, string> = tenant.branchID
    ? { branch_id: tenant.branchID }
    : {};
  const sales = useReturnsQuery<POSPage<SaleSummary>>(
    `/sales?${new URLSearchParams({ ...branch, search, page_size: '10' })}`,
  );
  const sale = useReturnsQuery<ReturnableSale>(
    saleID ? `/returns/sales/${saleID}` : '',
  );
  const history = useReturnsQuery<POSPage<SaleAdjustment>>(
    `${path}?${new URLSearchParams({ ...branch, page: String(page), page_size: '10', search: historySearch, status, ...(params.get('sale_id') ? { sale_id: params.get('sale_id')! } : {}) })}`,
  );
  const detail = useReturnsQuery<SaleAdjustment>(
    selected ? `${path}/${selected}` : '',
  );
  function saved(doc: SaleAdjustment) {
    setSelected(doc.id);
    setEditing(null);
  }
  return (
    <div className="catalog-page returns-page">
      <div className="page-heading">
        <div>
          <h1>{reversal ? text.voids : text.exchanges}</h1>
          <p>{text.notice}</p>
        </div>
        <Field label={text.language}>
          <select
            value={language}
            onChange={(event) => setLanguage(event.target.value as 'th' | 'en')}
          >
            <option value="th">ไทย</option>
            <option value="en">English</option>
          </select>
        </Field>
      </div>
      <nav className="catalog-nav">
        <Link to="/pos/exchanges">{text.exchanges}</Link>
        <Link to="/sales/voids">{text.voids}</Link>
        <Link to="/pos/returns">Returns</Link>
        <Link to="/sales/refunds">Refunds</Link>
        <Link to="/pos/checkout">POS checkout</Link>
      </nav>
      {reversal && (
        <p>
          {text.reversalPolicy} {text.checkout}
        </p>
      )}
      <CatalogError error={command.error} />
      {canCreate && (
        <Card>
          <h2>{text.sale}</h2>
          <Field label={text.search}>
            <input
              value={search}
              maxLength={100}
              onChange={(event) => setSearch(event.target.value)}
            />
          </Field>
          <Field label={text.choose}>
            <select
              value={saleID}
              disabled={!!editing}
              onChange={(event) => setSaleID(event.target.value)}
            >
              <option value="">{text.choose}</option>
              {sales.data?.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.sale_number} · {item.grand_total}
                </option>
              ))}
            </select>
          </Field>
          <CatalogError error={sales.error || sale.error} />
          {saleID && sale.isPending && <Loading>{text.loading}</Loading>}
          {editing && (
            <Button onClick={() => setEditing(null)}>{text.stopEdit}</Button>
          )}
          {sale.data && sale.data.branch_id === tenant.branchID && (
            <AdjustmentBuilder
              key={`${sale.data.id}:${editing?.id}:${editing?.revision}`}
              sale={sale.data}
              editing={editing}
              reversal={reversal}
              path={path}
              text={text}
              command={command}
              saved={saved}
            />
          )}
        </Card>
      )}
      <Card>
        <h2>{text.history}</h2>
        <div className="adjustment-grid">
          <Field label={text.historySearch}>
            <input
              value={historySearch}
              onChange={(event) => {
                setHistorySearch(event.target.value);
                setPage(1);
              }}
            />
          </Field>
          <Field label={text.status}>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">{text.all}</option>
              {[
                'DRAFT',
                'PENDING_APPROVAL',
                'APPROVED',
                'AWAITING_SETTLEMENT',
                'RECONCILIATION_REQUIRED',
                'COMPLETED',
                'REJECTED',
                'CANCELLED',
              ].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
        </div>
        <CatalogError error={history.error} />
        {history.isPending && <Loading>{text.loading}</Loading>}
        {history.data?.items.length === 0 && <p>{text.empty}</p>}
        {history.data?.items.map((item) => (
          <div className="returns-line" key={item.id}>
            <Button
              onClick={() => {
                setSelected(item.id);
                setEditing(null);
              }}
            >
              {item.number}
            </Button>
            <Tag>{item.status}</Tag>
            <p>
              {item.return_credit} / {item.replacement_total} /{' '}
              {item.net_difference} THB
            </p>
          </div>
        ))}
        <div className="catalog-actions">
          <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
            {text.previous}
          </Button>
          <span>{page}</span>
          <Button
            disabled={!history.data || page * 10 >= history.data.total}
            onClick={() => setPage(page + 1)}
          >
            {text.next}
          </Button>
        </div>
      </Card>
      {selected && (
        <>
          <CatalogError error={detail.error} />
          <Button onClick={() => void detail.refetch()}>{text.reload}</Button>
          {detail.isPending && <Loading>{text.loading}</Loading>}
        </>
      )}
      {detail.data && detail.data.branch_id === tenant.branchID && (
        <AdjustmentDetails
          key={`${detail.data.id}:${detail.data.revision}`}
          doc={detail.data}
          path={path}
          text={text}
          command={command}
          edit={() => {
            setSaleID(detail.data.original_sale_id);
            setEditing(detail.data);
          }}
        />
      )}
    </div>
  );
}

function AdjustmentDetails({
  doc,
  path,
  text,
  command,
  edit,
}: {
  doc: SaleAdjustment;
  path: string;
  text: AdjustmentsCopy;
  command: ReturnType<typeof useReturnsCommand>;
  edit: () => void;
}) {
  const tenant = useOrganization(),
    reversal = doc.kind === 'REVERSAL';
  const [method, setMethod] = useState(
      settlementMethods(doc.net_difference)[0],
    ),
    [shiftID, setShiftID] = useState(''),
    [reference, setReference] = useState(''),
    [note, setNote] = useState(''),
    [acknowledged, setAcknowledged] = useState(false),
    [printError, setPrintError] = useState('');
  const shifts = useReturnsQuery<POSPage<POSShift>>(
    `/pos/shifts?status=OPEN&branch_id=${doc.branch_id}&page_size=100`,
  );
  const { state } = useAuth();
  async function action(name: string, extra: object = {}) {
    if (window.confirm(text.review))
      await command.run(`${path}/${doc.id}/${name}`, {
        revision: doc.revision,
        ...extra,
      });
  }
  const canApprove = tenant.can(
    reversal ? 'sales.void.approve' : 'exchange.approve',
  );
  const refundRestricted =
    doc.net_difference.startsWith('-') &&
    tenant.context?.membership.role === 'CASHIER';
  const canComplete =
    tenant.can(reversal ? 'sales.void.complete' : 'exchange.complete') &&
    !refundRestricted;
  const canSettle =
    tenant.can(
      reversal ? 'sales.void.complete' : 'exchange.settlement.confirm',
    ) && !refundRestricted;
  return (
    <Card>
      <h2>{text.details}</h2>
      <p className="returns-reference">
        {doc.number} · <Tag>{doc.status}</Tag> · revision {doc.revision}
      </p>
      <p>{doc.reason}</p>
      <nav className="catalog-nav">
        <Link to={`/sales/${doc.original_sale_id}`}>{text.original}</Link>
        <Link to={`/pos/returns?return_id=${doc.linked_return_id}`}>
          {text.linkedReturn}
        </Link>
        {doc.replacement_sale_id && (
          <Link to={`/sales/${doc.replacement_sale_id}`}>
            {text.replacement}
          </Link>
        )}
      </nav>
      {doc.status === 'RECONCILIATION_REQUIRED' && (
        <p role="alert">
          {text.recovery} ({doc.failure_code})
        </p>
      )}
      <div className="catalog-actions">
        {doc.status === 'DRAFT' && (
          <>
            <Button disabled={command.busy} onClick={edit}>
              {text.edit}
            </Button>
            <Button
              disabled={command.busy}
              onClick={() => void action('submit')}
            >
              {text.submit}
            </Button>
          </>
        )}
        {doc.status === 'PENDING_APPROVAL' && canApprove && (
          <>
            <Button
              disabled={command.busy}
              onClick={() => void action('approve')}
            >
              {text.approve}
            </Button>
            <Button
              disabled={command.busy}
              onClick={() => void action('reject')}
            >
              {text.reject}
            </Button>
          </>
        )}
        {['DRAFT', 'PENDING_APPROVAL', 'APPROVED'].includes(doc.status) && (
          <Button disabled={command.busy} onClick={() => void action('cancel')}>
            {text.cancel}
          </Button>
        )}
        {['AWAITING_SETTLEMENT', 'RECONCILIATION_REQUIRED'].includes(
          doc.status,
        ) &&
          canComplete && (
            <Button
              disabled={command.busy}
              onClick={() => void action('complete')}
            >
              {doc.status === 'RECONCILIATION_REQUIRED'
                ? text.recover
                : text.complete}
            </Button>
          )}
      </div>
      {doc.status === 'APPROVED' && canSettle && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void action('confirm-settlement', {
              method,
              reference,
              note,
              acknowledged,
              shift_id:
                method === 'CASH' || method === 'CASH_REFUND' ? shiftID : null,
            });
          }}
        >
          <Field label={text.method}>
            <select
              value={method}
              onChange={(event) => setMethod(event.target.value)}
            >
              {settlementMethods(doc.net_difference).map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
          {(method === 'CASH' || method === 'CASH_REFUND') && (
            <Field label={text.shift}>
              <select
                required
                value={shiftID}
                onChange={(event) => setShiftID(event.target.value)}
              >
                <option value="">{text.choose}</option>
                {shifts.data?.items
                  .filter(
                    (item) =>
                      item.cashier_id === state.session?.user.id &&
                      (!doc.terminal_id ||
                        doc.terminal_id === item.terminal_id),
                  )
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.terminal_name} · {item.expected_cash}
                    </option>
                  ))}
              </select>
            </Field>
          )}
          <CatalogError error={shifts.error} />
          <Field label={text.reference}>
            <input
              value={reference}
              required={!['CASH', 'CASH_REFUND', 'NONE'].includes(method)}
              maxLength={200}
              onChange={(event) => setReference(event.target.value)}
            />
          </Field>
          <Field label={text.note}>
            <textarea
              required
              value={note}
              maxLength={2000}
              onChange={(event) => setNote(event.target.value)}
            />
          </Field>
          <label className="returns-ack">
            <input
              type="checkbox"
              required
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
            />
            {text.acknowledged}
          </label>
          <Button type="submit" disabled={command.busy || !acknowledged}>
            {text.confirm}
          </Button>
        </form>
      )}
      <article
        className={doc.status === 'COMPLETED' ? 'returns-print-document' : ''}
        aria-label={text.acknowledgement}
      >
        <h2>{text.acknowledgement}</h2>
        <h3>{doc.store_name}</h3>
        <p>
          {doc.branch_name} · {doc.cashier_name}
        </p>
        <p className="returns-reference">
          {doc.number} · {doc.original_sale_number}
        </p>
        <p>{doc.completed_at ?? doc.status}</p>
        {doc.return_document.items.map((item) => (
          <p key={item.id}>
            {item.product_name} · {item.sku} · {item.quantity} ·{' '}
            {item.refund_amount} THB · {item.disposition} · {item.movement_id}
          </p>
        ))}
        <h3>{text.replacements}</h3>
        {doc.replacement_items.map((item) => (
          <p key={item.variant_id}>
            {item.product_name} · {item.sku} · {item.quantity} ×{' '}
            {item.unit_price} = {item.line_total}
          </p>
        ))}
        <p>
          {text.credit}: {doc.return_credit} THB
        </p>
        <p>
          {text.total}: {doc.replacement_total} THB
        </p>
        <p>
          {text.difference}: {doc.net_difference} THB —{' '}
          {doc.net_difference === '0.00'
            ? text.zero
            : doc.net_difference.startsWith('-')
              ? text.refund
              : text.collect}
        </p>
        <p>
          {doc.method} · {doc.status} · {doc.reference}
        </p>
        <p>{text.printNotice}</p>
      </article>
      {doc.status === 'COMPLETED' && (
        <Button
          onClick={() => {
            try {
              window.print();
            } catch {
              setPrintError(text.printError);
            }
          }}
        >
          {text.print}
        </Button>
      )}
      {printError && <p role="alert">{printError}</p>}
      <h3>{text.timeline}</h3>
      {doc.events.map((event) => (
        <p key={event.id}>
          {event.action} · {event.reference} · {event.note} · {event.created_at}
        </p>
      ))}
      {doc.audit.map((event, index) => (
        <p key={index}>
          {event.event_type} · {event.actor_id} · {event.created_at}
        </p>
      ))}
    </Card>
  );
}
