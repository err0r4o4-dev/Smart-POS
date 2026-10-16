import { useLanguage } from '../../app/language';
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
  const { t, localize, formatDateTime } = useLanguage();

  return (
    <div className="online-order-detail">
      <div className="shop-actions">
        <h2>{order.number}</h2>
        <Tag tone={order.status === 'COMPLETED' ? 'success' : 'amber'}>
          {localize(orderStatusLabels[order.status])}
        </Tag>
      </div>
      <p>
        {order.payment_status === 'PAID_AT_STORE'
          ? t('storefront.paidAndSaleSavedInStore')
          : t('storefront.unpaidPickUpAndPayInStore')}
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
