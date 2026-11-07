import { CookingPot } from 'lucide-react';
import { Button, Card } from '../../components/ui/primitives';
import { StandardPageHeader } from '../../components/ui/StandardPage';
import { WorkspaceLink } from '../../app/WorkspaceNavigation';
import { Table } from '../inventory/InventoryUI';
import { QueryState } from './RestaurantUI';
import {
  useRestaurantCommand,
  useRestaurantQuery,
  useRestaurantScope,
} from './restaurant-hooks';
import { RecipesScreen } from './RecipesScreen';
import { QuickStockScreen, TablesScreen } from './StockAndTables';
import { SettingsPage } from '../organization/SettingsPage';
import './restaurant.css';

export interface RestaurantSettings {
  branch_id: string;
  closing_time: string;
  timezone: string;
  revision: number;
  period: { start: string; end: string };
}
export type RestaurantView =
  'settings' | 'recipes' | 'tables' | 'queue' | 'forecast' | 'quick-stock';
const titles: Record<RestaurantView, string> = {
  settings: 'ตั้งค่ารอบวันร้านอาหาร',
  recipes: 'สูตรอาหารต่อหนึ่งจาน',
  tables: 'โต๊ะอาหาร',
  queue: 'หน้าจอคิวอาหาร',
  forecast: 'พยากรณ์วัตถุดิบ',
  'quick-stock': 'เพิ่มและตรวจนับวัตถุดิบ',
};
const permissions: Record<RestaurantView, string> = {
  settings: 'storefront.manage',
  recipes: 'catalog.read',
  tables: 'online_orders.manage',
  queue: 'online_orders.read',
  forecast: 'sales.read',
  'quick-stock': 'inventory.read',
};

export function RestaurantPage({ view }: { view: RestaurantView }) {
  const scope = useRestaurantScope();
  const key = JSON.stringify([
    scope.user,
    scope.org,
    scope.branch,
    view,
    scope.can(permissions[view]),
  ]);
  return (
    <div className="restaurant-page">
      {view !== 'settings' && (
        <StandardPageHeader
          icon={<CookingPot size={22} />}
          title={titles[view]}
        />
      )}
      {!scope.branch ? (
        <p role="status">เลือกสาขาก่อนจัดการร้านอาหาร</p>
      ) : !scope.can(permissions[view]) ? (
        <p role="alert">คุณไม่มีสิทธิ์ใช้งานหน้านี้</p>
      ) : (
        <RestaurantContent key={key} view={view} />
      )}
    </div>
  );
}
function RestaurantContent({ view }: { view: RestaurantView }) {
  if (view === 'settings') return <SettingsScreen />;
  if (view === 'recipes') return <RecipesScreen />;
  if (view === 'quick-stock') return <QuickStockScreen />;
  if (view === 'tables') return <TablesScreen />;
  if (view === 'queue') return <QueueScreen />;
  return <ForecastScreen />;
}
function SettingsScreen() {
  const scope = useRestaurantScope();
  const query = useRestaurantQuery<RestaurantSettings>(
    `/restaurant/settings?branch_id=${scope.branch}`,
    'storefront.manage',
  );
  const command = useRestaurantCommand<RestaurantSettings>(
    '/restaurant/settings',
    'PATCH',
  );
  return (
    <>
      <QueryState query={query} />
      {query.data && !query.error ? (
        <SettingsPage
          key={query.data.revision}
          initialSettings={query.data}
          branchId={scope.branch}
          onSaveHours={(closing) => {
            command.run({
              branch_id: query.data!.branch_id,
              closing_time: closing,
              timezone: query.data!.timezone,
              revision: query.data!.revision,
            });
          }}
        />
      ) : null}
    </>
  );
}

interface QueueItem {
  order_id: string;
  queue_number: string;
  channel: string;
  table_code?: string;
  status: string;
  created_at: string;
}
function QueueScreen() {
  const scope = useRestaurantScope();
  const query = useRestaurantQuery<QueueItem[]>(
    `/restaurant/queue?branch_id=${scope.branch}`,
    'online_orders.read',
    true,
  );
  return (
    <Card className="catalog-panel">
      <p>
        ออเดอร์ที่ยืนยันชำระแล้วในรอบเวลาปิดร้าน อัปเดตทุก 15 วินาที
        เลขลำดับอาจเปลี่ยนเมื่อออเดอร์ออกจากคิว หน้านี้ยังต้องเข้าสู่ระบบ
      </p>
      <Button
        onClick={() => {
          void query.refetch();
        }}
        disabled={query.isFetching}
      >
        อัปเดตคิว
      </Button>
      <QueryState query={query} />
      {query.data && !query.error ? (
        query.data.length === 0 ? (
          <p role="status">ยังไม่มีออเดอร์ที่ชำระแล้วรอทำอาหาร</p>
        ) : (
          <Table headers={['คิว', 'ช่องทาง', 'สถานะ']}>
            {query.data.map((item) => (
              <tr key={item.order_id}>
                <th scope="row">{item.queue_number}</th>
                <td>
                  {item.channel === 'DINE_IN'
                    ? `ทานที่ร้าน${item.table_code ? ` · โต๊ะ ${item.table_code}` : ''}`
                    : item.channel === 'DELIVERY'
                      ? 'จัดส่ง'
                      : 'รับที่ร้าน'}
                </td>
                <td>
                  {(
                    {
                      PENDING: 'รอทำ',
                      PREPARING: 'กำลังทำ',
                      READY: 'พร้อมรับ',
                    } as Record<string, string>
                  )[item.status] ?? item.status}
                </td>
              </tr>
            ))}
          </Table>
        )
      ) : null}
      <WorkspaceLink to="/online-orders">
        จัดการออเดอร์และสถานะอาหาร
      </WorkspaceLink>
    </Card>
  );
}
function ForecastScreen() {
  const scope = useRestaurantScope();
  const query = useRestaurantQuery<{
    status: string;
    reason: string;
    items: unknown[];
  }>(`/restaurant/forecast?branch_id=${scope.branch}`, 'sales.read');
  return (
    <Card className="catalog-panel">
      <QueryState query={query} />
      {query.data && !query.error ? (
        <>
          <h2>ยังไม่มีระบบพยากรณ์ที่พร้อมใช้งาน</h2>
          <p>
            ต้องเชื่อมยอดขายจริง สูตรอาหาร และรอบเวลาปิดร้านก่อน
            ระบบยังไม่แสดงตัวเลขคาดการณ์ และไม่เพิ่มหรือตัดสต็อกอัตโนมัติ
          </p>
          <WorkspaceLink to="/restaurant/recipes">
            จัดเตรียมสูตรอาหาร
          </WorkspaceLink>
        </>
      ) : null}
    </Card>
  );
}
