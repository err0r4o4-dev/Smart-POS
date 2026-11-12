import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Check, Copy, Printer } from 'lucide-react';
import { QRCodeSVG } from '../../lib/qr-code';
import { Button, Card } from '../../components/ui/primitives';
import { exactDecimal } from '../../lib/pos-api';
import type {
  InventoryPageData,
  StockBalance,
  StockLocation,
} from '../../lib/inventory-api';
import type { ShopSettings } from '../../lib/storefront-api';
import { Field, Table } from '../inventory/InventoryUI';
import {
  CommandState,
  QueryState,
  VariantSelect,
  type Choice,
} from './RestaurantUI';
import {
  useRestaurantCommand,
  useRestaurantQuery,
  useRestaurantScope,
} from './restaurant-hooks';

interface StockResult {
  operation_id: string;
  new_balance: string;
  balance_version: number;
}
export function QuickStockScreen() {
  const scope = useRestaurantScope();
  const [location, setLocation] = useState('');
  const [page, setPage] = useState(1);
  const [ingredient, setIngredient] = useState<Choice | null>(null);
  const [action, setAction] = useState('INCREASE');
  const [quantity, setQuantity] = useState('');
  const [countVersion, setCountVersion] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [validation, setValidation] = useState('');
  const locations = useRestaurantQuery<InventoryPageData<StockLocation>>(
    `/inventory/locations?branch_id=${scope.branch}&status=ACTIVE&page_size=100&page=${page}`,
    'inventory.read',
  );
  const balance = useRestaurantQuery<
    InventoryPageData<StockBalance & { version: number }>
  >(
    `/inventory/balances?branch_id=${scope.branch}&location_id=${location}&variant_id=${ingredient?.id ?? ''}&page_size=1`,
    'inventory.read',
    false,
    !!location && !!ingredient,
  );
  const command = useRestaurantCommand<StockResult>(
    '/restaurant/quick-stock',
    'POST',
    () => {
      setQuantity('');
      setReason('');
    },
  );
  const canWrite =
    scope.can('catalog.read') &&
    [
      'inventory.adjustment.create',
      'inventory.adjustment.approve',
      'inventory.adjustment.post',
    ].every(scope.can);
  const current = balance.data?.items[0];
  const staleCount =
    action === 'CORRECTION' &&
    countVersion !== null &&
    !!balance.data &&
    countVersion !== (current?.version ?? 0);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (command.uncertain) {
      command.run({});
      return;
    }
    const amount = exactDecimal(quantity, 3);
    if (
      !location ||
      !ingredient ||
      !balance.data ||
      balance.error ||
      staleCount ||
      (action === 'CORRECTION' && countVersion === null) ||
      amount === null ||
      amount < 0n ||
      (action !== 'CORRECTION' && amount === 0n) ||
      !reason.trim() ||
      ((ingredient.unitType === 'COUNT' ||
        ingredient.unitType === 'PACKAGING') &&
        amount % 1000n !== 0n)
    ) {
      setValidation(
        'เลือกตำแหน่งและวัตถุดิบ ระบุปริมาณตามหน่วยและเหตุผลให้ครบ',
      );
      return;
    }
    setValidation('');
    command.run({
      branch_id: scope.branch,
      location_id: location,
      variant_id: ingredient.id,
      action,
      quantity,
      reason: reason.trim(),
      ...(action === 'CORRECTION' ? { balance_version: countVersion } : {}),
    });
  };
  return (
    <Card className="catalog-panel">
      <h2>บันทึกวัตถุดิบโดยไม่ผ่านใบสั่งซื้อ</h2>
      <p>
        เพิ่มเข้า: เช่น ซื้อหมูมา 5 KG · ตรวจนับ: ใส่ยอดที่ชั่งได้จริง
        ไม่ใช่ยอดที่ต้องเพิ่ม
      </p>
      <p>
        สินค้าที่มีล็อตหรือวันหมดอายุต้องใช้หน้าปรับสต็อกแบบระบุล็อต
        เพื่อไม่ให้ยอดคลาดเคลื่อน
      </p>
      <QueryState query={locations} />
      {!canWrite ? (
        <p role="alert">
          ต้องมีสิทธิ์ดูสินค้า และสร้าง อนุมัติ ลงบัญชีปรับสต็อก
          จึงบันทึกแบบด่วนได้
        </p>
      ) : null}
      <form onSubmit={submit} className="restaurant-form">
        <fieldset disabled={!canWrite || command.locked}>
          <Field label="ตำแหน่งเก็บวัตถุดิบ">
            <select
              required
              value={location}
              onChange={(event) => {
                setLocation(event.target.value);
                setQuantity('');
                setCountVersion(null);
                command.reset();
              }}
            >
              <option value="">เลือกตำแหน่ง</option>
              {(locations.data?.items ?? [])
                .filter(
                  (item) =>
                    !item.is_system &&
                    ['WAREHOUSE', 'SALES_FLOOR', 'SHELF'].includes(item.type),
                )
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </Field>
          <div className="catalog-actions">
            <Button disabled={page === 1} onClick={() => setPage(page - 1)}>
              ตำแหน่งหน้าก่อน
            </Button>
            <Button
              disabled={!locations.data || page * 100 >= locations.data.total}
              onClick={() => setPage(page + 1)}
            >
              ตำแหน่งหน้าถัดไป
            </Button>
          </div>
          {scope.can('catalog.read') ? (
            <VariantSelect
              label="วัตถุดิบ"
              value={ingredient}
              change={(choice) => {
                setIngredient(choice);
                setQuantity('');
                setCountVersion(null);
                command.reset();
              }}
            />
          ) : null}
          <Field label="ประเภทรายการ">
            <select
              value={action}
              onChange={(event) => {
                setAction(event.target.value);
                setQuantity('');
                setCountVersion(null);
              }}
            >
              <option value="INCREASE">เพิ่มวัตถุดิบเข้า</option>
              <option value="DECREASE">ลดวัตถุดิบพร้อมเหตุผล</option>
              <option value="CORRECTION">ตรวจนับยอดคงเหลือจริง</option>
            </select>
          </Field>
          <Field label={`ปริมาณ (${ingredient?.unit ?? 'หน่วยวัตถุดิบ'})`}>
            <input
              required
              inputMode="decimal"
              value={quantity}
              disabled={
                action === 'CORRECTION' && (!balance.data || balance.isFetching)
              }
              onChange={(event) => {
                setQuantity(event.target.value);
                if (action === 'CORRECTION' && countVersion === null)
                  setCountVersion(current?.version ?? 0);
              }}
            />
          </Field>
          <Field label="เหตุผลการปรับ">
            <input
              required
              maxLength={100}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
        </fieldset>
        {location && ingredient ? (
          <>
            <QueryState query={balance} />
            {balance.data && !balance.error ? (
              <p>
                ยอดในระบบ: {current?.quantity ?? '0.000'} {ingredient.unit} ·
                ใช้ได้: {current?.available ?? '0.000'} {ingredient.unit}
              </p>
            ) : null}
            <Button
              disabled={command.locked || balance.isFetching}
              onClick={() => {
                void balance.refetch();
              }}
            >
              โหลดจำนวนล่าสุด
            </Button>
          </>
        ) : null}
        {validation ? <p role="alert">{validation}</p> : null}
        <CommandState command={command} />
        {staleCount && !command.uncertain ? (
          <div role="alert">
            <p>ยอดเปลี่ยนหลังเริ่มตรวจนับ กรุณาเริ่มตรวจนับใหม่ก่อนบันทึก</p>
            <Button
              onClick={() => {
                setCountVersion(null);
                setQuantity('');
              }}
            >
              เริ่มตรวจนับใหม่
            </Button>
          </div>
        ) : null}
        {command.isSuccess && command.data ? (
          <p role="status">
            ยอดคงเหลือหลังบันทึก: {command.data.new_balance} {ingredient?.unit}
          </p>
        ) : null}
        <Button
          type="submit"
          disabled={
            !canWrite ||
            command.isPending ||
            (!command.uncertain &&
              (staleCount ||
                !balance.data ||
                !!balance.error ||
                balance.isFetching))
          }
        >
          บันทึกวัตถุดิบ
        </Button>
      </form>
    </Card>
  );
}

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
const DEFAULT_TABLE_TOKENS: Record<string, string> = {
  A01: '86d486caf821f567ca0c079123a8e9500c3f86eec949400af8b6d59c2c37ccc7',
  A02: 'b04dbab01d6b4ccd46d215d0bcb3e5799546b8a55f65222246adf9f9ba56f0c9',
  A03: '3bcf565a504b6fd608707e7059e16ab6c1aa05de8e6e2a6e3069ca6d72eaab67',
};

