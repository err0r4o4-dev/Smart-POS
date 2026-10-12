import { useState } from 'react';
import { useWorkspaceNavigate as useNavigate } from '../../app/useWorkspaceNavigate';
import { useQuery } from '@tanstack/react-query';
import { Button, Card } from '../../components/ui/primitives';
import { QueryFeedback } from '../../components/feedback/QueryFeedback';
import {
  posRequest,
  type POSPage,
  type POSCart,
  type CartSummary,
} from '../../lib/pos-api';
import { usePOS } from './POSContext';
import { POSPagination } from './POSPagination';

export function HeldCartsPage() {
  const pos = usePOS();
  const [page, setPage] = useState(1);
  const navigate = useNavigate();
  const query = useQuery({
    queryKey: [
      'tenant',
      pos.user,
      pos.org,
      'pos',
      pos.branch,
      'held',
      page,
      pos.terminal?.id,
    ],
    queryFn: ({ signal }) =>
      posRequest<POSPage<CartSummary>>(
        pos.org,
        `/pos/carts?status=HELD&branch_id=${pos.branch}&terminal_id=${pos.terminal?.id}&page=${page}`,
        { signal },
      ),
    enabled: !!pos.terminal,
  });
  return (
    <>
      <h1>ตะกร้าพัก</h1>
      <p>
        เฉพาะตะกร้าของคุณในเครื่องนี้ ไม่สำรองสต็อก
        ราคาจะตรวจสอบใหม่เมื่อกลับมาขาย
      </p>
      <QueryFeedback
        loading={query.isFetching}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {query.data?.items.map((item) => (
        <Card key={item.id}>
          <p>
            ตะกร้า {item.id.slice(0, 8)} ·{' '}
            {new Date(item.updated_at).toLocaleString('th-TH')}
          </p>
          <Button
            disabled={pos.busy || !pos.shift}
            onClick={() =>
              void (async () => {
                const result = await pos.mutate<POSCart>(
                  `/pos/carts/${item.id}/resume`,
                  { revision: item.revision, terminal_id: pos.terminal?.id },
                );
                if (result) {
                  pos.setCart(result.id);
                  if (result.customer_cleared)
                    pos.setMessage(
                      'ลูกค้าที่ถูกเก็บถาวรถูกนำออกแล้ว — Walk-in กรุณาตรวจสอบก่อนชำระเงิน',
                    );
                  if (result.review_required)
                    pos.setMessage('ราคา / สถานะ / สต็อกเปลี่ยน กรุณาตรวจสอบ');
                  navigate('/pos');
                }
              })()
            }
          >
            กลับมาขาย
          </Button>
          <Button
            disabled={pos.busy}
            onClick={() =>
              void pos.mutate(`/pos/carts/${item.id}/cancel`, {
                revision: item.revision,
              })
            }
          >
            ยกเลิกตะกร้า
          </Button>
        </Card>
      ))}
      {query.data?.total === 0 && <p>ไม่มีตะกร้าพัก</p>}
      <POSPagination
        page={page}
        total={query.data?.total ?? 0}
        busy={query.isFetching}
        change={setPage}
      />
    </>
  );
}
