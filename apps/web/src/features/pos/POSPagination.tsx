import { ChevronLeft, ChevronRight } from 'lucide-react';
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
    <div className="pos-pagination sales-pagination-bar">
      <div className="sales-pagination-info">
        <span>
          {t('catalog.page')} {page} {t('pos.total2')} {total}{' '}
          {t('catalog.definitions')}
        </span>
      </div>
      <div className="sales-pagination-controls">
        <Button
          className="button-secondary"
          disabled={busy || page <= 1}
          onClick={() => change(page - 1)}
        >
          <ChevronLeft size={15} aria-hidden="true" />
          <span>{t('catalog.previous')}</span>
        </Button>
        <strong className="sales-page-number active">{page}</strong>
        <Button
          className="button-secondary"
          disabled={busy || page * 25 >= total}
          onClick={() => change(page + 1)}
        >
          <span>{t('catalog.next')}</span>
          <ChevronRight size={15} aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
