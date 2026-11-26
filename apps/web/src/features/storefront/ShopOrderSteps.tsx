import { Check } from 'lucide-react';
import { useLanguage } from '../../app/language';

export function ShopOrderSteps({ active }: { active: 1 | 2 | 3 }) {
  const { language } = useLanguage();
  const labels =
    language === 'th'
      ? ['ตะกร้าสินค้า', 'ยืนยันคำสั่งซื้อ', 'ติดตามออเดอร์']
      : ['Shopping cart', 'Confirm order', 'Track order'];

  return (
    <nav
      className="shop-order-steps"
      aria-label={language === 'th' ? 'ขั้นตอนการสั่งซื้อ' : 'Order steps'}
    >
      <ol>
        {labels.map((label, index) => (
          <li
            key={label}
            aria-current={index + 1 === active ? 'step' : undefined}
            data-complete={index + 1 < active}
          >
            <span className="shop-step-number" aria-hidden="true">
              {index + 1 < active ? <Check size={16} /> : index + 1}
            </span>
            <span>{label}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
