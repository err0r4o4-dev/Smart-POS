import { useLanguage } from '../../app/language';
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
  const { t, formatDateTime } = useLanguage();

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
      <h1>{t('pos.heldCarts')}</h1>
      <p>{t('pos.yourCartsOnThisDeviceOnlyStock')}</p>
      <QueryFeedback
        loading={query.isFetching}
        error={query.error}
        retry={() => void query.refetch()}
      />
      {query.data?.items.map((item) => (
        <Card key={item.id}>
          <p>
            {t('pos.cart')} {item.id.slice(0, 8)} ·{' '}
            {formatDateTime(item.updated_at)}
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
                      t('pos.archivedCustomerRemovedWalkInSaleReview'),
                    );
                  if (result.review_required)
                    pos.setMessage(
                      t('pos.priceStatusStockChangedPleaseReview'),
                    );
                  navigate('/pos');
                }
              })()
            }
          >
            {t('pos.resumeSale')}
          </Button>
          <Button
            disabled={pos.busy}
            onClick={() =>
              void pos.mutate(`/pos/carts/${item.id}/cancel`, {
                revision: item.revision,
              })
            }
          >
            {t('pos.cancelCart')}
          </Button>
        </Card>
      ))}
      {query.data?.total === 0 && <p>{t('pos.noHeldCarts')}</p>}
      <POSPagination
        page={page}
        total={query.data?.total ?? 0}
        busy={query.isFetching}
        change={setPage}
      />
    </>
  );
}
