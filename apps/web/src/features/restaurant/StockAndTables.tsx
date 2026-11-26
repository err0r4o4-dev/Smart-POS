import { useLanguage } from '../../app/language';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, Printer } from 'lucide-react';
import { QRCodeSVG } from '../../lib/qr-code';
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
  const [activeQRTable, setActiveQRTable] = useState<DiningTable | null>(null);

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
                    {table.qr_token && (
                      <Button
                        className="button-secondary"
                        onClick={() => setActiveQRTable(table)}
                      >
                        ดู / พิมพ์ QR
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          )
        ) : null}
      </Card>

      {activeQRTable && (
        <Card
          className="catalog-panel"
          style={{ border: '2px solid #F8CA49', marginTop: 16 }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <h3>
              QR Code ประจำโต๊ะ {activeQRTable.code} ({activeQRTable.name})
            </h3>
            <Button
              className="button-secondary"
              onClick={() => setActiveQRTable(null)}
            >
              ปิด
            </Button>
          </div>
          <TableOrderLink table={activeQRTable} />
        </Card>
      )}

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
  const [showTentStand, setShowTentStand] = useState(false);
  const [copied, setCopied] = useState(false);
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
  const fullUrl =
    typeof window !== 'undefined' ? `${window.location.origin}${path}` : path;

  const copyToClipboard = () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(fullUrl).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

  return (
    <section aria-label={`ลิงก์โต๊ะ ${table.code}`} style={{ marginTop: 20 }}>
      <h3>ลิงก์สำหรับสร้าง QR โต๊ะ {table.code}</h3>
      <p>เก็บลิงก์นี้ไว้ก่อนออกจากหน้า ใช้สำหรับโต๊ะนี้เท่านั้น</p>

      {/* Render actual QR Code graphic (Phase 5) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 20,
          margin: '14px 0',
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            padding: 12,
            background: '#FFFFFF',
            border: '1.5px solid #F8CA49',
            borderRadius: 14,
            boxShadow: '0 4px 12px rgba(0,0,0,0.05)',
          }}
        >
          <QRCodeSVG
            value={fullUrl}
            size={150}
            title={`QR โต๊ะ ${table.code}`}
          />
        </div>
        <div>
          <div
            style={{
              fontWeight: 800,
              fontSize: 18,
              color: '#111B38',
              marginBottom: 4,
            }}
          >
            โต๊ะ {table.code} ({table.name})
          </div>
          <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 12 }}>
            จำนวนที่นั่ง: {table.seats} ที่นั่ง
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <Button
              className="button"
              onClick={() => setShowTentStand(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Printer size={16} aria-hidden="true" />
              <span>พิมพ์ป้ายตั้งโต๊ะ</span>
            </Button>
            <Button
              className="button-secondary"
              onClick={copyToClipboard}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              {copied ? (
                <Check size={16} color="#16A34A" />
              ) : (
                <Copy size={16} />
              )}
              <span>{copied ? 'คัดลอกแล้ว!' : 'คัดลอกลิงก์'}</span>
            </Button>
          </div>
        </div>
      </div>

      <div style={{ marginTop: 10 }}>
        <Link to={path} target="_blank" rel="noreferrer">
          เปิดหน้าสั่งอาหาร โต๊ะ {table.code}
        </Link>
      </div>

      {/* Printable Table Tent Stand Modal (Image #1 Step 1) */}
      {showTentStand && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`ป้ายตั้งโต๊ะ ${table.code}`}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 20,
          }}
        >
          <div
            style={{
              background: '#FFFFFF',
              borderRadius: 24,
              padding: 32,
              maxWidth: 380,
              width: '100%',
              textAlign: 'center',
              boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
            }}
          >
            <div
              style={{
                border: '3px solid #F8CA49',
                borderRadius: 20,
                padding: '24px 20px',
                background: '#FFFDF5',
                marginBottom: 20,
              }}
            >
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '4px 16px',
                  background: '#F8CA49',
                  borderRadius: 8,
                  fontWeight: 900,
                  fontSize: 18,
                  color: '#111B38',
                  marginBottom: 12,
                }}
              >
                {shop.data?.name || 'VELO'}
              </div>
              <div
                style={{
                  fontSize: 26,
                  fontWeight: 900,
                  color: '#111B38',
                  marginBottom: 14,
                }}
              >
                โต๊ะ: {table.code}
              </div>
              <div
                style={{
                  display: 'inline-block',
                  padding: 12,
                  background: '#FFFFFF',
                  borderRadius: 14,
                  border: '1px solid #E5E7EB',
                  marginBottom: 14,
                }}
              >
                <QRCodeSVG value={fullUrl} size={180} />
              </div>
              <div
                style={{
                  fontSize: 16,
                  fontWeight: 800,
                  color: '#85651D',
                }}
              >
                สแกนเพื่อสั่งอาหาร
              </div>
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <Button
                onClick={() => window.print()}
                style={{
                  flex: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                }}
              >
                <Printer size={16} aria-hidden="true" />
                <span>พิมพ์ป้าย</span>
              </Button>
              <Button
                className="button-secondary"
                onClick={() => setShowTentStand(false)}
                style={{ flex: 1 }}
              >
                ปิด
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
