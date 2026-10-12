import { useRef, useState } from 'react';
import { WorkspaceLink as Link } from '../../app/WorkspaceNavigation';
import { useQuery } from '@tanstack/react-query';
import { Button, Card } from '../../components/ui/primitives';
import {
  PricingCheckoutControls,
  type PricingSelection,
} from '../pricing/PricingCheckoutControls';
import {
  posRequest,
  moneyText,
  exactDecimal,
  paymentLabels,
  type POSPage,
  type POSCheckout,
  type PaymentMethod,
} from '../../lib/pos-api';
import { usePOS } from './POSContext';
import { QueryFeedback } from '../../components/feedback/QueryFeedback';
import { LoyaltyCheckoutControls } from '../loyalty/LoyaltyCheckoutControls';

export function CheckoutPage() {
  const pos = usePOS();
  const [pricingSelection, setPricingSelection] = useState<PricingSelection>();
  const currentSelection =
    pricingSelection?.cartID === pos.cart?.id &&
    pricingSelection?.cartRevision === pos.cart?.revision &&
    pricingSelection?.baseRevision === pos.cart?.pricing?.revision
      ? pricingSelection
      : undefined;
  const payable = currentSelection?.quote.total ?? pos.cart?.total ?? '0.00';
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [received, setReceived] = useState('');
  const [reference, setReference] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [selected, setSelected] = useState<POSCheckout>();
  const request = useRef<{ key: string; body: object } | null>(null);
  const [requestLocked, setRequestLocked] = useState(false);
  const confirmKey = useRef(crypto.randomUUID());
  const quickPresets = (() => {
    const payDec = exactDecimal(payable, 2);
    if (payDec === null || payDec <= 0n) return [];
    const list: string[] = [];
    const denominations = [50n, 100n, 500n, 1000n];
    for (const denom of denominations) {
      const val = denom * 100n;
      if (val > payDec) {
        list.push(`${denom}.00`);
      }
    }
    if (payDec > 100000n) {
      const nextThou = ((payDec + 99999n) / 100000n) * 1000n;
      const nextStr = `${nextThou}.00`;
      if (!list.includes(nextStr)) {
        list.push(nextStr);
      }
    }
    return list;
  })();
  const changeCalculation = (() => {
    if (!received.trim()) return null;
    const payDec = exactDecimal(payable, 2);
    const recDec = exactDecimal(received.trim(), 2);
    if (payDec === null || recDec === null) return null;
    const diff = recDec - payDec;
    if (diff >= 0n) {
      const whole = diff / 100n;
      const frac = (diff % 100n).toString().padStart(2, '0');
      return { valid: true, amount: `${whole}.${frac}` };
    } else {
      const shortage = -diff;
      const whole = shortage / 100n;
      const frac = (shortage % 100n).toString().padStart(2, '0');
      return { valid: false, amount: `${whole}.${frac}` };
    }
  })();
  const pending = useQuery({
    queryKey: [
      'tenant',
      pos.user,
      pos.org,
      'pos',
      pos.branch,
      'pending',
      pos.terminal?.id,
    ],
    queryFn: ({ signal }) =>
      posRequest<POSPage<POSCheckout>>(
        pos.org,
        `/pos/checkouts?branch_id=${pos.branch}&terminal_id=${pos.terminal?.id}`,
        { signal },
      ),
    enabled: !!pos.terminal,
  });
  const checkout =
    selected ??
    pending.data?.items.find(
      (item) =>
        item.cart_id === pos.cart?.id &&
        ['AWAITING_PAYMENT', 'CONFIRMED', 'RECONCILIATION_REQUIRED'].includes(
          item.status,
        ),
    );
  const prepare = async () => {
    if (!pos.cart || pending.isPending || pending.isError) return;
    setRequestLocked(true);
    if (!request.current)
      request.current = {
        key: crypto.randomUUID(),
        body: {
          cart_id: pos.cart.id,
          revision: pos.cart.revision,
          method: payable === '0.00' ? 'NONE' : method,
          expected_total: payable,
          received:
            payable === '0.00'
              ? '0.00'
              : method === 'CASH'
                ? received
                : payable,
          pricing_revision:
            currentSelection?.quote.revision ?? pos.cart.pricing?.revision,
          approval_id: currentSelection?.approvalID ?? '',
          loyalty_points: currentSelection?.quote.loyalty?.points ?? 0,
        },
      };
    const result = await pos.mutate<POSCheckout>(
      '/pos/checkout',
      request.current.body,
      'POST',
      request.current.key,
    );
    if (result) setSelected(result);
  };
  const confirm = async () => {
    if (!checkout) return;
    const result = await pos.mutate<POSCheckout>(
      `/pos/payments/${checkout.id}/confirm`,
      { acknowledged, reference },
      'POST',
      confirmKey.current,
    );
    if (result) setSelected(result);
  };
  const complete = async () => {
    if (!checkout) return;
    const result = await pos.mutate<POSCheckout>(
      `/pos/checkouts/${checkout.id}/complete`,
      {},
    );
    if (result) {
      setSelected(result);
      if (result.status === 'COMPLETED') {
        pos.setCart('');
        pos.setMessage('ขายสำเร็จและตัดสต็อกแล้ว การพิมพ์ไม่มีผลต่อรายการขาย');
      }
    }
  };
  return (
    <>
      <h1>ชำระเงิน</h1>
      <QueryFeedback
        loading={pending.isFetching}
        error={pending.error}
        retry={() => void pending.refetch()}
      />
      <Card className="pos-checkout">
        <p>
          ลูกค้า / Customer:{' '}
          {checkout?.customer_code_snapshot ||
            pos.cart?.customer?.code ||
            'Walk-in'}
        </p>
        <p>
          ราคาสุดท้ายคำนวณจาก Pricing quote บนเซิร์ฟเวอร์ การเลือก QR /
          โอนยังไม่ใช่การรับเงิน
        </p>
        {!checkout ? (
          <>
            <strong className="pos-total">
              ยอดรวม {moneyText(payable)} บาท
            </strong>
            <LoyaltyCheckoutControls
              locked={requestLocked || !!checkout}
              onSelection={setPricingSelection}
            />
            <PricingCheckoutControls
              key={[
                pos.cart?.id,
                pos.cart?.revision,
                pos.cart?.pricing?.revision,
              ].join(':')}
              locked={requestLocked}
              onSelection={setPricingSelection}
            />
            <label>
              วิธีชำระเงิน
              <select
                value={method}
                disabled={pos.busy || requestLocked}
                onChange={(event) =>
                  setMethod(event.target.value as PaymentMethod)
                }
              >
                {Object.entries(paymentLabels)
                  .filter(
                    ([value]) =>
                      value !== 'EXCHANGE_CREDIT' && value !== 'NONE',
                  )
                  .map(([value, label]) => (
                    <option value={value} key={value}>
                      {label}
                    </option>
                  ))}
              </select>
            </label>
            {method === 'CASH' && (
              <div className="pos-cash-field">
                <label>
                  เงินรับ
                  <input
                    aria-label="เงินรับ"
                    inputMode="decimal"
                    value={received}
                    disabled={pos.busy || requestLocked}
                    onChange={(event) => setReceived(event.target.value)}
                  />
                </label>
                <div
                  className="quick-cash-buttons"
                  role="group"
                  aria-label="ปุ่มเงินสดด่วน"
                >
                  <button
                    type="button"
                    className="quick-cash-btn"
                    disabled={pos.busy || requestLocked}
                    onClick={() => setReceived(payable)}
                  >
                    พอดี ({moneyText(payable)})
                  </button>
                  {quickPresets.map((amt) => (
                    <button
                      key={amt}
                      type="button"
                      className="quick-cash-btn"
                      disabled={pos.busy || requestLocked}
                      onClick={() => setReceived(amt)}
                    >
                      {moneyText(amt)}
                    </button>
                  ))}
                </div>
                {changeCalculation && (
                  <div
                    className={`pos-change-hint ${changeCalculation.valid ? 'change-valid' : 'change-short'}`}
                    role="status"
                  >
                    {changeCalculation.valid ? (
                      <span>
                        เงินทอน:{' '}
                        <strong>
                          {moneyText(changeCalculation.amount)} บาท
                        </strong>
                      </span>
                    ) : (
                      <span>
                        ยังขาดอีก:{' '}
                        <strong>
                          {moneyText(changeCalculation.amount)} บาท
                        </strong>
                      </span>
                    )}
                  </div>
                )}
              </div>
            )}
            <Button
              disabled={
                pos.busy ||
                pending.isPending ||
                pending.isError ||
                !pos.cart?.items.length ||
                !pos.shift
              }
              onClick={() => void prepare()}
            >
              ตรวจสอบยอดและเตรียมชำระเงิน
            </Button>
            {requestLocked && (
              <Button
                disabled={pos.busy}
                onClick={() => {
                  request.current = null;
                  setRequestLocked(false);
                  pos.setMessage(
                    'เปลี่ยนข้อมูลได้แล้ว หากมีรายการค้างเซิร์ฟเวอร์จะป้องกันการชำระซ้ำ',
                  );
                }}
              >
                แก้ไขข้อมูลหลังตรวจสถานะ
              </Button>
            )}
          </>
        ) : (
          <>
            <p>
              รายการ {checkout.id} · สถานะ <strong>{checkout.status}</strong>
            </p>
            <p>{paymentLabels[checkout.method]}</p>
            <strong className="pos-total">
              {moneyText(checkout.total)} บาท
            </strong>
            <p>
              เงินรับ {moneyText(checkout.received)} · เงินทอน{' '}
              {moneyText(checkout.change)}
            </p>
            {checkout.status === 'AWAITING_PAYMENT' && (
              <>
                <p className="notice">
                  ตรวจสอบเงินจริงก่อนยืนยัน
                  ไม่เชื่อมธนาคารและไม่ตรวจสลิปอัตโนมัติ
                </p>
                {checkout.method !== 'CASH' && (
                  <label>
                    อ้างอิงการชำระเงิน
                    <input
                      aria-label="อ้างอิงการชำระเงิน"
                      value={reference}
                      maxLength={200}
                      onChange={(event) => setReference(event.target.value)}
                    />
                  </label>
                )}
                <label className="pos-checkbox">
                  <input
                    type="checkbox"
                    checked={acknowledged}
                    onChange={(event) => setAcknowledged(event.target.checked)}
                  />
                  ฉันตรวจสอบแล้วว่าได้รับเงินจริง
                </label>
                <Button
                  disabled={
                    pos.busy ||
                    !acknowledged ||
                    (checkout.method !== 'CASH' && !reference.trim())
                  }
                  onClick={() => void confirm()}
                >
                  ยืนยันรับเงินจริง
                </Button>
                <Button
                  disabled={pos.busy}
                  onClick={() =>
                    void (async () => {
                      const result = await pos.mutate<POSCheckout>(
                        `/pos/checkouts/${checkout.id}/cancel`,
                        {},
                      );
                      if (result) {
                        setSelected(undefined);
                        request.current = null;
                        setRequestLocked(false);
                        confirmKey.current = crypto.randomUUID();
                      }
                    })()
                  }
                >
                  ยกเลิกก่อนรับเงิน
                </Button>
              </>
            )}
            {['CONFIRMED', 'RECONCILIATION_REQUIRED'].includes(
              checkout.status,
            ) && (
              <>
                <p role="status">
                  {checkout.method === 'NONE'
                    ? 'ยอดสุทธิศูนย์ ไม่มีการรับเงิน กรุณาบันทึกขายและตัดสต็อก'
                    : 'ยืนยันเงินแล้ว แต่ยังไม่ใช่การขายสำเร็จ'}
                </p>
                {checkout.failure_code && (
                  <p role="alert">
                    {checkout.failure_code} — หลักฐานเงินยังอยู่ ต้องตรวจสอบ
                    ห้ามเรียกเก็บเงินซ้ำ
                  </p>
                )}
                <Button disabled={pos.busy} onClick={() => void complete()}>
                  {checkout.status === 'CONFIRMED'
                    ? 'บันทึกขายและตัดสต็อก'
                    : 'ลองบันทึกขายเดิมอีกครั้ง'}
                </Button>
                <Link to="/pos/shifts">ตรวจสอบรายการเงินค้าง</Link>
              </>
            )}
            {checkout.status === 'COMPLETED' && (
              <>
                <p role="status">ขายสำเร็จ</p>
                <Link to={`/sales/${checkout.sale_id}`}>
                  ดูรายการขายและพิมพ์ใบเสร็จ
                </Link>
                <Button
                  onClick={() => {
                    setSelected(undefined);
                    request.current = null;
                    setRequestLocked(false);
                    confirmKey.current = crypto.randomUUID();
                    setReceived('');
                    setReference('');
                    setAcknowledged(false);
                  }}
                >
                  เริ่มรายการใหม่
                </Button>
              </>
            )}
          </>
        )}
      </Card>
    </>
  );
}
