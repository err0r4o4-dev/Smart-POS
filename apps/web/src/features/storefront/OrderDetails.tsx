import { Tag } from '../../components/ui/primitives';
import { moneyText } from '../../lib/pos-api';
import { orderStatusLabels, type OnlineOrder } from '../../lib/storefront-api';

export function OrderDetails({
  order,
  staff = false,
}: {
  order: OnlineOrder;
  staff?: boolean;
}) {
  return (
    <div className="online-order-detail">
      <div className="shop-actions">
        <h2>{order.number}</h2>
        <Tag tone={order.status === 'COMPLETED' ? 'success' : 'amber'}>
          {orderStatusLabels[order.status]}
        </Tag>
      </div>
      <p>
        {order.payment_status === 'PAID_AT_STORE'
          ? 'ชำระและบันทึกขายที่ร้านแล้ว'
          : 'ยังไม่ชำระเงิน · รับและจ่ายที่ร้าน'}
      </p>
      {staff && (
        <p>
          ผู้รับ: {order.customer_name} · {order.contact_phone}
          <br />
          หมายเหตุลูกค้า: {order.customer_note || '—'}
        </p>
      )}
      <ul className="shop-order-lines">
        {order.items.map((line) => (
          <li key={line.variant_id}>
            <div>
              <strong>{line.product_name}</strong>
              <p>
                {line.variant_name} · {line.quantity} {line.unit}
              </p>
            </div>
            <span>฿{moneyText(line.line_total)}</span>
          </li>
        ))}
      </ul>
      <p>
        ยอดประมาณการเมื่อสั่ง{' '}
        <strong>฿{moneyText(order.estimated_total)}</strong>
      </p>
      {order.final_total && (
        <p>
          ยอดขายจริง <strong>฿{moneyText(order.final_total)}</strong> · ใบเสร็จ{' '}
          {order.receipt_number}
        </p>
      )}
      <p>
        รับที่: {order.store_name}
        <br />
        {order.pickup_instructions}
        <br />
        ติดต่อร้าน: {order.store_phone || 'ดูช่องทางติดต่อหน้าร้าน'}
      </p>
      {['PENDING', 'PREPARING', 'READY'].includes(order.status) && (
        <p className="notice">
          ยังไม่กันสต็อก · กรุณาติดต่อร้านก่อนเดินทาง ออเดอร์ที่ยังไม่เข้า POS
          หมดอายุ {new Date(order.expires_at).toLocaleString('th-TH')}
        </p>
      )}
      <h3>ความคืบหน้า</h3>
      <ol className="shop-timeline">
        {order.events.map((event, index) => (
          <li key={`${event.created_at}:${index}`}>
            <strong>{orderStatusLabels[event.status]}</strong>
            <p>{event.message}</p>
            <small>{new Date(event.created_at).toLocaleString('th-TH')}</small>
          </li>
        ))}
      </ol>
    </div>
  );
}
