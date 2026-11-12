import { useLanguage } from '../../app/language';
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
import { TablesScreen } from './StockAndTables';
import { SettingsPage } from '../organization/SettingsPage';
import { useState } from 'react';
import { QueueBoard } from './QueueBoard';
import './restaurant.css';

export interface RestaurantSettings {
  branch_id: string;
  closing_time: string;
  timezone: string;
  revision: number;
  period: { start: string; end: string };
}
export type RestaurantView = 'settings' | 'tables' | 'queue';
const permissions: Record<RestaurantView, string> = {
  settings: 'storefront.manage',
  tables: 'online_orders.manage',
  queue: 'online_orders.read',
};

export function RestaurantPage({ view }: { view: RestaurantView }) {
  const { t } = useLanguage();
  const scope = useRestaurantScope();
  const titles = {
    settings: t('restaurant.settingsTitle'),
    tables: t('restaurant.tablesTitle'),
    queue: t('restaurant.queueTitle'),
  };
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
        <p role="status">{t('restaurant.selectBranch')}</p>
      ) : !scope.can(permissions[view]) ? (
        <p role="alert">{t('restaurant.noPermission')}</p>
      ) : (
        <RestaurantContent key={key} view={view} />
      )}
    </div>
  );
}
function RestaurantContent({ view }: { view: RestaurantView }) {
  if (view === 'settings') return <SettingsScreen />;
  if (view === 'tables') return <TablesScreen />;
  return <QueueScreen />;
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
export interface QueueItem {
  order_id: string;
  queue_number: string;
  channel: string;
  table_code?: string;
  status: string;
  created_at: string;
}
function QueueScreen() {
  const { t } = useLanguage();
  const scope = useRestaurantScope();
  const query = useRestaurantQuery<QueueItem[]>(
    `/restaurant/queue?branch_id=${scope.branch}`,
    'online_orders.read',
    true,
  );
  const [viewMode, setViewMode] = useState<'board' | 'list'>('board');
  return (
    <div className="queue-screen-wrapper">
      <div className="catalog-actions" style={{ marginBottom: 16 }}>
        <Button
          className={viewMode === 'board' ? 'button' : 'button-secondary'}
          onClick={() => setViewMode('board')}
        >
          🖥️ หน้าจอคิวรับอาหาร (Queue Board TV)
        </Button>
        <Button
          className={viewMode === 'list' ? 'button' : 'button-secondary'}
          onClick={() => setViewMode('list')}
        >
          📋 รายการคิวแบบละเอียด (Staff List)
        </Button>
      </div>

      <QueryState query={query} />

      {query.data && !query.error && viewMode === 'board' && (
        <QueueBoard
          items={query.data}
          storeName="VELO Shop"
          onRefresh={() => void query.refetch()}
          isFetching={query.isFetching}
        />
      )}

      <Card
        className="catalog-panel"
        style={{ display: viewMode === 'list' ? 'block' : 'none' }}
      >
        <p>{t('restaurant.queueDescription')}</p>
        <Button
          onClick={() => {
            void query.refetch();
          }}
          disabled={query.isFetching}
        >
          {t('restaurant.refreshQueue')}
        </Button>
        <QueryState query={query} />
        {query.data && !query.error ? (
          query.data.length === 0 ? (
            <p role="status">{t('restaurant.queueEmpty')}</p>
          ) : (
            <Table
              headers={[
                t('restaurant.queue'),
                t('restaurant.channel'),
                t('restaurant.status'),
              ]}
            >
              {query.data.map((item) => (
                <tr key={item.order_id}>
                  <th scope="row">{item.queue_number}</th>
                  <td>
                    {item.channel === 'DINE_IN'
                      ? item.table_code
                        ? t('restaurant.dineInTable', { code: item.table_code })
                        : t('restaurant.dineIn')
                      : item.channel === 'DELIVERY'
                        ? t('restaurant.delivery')
                        : t('restaurant.pickup')}
                  </td>
                  <td>
                    {(
                      {
                        PENDING: t('restaurant.pending'),
                        PREPARING: t('restaurant.preparing'),
                        READY: t('restaurant.ready'),
                      } as Record<string, string>
                    )[item.status] ?? item.status}
                  </td>
                </tr>
              ))}
            </Table>
          )
        ) : null}
        <WorkspaceLink to="/orders">
          {t('restaurant.manageOrders')}
        </WorkspaceLink>
      </Card>
    </div>
  );
}
