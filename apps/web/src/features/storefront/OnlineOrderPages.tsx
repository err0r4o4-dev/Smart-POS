import { useLanguage } from '../../app/language';
import { useState, type FormEvent } from 'react';
import { useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { WorkspaceLink as Link } from '../../app/WorkspaceNavigation';
import { useAuth } from '../../app/AuthProvider';
import { useOrganization } from '../../app/OrganizationProvider';
import { Button, Card, Loading, Tag } from '../../components/ui/primitives';
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
      <div className="shop-heading">
        <div>
          <p className="eyebrow">{t('storefront.receiveOnlineOrders')}</p>
          <h1>{t('storefront.onlineStorefrontSettings')}</h1>
        </div>
        <Link to="/settings/storefront/payments">
          {t('storefront.testStripeSandbox')}
        </Link>
        <Link to="/online-orders">{t('storefront.manageOrders')}</Link>
      </div>
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
          <div className="shop-heading">
            <h2>{t('storefront.publishedProducts')}</h2>
            <a
              href={`/shop/${settings.data.slug}`}
              target="_blank"
              rel="noreferrer"
            >
              {t('storefront.previewStorefront')}
            </a>
          </div>
          <form
            className="shop-search"
            onSubmit={(event) => {
              event.preventDefault();
              setSubmitted(search.trim());
              setPage(1);
            }}
          >
            <label htmlFor="listing-search">
              {t('storefront.findProductsToPublish')}
            </label>
            <div className="shop-actions">
              <input
                id="listing-search"
                maxLength={100}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <Button type="submit">{t('customers.search')}</Button>
            </div>
          </form>
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
            <p>{t('storefront.noProductsListedAddProductsToThe')}</p>
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
                    {t('storefront.stock')} {item.available}
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
    terminal_id: initial?.terminal_id ?? '',
    online_terminal_id: initial?.online_terminal_id ?? '',
    published: initial?.published ?? false,
    accepting_orders: initial?.accepting_orders ?? false,
    revision: initial?.revision ?? 0,
  }));
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
    command.mutate({ path: '/storefront', body: form, method: 'PUT' });
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
  return (
    <div className="catalog-page online-admin">
      <div className="shop-heading">
        <div>
          <p className="eyebrow">{t('storefront.storePickupPayThroughPos')}</p>
          <h1>{t('pos.onlineOrders')}</h1>
        </div>
        {scope.tenant.can('storefront.manage') && (
          <Link to="/settings/storefront">
            {t('storefront.storefrontSettings')}
          </Link>
        )}
      </div>
      <div className="shop-actions">
        <label>
          {t('catalog.filterStatus')}
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
        <Button
          className="button-secondary"
          onClick={() => void orders.refetch()}
        >
          {t('storefront.refreshList')}
        </Button>
      </div>
      {!scope.branch && (
        <p role="status">{t('storefront.selectABranchToViewOrders')}</p>
      )}
      {orders.isFetching && <Loading>{t('storefront.loadingOrders')}</Loading>}
      {orders.error && (
        <ShopError error={orders.error} retry={() => void orders.refetch()} />
      )}
      {orders.data?.total === 0 && (
        <Card>
          <h2>{t('storefront.noOrdersListedYet')}</h2>
          <p>{t('storefront.actualStorefrontOrdersAppearHereNoSimulated')}</p>
        </Card>
      )}
      <div className="online-listings">
        {orders.data?.items.map((order) => (
          <Card className="online-listing" key={order.id}>
            <div>
              <h2>
                <Link to={`/online-orders/${order.id}`}>{order.number}</Link>
              </h2>
              <p>
                {order.customer_name} · {order.contact_phone}
              </p>
              <small>{formatDateTime(order.created_at)}</small>
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
    </div>
  );
}
export function OnlineOrderPage() {
  const { t } = useLanguage();

  const { orderId = '' } = useParams();
  const scope = useScope();
  const order = useShopQuery<OnlineOrder>(
    `/online-orders/${orderId}`,
    !!orderId,
  );
  const command = useCommand();
  return (
    <div className="catalog-page online-admin">
      <div className="shop-heading">
        <h1>{t('storefront.onlineOrderDetails')}</h1>
        <Link to="/online-orders">{t('storefront.backToOrders')}</Link>
      </div>
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
  order: OnlineOrder;
  command: Command;
}) {
  const { t } = useLanguage();

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
      {order.status === 'READY' && scope.tenant.can('pos.checkout') && (
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
