import { useLanguage } from '../../app/language';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card } from '../../components/ui/primitives';
import type { ShopSettings } from '../../lib/storefront-api';
import { Field, Table } from '../inventory/InventoryUI';
import { CommandState, QueryState } from './RestaurantUI';
import {
  useRestaurantCommand,
  useRestaurantQuery,
  useRestaurantScope,
} from './restaurant-hooks';

interface DiningTable {
  id: string;
  branch_id: string;
  code: string;
  name: string;
  seats: number;
  status: string;
  revision: number;
  qr_token?: string;
}
export function TablesScreen() {
  const { t } = useLanguage();
  const scope = useRestaurantScope();
  const query = useRestaurantQuery<DiningTable[]>(
    `/restaurant/tables?branch_id=${scope.branch}`,
    'online_orders.manage',
  );
  const [editing, setEditing] = useState<DiningTable | null>(null);
  return (
    <>
      <Card className="catalog-panel">
        <h2>{t('restaurant.tableHeading')}</h2>
        <p>{t('restaurant.tableDescription')}</p>
        <QueryState query={query} />
        {query.data && !query.error ? (
          query.data.length === 0 ? (
            <p role="status">{t('restaurant.noTables')}</p>
          ) : (
            <Table
              headers={[
                t('restaurant.table'),
                t('restaurant.name'),
                t('restaurant.seats'),
                t('restaurant.status'),
                t('restaurant.actions'),
              ]}
            >
              {query.data.map((table) => (
                <tr key={table.id}>
                  <th scope="row">{table.code}</th>
                  <td>{table.name}</td>
                  <td>{table.seats}</td>
                  <td>
                    {table.status === 'ACTIVE'
                      ? t('restaurant.active')
                      : t('restaurant.inactive')}
                  </td>
                  <td>
                    <Button onClick={() => setEditing(table)}>
                      {t('restaurant.editCode', { code: table.code })}
                    </Button>
                  </td>
                </tr>
              ))}
            </Table>
          )
        ) : null}
      </Card>
      <TableForm
        key={editing?.id ?? 'new'}
        table={editing}
        done={() => setEditing(null)}
      />
    </>
  );
}
function TableForm({
  table,
  done,
}: {
  table: DiningTable | null;
  done: () => void;
}) {
  const { t } = useLanguage();
  const scope = useRestaurantScope();
  const [code, setCode] = useState(table?.code ?? '');
  const [name, setName] = useState(table?.name ?? '');
  const [seats, setSeats] = useState(table?.seats ?? 2);
  const [status, setStatus] = useState(table?.status ?? 'ACTIVE');
  const command = useRestaurantCommand<DiningTable>(
    `/restaurant/tables${table ? '/' + table.id : ''}`,
    table ? 'PUT' : 'POST',
    () => {
      if (table) done();
      else {
        setCode('');
        setName('');
      }
    },
  );
  return (
    <Card className="catalog-panel">
      <h2>{table ? t('restaurant.editTable') : t('restaurant.addTable')}</h2>
      <form
        className="restaurant-form"
        onSubmit={(event) => {
          event.preventDefault();
          command.run({
            branch_id: scope.branch,
            code,
            name,
            seats,
            status,
            revision: table?.revision ?? 0,
          });
        }}
      >
        <fieldset disabled={command.locked}>
          <Field label={t('restaurant.tableCode')}>
            <input
              required
              pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,39}"
              maxLength={40}
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </Field>
          <Field label={t('restaurant.tableName')}>
            <input
              required
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label={t('restaurant.seatCount')}>
            <input
              required
              type="number"
              min={1}
              max={100}
              step={1}
              value={seats}
              onChange={(event) => setSeats(Number(event.target.value))}
            />
          </Field>
          <Field label={t('restaurant.tableStatus')}>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="ACTIVE">{t('restaurant.active')}</option>
              <option value="INACTIVE">{t('restaurant.inactive')}</option>
            </select>
          </Field>
        </fieldset>
        <CommandState command={command} />
        <div className="catalog-actions">
          <Button type="submit" disabled={command.isPending}>
            {t('restaurant.saveTable')}
          </Button>
          {table ? (
            <Button disabled={command.locked} onClick={done}>
              {t('restaurant.cancelEdit')}
            </Button>
          ) : null}
        </div>
      </form>
      {command.data?.qr_token ? <TableOrderLink table={command.data} /> : null}
    </Card>
  );
}

function TableOrderLink({ table }: { table: DiningTable }) {
  const { t } = useLanguage();
  const scope = useRestaurantScope();
  const permitted = scope.can('storefront.manage');
  const shop = useRestaurantQuery<ShopSettings | null>(
    '/storefront',
    'storefront.manage',
  );
  if (!permitted) return <p role="status">{t('restaurant.linkPermission')}</p>;
  if (shop.isPending || shop.error) return <QueryState query={shop} />;
  if (!shop.data) return <p role="status">{t('restaurant.setupStorefront')}</p>;
  if (
    table.branch_id !== scope.branch ||
    shop.data?.branch_id !== table.branch_id
  ) {
    return <p role="status">{t('restaurant.wrongBranch')}</p>;
  }
  if (!shop.data.published || !shop.data.slug)
    return <p role="status">{t('restaurant.publishStorefront')}</p>;
  if (table.status !== 'ACTIVE')
    return <p role="status">{t('restaurant.inactiveTable')}</p>;
  const path = `/shop/${encodeURIComponent(shop.data.slug)}?table=${table.qr_token}`;
  return (
    <section aria-label={t('restaurant.tableLinkLabel', { code: table.code })}>
      <h3>{t('restaurant.tableLinkTitle', { code: table.code })}</h3>
      <p>{t('restaurant.tableLinkDescription')}</p>
      <Link to={path} target="_blank" rel="noreferrer">
        {t('restaurant.openTableLink', { code: table.code })}
      </Link>
    </section>
  );
}
