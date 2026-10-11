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
> & { terminal_id: string };

export function StorefrontSettingsPage() {
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
          <p className="eyebrow">รับออเดอร์ออนไลน์</p>
          <h1>ตั้งค่าหน้าร้านออนไลน์</h1>
        </div>
        <Link to="/settings/storefront/payments">ทดสอบ Stripe sandbox</Link>
        <Link to="/online-orders">จัดการออเดอร์</Link>
      </div>
      <p className="notice">
        เผยแพร่เฉพาะสินค้าที่เลือก รับสินค้าที่ร้านและชำระผ่าน POS ไม่กันสต็อก
        ไม่รับโอน/จัดส่งออนไลน์ ออเดอร์ที่ยังไม่เข้า POS หมดอายุใน 48 ชั่วโมง
      </p>
      {settings.isPending || terminals.isPending ? (
        <Loading>กำลังโหลดการตั้งค่า…</Loading>
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
            <h2>สินค้าที่เผยแพร่</h2>
            <a
              href={`/shop/${settings.data.slug}`}
              target="_blank"
              rel="noreferrer"
            >
              ดูตัวอย่างหน้าร้าน
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
            <label htmlFor="listing-search">ค้นหาสินค้าเพื่อเผยแพร่</label>
            <div className="shop-actions">
              <input
                id="listing-search"
                maxLength={100}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
              <Button type="submit">ค้นหา</Button>
            </div>
          </form>
          {listings.isPending && <Loading>กำลังโหลดสินค้า…</Loading>}
          {listings.error && (
            <ShopError
              error={listings.error}
              retry={() => void listings.refetch()}
            />
          )}
          {listings.data?.total === 0 && (
            <p>ยังไม่มีสินค้าในรายการนี้ เพิ่มสินค้าในระบบ Catalog ก่อน</p>
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
                    ฿{moneyText(item.unit_price)} / {item.unit} · สต็อก{' '}
                    {item.available}
                  </small>
                </div>
                <Tag tone={item.published ? 'success' : 'neutral'}>
                  {item.published ? 'เผยแพร่แล้ว' : 'ยังไม่เผยแพร่'}
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
                  {item.published ? 'หยุดเผยแพร่' : 'เผยแพร่สินค้า'}
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
  const [form, setForm] = useState<SettingsInput>(() => ({
    slug: initial?.slug ?? '',
    name: initial?.name ?? organizationName,
    description: initial?.description ?? '',
    contact_phone: initial?.contact_phone ?? '',
    pickup_instructions: initial?.pickup_instructions ?? '',
    terminal_id: initial?.terminal_id ?? '',
    published: initial?.published ?? false,
    accepting_orders: initial?.accepting_orders ?? false,
    revision: initial?.revision ?? 0,
  }));
  const set = (key: keyof SettingsInput, value: string | boolean) =>
    setForm({ ...form, [key]: value });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    command.mutate({ path: '/storefront', body: form, method: 'PUT' });
  };
  return (
    <Card>
      <form className="online-settings-form" onSubmit={submit}>
        <label>
          ชื่อร้านที่แสดง
          <input
            required
            maxLength={200}
            value={form.name}
            onChange={(event) => set('name', event.target.value)}
          />
        </label>
        <label>
          ชื่อใน URL (slug)
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
          เครื่องขาย / สาขา / แหล่งสต็อก
          <select
            required
            value={form.terminal_id}
            onChange={(event) => set('terminal_id', event.target.value)}
          >
            <option value="">เลือกเครื่องขายของสาขาปัจจุบัน</option>
            {terminals.map((terminal) => (
              <option value={terminal.id} key={terminal.id}>
                {terminal.name} · {terminal.code}
              </option>
            ))}
          </select>
          <small>
            ใช้สาขาและจุดสต็อกของเครื่องขายนี้ ไม่มีการรวมสต็อกข้ามสาขา
          </small>
        </label>
        <label>
          เบอร์ติดต่อร้าน
          <input
            type="tel"
            maxLength={30}
            value={form.contact_phone}
            onChange={(event) => set('contact_phone', event.target.value)}
          />
        </label>
        <label className="online-wide">
          แนะนำร้าน
          <input
            maxLength={1000}
            value={form.description}
            onChange={(event) => set('description', event.target.value)}
          />
        </label>
        <label className="online-wide">
          สถานที่ เวลา และวิธีรับสินค้า
          <input
            maxLength={1000}
            value={form.pickup_instructions}
            onChange={(event) => set('pickup_instructions', event.target.value)}
            placeholder="ที่อยู่ จุดรับสินค้า และเวลาที่ติดต่อร้านได้"
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
          เผยแพร่หน้าร้าน
        </label>
        <label className="shop-consent">
          <input
            type="checkbox"
            checked={form.accepting_orders}
            disabled={!form.published}
            onChange={(event) => set('accepting_orders', event.target.checked)}
          />
          เปิดรับออเดอร์
        </label>
        <p className="online-wide">
          หากมีออเดอร์ค้างอยู่ ให้ปิดรับออเดอร์ชั่วคราวแทนการซ่อนร้านหรือเปลี่ยน
          URL/เครื่องขาย เพื่อให้ลูกค้าติดตามต่อได้
        </p>
        {!terminals.length && (
          <p role="status">
            ยังไม่มีเครื่องขายที่ใช้งานได้ในสาขานี้ กรุณาตั้งค่า POS ก่อน
          </p>
        )}
        <Button type="submit" disabled={command.isPending || !terminals.length}>
          {command.isPending ? 'กำลังบันทึก…' : 'บันทึกการตั้งค่า'}
        </Button>
      </form>
    </Card>
  );
}
export function OnlineOrdersPage() {
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
          <p className="eyebrow">รับที่ร้าน · ชำระผ่าน POS</p>
          <h1>ออเดอร์ออนไลน์</h1>
        </div>
        {scope.tenant.can('storefront.manage') && (
          <Link to="/settings/storefront">ตั้งค่าหน้าร้าน</Link>
        )}
      </div>
      <div className="shop-actions">
        <label>
          กรองสถานะ
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">ทุกสถานะ</option>
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
          อัปเดตรายการ
        </Button>
      </div>
      {!scope.branch && <p role="status">เลือกสาขาก่อนดูออเดอร์</p>}
      {orders.isFetching && <Loading>กำลังโหลดออเดอร์…</Loading>}
      {orders.error && (
        <ShopError error={orders.error} retry={() => void orders.refetch()} />
      )}
      {orders.data?.total === 0 && (
        <Card>
          <h2>ยังไม่มีออเดอร์ในรายการนี้</h2>
          <p>ออเดอร์จริงจากหน้าร้านจะแสดงที่นี่ ไม่มีข้อมูลจำลอง</p>
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
              <small>
                {new Date(order.created_at).toLocaleString('th-TH')}
              </small>
            </div>
            <Tag tone={order.status === 'COMPLETED' ? 'success' : 'amber'}>
              {orderStatusLabels[order.status]}
            </Tag>
            <div>
              <strong>
                ฿{moneyText(order.final_total ?? order.estimated_total)}
              </strong>
              <p>
                {order.payment_status === 'UNPAID'
                  ? 'ยังไม่ชำระเงิน'
                  : 'ชำระที่ร้านแล้ว'}
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
        <h1>รายละเอียดออเดอร์ออนไลน์</h1>
        <Link to="/online-orders">กลับรายการออเดอร์</Link>
      </div>
      {order.isPending && <Loading>กำลังโหลดออเดอร์…</Loading>}
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
              ดูรายการขายและใบเสร็จ
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
  const [message, setMessage] = useState('');
  const scope = useScope();
  const transitions: { status: OrderStatus; label: string }[] =
    order.status === 'PENDING'
      ? [
          { status: 'PREPARING', label: 'เริ่มเตรียมสินค้า' },
          { status: 'REJECTED', label: 'ปฏิเสธออเดอร์' },
          { status: 'CANCELLED', label: 'ยกเลิกออเดอร์' },
        ]
      : order.status === 'PREPARING'
        ? [
            { status: 'READY', label: 'แจ้งพร้อมรับสินค้า' },
            { status: 'REJECTED', label: 'ปฏิเสธออเดอร์' },
            { status: 'CANCELLED', label: 'ยกเลิกออเดอร์' },
          ]
        : order.status === 'READY'
          ? [{ status: 'CANCELLED', label: 'ยกเลิกออเดอร์' }]
          : [];
  return (
    <section className="online-order-actions" aria-label="จัดการออเดอร์">
      {!!transitions.length && !order.cart_id && (
        <>
          <label>
            ข้อความถึงลูกค้า (ลูกค้ามองเห็น)
            <input
              maxLength={1000}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder="ระบุเหตุผลก่อนปฏิเสธหรือยกเลิก"
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
              ? 'กลับไปยังตะกร้า POS ของออเดอร์'
              : 'ลูกค้ามารับ · เปิดเข้า POS'}
          </Link>
          <p>
            พนักงานต้องเปิดกะในเครื่องขายที่กำหนด ตรวจ lot/สต็อก
            และยืนยันยอดกับลูกค้าก่อนรับชำระ
            ออเดอร์สำเร็จเมื่อบันทึกขายสำเร็จเท่านั้น
          </p>
          {order.cart_id && (
            <p className="notice">
              ออเดอร์อยู่ใน POS แล้ว หากต้องยกเลิก
              ต้องจัดการการชำระที่ค้างและยกเลิกตะกร้าโดยเจ้าของตะกร้าก่อน
            </p>
          )}
        </>
      )}
    </section>
  );
}
