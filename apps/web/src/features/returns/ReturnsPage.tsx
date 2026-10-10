import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { useOrganization } from '../../app/OrganizationProvider';
import { Button, Card, Loading, Tag } from '../../components/ui/primitives';
import { CatalogError } from '../catalog/CatalogUI';
import { Field, SupplyTable } from '../purchasing/SupplyUI';
import type { POSPage, POSShift, SaleSummary } from '../../lib/pos-api';
import {
  validReturnQuantity,
  type CustomerReturn,
  type CustomerRefund,
  type ReturnableSale,
  type StockDisposition,
} from '../../lib/returns-api';
import { useReturnsCommand, useReturnsQuery } from './returns-hooks';
import { copy, type ReturnsCopy } from './copy';

type Command = ReturnType<typeof useReturnsCommand>;
type Location = { id: string; name: string; type: string; status: string };
export function ReturnsPage({ refunds = false }: { refunds?: boolean }) {
  const tenant = useOrganization(),
    { state } = useAuth();
  return (
    <ReturnsWorkspace
      key={[
        state.session?.user.id,
        tenant.context?.organization.id,
        tenant.branchID,
        refunds,
      ].join(':')}
      refunds={refunds}
    />
  );
}
function ReturnsWorkspace({ refunds }: { refunds: boolean }) {
  const [params] = useSearchParams();
  const tenant = useOrganization(),
    command = useReturnsCommand();
  const [language, setLanguage] = useState<'th' | 'en'>('th'),
    [search, setSearch] = useState(''),
    [page, setPage] = useState(1),
    [selected, setSelected] = useState(params.get('return_id') ?? '');
  const text = copy[language],
    kind = refunds ? 'refunds' : 'returns';
  const filters = new URLSearchParams({
    search,
    page: String(page),
    page_size: '10',
    ...(tenant.branchID ? { branch_id: tenant.branchID } : {}),
  });
  const history = useReturnsQuery<POSPage<CustomerReturn | CustomerRefund>>(
    `/${kind}?${filters}`,
  );
  return (
    <div className="catalog-page returns-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">BUSINESS OPERATIONS</p>
          <h1>{refunds ? text.refunds : text.returns}</h1>
          <p>{text.privacy}</p>
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
        <Link to="/sales">{text.back}</Link>
        <Link to="/pos/returns">{text.returns}</Link>
        <Link to="/sales/refunds">{text.refunds}</Link>
      </nav>
      <CatalogError error={command.error} />
      {!refunds && tenant.can('returns.create') && (
        <ReturnForm text={text} command={command} created={setSelected} />
      )}
      <Card>
        <h2>{refunds ? text.refundList : text.list}</h2>
        <Field label={text.filter}>
          <input
            value={search}
            maxLength={100}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </Field>
        {history.isPending && <Loading>{text.loading}</Loading>}
        <CatalogError error={history.error} />
        {history.isError && (
          <Button onClick={() => void history.refetch()}>{text.retry}</Button>
        )}
        {history.data && (
          <>
            <SupplyTable headers={[text.select, text.status, text.amount]}>
              {history.data.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <Button
                      className="button-secondary"
                      onClick={() => setSelected(item.id)}
                    >
                      {'number' in item
                        ? item.number
                        : (item.return_number ?? item.id)}
                    </Button>
                  </td>
                  <td>
                    <Tag>{item.status}</Tag>
                  </td>
                  <td>{item.amount} THB</td>
                </tr>
              ))}
            </SupplyTable>
            {history.data.items.length === 0 && <p>{text.empty}</p>}
            <div className="catalog-actions">
              <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
                {text.previous}
              </Button>
              <span>
                {text.page} {page}
              </span>
              <Button
                disabled={page * 10 >= history.data.total}
                onClick={() => setPage(page + 1)}
              >
                {text.next}
              </Button>
            </div>
          </>
        )}
      </Card>
      {selected &&
        (refunds ? (
          <RefundPanel id={selected} text={text} command={command} />
        ) : (
          <ReturnPanel id={selected} text={text} command={command} />
        ))}
    </div>
  );
}
function ReturnForm({
  text,
  command,
  created,
}: {
  text: ReturnsCopy;
  command: Command;
  created: (id: string) => void;
}) {
  const tenant = useOrganization();
  const [search, setSearch] = useState(''),
    [saleID, setSaleID] = useState('');
  const sales = useReturnsQuery<POSPage<SaleSummary>>(
    `/sales?${new URLSearchParams({ search, page_size: '10', ...(tenant.branchID ? { branch_id: tenant.branchID } : {}) })}`,
  );
  const sale = useReturnsQuery<ReturnableSale>(
    saleID ? `/returns/sales/${saleID}` : '',
  );
  return (
    <Card>
      <h2>{text.paid}</h2>
      <Field label={text.search}>
        <input
          value={search}
          maxLength={100}
          onChange={(event) => setSearch(event.target.value)}
        />
      </Field>
      <CatalogError error={sales.error} />
      {sales.isPending && <Loading>{text.loading}</Loading>}
      <Field label={text.choose}>
        <select
          value={saleID}
          onChange={(event) => setSaleID(event.target.value)}
        >
          <option value="">{text.select}</option>
          {sales.data?.items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.sale_number} — {item.grand_total} THB
            </option>
          ))}
        </select>
      </Field>
      {sales.data?.items.length === 0 && <p>{text.empty}</p>}
      <CatalogError error={sale.error} />
      {saleID && sale.isPending && <Loading>{text.loading}</Loading>}
      {sale.data && (
        <ReturnLines
          key={sale.data.id}
          sale={sale.data}
          text={text}
          command={command}
          created={created}
        />
      )}
    </Card>
  );
}
function ReturnLines({
  sale,
  text,
  command,
  created,
}: {
  sale: ReturnableSale;
  text: ReturnsCopy;
  command: Command;
  created: (id: string) => void;
}) {
  const [reason, setReason] = useState(''),
    [quantities, setQuantities] = useState<Record<string, string>>({}),
    [dispositions, setDispositions] = useState<
      Record<string, StockDisposition>
    >({}),
    [destinations, setDestinations] = useState<Record<string, string>>({}),
    [invalid, setInvalid] = useState(false);
  const locations = useReturnsQuery<POSPage<Location>>(
    `/inventory/locations?branch_id=${sale.branch_id}&page_size=100`,
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    const selected = sale.items.filter((item) => quantities[item.id]);
    if (
      !selected.length ||
      selected.some(
        (item) =>
          !validReturnQuantity(quantities[item.id], item.returnable_quantity),
      )
    ) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    const items = selected.map((item) => {
      const disposition = dispositions[item.id] ?? 'RESTOCK_SELLABLE';
      return {
        original_sale_item_id: item.id,
        quantity: quantities[item.id],
        disposition,
        destination_location_id:
          disposition === 'NO_STOCK_RETURN'
            ? null
            : (destinations[item.id] ?? item.stock_location_id),
      };
    });
    const result = await command.run<CustomerReturn>('/returns', {
      original_sale_id: sale.id,
      reason,
      items,
    });
    if (result) {
      created(result.id);
      setQuantities({});
    }
  }
  return (
    <form onSubmit={(event) => void submit(event)}>
      <p>{sale.sale_number}</p>
      <p>{text.preview}</p>
      <CatalogError error={locations.error} />
      {sale.items.map((item) => {
        const disposition = dispositions[item.id] ?? 'RESTOCK_SELLABLE';
        return (
          <fieldset key={item.id} className="returns-line">
            <legend>
              {item.product_name} / {item.sku}
            </legend>
            <p>
              {text.returned}: {item.returned_quantity} · {text.remaining}:{' '}
              {item.returnable_quantity} · {text.historical}: {item.line_total}{' '}
              THB
            </p>
            <div className="tenant-form-grid">
              <Field label={`${text.quantity} ${item.sku}`}>
                <input
                  inputMode="decimal"
                  value={quantities[item.id] ?? ''}
                  maxLength={19}
                  onChange={(event) =>
                    setQuantities({
                      ...quantities,
                      [item.id]: event.target.value,
                    })
                  }
                />
              </Field>
              <Field label={`${text.disposition} ${item.sku}`}>
                <select
                  value={disposition}
                  onChange={(event) => {
                    setDispositions({
                      ...dispositions,
                      [item.id]: event.target.value as StockDisposition,
                    });
                    setDestinations({ ...destinations, [item.id]: '' });
                  }}
                >
                  <option value="RESTOCK_SELLABLE">{text.sellable}</option>
                  <option value="QUARANTINE">{text.quarantine}</option>
                  <option value="DAMAGED">{text.damaged}</option>
                  <option value="NO_STOCK_RETURN">{text.noStock}</option>
                </select>
              </Field>
              {disposition !== 'NO_STOCK_RETURN' && (
                <Field label={`${text.destination} ${item.sku}`}>
                  <select
                    value={destinations[item.id] ?? item.stock_location_id}
                    onChange={(event) =>
                      setDestinations({
                        ...destinations,
                        [item.id]: event.target.value,
                      })
                    }
                    required={!!quantities[item.id]}
                  >
                    <option value="">{text.select}</option>
                    {locations.data?.items
                      .filter(
                        (location) =>
                          location.status === 'ACTIVE' &&
                          (disposition === 'RESTOCK_SELLABLE'
                            ? ['WAREHOUSE', 'SHELF', 'SALES_FLOOR'].includes(
                                location.type,
                              )
                            : location.type === disposition),
                      )
                      .map((location) => (
                        <option value={location.id} key={location.id}>
                          {location.name}
                        </option>
                      ))}
                  </select>
                </Field>
              )}
            </div>
          </fieldset>
        );
      })}
      <Field label={text.reason}>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={2000}
          required
        />
      </Field>
      {invalid && <p role="alert">{text.invalid}</p>}
      <Button type="submit" disabled={command.busy || !locations.data}>
        {text.create}
      </Button>
    </form>
  );
}
function ReturnPanel({
  id,
  text,
  command,
}: {
  id: string;
  text: ReturnsCopy;
  command: Command;
}) {
  const tenant = useOrganization(),
    query = useReturnsQuery<CustomerReturn>(`/returns/${id}`);
  const doc = query.data;
  return (
    <Card className="returns-print-document">
      <h2>{text.details}</h2>
      {query.isPending && <Loading>{text.loading}</Loading>}
      <CatalogError error={query.error} />
      {doc && (
        <>
          <p className="returns-reference">{doc.number}</p>
          <Tag>{doc.status}</Tag>
          <p>
            {text.amount}: {doc.amount} THB
          </p>
          <p>{doc.reason}</p>
          <p className="returns-reference">
            {text.paid}: {doc.original_sale_id}
          </p>
          <p className="returns-reference">
            {text.branch}: {doc.branch_id}
          </p>
          <p className="returns-reference">
            {text.created}: {doc.created_at} / {doc.created_by}
          </p>
          {doc.approved_at && (
            <p className="returns-reference">
              {text.approved}: {doc.approved_at} / {doc.approved_by}
            </p>
          )}
          {doc.completed_at && (
            <p className="returns-reference">
              {text.completed}: {doc.completed_at} / {doc.completed_by}
            </p>
          )}
          {doc.refund_id && (
            <p className="returns-reference">
              {text.refunds}: {doc.refund_id}
            </p>
          )}
          <p>{text.warning}</p>
          <SupplyTable
            headers={[
              text.details,
              text.quantity,
              text.disposition,
              text.amount,
              text.stock,
            ]}
          >
            {doc.items.map((item) => (
              <tr key={item.id}>
                <td>
                  {item.product_name} / {item.sku}
                </td>
                <td>{item.quantity}</td>
                <td>{item.disposition}</td>
                <td>{item.refund_amount}</td>
                <td className="returns-reference">{item.movement_id ?? '—'}</td>
              </tr>
            ))}
          </SupplyTable>
          <div className="catalog-actions">
            {[
              {
                action: 'submit',
                label: text.submit,
                permission: 'returns.create',
                states: ['DRAFT'],
              },
              {
                action: 'approve',
                label: text.approve,
                permission: 'returns.approve',
                states: ['PENDING_APPROVAL'],
              },
              {
                action: 'reject',
                label: text.reject,
                permission: 'returns.approve',
                states: ['PENDING_APPROVAL'],
              },
              {
                action: 'complete',
                label: text.complete,
                permission: 'returns.complete',
                states: ['APPROVED'],
              },
              {
                action: 'cancel',
                label: text.cancel,
                permission: 'returns.create',
                states: ['DRAFT', 'PENDING_APPROVAL', 'APPROVED'],
              },
            ]
              .filter(
                (entry) =>
                  entry.states.includes(doc.status) &&
                  tenant.can(entry.permission),
              )
              .map((entry) => (
                <Button
                  key={entry.action}
                  disabled={command.busy}
                  onClick={() =>
                    void command.run(`/returns/${doc.id}/${entry.action}`, {
                      revision: doc.revision,
                    })
                  }
                >
                  {entry.label}
                </Button>
              ))}
            <Button className="button-secondary" onClick={() => window.print()}>
              {text.print}
            </Button>
            {doc.refund_id && <Link to="/sales/refunds">{text.refunds}</Link>}
          </div>
        </>
      )}
    </Card>
  );
}
function RefundPanel({
  id,
  text,
  command,
}: {
  id: string;
  text: ReturnsCopy;
  command: Command;
}) {
  const query = useReturnsQuery<CustomerRefund>(`/refunds/${id}`),
    refund = query.data;
  return (
    <Card className="returns-print-document">
      <h2>{text.settlement}</h2>
      {query.isPending && <Loading>{text.loading}</Loading>}
      <CatalogError error={query.error} />
      {refund && (
        <RefundDetails
          key={refund.id + ':' + refund.revision}
          refund={refund}
          text={text}
          command={command}
        />
      )}
    </Card>
  );
}
function RefundDetails({
  refund,
  text,
  command,
}: {
  refund: CustomerRefund;
  text: ReturnsCopy;
  command: Command;
}) {
  const tenant = useOrganization(),
    { state } = useAuth();
  const [method, setMethod] = useState('MANUAL_BANK_REFUND'),
    [shift, setShift] = useState(''),
    [reference, setReference] = useState(''),
    [note, setNote] = useState(''),
    [acknowledged, setAcknowledged] = useState(false);
  const shifts = useReturnsQuery<POSPage<POSShift>>(
    `/pos/shifts?branch_id=${refund.branch_id}&status=OPEN&page_size=100`,
  );
  const pending = refund.status === 'PENDING_SETTLEMENT';
  async function settle(action: string) {
    await command.run(`/refunds/${refund.id}/${action}`, {
      revision: refund.revision,
      note,
      acknowledged,
      ...(action === 'report-settlement'
        ? {
            method,
            reference,
            shift_id: method === 'CASH_REFUND' ? shift : null,
          }
        : {}),
    });
  }
  return (
    <>
      <p className="returns-reference">{refund.id}</p>
      <Tag>{refund.status}</Tag>
      <p>
        {text.amount}: {refund.amount} THB
      </p>
      <p>{text.warning}</p>
      <p>
        {refund.method} {refund.reference}
      </p>
      <p>{refund.settlement_note}</p>
      <p className="returns-reference">
        {text.returns}: {refund.return_id}
      </p>
      <p className="returns-reference">
        {text.branch}: {refund.branch_id}
      </p>
      {refund.reported_at && (
        <p className="returns-reference">
          {text.reported}: {refund.reported_at} / {refund.reported_by}
        </p>
      )}
      {refund.confirmed_at && (
        <p className="returns-reference">
          {text.confirmed}: {refund.confirmed_at} / {refund.confirmed_by}
        </p>
      )}
      {pending && <p>{text.pending}</p>}
      {refund.status !== 'CONFIRMED' &&
        tenant.can(
          pending ? 'refunds.settlement.report' : 'refunds.settlement.confirm',
        ) && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void settle(pending ? 'report-settlement' : 'confirm-settlement');
            }}
          >
            {pending && (
              <>
                <Field label={text.method}>
                  <select
                    value={method}
                    onChange={(event) => setMethod(event.target.value)}
                  >
                    <option value="MANUAL_BANK_REFUND">{text.bank}</option>
                    <option value="MANUAL_ORIGINAL_METHOD_REFUND">
                      {text.original}
                    </option>
                    <option value="CASH_REFUND">{text.cash}</option>
                  </select>
                </Field>
                {method === 'CASH_REFUND' ? (
                  <Field label={text.shift}>
                    <select
                      required
                      value={shift}
                      onChange={(event) => setShift(event.target.value)}
                    >
                      <option value="">{text.select}</option>
                      {shifts.data?.items
                        .filter(
                          (item) => item.cashier_id === state.session?.user.id,
                        )
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.terminal_name} — {item.expected_cash} THB
                          </option>
                        ))}
                    </select>
                  </Field>
                ) : (
                  <Field label={text.reference}>
                    <input
                      required
                      value={reference}
                      maxLength={200}
                      onChange={(event) => setReference(event.target.value)}
                    />
                  </Field>
                )}
              </>
            )}
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
                required
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
              />
              {text.acknowledge}
            </label>
            <div className="catalog-actions">
              <Button type="submit" disabled={command.busy || !acknowledged}>
                {pending ? text.report : text.confirm}
              </Button>
              {!pending && (
                <Button
                  disabled={command.busy || !acknowledged || !note.trim()}
                  className="button-secondary"
                  onClick={() => void settle('reconcile')}
                >
                  {text.reconcile}
                </Button>
              )}
            </div>
          </form>
        )}
      {refund.cash_disbursement_id && (
        <p className="returns-reference">
          {text.ledger}: {refund.cash_disbursement_id}
        </p>
      )}
      <ul>
        {refund.events.map((event) => (
          <li key={event.id}>
            {event.action} · {event.created_at} · {event.note}
          </li>
        ))}
      </ul>
      <Button className="button-secondary" onClick={() => window.print()}>
        {text.print}
      </Button>
    </>
  );
}
