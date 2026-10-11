import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { WorkspaceLink as Link } from '../../app/WorkspaceNavigation';
import { useWorkspaceNavigate } from '../../app/useWorkspaceNavigate';
import { Button, Card, Loading } from '../../components/ui/primitives';
import { posRequest, moneyText, type POSCart } from '../../lib/pos-api';
import type { OnlineOrder } from '../../lib/storefront-api';
import { usePOS } from '../pos/POSContext';
import { ShopError } from './StorefrontPage';

export function OnlineOrderPOS() {
  const pos = usePOS();
  const navigate = useWorkspaceNavigate();
  const [params] = useSearchParams();
  const id = params.get('online_order') ?? '';
  const order = useQuery({
    queryKey: [
      'tenant',
      pos.user,
      pos.org,
      pos.branch,
      'online-order-entry',
      id,
    ],
    queryFn: ({ signal }) =>
      posRequest<OnlineOrder>(pos.org, `/online-orders/${id}`, { signal }),
    enabled: !!id && pos.can('online_orders.read'),
    retry: false,
  });
  if (!id) return null;
  if (!pos.can('online_orders.read'))
    return <ShopError error={new Error('ไม่มีสิทธิ์เข้าถึงออเดอร์ออนไลน์')} />;
  if (order.isPending) return <Loading>กำลังตรวจออเดอร์ออนไลน์…</Loading>;
  if (order.error || !order.data)
    return <ShopError error={order.error} retry={() => void order.refetch()} />;
  const value = order.data;
  const sourceMatches = pos.terminal?.id === value.terminal_id;
  const occupied = !!pos.cart?.items.length && pos.cart.id !== value.cart_id;
  return (
    <Card className="online-pos-entry">
      <h2>รับสินค้า: {value.number}</h2>
      <p>
        {value.customer_name} · ยอดประมาณการตอนสั่ง ฿
        {moneyText(value.estimated_total)}
      </p>
      <p>
        ตรวจรายการ lot สต็อก และยอดล่าสุดกับลูกค้าก่อนรับชำระ
        การเปิดตะกร้ายังไม่สร้างยอดขาย
      </p>
      {value.status !== 'READY' && (
        <p role="alert">
          ออเดอร์ยังไม่พร้อมรับหรือปิดไปแล้ว กรุณาตรวจสถานะก่อน
        </p>
      )}
      {!sourceMatches && (
        <Button
          className="button-secondary"
          disabled={
            pos.busy ||
            !pos.terminals.some((terminal) => terminal.id === value.terminal_id)
          }
          onClick={() =>
            value.terminal_id && pos.setTerminal(value.terminal_id)
          }
        >
          เลือกเครื่องขายของออเดอร์
        </Button>
      )}
      {!sourceMatches &&
        !pos.terminals.some(
          (terminal) => terminal.id === value.terminal_id,
        ) && (
          <p role="status">
            เลือกสาขาของออเดอร์จากตัวเลือกสาขาก่อน แล้วเปิดออเดอร์นี้อีกครั้ง
          </p>
        )}
      {sourceMatches && !pos.shift && (
        <p>
          ต้อง <Link to="/pos/register/open">เปิดกะของคุณ</Link>{' '}
          แล้วกลับมาเปิดออเดอร์จากรายการ
        </p>
      )}
      {occupied && (
        <p role="status">
          พักหรือยกเลิกตะกร้าปัจจุบันก่อน เพื่อไม่ทับงานขายที่กำลังทำ
        </p>
      )}
      <div className="shop-actions">
        <Button
          disabled={
            pos.busy ||
            !sourceMatches ||
            !pos.shift ||
            occupied ||
            value.status !== 'READY' ||
            !pos.can('online_orders.manage')
          }
          onClick={() =>
            void (async () => {
              const cart = await pos.mutate<POSCart>(
                `/online-orders/${value.id}/pos-cart`,
                { revision: value.revision },
              );
              if (!cart) return;
              pos.setCart(cart.id);
              pos.setMessage(
                `เปิด ${value.number} เข้า POS แล้ว — ทบทวนยอดกับลูกค้าก่อนชำระ`,
              );
              navigate('/pos');
            })()
          }
        >
          เปิดตะกร้าออเดอร์นี้
        </Button>
        <Link to={`/online-orders/${value.id}`}>กลับรายละเอียดออเดอร์</Link>
      </div>
    </Card>
  );
}
