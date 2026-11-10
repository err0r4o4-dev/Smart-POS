import { useLanguage } from '../../app/language';
import { useMemo, useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  Clock,
  CreditCard,
  ExternalLink,
  Eye,
  Package,
  RefreshCw,
  ShoppingBag,
  Store,
  Terminal,
} from 'lucide-react';
import { WorkspaceLink as Link } from '../../app/WorkspaceNavigation';
import { useAuth } from '../../app/AuthProvider';
import { useOrganization } from '../../app/OrganizationProvider';
import { Button, Card, Loading, Tag } from '../../components/ui/primitives';
import {
  StandardFilterCard,
  StandardKpiCard,
  StandardKpiGrid,
  StandardPageHeader,
  StandardStatusTabs,
} from '../../components/ui/StandardPage';
import { ApiError } from '../../lib/api';
import {
  posRequest,
  moneyText,
  type POSTerminal,
  type POSPage,
} from '../../lib/pos-api';
import {
  orderStatusLabels,
  type OnlineOrder,
  type OrderStatus,
  type ShopPage,
  type ShopProduct,
  type ShopSettings,
} from '../../lib/storefront-api';
import { ShopError, ShopPagination } from './StorefrontPage';
import { OrderDetails } from './OrderDetails';

function useScope() {
  const tenant = useOrganization();
  const { state } = useAuth();
  return {
    org: tenant.context?.organization.id ?? '',
    user: state.session?.user.id ?? '',
    csrf: state.session?.csrf_token,
    branch: tenant.branchID,
    tenant,
  };
}
function useShopQuery<Result>(
  path: string,
  enabled = true,
  allowAbsent = false,
) {
  const scope = useScope();
  return useQuery({
    queryKey: [
      'tenant',
      scope.user,
      scope.org,
      scope.branch,
      'storefront-admin',
      scope.tenant.can('storefront.manage'),
      scope.tenant.can('online_orders.manage'),
      path,
    ],
    queryFn: async ({ signal }) => {
      try {
        return await posRequest<Result>(scope.org, path, { signal });
      } catch (error) {
        if (allowAbsent && error instanceof ApiError && error.status === 404)
          return null;
        throw error;
      }
    },
    enabled: !!scope.org && enabled,
    retry: false,
  });
}
function useCommand() {
  const scope = useScope();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({
      path,
      body,
      method = 'POST',
    }: {
      path: string;
      body: object;
      method?: string;
    }) =>
      posRequest<unknown>(scope.org, path, { body, method, csrf: scope.csrf }),
    onSettled: () =>
      client.invalidateQueries({ queryKey: ['tenant', scope.user, scope.org] }),
  });
}
type Command = ReturnType<typeof useCommand>;
type SettingsInput = Pick<
  ShopSettings,
  | 'slug'
  | 'name'
  | 'description'
  | 'contact_phone'
  | 'pickup_instructions'
  | 'delivery_enabled'
  | 'shipping_fee'
  | 'published'
  | 'accepting_orders'
  | 'revision'
> & { terminal_id: string; online_terminal_id: string };

