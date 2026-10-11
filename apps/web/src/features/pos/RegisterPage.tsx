import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Card } from '../../components/ui/primitives';
import {
  posRequest,
  moneyText,
  paymentLabels,
  type POSPage,
  type POSCheckout,
  type POSShift,
} from '../../lib/pos-api';
import { usePOS } from './POSContext';
import { QueryFeedback } from '../../components/feedback/QueryFeedback';
import { POSPagination } from './POSPagination';

export function RegisterPage({
  section,
}: {
  section: 'open' | 'close' | 'history' | 'shifts';
}) {
  const pos = usePOS();
  const [cash, setCash] = useState('0.00');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');
  const [page, setPage] = useState(1);
  const key = useRef(crypto.randomUUID());
  const locations = useQuery({
    queryKey: ['tenant', pos.user, pos.org, 'pos', pos.branch, 'locations'],
    queryFn: ({ signal }) =>
      posRequest<POSPage<{ id: string; name: string; type: string }>>(
        pos.org,
        `/inventory/locations?branch_id=${pos.branch}&status=ACTIVE&page_size=100`,
        { signal },
      ),
    enabled: section === 'open' && pos.can('pos.terminal.manage'),
  });
  const history = useQuery({
    queryKey: [
      'tenant',
      pos.user,
      pos.org,
      'pos',
      pos.branch,
      'register-history',
      page,
    ],
    queryFn: ({ signal }) =>
      posRequest<POSPage<POSShift>>(
        pos.org,
        `/pos/shifts?branch_id=${pos.branch}&page=${page}`,
        { signal },
      ),
    enabled: section === 'history',
  });
  const payments = useQuery({
    queryKey: [
      'tenant',
      pos.user,
      pos.org,
      'pos',
      pos.branch,
      'payment-history',
      page,
    ],
    queryFn: ({ signal }) =>
      posRequest<POSPage<POSCheckout>>(
        pos.org,
        `/pos/checkouts?branch_id=${pos.branch}&page=${page}`,
        { signal },
      ),
    enabled: section === 'shifts',
  });
  return (
    <>
      <h1>
        {
          {
            open: 'เปิดกะขาย',
            close: 'ปิดกะและนับเงิน',
            history: 'ประวัติกะ',
            shifts: 'ตรวจสอบการชำระเงิน',
          }[section]
        }
      </h1>
      {section === 'open' && (
        <>
          <Card>
            <p>หนึ่งเครื่องมีได้หนึ่งกะ และหนึ่งแคชเชียร์มีได้หนึ่งกะเปิด</p>
            <label>
              เงินเปิดกะ
              <input
                aria-label="เงินเปิดกะ"
                value={cash}
                inputMode="decimal"
                onChange={(event) => setCash(event.target.value)}
              />
            </label>
            <Button
              disabled={pos.busy || !pos.terminal || !!pos.shift}
              onClick={() =>
                void pos.mutate(
                  '/pos/shifts/open',
                  { terminal_id: pos.terminal?.id, opening_cash: cash },
                  'POST',
                  key.current,
                )
              }
            >
              เปิดกะขาย
            </Button>
          </Card>
          {pos.can('pos.terminal.manage') && (
            <Card>
              <h2>ตั้งค่าเครื่องขาย</h2>
              <label>
                รหัสเครื่อง
                <input
                  value={code}
                  onChange={(event) =>
                    setCode(event.target.value.toUpperCase())
                  }
                />
              </label>
              <label>
                ชื่อเครื่อง
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <label>
                ตำแหน่งสต็อกขาย
                <select
                  value={location}
                  onChange={(event) => setLocation(event.target.value)}
                >
                  <option value="">เลือกตำแหน่ง</option>
                  {locations.data?.items
                    .filter((item) =>
                      ['WAREHOUSE', 'SALES_FLOOR', 'SHELF'].includes(item.type),
                    )
                    .map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.name} ({item.type})
                      </option>
                    ))}
                </select>
              </label>
              <Button
                disabled={pos.busy || !location || !name || !code}
                onClick={() =>
                  void pos.mutate('/pos/terminals', {
                    branch_id: pos.branch,
                    code,
                    name,
                    stock_location_id: location,
                    status: 'ACTIVE',
                  })
                }
              >
                สร้างเครื่องขาย
              </Button>
            </Card>
          )}
        </>
      )}
      {section === 'close' && (
        <Card>
          {pos.shift ? (
            <>
              <p>เงินเปิดกะ {moneyText(pos.shift.opening_cash)}</p>
              <p>ยอดขายเงินสดสุทธิ {moneyText(pos.shift.cash_sales)}</p>
              <p>คืนเงินสด {moneyText(pos.shift.cash_refunds ?? '0.00')}</p>
              <strong>
                เงินควรมี {moneyText(pos.shift.expected_cash)} บาท
              </strong>
              <p>QR / โอนไม่รวมในลิ้นชัก เงินค้างต้องจัดการก่อนปิดกะ</p>
              <label>
                เงินนับจริง
                <input
                  aria-label="เงินนับจริง"
                  value={cash}
                  inputMode="decimal"
                  onChange={(event) => setCash(event.target.value)}
                />
              </label>
              <Button
                disabled={pos.busy}
                onClick={() =>
                  void (async () => {
                    const result = await pos.mutate<POSShift>(
                      `/pos/shifts/${pos.shift?.id}/close`,
                      { counted_cash: cash },
                      'POST',
                      key.current,
                    );
                    if (result)
                      pos.setMessage(
                        `ปิดกะแล้ว ส่วนต่าง ${result.difference} บาท`,
                      );
                  })()
                }
              >
                ยืนยันปิดกะ
              </Button>
            </>
          ) : (
            <p>ไม่มีกะเปิดของคุณในเครื่องนี้</p>
          )}
        </Card>
      )}
      {section === 'history' && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>เครื่อง / แคชเชียร์</th>
                <th>เวลา</th>
                <th>เปิดกะ</th>
                <th>ขายเงินสด</th>
                <th>คืนเงินสด</th>
                <th>ควรมี</th>
                <th>นับจริง / ส่วนต่าง</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {history.data?.items.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.terminal_name}
                    <br />
                    {item.cashier_name}
                  </td>
                  <td>
                    {new Date(item.opened_at).toLocaleString('th-TH')}
                    <br />
                    {item.closed_at &&
                      new Date(item.closed_at).toLocaleString('th-TH')}
                  </td>
                  <td>{item.opening_cash}</td>
                  <td>{item.cash_sales}</td>
                  <td>{item.cash_refunds ?? '0.00'}</td>
                  <td>{item.expected_cash}</td>
                  <td>
                    {item.counted_cash ?? '?'} / {item.difference ?? '?'}
                  </td>
                  <td>{item.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <QueryFeedback
            loading={history.isFetching}
            error={history.error}
            empty={history.data?.total === 0}
            emptyMessage="ยังไม่มีประวัติกะในสาขานี้"
            retry={() => void history.refetch()}
          />
        </div>
      )}
      {section === 'shifts' && (
        <>
          <p>
            รายการยืนยันเงินแล้วแต่ขายไม่สำเร็จต้องตรวจสอบด้วยคน
            ระบบไม่โอนเงินคืนอัตโนมัติ
          </p>
          {pos.can('pos.payment.reconcile') && (
            <label>
              บันทึกหลักฐานการตรวจสอบ / การคืนเงินนอกระบบ
              <input
                value={note}
                maxLength={2000}
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
          )}
          {payments.data?.items
            .filter((item) =>
              [
                'AWAITING_PAYMENT',
                'CONFIRMED',
                'RECONCILIATION_REQUIRED',
              ].includes(item.status),
            )
            .map((item) => (
              <Card key={item.id}>
                <p>
                  {item.id} · {item.status} · {paymentLabels[item.method]}
                </p>
                <strong>{item.total} บาท</strong>
                <p>
                  อ้างอิง: {item.reference || '—'} · {item.failure_code}
                </p>
                {item.status === 'AWAITING_PAYMENT' ? (
                  <Button
                    disabled={pos.busy}
                    onClick={() =>
                      void pos.mutate(`/pos/checkouts/${item.id}/cancel`, {})
                    }
                  >
                    ยกเลิกก่อนรับเงิน
                  </Button>
                ) : (
                  <>
                    <Button
                      disabled={pos.busy}
                      onClick={() =>
                        void (async () => {
                          const result = await pos.mutate<POSCheckout>(
                            `/pos/checkouts/${item.id}/complete`,
                            {},
                          );
                          if (result)
                            pos.setMessage(
                              result.status === 'COMPLETED'
                                ? 'ขายสำเร็จ'
                                : `ยังต้องตรวจสอบ: ${result.failure_code}`,
                            );
                        })()
                      }
                    >
                      ลองบันทึกขายเดิม
                    </Button>
                    {pos.can('pos.payment.reconcile') && (
                      <Button
                        disabled={pos.busy || !note.trim()}
                        onClick={() =>
                          void pos.mutate(`/pos/checkouts/${item.id}/resolve`, {
                            acknowledged: true,
                            note,
                          })
                        }
                      >
                        ยืนยันตรวจสอบเงินเสร็จแล้ว
                      </Button>
                    )}
                  </>
                )}
              </Card>
            ))}
          <QueryFeedback
            loading={payments.isFetching}
            error={payments.error}
            empty={payments.data?.total === 0}
            emptyMessage="ยังไม่มีรายการชำระเงินในสาขานี้"
            retry={() => void payments.refetch()}
          />
        </>
      )}
      {['history', 'shifts'].includes(section) && (
        <POSPagination
          page={page}
          total={
            (section === 'history' ? history.data : payments.data)?.total ?? 0
          }
          busy={history.isFetching || payments.isFetching}
          change={setPage}
        />
      )}
    </>
  );
}