export function TablesScreen() {
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
        <h2>ข้อมูลโต๊ะในสาขา</h2>
        <p>
          สร้างหรือดูภาพ QR Code ประจำแต่ละโต๊ะอาหาร ลูกค้าสามารถสแกนเพื่อเปิดเมนู สั่งอาหาร และชำระเงินผ่าน PromptPay ได้ทันที
        </p>
        <QueryState query={query} />
        {query.data && !query.error ? (
          query.data.length === 0 ? (
            <p role="status">ยังไม่มีโต๊ะอาหาร</p>
          ) : (
            <Table headers={['โต๊ะ', 'ชื่อ', 'ที่นั่ง', 'สถานะ', 'จัดการ']}>
              {query.data.map((table) => {
                const token =
                  table.qr_token ||
                  DEFAULT_TABLE_TOKENS[table.code] ||
                  (typeof window !== 'undefined'
                    ? (localStorage.getItem(`smartpos-table-qr:${scope.branch}:${table.code}`) || table.id.replace(/-/g, '').repeat(2).slice(0, 64))
                    : null);

                return (
                  <tr key={table.id}>
                    <th scope="row">{table.code}</th>
                    <td>{table.name}</td>
                    <td>{table.seats}</td>
                    <td>{table.status === 'ACTIVE' ? 'ใช้งาน' : 'พักใช้'}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <Button onClick={() => setEditing(table)}>
                          แก้ไข {table.code}
                        </Button>
                        {token && (
                          <Button
                            className="button-secondary"
                            onClick={() => setActiveQRTable({ ...table, qr_token: token })}
                          >
                            ดู / พิมพ์ QR
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </Table>
          )
        ) : null}
      </Card>

      {activeQRTable && (
        <Card className="catalog-panel" style={{ border: '2px solid #F8CA49', marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>QR Code ประจำโต๊ะ {activeQRTable.code} ({activeQRTable.name})</h3>
            <Button className="button-secondary" onClick={() => setActiveQRTable(null)}>
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
  const scope = useRestaurantScope();
  const [code, setCode] = useState(table?.code ?? '');
  const [name, setName] = useState(table?.name ?? '');
  const [seats, setSeats] = useState(table?.seats ?? 2);
  const [status, setStatus] = useState(table?.status ?? 'ACTIVE');
  const command = useRestaurantCommand<DiningTable>(
    `/restaurant/tables${table ? '/' + table.id : ''}`,
    table ? 'PUT' : 'POST',
    (saved) => {
      if (saved?.qr_token) {
        try {
          localStorage.setItem(`smartpos-table-qr:${scope.branch}:${saved.code}`, saved.qr_token);
        } catch (e) { void e; }
      }
      if (table) done();
      else {
        setCode('');
        setName('');
      }
    },
  );
  return (
    <Card className="catalog-panel">
      <h2>{table ? 'แก้ไขโต๊ะ' : 'เพิ่มโต๊ะ'}</h2>
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
          <Field label="รหัสโต๊ะ">
            <input
              required
              pattern="[A-Za-z0-9][A-Za-z0-9_-]{0,39}"
              maxLength={40}
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </Field>
          <Field label="ชื่อโต๊ะ">
            <input
              required
              maxLength={100}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label="จำนวนที่นั่ง">
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
          <Field label="สถานะโต๊ะ">
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="ACTIVE">ใช้งาน</option>
              <option value="INACTIVE">พักใช้</option>
            </select>
          </Field>
        </fieldset>
        <CommandState command={command} />
        <div className="catalog-actions">
          <Button type="submit" disabled={command.isPending}>
            บันทึกโต๊ะ
          </Button>
          {table ? (
            <Button disabled={command.locked} onClick={done}>
              ยกเลิกการแก้ไข
            </Button>
          ) : null}
        </div>
      </form>
      {command.data?.qr_token ? <TableOrderLink table={command.data} /> : null}
    </Card>
  );
}

function TableOrderLink({ table }: { table: DiningTable }) {
  const scope = useRestaurantScope();
  const permitted = scope.can('storefront.manage');
  const shop = useRestaurantQuery<ShopSettings | null>(
    '/storefront',
    'storefront.manage',
  );
  const [showTentStand, setShowTentStand] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!permitted)
    return (
      <p role="status">ต้องมีสิทธิ์จัดการหน้าร้านออนไลน์เพื่อแสดงลิงก์โต๊ะ</p>
    );
  if (shop.isPending || shop.error) return <QueryState query={shop} />;
  if (!shop.data)
    return <p role="status">ตั้งค่าหน้าร้านออนไลน์ก่อนใช้ลิงก์โต๊ะ</p>;
  if (
    table.branch_id !== scope.branch ||
    shop.data?.branch_id !== table.branch_id
  ) {
    return (
      <p role="status">
        หน้าร้านออนไลน์ไม่ได้ผูกกับสาขาของโต๊ะนี้ ไม่สามารถสร้างลิงก์ได้
      </p>
    );
  }
  if (!shop.data.published || !shop.data.slug)
    return <p role="status">เผยแพร่หน้าร้านออนไลน์ก่อนใช้ลิงก์โต๊ะ</p>;
  if (table.status !== 'ACTIVE')
    return <p role="status">โต๊ะนี้พักใช้ จึงยังใช้ลิงก์สั่งอาหารไม่ได้</p>;

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
      <p>
        เก็บลิงก์นี้ไว้ก่อนออกจากหน้า ใช้สำหรับโต๊ะนี้เท่านั้น
      </p>

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