export function StorefrontSettingsPage() {
  const { t } = useLanguage();

  const scope = useScope();
  const settings = useShopQuery<ShopSettings>('/storefront', true, true);
  const terminals = useShopQuery<POSPage<POSTerminal>>(
    `/pos/terminals?branch_id=${scope.branch}&status=ACTIVE&page_size=100`,
    !!scope.branch,
  );
  const command = useCommand();
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [page, setPage] = useState(1);
  const listings = useShopQuery<ShopPage<ShopProduct>>(
    `/storefront/products?search=${encodeURIComponent(submitted)}&page=${page}`,
    !!settings.data,
  );
  return (
    <div className="catalog-page online-admin">
      <StandardPageHeader
        icon={<Store size={24} />}
        eyebrow={t('storefront.receiveOnlineOrders')}
        title={t('storefront.onlineStorefrontSettings')}
        description={t('storefront.publishSelectedProductsForPickupAndPos')}
        actions={
          <>
            <Link
              className="button button-secondary sales-export-btn"
              to="/settings/payments"
            >
              <CreditCard size={15} aria-hidden="true" />
              <span>{t('storefront.testStripeSandbox')}</span>
            </Link>
            <Link className="button sales-new-sale-btn" to="/orders">
              <ShoppingBag size={15} aria-hidden="true" />
              <span>{t('storefront.manageOrders')}</span>
            </Link>
          </>
        }
      />

      <StandardKpiGrid label={t('storefront.onlineStorefrontSettings')}>
        <StandardKpiCard
          icon={<Store size={20} />}
          tone={settings.data?.published ? 'success' : 'amber'}
          label={t('storefront.publishStorefront')}
          value={
            settings.data?.published
              ? t('storefront.published')
              : t('storefront.unpublished')
          }
          subtext={settings.data?.slug ? `/shop/${settings.data.slug}` : '—'}
          sparkline
        />
        <StandardKpiCard
          icon={<CheckCircle2 size={20} />}
          tone={settings.data?.accepting_orders ? 'success' : 'amber'}
          label={t('storefront.acceptOrders')}
          value={
            settings.data?.accepting_orders
              ? t('storefront.published')
              : t('storefront.unpublished')
          }
          trendUp={Boolean(settings.data?.accepting_orders)}
        />
        <StandardKpiCard
          icon={<Terminal size={20} />}
          tone="amber"
          label={t('pos.terminal')}
          value={`${terminals.data?.items.length ?? 0} ${t('pos.itemsUnit')}`}
        />
        <StandardKpiCard
          icon={<Package size={20} />}
          tone="info"
          label={t('storefront.publishedProducts')}
          value={`${listings.data?.total ?? 0} ${t('pos.itemsUnit')}`}
        />
      </StandardKpiGrid>

      <p className="notice">
        {t('storefront.publishSelectedProductsForPickupAndPos')}
      </p>
      {settings.isPending || terminals.isPending ? (
        <Loading>{t('storefront.loadingSettings')}</Loading>
      ) : null}
      {(settings.error || terminals.error) && (
        <ShopError
          error={settings.error || terminals.error}
          retry={() => {
            void settings.refetch();
            void terminals.refetch();
          }}
        />
      )}
      {command.error && <ShopError error={command.error} />}
      {settings.isSuccess && terminals.data && (
        <SettingsForm
          key={`${scope.org}:${scope.branch}:${settings.data?.revision ?? 0}`}
          initial={settings.data}
          organizationName={scope.tenant.context?.organization.name ?? ''}
          terminals={terminals.data.items}
          command={command}
        />
      )}
      {settings.data && (
        <>
          <StandardFilterCard
            title={t('storefront.publishedProducts')}
            headerControls={
              <a
                className="button button-secondary sales-detail-link"
                href={`/shop/${settings.data.slug}`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={14} aria-hidden="true" />
                <span>{t('storefront.previewStorefront')}</span>
              </a>
            }
            useForm
            onSubmit={(event) => {
              event.preventDefault();
              setSubmitted(search.trim());
              setPage(1);
            }}
            onReset={() => {
              setSearch('');
              setSubmitted('');
              setPage(1);
            }}
            searchSubmit
            searchLabel={t('customers.search')}
          >
            <div className="sales-filter-field">
              <label htmlFor="listing-search">
                {t('storefront.findProductsToPublish')}
              </label>
              <input
                id="listing-search"
                maxLength={100}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
          </StandardFilterCard>
          {listings.isPending && (
            <Loading>{t('storefront.loadingProducts')}</Loading>
          )}
          {listings.error && (
            <ShopError
              error={listings.error}
              retry={() => void listings.refetch()}
            />
          )}
          {listings.data?.total === 0 && (
            <p className="sales-empty-message">
              {t('storefront.noProductsListedAddProductsToThe')}
            </p>
          )}
          <div className="online-listings">
            {listings.data?.items.map((item) => (
              <Card key={item.variant_id} className="online-listing">
                <div>
                  <h3>{item.product_name}</h3>
                  <p>
                    {item.variant_name} · {item.sku}
                  </p>
                  <small>
                    ฿{moneyText(item.unit_price)} / {item.unit}{' '}
                    {item.stock_policy !== 'MENU_ONLY' && (
                      <>
                        {t('storefront.stock')} {item.available ?? '—'}
                      </>
                    )}
                  </small>
                </div>
                <Tag tone={item.published ? 'success' : 'neutral'}>
                  {item.published
                    ? t('storefront.published')
                    : t('storefront.unpublished')}
                </Tag>
                <Button
                  className="button-secondary"
                  disabled={
                    command.isPending || (!item.published && !item.saleable)
                  }
                  onClick={() =>
                    command.mutate({
                      path: `/storefront/products/${item.variant_id}`,
                      method: 'PUT',
                      body: {
                        published: !item.published,
                        revision: settings.data!.revision,
                      },
                    })
                  }
                >
                  {item.published
                    ? t('storefront.unpublish')
                    : t('storefront.publishProduct')}
                </Button>
              </Card>
            ))}
          </div>
          {listings.data && (
            <ShopPagination
              page={page}
              total={listings.data.total}
              pageSize={listings.data.page_size}
              change={setPage}
            />
          )}
        </>
      )}
    </div>
  );
}
function SettingsForm({
  initial,
  organizationName,
  terminals,
  command,
}: {
  initial: ShopSettings | null;
  organizationName: string;
  terminals: POSTerminal[];
  command: Command;
}) {
  const { t } = useLanguage();

  const [form, setForm] = useState<SettingsInput>(() => ({
    slug: initial?.slug ?? '',
    name: initial?.name ?? organizationName,
    description: initial?.description ?? '',
    contact_phone: initial?.contact_phone ?? '',
    pickup_instructions: initial?.pickup_instructions ?? '',
    delivery_enabled: initial?.delivery_enabled ?? false,
    shipping_fee: initial?.shipping_fee ?? '0.00',
    terminal_id: initial?.terminal_id ?? '',
    online_terminal_id: initial?.online_terminal_id ?? '',
    published: initial?.published ?? false,
    accepting_orders: initial?.accepting_orders ?? false,
    revision: initial?.revision ?? 0,
  }));
  const [saved, setSaved] = useState(false);
  const set = (key: keyof SettingsInput, value: string | boolean) =>
    setForm({ ...form, [key]: value });
  const frontTerminal = terminals.find(
    (terminal) => terminal.id === form.terminal_id,
  );
  const onlineTerminals = terminals.filter(
    (terminal) =>
      terminal.branch_id === frontTerminal?.branch_id &&
      terminal.stock_location_id !== frontTerminal?.stock_location_id,
  );
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSaved(false);
    command.mutate(
      { path: '/storefront', body: form, method: 'PUT' },
      {
        onSuccess: () => setSaved(true),
        onError: () => setSaved(false),
      },
    );
  };
  return (
    <Card>
      <form className="online-settings-form" onSubmit={submit}>
        <label>
          {t('storefront.storeDisplayName')}
          <input
            required
            maxLength={200}
            value={form.name}
            onChange={(event) => set('name', event.target.value)}
          />
        </label>
        <label>
          {t('storefront.urlNameSlug')}
          <input
            required
            pattern="[a-z][a-z0-9\-]{2,49}"
            minLength={3}
            maxLength={50}
            value={form.slug}
            onChange={(event) => set('slug', event.target.value)}
            placeholder="my-shop"
          />
          <small>/shop/{form.slug || 'my-shop'}</small>
        </label>
        <label>
          {t('storefront.terminalBranchStockSource')}
          <select
            required
            value={form.terminal_id}
            onChange={(event) =>
              setForm({
                ...form,
                terminal_id: event.target.value,
                online_terminal_id: '',
              })
            }
          >
            <option value="">
              {t('storefront.selectATerminalInTheCurrentBranch')}
            </option>
            {terminals.map((terminal) => (
              <option value={terminal.id} key={terminal.id}>
                {terminal.name} · {terminal.code}
              </option>
            ))}
          </select>
          <small>{t('storefront.inStoreStockSourceAndDefaultOnline')}</small>
        </label>
        <label>
          {t('storefront.backOfficeWarehouseTerminalForOnlineOrders')}
          <select
            value={form.online_terminal_id}
            disabled={!frontTerminal}
            onChange={(event) => set('online_terminal_id', event.target.value)}
          >
            <option value="">{t('storefront.useTheInStoreStockSource')}</option>
            {onlineTerminals.map((terminal) => (
              <option value={terminal.id} key={terminal.id}>
                {terminal.name} · {terminal.code}
              </option>
            ))}
          </select>
          <small>{t('storefront.selectATerminalLinkedToADifferent')}</small>
        </label>
        <label>
          {t('storefront.storePhone')}
          <input
            type="tel"
            maxLength={30}
            value={form.contact_phone}
            onChange={(event) => set('contact_phone', event.target.value)}
          />
        </label>
        <label className="online-wide">
          {t('storefront.aboutTheStore')}
          <input
            maxLength={1000}
            value={form.description}
            onChange={(event) => set('description', event.target.value)}
          />
        </label>
        <label className="online-wide">
          {t('storefront.pickupLocationHoursAndInstructions')}
          <input
            maxLength={1000}
            value={form.pickup_instructions}
            onChange={(event) => set('pickup_instructions', event.target.value)}
            placeholder={t('storefront.addressPickupPointAndContactHours')}
          />
        </label>
        <label className="shop-consent">
          <input
            type="checkbox"
            checked={form.delivery_enabled}
            onChange={(event) => set('delivery_enabled', event.target.checked)}
          />
          {t('storefront.enableDelivery')}
        </label>
        <label>
          {t('storefront.deliveryFee')}
          <input
            inputMode="decimal"
            pattern="(0|[1-9][0-9]{0,7})(\.[0-9]{1,2})?"
            value={form.shipping_fee}
            onChange={(event) => set('shipping_fee', event.target.value)}
            aria-describedby="storefront-delivery-fee-help"
          />
          <small id="storefront-delivery-fee-help">
            {t('storefront.deliveryFeeHelp')}
          </small>
        </label>
        <label className="shop-consent">
          <input
            type="checkbox"
            checked={form.published}
            onChange={(event) =>
              setForm({
                ...form,
                published: event.target.checked,
                accepting_orders: event.target.checked && form.accepting_orders,
              })
            }
          />
          {t('storefront.publishStorefront')}
        </label>
        <label className="shop-consent">
          <input
            type="checkbox"
            checked={form.accepting_orders}
            disabled={!form.published}
            onChange={(event) => set('accepting_orders', event.target.checked)}
          />
          {t('storefront.acceptOrders')}
        </label>
        <p className="online-wide">
          {t('storefront.ifOrdersArePendingPauseNewOrders')}
        </p>
        {!terminals.length && (
          <p role="status">
            {t('storefront.noActiveTerminalsInThisBranchConfigure')}
          </p>
        )}
        <Button type="submit" disabled={command.isPending || !terminals.length}>
          {command.isPending
            ? t('catalog.saving')
            : t('storefront.saveSettings')}
        </Button>
        {saved && <p role="status">{t('storefront.settingsSaved')}</p>}
      </form>
    </Card>
  );
}
export function OnlineOrdersPage() {
  const { t, localize, formatDateTime } = useLanguage();

  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const scope = useScope();
  const orders = useShopQuery<ShopPage<OnlineOrder>>(
    `/online-orders?branch_id=${scope.branch}&status=${status}&page=${page}`,
    !!scope.branch,
  );
  const items = useMemo(() => orders.data?.items ?? [], [orders.data?.items]);
  const totalOrders = orders.data?.total ?? 0;
  const pendingCount = useMemo(
    () =>
      items.filter((item) => ['PENDING', 'PREPARING'].includes(item.status))
        .length,
    [items],
  );
  const readyCount = useMemo(
    () => items.filter((item) => item.status === 'READY').length,
    [items],
  );
  const completedCount = useMemo(
    () => items.filter((item) => item.status === 'COMPLETED').length,
    [items],
  );

  return (
    <div className="catalog-page online-admin">
      <StandardPageHeader
        icon={<ShoppingBag size={24} />}
        eyebrow={t('storefront.storePickupPayThroughPos')}
        title={t('pos.onlineOrders')}
        description={t('storefront.storePickupPayThroughPos')}
        actions={
          <>
            <Button
              className="button-secondary sales-export-btn"
              onClick={() => void orders.refetch()}
            >
              <RefreshCw size={15} aria-hidden="true" />
              <span>{t('storefront.refreshList')}</span>
            </Button>
            {scope.tenant.can('storefront.manage') && (
              <Link
                className="button sales-new-sale-btn"
                to="/settings/storefront"
              >
                <Store size={15} aria-hidden="true" />
                <span>{t('storefront.storefrontSettings')}</span>
              </Link>
            )}
          </>
        }
      />

      <StandardKpiGrid label={t('pos.onlineOrders')}>
        <StandardKpiCard
          icon={<ShoppingBag size={20} />}
          tone="amber"
          label={t('pos.onlineOrders')}
          value={`${totalOrders} ${t('pos.itemsUnit')}`}
          sparkline
        />
        <StandardKpiCard
          icon={<Clock size={20} />}
          tone="amber"
          label={localize(orderStatusLabels.PENDING)}
          value={`${pendingCount} ${t('pos.itemsUnit')}`}
        />
        <StandardKpiCard
          icon={<Package size={20} />}
          tone="info"
          label={localize(orderStatusLabels.READY)}
          value={`${readyCount} ${t('pos.itemsUnit')}`}
        />
        <StandardKpiCard
          icon={<CheckCircle2 size={20} />}
          tone="success"
          label={localize(orderStatusLabels.COMPLETED)}
          value={`${completedCount} ${t('pos.itemsUnit')}`}
          trendUp
        />
      </StandardKpiGrid>

      <StandardFilterCard
        onReset={() => {
          setStatus('');
          setPage(1);
        }}
        onSearch={() => void orders.refetch()}
      >
        <label className="sales-filter-field">
          <span>{t('catalog.filterStatus')}</span>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">{t('purchasing.allStatuses')}</option>
            {Object.entries(orderStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </StandardFilterCard>

      {!scope.branch && (
        <p role="status">{t('storefront.selectABranchToViewOrders')}</p>
      )}

      <Card className="sales-table-card">
        <StandardStatusTabs
          ariaLabel={t('catalog.filterStatus')}
          value={status}
          onChange={(next) => {
            setStatus(next);
            setPage(1);
          }}
          tabs={[
            {
              key: '',
              label: t('purchasing.allStatuses'),
              count: status === '' ? totalOrders : items.length,
              icon: <ClipboardList size={15} aria-hidden="true" />,
            },
            ...Object.entries(orderStatusLabels).map(([value, label]) => ({
              key: value,
              label: localize(label),
              count: items.filter((item) => item.status === value).length,
            })),
          ]}
        />
        {orders.isFetching && (
          <Loading>{t('storefront.loadingOrders')}</Loading>
        )}
        {orders.error && (
          <ShopError error={orders.error} retry={() => void orders.refetch()} />
        )}
        {orders.data?.total === 0 && (
          <div className="sales-empty-message">
            <h2>{t('storefront.noOrdersListedYet')}</h2>
            <p>{t('storefront.actualStorefrontOrdersAppearHereNoSimulated')}</p>
          </div>
        )}
        <div className="online-listings">
          {orders.data?.items.map((order) => (
            <Card className="online-listing" key={order.id}>
              <div className="sales-number-cell">
                <span className="sales-doc-icon" aria-hidden="true">
                  <ShoppingBag size={18} />
                </span>
                <div>
                  <h2>
                    <Link to={`/orders/${order.id}`}>{order.number}</Link>
                  </h2>
                  <p>
                    {order.customer_name} · {order.contact_phone}
                  </p>
                  <small>{formatDateTime(order.created_at)}</small>
                </div>
              </div>
              <Tag tone={order.status === 'COMPLETED' ? 'success' : 'amber'}>
                {localize(orderStatusLabels[order.status])}
              </Tag>
              <div>
                <strong>
                  ฿{moneyText(order.final_total ?? order.estimated_total)}
                </strong>
                <p>
                  {order.payment_status === 'UNPAID'
                    ? t('storefront.unpaid')
                    : t('storefront.paidInStore')}
                </p>
              </div>
              <Link
                to={`/orders/${order.id}`}
                className="button button-secondary sales-detail-link"
              >
                <Eye size={15} aria-hidden="true" />
                <span>{t('pos.viewDetails')}</span>
              </Link>
            </Card>
          ))}
        </div>
        {orders.data && (
          <ShopPagination
            page={page}
            total={orders.data.total}
            pageSize={orders.data.page_size}
            change={setPage}
          />
        )}
      </Card>
    </div>
  );
}
export function OnlineOrderPage() {
  const { t } = useLanguage();

  const { orderId = '' } = useParams();
  const scope = useScope();
  const order = useShopQuery<
    OnlineOrder & { fulfillment?: 'PICKUP' | 'DELIVERY' }
  >(`/online-orders/${orderId}`, !!orderId);
  const command = useCommand();
  return (
    <div className="catalog-page online-admin">
      <StandardPageHeader
        icon={<ShoppingBag size={24} />}
        title={t('storefront.onlineOrderDetails')}
        actions={
          <Link
            className="button button-secondary sales-export-btn"
            to="/orders"
          >
            <ArrowLeft size={15} aria-hidden="true" />
            <span>{t('storefront.backToOrders')}</span>
          </Link>
        }
      />
      {order.isPending && <Loading>{t('storefront.loadingOrders')}</Loading>}
      {order.error && (
        <ShopError error={order.error} retry={() => void order.refetch()} />
      )}
      {command.error && <ShopError error={command.error} />}
      {order.data && (
        <Card>
          <OrderDetails order={order.data} staff />
          {scope.tenant.can('online_orders.manage') && (
            <OrderActions
              key={`${order.data.id}:${order.data.revision}`}
              order={order.data}
              command={command}
            />
          )}
          {order.data.sale_id && (
            <Link to={`/sales/${order.data.sale_id}`}>
              {t('storefront.viewSaleAndReceipt')}
            </Link>
          )}
        </Card>
      )}
    </div>
  );
}
function OrderActions({
  order,
  command,
}: {
  order: OnlineOrder & { fulfillment?: 'PICKUP' | 'DELIVERY' };
  command: Command;
}) {
  const { t, language } = useLanguage();

  const [message, setMessage] = useState('');
  const scope = useScope();
  const transitions: { status: OrderStatus; label: string }[] =
    order.status === 'PENDING'
      ? [
          { status: 'PREPARING', label: t('storefront.startPreparing') },
          { status: 'REJECTED', label: t('storefront.rejectOrder') },
          { status: 'CANCELLED', label: t('storefront.cancelOrder') },
        ]
      : order.status === 'PREPARING'
        ? [
            { status: 'READY', label: t('storefront.markReadyForPickup') },
            { status: 'REJECTED', label: t('storefront.rejectOrder') },
            { status: 'CANCELLED', label: t('storefront.cancelOrder') },
          ]
        : order.status === 'READY'
          ? [{ status: 'CANCELLED', label: t('storefront.cancelOrder') }]
          : [];
  return (
    <section
      className="online-order-actions"
      aria-label={t('storefront.manageOrders')}
    >
      {!!transitions.length && !order.cart_id && (
        <>
          <label>
            {t('storefront.messageToCustomerVisibleToCustomer')}
            <input
              maxLength={1000}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={t(
                'storefront.provideAReasonBeforeRejectingOrCancelling',
              )}
            />
          </label>
          <div className="shop-actions">
            {transitions.map((action) => (
              <Button
                key={action.status}
                className={
                  action.status === 'PREPARING' || action.status === 'READY'
                    ? ''
                    : 'button-secondary'
                }
                disabled={
                  command.isPending ||
                  (['PREPARING', 'READY'].includes(action.status) &&
                    order.payment_status !== 'PAID_AT_STORE') ||
                  (['REJECTED', 'CANCELLED'].includes(action.status) &&
                    !message.trim())
                }
                onClick={() =>
                  command.mutate({
                    path: `/online-orders/${order.id}/status`,
                    body: {
                      status: action.status,
                      message,
                      revision: order.revision,
                    },
                  })
                }
              >
                {action.label}
              </Button>
            ))}
          </div>
        </>
      )}
      {order.status === 'READY' &&
        order.payment_status === 'PAID_AT_STORE' &&
        order.fulfillment === 'PICKUP' &&
        !order.cart_id &&
        scope.tenant.can('online_orders.manage') &&
        scope.tenant.can('pos.cart.manage') &&
        scope.tenant.can('pos.checkout') && (
          <Button
            disabled={command.isPending}
            onClick={() =>
              command.mutate({
                path: `/online-orders/${order.id}/settle-prepaid`,
                body: { revision: order.revision },
              })
            }
          >
            {language === 'th' ? 'ส่งมอบและปิดยอด' : 'Hand over and settle'}
          </Button>
        )}
      {order.status === 'READY' &&
        order.payment_status === 'UNPAID' &&
        order.fulfillment === 'PICKUP' &&
        scope.tenant.can('pos.checkout') && (
          <>
            <Link className="button" to={`/pos?online_order=${order.id}`}>
              {order.cart_id
                ? t('storefront.returnToThisOrderSPosCart')
                : t('storefront.customerPickupOpenInPos')}
            </Link>
            <p>{t('storefront.staffMustOpenAShiftAtThe')}</p>
            {order.cart_id && (
              <p className="notice">
                {t('storefront.thisOrderIsAlreadyInPosTo')}
              </p>
            )}
          </>
        )}
    </section>
  );
}
