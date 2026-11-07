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
  const scope = useRestaurantScope();
  const query = useRestaurantQuery<DiningTable[]>(
    `/restaurant/tables?branch_id=${scope.branch}`,
    'online_orders.manage',
  );
  const [editing, setEditing] = useState<DiningTable | null>(null);
  return (
    <>
      <Card className="catalog-panel">
        <h2>ข้อมูลโต๊ะในสาขา</h2>
        <p>
          เพิ่มโต๊ะเพื่อรับลิงก์สำหรับสร้าง QR สั่งอาหาร
          ลิงก์จะแสดงหลังสร้างโต๊ะเท่านั้น ระบบยังไม่ได้สร้างภาพ QR ให้
          และต้องตรวจการชำระเงินก่อนเข้าคิวครัว
        </p>
        <QueryState query={query} />
        {query.data && !query.error ? (
          query.data.length === 0 ? (
            <p role="status">ยังไม่มีโต๊ะอาหาร</p>
          ) : (
            <Table headers={['โต๊ะ', 'ชื่อ', 'ที่นั่ง', 'สถานะ', 'จัดการ']}>
              {query.data.map((table) => (
                <tr key={table.id}>
                  <th scope="row">{table.code}</th>
                  <td>{table.name}</td>
                  <td>{table.seats}</td>
                  <td>{table.status === 'ACTIVE' ? 'ใช้งาน' : 'พักใช้'}</td>
                  <td>
                    <Button onClick={() => setEditing(table)}>
                      แก้ไข {table.code}
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
  return (
    <section aria-label={`ลิงก์โต๊ะ ${table.code}`}>
      <h3>ลิงก์สำหรับสร้าง QR โต๊ะ {table.code}</h3>
      <p>
        เก็บลิงก์นี้ไว้ก่อนออกจากหน้า ใช้สำหรับโต๊ะนี้เท่านั้น ยังไม่มีภาพ QR
        ให้ดาวน์โหลด
      </p>
      <Link to={path} target="_blank" rel="noreferrer">
        เปิดหน้าสั่งอาหาร โต๊ะ {table.code}
      </Link>
    </section>
  );
}
