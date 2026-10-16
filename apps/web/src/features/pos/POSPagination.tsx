import { useLanguage } from '../../app/language';
import { Button } from '../../components/ui/primitives';

export function POSPagination({
  page,
  total,
  busy,
  change,
}: {
  page: number;
  total: number;
  busy: boolean;
  change: (page: number) => void;
}) {
  const { t } = useLanguage();

  return (
    <div className="pos-pagination">
      <Button disabled={busy || page <= 1} onClick={() => change(page - 1)}>
        {t('catalog.previous')}
      </Button>
      <span>
        {t('catalog.page')} {page} {t('pos.total2')} {total}{' '}
        {t('catalog.definitions')}
      </span>
      <Button
        disabled={busy || page * 25 >= total}
        onClick={() => change(page + 1)}
      >
        {t('catalog.next')}
      </Button>
    </div>
  );
}
