import { useLanguage } from '../../app/language';
import { Tag } from '../../components/ui/primitives';
import { moneyText } from '../../lib/pos-api';
import { orderStatusLabels, type OnlineOrder } from '../../lib/storefront-api';
import {
  CheckCircle2,
  UtensilsCrossed,
} from 'lucide-react';

export function OrderDetails({
  order,
  staff = false,
}: {
  order: OnlineOrder;
  staff?: boolean;
}) {
  const { t, localize, formatDateTime, language } = useLanguage();

  const isPaid =
    order.payment_status === 'PAID_AT_STORE' ||
    ['PREPARING', 'READY', 'COMPLETED'].includes(order.status);
  const isPreparing = order.status === 'PREPARING';
  const isReady = order.status === 'READY';
  const isCompleted = order.status === 'COMPLETED';

  const timelineSteps = [
    {
      id: 'paid',
      label: language === 'th' ? 'ชำระเงินสำเร็จ' : 'Payment Verified',
      desc: isPaid
        ? language === 'th'
          ? 'ยืนยันการชำระเงินเรียบร้อย'
          : 'Payment verified'
        : language === 'th'
          ? 'รอการชำระเงิน'
          : 'Awaiting payment',
      isDone: isPaid,
      isActive: false,
    },
    {
      id: 'preparing',
      label: language === 'th' ? 'กำลังเตรียมอาหาร' : 'Preparing Order',
      desc: isPreparing
        ? language === 'th'
          ? 'ห้องครัวกำลังปรุงอาหารของคุณ'
          : 'Kitchen is preparing your dishes'
        : isReady || isCompleted
          ? language === 'th'
            ? 'อาหารปรุงเสร็จแล้ว'
            : 'Preparation finished'
          : '',
      isDone: isReady || isCompleted,
      isActive: isPreparing,
    },
    {
      id: 'ready',
      label: language === 'th' ? 'พร้อมเสิร์ฟ' : 'Ready to Serve',
      desc: isReady
        ? language === 'th'
          ? 'อาหารพร้อมเสิร์ฟ/พร้อมรับที่เคาน์เตอร์'
          : 'Ready for table serving or pickup'
        : isCompleted
          ? language === 'th'
            ? 'พร้อมเสิร์ฟแล้ว'
            : 'Ready'
          : '',
      isDone: isCompleted,
      isActive: isReady,
    },
    {
      id: 'completed',
      label: language === 'th' ? 'เสิร์ฟแล้ว' : 'Served & Completed',
      desc: isCompleted
        ? language === 'th'
          ? 'เสิร์ฟอาหารเรียบร้อยแล้ว ขอให้อร่อยกับมื้ออาหาร!'
          : 'Served successfully. Enjoy your meal!'
        : '',
      isDone: isCompleted,
      isActive: false,
    },
  ];

  return (
    <div className="online-order-detail">
      <div className="shop-actions">
        <h2>{order.number}</h2>
        <Tag tone={order.status === 'COMPLETED' ? 'success' : 'amber'}>
          {localize(orderStatusLabels[order.status])}
        </Tag>
      </div>

      {order.table_code && (
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px', background: '#FFF3CA', border: '1px solid #F8CA49', borderRadius: 8, fontWeight: 700, color: '#111B38', marginBottom: 12 }}>
          <UtensilsCrossed size={16} aria-hidden="true" />
          <span>โต๊ะ {order.table_code}</span>
        </div>
      )}

      {/* 4-Step Dine-in Order Lifecycle Stepper (Image #1 Step 7) */}
      <section className="dinein-tracking-stepper" aria-label="สถานะคำสั่งซื้อ">
        <div className="dinein-step-list">
          {timelineSteps.map((step, idx) => (
            <div
              key={step.id}
              className={`dinein-step-item ${step.isDone ? 'done' : ''} ${step.isActive ? 'active' : ''}`}
            >
              <div className="dinein-step-circle">
                {step.isDone ? (
                  <CheckCircle2 size={20} className="icon-done" />
                ) : step.isActive ? (
                  <span className="dinein-step-pulse" />
                ) : (
                  <span>{idx + 1}</span>
                )}
              </div>
              <div className="dinein-step-info">
                <strong>{step.label}</strong>
                {step.desc && <small>{step.desc}</small>}
              </div>
            </div>
          ))}
        </div>
      </section>

      <p>
        {order.payment_status === 'PAID_AT_STORE'
          ? order.status === 'COMPLETED'
            ? t('storefront.paidAndSaleSavedInStore')
            : language === 'th'
              ? 'ยืนยันการชำระเงินแล้ว'
              : 'Payment verified'
          : language === 'th'
            ? 'ยังไม่ชำระเงิน'
            : 'Unpaid'}
      </p>

      {staff && (
        <p>
          {t('storefront.recipient')} {order.customer_name} ·{' '}
          {order.contact_phone}
          <br />
          {t('storefront.customerNote')} {order.customer_note || '—'}
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
        {t('storefront.estimatedTotalAtOrderTime')}{' '}
        <strong>฿{moneyText(order.estimated_total)}</strong>
      </p>

      {order.final_total && (
        <p>
          {t('storefront.actualSaleTotal')}{' '}
          <strong>฿{moneyText(order.final_total)}</strong>{' '}
          {t('storefront.receipt')} {order.receipt_number}
        </p>
      )}

      <p>
        {t('storefront.pickupAt')} {order.store_name}
        <br />
        {order.pickup_instructions}
        <br />
        {t('storefront.contactStore')}{' '}
        {order.store_phone || t('storefront.viewStoreContactDetails')}
      </p>

      {['PENDING', 'PREPARING', 'READY'].includes(order.status) && (
        <p className="notice">
          {t('storefront.waitForTheStoreToConfirmPickup')}{' '}
          {formatDateTime(order.expires_at)}
        </p>
      )}

      <h3>{t('storefront.progress')}</h3>
      <ol className="shop-timeline">
        {order.events.map((event, index) => (
          <li key={`${event.created_at}:${index}`}>
            <strong>{localize(orderStatusLabels[event.status])}</strong>
            <p>{event.message}</p>
            <small>{formatDateTime(event.created_at)}</small>
          </li>
        ))}
      </ol>
    </div>
  );
}