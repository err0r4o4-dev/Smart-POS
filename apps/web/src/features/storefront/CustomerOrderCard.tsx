import { CheckCircle2, Circle, UtensilsCrossed } from 'lucide-react';
import { useLanguage } from '../../app/language';
import { moneyText } from '../../lib/pos-api';
import {
  orderStatusLabels,
  type OnlineOrder,
  type OrderStatus,
} from '../../lib/storefront-api';

const flow: OrderStatus[] = ['PENDING', 'PREPARING', 'READY', 'COMPLETED'];
const endings: OrderStatus[] = ['REJECTED', 'CANCELLED', 'EXPIRED'];

type Step = {
  status: OrderStatus;
  state: 'done' | 'current' | 'pending';
  at?: string;
  /** Store-written reason the customer is told they will see (reject/cancel). */
  note?: string;
};

/** Full PENDING→COMPLETED sequence; an ending status replaces the unreached steps. */
function timelineSteps(order: OnlineOrder): Step[] {
  const firstAt = (status: OrderStatus) =>
    order.events.find((event) => event.status === status)?.created_at;
  const ended = endings.includes(order.status);
  const reached = ended
    ? Math.max(0, ...order.events.map((event) => flow.indexOf(event.status)))
    : Math.max(0, flow.indexOf(order.status));
  const steps: Step[] = flow
    .slice(0, ended ? reached + 1 : flow.length)
    .map((status, index) => ({
      status,
      state:
        ended || index < reached
          ? 'done'
          : index === reached
            ? order.status === 'COMPLETED'
              ? 'done'
              : 'current'
            : 'pending',
      at: index <= reached ? firstAt(status) : undefined,
    }));
  if (ended) {
    const ending = order.events
      .filter((event) => event.status === order.status)
      .at(-1);
    steps.push({
      status: order.status,
      state: 'current',
      at: ending?.created_at,
      note: ending?.message?.trim() || undefined,
    });
  }
  return steps;
}

export function CustomerOrderCard({ order }: { order: OnlineOrder }) {
  const { t, localize, formatDateTime, language } = useLanguage();
  const steps = timelineSteps(order);
  const lastIndex = steps.length - 1;
  const total = order.final_total ?? order.estimated_total;

  return (
    <section
      className="customer-order-card"
      aria-labelledby="customer-order-store"
    >
      <div className="customer-order-summary">
        <span className="customer-order-thumb" aria-hidden="true">
          <UtensilsCrossed size={26} />
        </span>
        <div className="customer-order-copy">
          <h2 id="customer-order-store">{order.store_name}</h2>
          <p>
            {t('storefront.customer.trackingOrderNumber', {
              number: order.number,
            })}
          </p>
          <p>
            <span>
              {t('storefront.customer.trackingItems', {
                count: order.items.length.toLocaleString(language),
              })}
            </span>
            {' · '}
            <strong>฿{moneyText(total)}</strong>
          </p>
        </div>
        <span className="customer-order-status">
          {localize(orderStatusLabels[order.status])}
        </span>
      </div>
      <ol
        className="customer-timeline"
        aria-label={t('storefront.customer.trackingTimeline')}
      >
        {steps.map((step, index) => (
          <li
            key={step.status}
            className={`customer-timeline-step is-${step.state}`}
            aria-current={step.state === 'current' ? 'step' : undefined}
          >
            <span className="customer-timeline-marker" aria-hidden="true">
              {step.state === 'done' ? (
                <CheckCircle2 size={22} />
              ) : (
                <Circle size={22} />
              )}
            </span>
            <span className="customer-timeline-copy">
              <strong>
                {step.status === 'PENDING'
                  ? t('storefront.customer.trackingStepReceived')
                  : localize(orderStatusLabels[step.status])}
              </strong>
              <small>
                {step.state === 'done'
                  ? t('storefront.customer.trackingStepDone')
                  : step.state === 'current'
                    ? t('storefront.customer.trackingStepCurrent')
                    : t('storefront.customer.trackingStepPending')}
                {step.at && (
                  <>
                    {' · '}
                    <time dateTime={step.at}>{formatDateTime(step.at)}</time>
                  </>
                )}
              </small>
              {step.note && (
                <span className="customer-timeline-note">{step.note}</span>
              )}
            </span>
            {index < lastIndex && (
              <span className="customer-timeline-line" aria-hidden="true" />
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
