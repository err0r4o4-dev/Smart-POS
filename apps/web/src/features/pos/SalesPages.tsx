import { useLanguage } from '../../app/language';
import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { Printer } from 'lucide-react';
import { SupplyTable } from '../purchasing/SupplyUI';
import { WorkspaceLink as Link } from '../../app/WorkspaceNavigation';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../app/AuthProvider';
import { useOrganization } from '../../app/OrganizationProvider';
import {
  Button,
  Card,
  ErrorState,
  Loading,
  Tag,
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
  const { t, localize, formatDateTime } = useLanguage();

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
          <p className="eyebrow">{t('pos.committedTransactions')}</p>
          <h1>{receipts ? t('pos.receipts') : t('pos.salesHistory2')}</h1>
          <p>
            {receipts
              ? t('pos.findReceiptsAndOpenDetailsToReprint')
              : t('pos.reviewTotalsPaymentMethodsAndCompletedSales')}
          </p>
        </div>
        <Link to="/pos">{t('customers.openPos')}</Link>
      </div>
      <Card>
        <div className="pos-history-filters">
          <label>
            {t('pos.searchTransactionNumber')}
            <input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <label>
            {t('pos.paymentMethod')}
            <select
              value={method}
              onChange={(event) => {
                setMethod(event.target.value);
                setPage(1);
              }}
            >
              <option value="">{t('common.all')}</option>
              {Object.entries(paymentLabels).map(([value, label]) => (
                <option value={value} key={value}>
                  {localize(label ?? '')}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('pos.terminal')}
            <select
              value={terminal}
              onChange={(event) => {
                setTerminal(event.target.value);
                setPage(1);
              }}
            >
              <option value="">{t('common.all')}</option>
              {terminals.data?.items.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('pos.cashierIdUuid')}
            <input
              value={cashier}
              onChange={(event) => {
                setCashier(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <label>
            {t('auth.status')}
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">{t('common.all')}</option>
              <option value="COMPLETED">{t('pos.saleCompleted')}</option>
            </select>
          </label>
          <label>
            {t('customers.from')}
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
            {t('customers.to')}
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
        {query.isPending && <Loading>{t('pos.loadingHistory')}</Loading>}
        {query.error && (
          <ErrorState
            message={query.error.message}
            retry={() => void query.refetch()}
          />
        )}
        <div
          className="table-scroll sales-history-table"
          role="region"
          aria-label={receipts ? t('pos.receiptList') : t('landing.saleItems')}
          tabIndex={0}
        >
          <table className="record-table">
            <thead>
              <tr>
                <th>{receipts ? t('pos.receipts') : t('pos.saleNumber')}</th>
                <th>{t('loyalty.dateTime')}</th>
                <th>{t('pos.branchTerminal')}</th>
                <th>{t('pos.cashier2')}</th>
                <th className="sales-amount">{t('pos.totalThb')}</th>
                <th>{t('pos.paymentStatus')}</th>
                <th>{t('catalog.definitions')}</th>
              </tr>
            </thead>
            <tbody>
              {query.data?.items.map((item) => (
                <tr key={item.id}>
                  <td className="sales-number">
                    <strong>
                      {receipts ? item.receipt_number : item.sale_number}
                    </strong>
                  </td>
                  <td className="sales-date">
                    <time dateTime={item.completed_at}>
                      {formatDateTime(item.completed_at, 'date')}
                      <span className="sales-secondary">
                        {formatDateTime(item.completed_at, 'time')}{' '}
                        {t('pos.label')}
                      </span>
                    </time>
                  </td>
                  <td>
                    {item.branch_name}
                    <span className="sales-secondary">
                      {item.terminal_name}
                    </span>
                  </td>
                  <td>{item.cashier_name}</td>
                  <td className="sales-amount">
                    <strong>{moneyText(item.grand_total)}</strong>
                  </td>
                  <td>
                    {localize(paymentLabels[item.method])}
                    <div className="sales-statuses">
                      <Tag
                        tone={
                          item.payment_status === 'CONFIRMED'
                            ? 'success'
                            : 'neutral'
                        }
                      >
                        {item.payment_status === 'CONFIRMED'
                          ? t('pos.paymentConfirmed')
                          : item.payment_status}
                      </Tag>
                      <Tag
                        tone={
                          item.status === 'COMPLETED' ? 'success' : 'neutral'
                        }
                      >
                        {item.status === 'COMPLETED'
                          ? t('pos.saleCompleted')
                          : item.status}
                      </Tag>
                    </div>
                  </td>
                  <td>
                    <Link
                      to={`/sales/${item.id}`}
                      className="button button-secondary sales-detail-link"
                    >
                      <Printer size={16} aria-hidden="true" />
                      <span>{t('pos.viewDetailsPrint')}</span>
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {query.data?.total === 0 && (
          <p>
            {receipts
              ? t('pos.noReceiptsMatchTheFilters')
              : t('pos.noSalesMatchTheFilters')}
          </p>
        )}
        <div className="pos-pagination">
          <Button
            disabled={page <= 1 || query.isFetching}
            onClick={() => setPage(page - 1)}
          >
            {t('catalog.previous')}
          </Button>
          <span>
            {t('catalog.page')} {page} {t('pos.total2')}{' '}
            {query.data?.total ?? 0} {t('catalog.definitions')}
          </span>
          <Button
            disabled={
              !query.data ||
              page * query.data.page_size >= query.data.total ||
              query.isFetching
            }
            onClick={() => setPage(page + 1)}
          >
            {t('catalog.next')}
          </Button>
        </div>
      </Card>
    </div>
  );
}

export function SaleDetailsPage() {
  const { t, localize, formatDateTime, labelCode } = useLanguage();

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
  if (query.isPending) return <Loading>{t('pos.loadingSale')}</Loading>;
  if (query.error)
    return (
      <ErrorState
        message={localize(query.error.message ?? '')}
        retry={() => void query.refetch()}
      />
    );
  if (!sale) return null;
  return (
    <div className="catalog-page sales-page">
      <div className="page-heading no-print">
        <div>
          <p className="eyebrow">{t('pos.committedTransactionDetails')}</p>
          <h1>{t('pos.saleDetails')}</h1>
          <p>{t('pos.reviewItemsPaymentAndReceiptForA')}</p>
        </div>
        <Link to="/sales">{t('pos.backToSalesHistory')}</Link>
      </div>
      <div className="pos-sale-detail">
        <Card className="no-print sale-information">
          <h2>{sale.sale_number}</h2>
          {sale.customer_id && tenant.can('loyalty.read') && (
            <Link to={`/loyalty/history?customer_id=${sale.customer_id}`}>
              {t('pos.customerPointsHistory')}
            </Link>
          )}
          <div className="sales-statuses">
            <Tag tone={sale.status === 'COMPLETED' ? 'success' : 'neutral'}>
              {sale.status === 'COMPLETED'
                ? t('pos.saleCompleted')
                : sale.status}
            </Tag>
            <Tag
              tone={sale.payment_status === 'CONFIRMED' ? 'success' : 'neutral'}
            >
              {sale.payment_status === 'CONFIRMED'
                ? t('pos.paymentConfirmed')
                : sale.payment_status}
            </Tag>
          </div>
          <dl className="record-facts">
            <div>
              <dt>{t('pos.branchTerminal2')}</dt>
              <dd>
                {sale.branch_name} · {sale.terminal_name}
              </dd>
            </div>
            <div>
              <dt>{t('pos.cashier2')}</dt>
              <dd>{sale.cashier_name}</dd>
            </div>
            <div>
              <dt>{t('pos.paymentMethod')}</dt>
              <dd>{localize(paymentLabels[sale.payment.method])}</dd>
            </div>
            <div>
              <dt>{t('pos.netTotal')}</dt>
              <dd>
                <strong>
                  {moneyText(sale.grand_total)} {t('loyalty.thb')}
                </strong>
              </dd>
            </div>
            <div>
              <dt>{t('pos.paymentReference2')}</dt>
              <dd>{sale.payment.reference || '—'}</dd>
            </div>
            <div>
              <dt>{t('pos.paymentConfirmedAt')}</dt>
              <dd>{formatDateTime(sale.payment.confirmed_at)}</dd>
            </div>
          </dl>
          <h3>{t('pos.saleItems')}</h3>
          <SupplyTable
            className="record-table"
            headers={[
              t('common.productSku'),
              t('pos.quantity'),
              t('pos.unitPriceThb'),
              t('pos.totalThb2'),
            ]}
          >
            {sale.items.map((item) => (
              <tr key={item.variant_id}>
                <td>
                  <strong>{item.product_name}</strong>
                  <span className="record-secondary">{item.sku}</span>
                </td>
                <td className="record-number">
                  {item.quantity} {item.unit}
                </td>
                <td className="record-number">{moneyText(item.unit_price)}</td>
                <td className="record-number">
                  <strong>{moneyText(item.line_total)}</strong>
                </td>
              </tr>
            ))}
          </SupplyTable>
          <details className="sale-technical-details">
            <summary>{t('pos.stockMovementsAndTransactionHistory')}</summary>
            <p>
              {t('pos.stockMovementId')} {sale.inventory_operation_id}
            </p>
            <p>
              {t('pos.paymentConfirmerId')} {sale.payment.confirmed_by}
            </p>
            <h3>{t('pos.stockMovements')}</h3>
            <SupplyTable
              className="record-table"
              headers={[
                t('pos.location'),
                t('pos.beforeSale'),
                t('pos.change3'),
                t('pos.afterSale'),
              ]}
            >
              {sale.movements.map((item) => (
                <tr key={item.id}>
                  <td>{item.location_id}</td>
                  <td className="record-number">{item.quantity_before}</td>
                  <td className="record-number">{item.quantity_delta}</td>
                  <td className="record-number">{item.quantity_after}</td>
                </tr>
              ))}
            </SupplyTable>
            <h3>{t('pos.transactionHistory')}</h3>
            <SupplyTable
              className="record-table"
              headers={[t('pos.event'), t('loyalty.dateTime'), t('pos.actor')]}
            >
              {sale.audit.map((item, index) => (
                <tr key={index}>
                  <td>{item.event_type}</td>
                  <td>{formatDateTime(item.created_at)}</td>
                  <td>{item.actor_id}</td>
                </tr>
              ))}
            </SupplyTable>
          </details>
          <p>{t('pos.originalSalesRemainUnchangedReturnsExchangesAnd')}</p>
          <nav className="catalog-nav">
            <Link to={`/pos/exchanges?sale_id=${sale.id}`}>
              {t('pos.exchanges')}
            </Link>
            <Link to={`/sales/voids?sale_id=${sale.id}`}>
              {t('pos.reversal')}
            </Link>
          </nav>
          {sale.adjustments?.map((item) => (
            <p key={item.id}>
              <Link
                to={`${item.kind === 'EXCHANGE' ? '/pos/exchanges' : '/sales/voids'}?document_id=${item.id}`}
              >
                {item.number}
              </Link>{' '}
              · {labelCode(item.status)} · {item.net_difference} THB
            </p>
          ))}
          {sale.returns?.map((item) => (
            <p key={item.id}>
              <Link to={`/pos/returns?return_id=${item.id}`}>
                {item.number}
              </Link>{' '}
              · {labelCode(item.status)}
            </p>
          ))}
        </Card>
        <Card>
          <div className="no-print sale-receipt-controls">
            <h2>{t('pos.receiptReprint')}</h2>
            <label>
              {t('pos.paper')}
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
                  setPrintError(t('pos.unableToPrintTheSaleIsCompleted'));
                }
              }}
            >
              {t('pos.printReceipt')}
            </Button>
            <p>{t('pos.reprintingDoesNotAffectStockTheSale')}</p>
            {printError && <p role="alert">{localize(printError)}</p>}
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
  const { t, localize, formatDateTime } = useLanguage();

  return (
    <article
      className={`pos-receipt paper-${paper}`}
      aria-label={t('pos.salesReceipt')}
    >
      <h2>{sale.store_name}</h2>
      <p>{sale.branch_name}</p>
      <p>{sale.store_address}</p>
      <p>
        {t('pos.receipt')} {sale.receipt.receipt_number}
      </p>
      <p>
        {t('pos.sale')} {sale.sale_number}
      </p>
      <p>{formatDateTime(sale.completed_at)}</p>
      <p>
        {t('pos.cashier')} {sale.cashier_name}
      </p>
      <p>
        {t('customers.customer')}{' '}
        {sale.customer_code_snapshot || t('pos.walkIn')}
      </p>
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
          {t('pos.beforeDiscount')} {moneyText(sale.subtotal)}{' '}
          {t('pos.discount')} {moneyText(sale.discount_total)}
        </span>
        <span>{t('pos.netTotal2')}</span>
        <strong>
          {moneyText(sale.grand_total)} {sale.currency}
        </strong>
      </div>
      <p>
        {localize(paymentLabels[sale.payment.method])} ·{' '}
        {sale.payment.status === 'CONFIRMED'
          ? t('pos.paymentConfirmed')
          : sale.payment.status}
      </p>
      <p>
        {t('pos.amountReceived')} {moneyText(sale.payment.received)}{' '}
        {t('pos.change4')} {moneyText(sale.payment.change)}
      </p>
      {sale.payment.credit_amount && sale.payment.credit_amount !== '0.00' && (
        <p>
          {t('pos.exchangeCredit')} {moneyText(sale.payment.credit_amount)}{' '}
          {t('pos.newFunds')} {moneyText(sale.payment.amount)}
        </p>
      )}
      <p>{t('pos.thankYouForShoppingWithUs')}</p>
      <small>{t('pos.generalReceiptNotATaxInvoice')}</small>
    </article>
  );
}
