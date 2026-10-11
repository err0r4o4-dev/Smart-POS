import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { WorkspaceLink as Link } from '../../app/WorkspaceNavigation';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../app/AuthProvider';
import { useOrganization } from '../../app/OrganizationProvider';
import {
  Button,
  Card,
  ErrorState,
  Loading,
} from '../../components/ui/primitives';
import {
  posRequest,
  moneyText,
  paymentLabels,
  type POSPage,
  type POSSale,
  type SaleSummary,
  type POSTerminal,
} from '../../lib/pos-api';

export function SalesPage({ receipts = false }: { receipts?: boolean }) {
  const tenant = useOrganization();
  const { state } = useAuth();
  const org = tenant.context?.organization.id ?? '';
  const user = state.session?.user.id ?? '';
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState('');
  const [terminal, setTerminal] = useState('');
  const [cashier, setCashier] = useState('');
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const filters = new URLSearchParams({
    page: String(page),
    branch_id: tenant.branchID,
    search,
    method,
    terminal_id: terminal,
    cashier_id: cashier,
    status,
  });
  if (from) filters.set('from', new Date(from + 'T00:00:00').toISOString());
  if (to) filters.set('to', new Date(to + 'T23:59:59.999').toISOString());
  const resource = receipts ? 'receipts' : 'sales';
  const query = useQuery({
    queryKey: ['tenant', user, org, resource, filters.toString()],
    queryFn: ({ signal }) =>
      posRequest<POSPage<SaleSummary>>(org, `/${resource}?${filters}`, {
        signal,
      }),
    enabled: !!org,
  });
  const terminals = useQuery({
    queryKey: ['tenant', user, org, 'sales-terminals', tenant.branchID],
    queryFn: ({ signal }) =>
      posRequest<POSPage<POSTerminal>>(
        org,
        `/pos/terminals?branch_id=${tenant.branchID}&page_size=100`,
        { signal },
      ),
    enabled: !!org,
  });
  return (
    <div className="catalog-page sales-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">COMMITTED TRANSACTIONS</p>
          <h1>{receipts ? 'ใบเสร็จ' : 'ประวัติการขาย'}</h1>
          <p>
            แคชเชียร์เห็นเฉพาะรายการของตนเอง
            สาขาที่ไม่มีสิทธิ์ถูกปฏิเสธโดยเซิร์ฟเวอร์
          </p>
        </div>
        <Link to="/pos">ไปขายสินค้า</Link>
      </div>
      <Card>
        <div className="pos-history-filters">
          <label>
            ค้นหาเลขรายการ
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <label>
            วิธีชำระเงิน
            <select
              value={method}
              onChange={(event) => {
                setMethod(event.target.value);
                setPage(1);
              }}
            >
              <option value="">ทั้งหมด</option>
              {Object.entries(paymentLabels).map(([value, label]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            เครื่องขาย
            <select
              value={terminal}
              onChange={(event) => {
                setTerminal(event.target.value);
                setPage(1);
              }}
            >
              <option value="">ทั้งหมด</option>
              {terminals.data?.items.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cashier UUID
            <input
              value={cashier}
              onChange={(event) => {
                setCashier(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <label>
            สถานะ
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">ทั้งหมด</option>
              <option value="COMPLETED">COMPLETED</option>
            </select>
          </label>
          <label>
            ตั้งแต่
            <input
              type="date"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <label>
            ถึง
            <input
              type="date"
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
                setPage(1);
              }}
            />
          </label>
        </div>
        {query.isPending && <Loading>กำลังโหลดประวัติ…</Loading>}
        {query.error && (
          <ErrorState
            message={query.error.message}
            retry={() => void query.refetch()}
          />
        )}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{receipts ? 'ใบเสร็จ' : 'เลขรายการขาย'}</th>
                <th>วัน / เวลา</th>
                <th>สาขา / เครื่อง</th>
                <th>แคชเชียร์</th>
                <th>ยอดรวม</th>
                <th>ชำระเงิน / สถานะ</th>
                <th>รายการ</th>
              </tr>
            </thead>
            <tbody>
              {query.data?.items.map((item) => (
                <tr key={item.id}>
                  <td>{receipts ? item.receipt_number : item.sale_number}</td>
                  <td>{new Date(item.completed_at).toLocaleString('th-TH')}</td>
                  <td>
                    {item.branch_name}
                    <br />
                    {item.terminal_name}
                  </td>
                  <td>{item.cashier_name}</td>
                  <td>{moneyText(item.grand_total)} บาท</td>
                  <td>
                    {paymentLabels[item.method]}
                    <br />
                    {item.payment_status} · {item.status}
                  </td>
                  <td>
                    <Link to={`/sales/${item.id}`}>ดูรายละเอียด / พิมพ์</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {query.data?.total === 0 && <p>ยังไม่มีรายการขายที่ตรงเงื่อนไข</p>}
        <div className="pos-pagination">
          <Button
            disabled={page <= 1 || query.isFetching}
            onClick={() => setPage(page - 1)}
          >
            ก่อนหน้า
          </Button>
          <span>
            หน้า {page} · ทั้งหมด {query.data?.total ?? 0} รายการ
          </span>
          <Button
            disabled={
              !query.data ||
              page * query.data.page_size >= query.data.total ||
              query.isFetching
            }
            onClick={() => setPage(page + 1)}
          >
            ถัดไป
          </Button>
        </div>
      </Card>
    </div>
  );
}

export function SaleDetailsPage() {
  const { id } = useParams();
  const tenant = useOrganization();
  const { state } = useAuth();
  const org = tenant.context?.organization.id ?? '';
  const [paper, setPaper] = useState('80');
  const [printError, setPrintError] = useState('');
  const query = useQuery({
    queryKey: ['tenant', state.session?.user.id, org, 'sale', id],
    queryFn: ({ signal }) =>
      posRequest<POSSale>(org, `/sales/${id}`, { signal }),
    enabled: !!org && !!id,
  });
  const sale = query.data;
  if (query.isPending) return <Loading>กำลังโหลดรายการขาย…</Loading>;
  if (query.error)
    return (
      <ErrorState
        message={query.error.message}
        retry={() => void query.refetch()}
      />
    );
  if (!sale) return null;
  return (
    <div className="catalog-page sales-page">
      <div className="page-heading no-print">
        <h1>รายละเอียดการขาย</h1>
        <Link to="/sales">กลับประวัติขาย</Link>
      </div>
      <div className="pos-sale-detail">
        <Card className="no-print">
          <h2>{sale.sale_number}</h2>
          {sale.customer_id && tenant.can('loyalty.read') && (
            <Link to={`/loyalty/history?customer_id=${sale.customer_id}`}>
              ประวัติแต้มลูกค้า / Customer points history
            </Link>
          )}
          <p>
            {sale.status} · {sale.payment_status}
          </p>
          <p>
            เครื่อง {sale.terminal_name} · แคชเชียร์ {sale.cashier_name}
          </p>
          <p>
            เงินยืนยัน {paymentLabels[sale.payment.method]} · อ้างอิง{' '}
            {sale.payment.reference || '—'}
          </p>
          <p>
            ผู้ยืนยัน {sale.payment.confirmed_by} ·{' '}
            {new Date(sale.payment.confirmed_at).toLocaleString('th-TH')}
          </p>
          <h3>สินค้า (snapshot)</h3>
          {sale.items.map((item) => (
            <p key={item.variant_id}>
              {item.product_name} · {item.sku} · {item.quantity} ×{' '}
              {item.unit_price} = {item.line_total} บาท
            </p>
          ))}
          <h3>Inventory SALE movements</h3>
          <p>Operation: {sale.inventory_operation_id}</p>
          {sale.movements.map((item) => (
            <p key={item.id}>
              ตำแหน่ง {item.location_id} · {item.quantity_before}{' '}
              {item.quantity_delta} → {item.quantity_after}
            </p>
          ))}
          <h3>Audit trail</h3>
          {sale.audit.map((item, index) => (
            <p key={index}>
              {item.event_type} ·{' '}
              {new Date(item.created_at).toLocaleString('th-TH')} ·{' '}
              {item.actor_id}
            </p>
          ))}
          <p>
            ประวัติขายเดิมไม่ถูกแก้ไข
            การคืน/เปลี่ยน/กลับรายการใช้เอกสารเชื่อมโยง
          </p>
          <nav className="catalog-nav">
            <Link to={`/pos/exchanges?sale_id=${sale.id}`}>
              เปลี่ยนสินค้า / Exchanges
            </Link>
            <Link to={`/sales/voids?sale_id=${sale.id}`}>
              กลับรายการ / Reversal
            </Link>
          </nav>
          {sale.adjustments?.map((item) => (
            <p key={item.id}>
              <Link
                to={`${item.kind === 'EXCHANGE' ? '/pos/exchanges' : '/sales/voids'}?document_id=${item.id}`}
              >
                {item.number}
              </Link>{' '}
              · {item.status} · {item.net_difference} THB
            </p>
          ))}
          {sale.returns?.map((item) => (
            <p key={item.id}>
              <Link to={`/pos/returns?return_id=${item.id}`}>
                {item.number}
              </Link>{' '}
              · {item.status}
            </p>
          ))}
        </Card>
        <Card>
          <div className="no-print">
            <h2>ใบเสร็จ / พิมพ์ซ้ำ</h2>
            <label>
              กระดาษ
              <select
                value={paper}
                onChange={(event) => setPaper(event.target.value)}
              >
                <option value="80">80 mm</option>
                <option value="58">58 mm</option>
              </select>
            </label>
            <Button
              disabled={!tenant.can('receipts.print')}
              onClick={() => {
                setPrintError('');
                try {
                  window.print();
                } catch {
                  setPrintError(
                    'พิมพ์ไม่ได้ — รายการขายยังสำเร็จ กรุณาลองพิมพ์ซ้ำ',
                  );
                }
              }}
            >
              พิมพ์ใบเสร็จ
            </Button>
            <p>พิมพ์ซ้ำไม่มีผลต่อสต็อก ถ้าพิมพ์ไม่ได้ รายการขายยังสำเร็จ</p>
            {printError && <p role="alert">{printError}</p>}
          </div>
          <Receipt sale={sale} paper={paper} />
        </Card>
      </div>
    </div>
  );
}
export function Receipt({
  sale,
  paper = '80',
}: {
  sale: POSSale;
  paper?: string;
}) {
  return (
    <article className={`pos-receipt paper-${paper}`} aria-label="ใบเสร็จขาย">
      <h2>{sale.store_name}</h2>
      <p>{sale.branch_name}</p>
      <p>{sale.store_address}</p>
      <p>ใบเสร็จ: {sale.receipt.receipt_number}</p>
      <p>ขาย: {sale.sale_number}</p>
      <p>{new Date(sale.completed_at).toLocaleString('th-TH')}</p>
      <p>แคชเชียร์: {sale.cashier_name}</p>
      <p>ลูกค้า / Customer: {sale.customer_code_snapshot || 'Walk-in'}</p>
      <hr />
      {sale.items.map((item) => (
        <div className="receipt-item" key={item.variant_id}>
          <strong>{item.product_name}</strong>
          <span>
            {item.sku} · {item.variant_name}
          </span>
          <div>
            <span>
              {item.quantity} {item.unit} × {moneyText(item.unit_price)}
            </span>
            <strong>{moneyText(item.line_total)}</strong>
          </div>
        </div>
      ))}
      <hr />
      <div className="receipt-total">
        <span>
          ก่อนลด {moneyText(sale.subtotal)} · ส่วนลด{' '}
          {moneyText(sale.discount_total)}
        </span>
        <span>รวมสุทธิ</span>
        <strong>
          {moneyText(sale.grand_total)} {sale.currency}
        </strong>
      </div>
      <p>
        {paymentLabels[sale.payment.method]} · {sale.payment.status}
      </p>
      <p>
        เงินรับ {moneyText(sale.payment.received)} · ทอน{' '}
        {moneyText(sale.payment.change)}
      </p>
      {sale.payment.credit_amount && sale.payment.credit_amount !== '0.00' && (
        <p>
          เครดิตเปลี่ยนสินค้า {moneyText(sale.payment.credit_amount)} · เงินใหม่{' '}
          {moneyText(sale.payment.amount)}
        </p>
      )}
      <p>ขอบคุณที่ใช้บริการ</p>
      <small>ใบเสร็จรับเงินทั่วไป ไม่ใช่ใบกำกับภาษี</small>
    </article>
  );
}
