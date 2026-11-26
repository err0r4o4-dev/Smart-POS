import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useLanguage } from '../../app/language';
import { errorMessage } from '../../i18n';
import { Button } from '../../components/ui/primitives';

export function ShopError({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  const { t, language } = useLanguage();

  return (
    <div className="error-state" role="alert">
      <p>{errorMessage(language, error)}</p>
      {retry && (
        <Button className="button-secondary" onClick={retry}>
          {t('shell.tryAgain')}
        </Button>
      )}
    </div>
  );
}

export function ShopPagination({
  page,
  total,
  pageSize,
  change,
}: {
  page: number;
  total: number;
  pageSize: number;
  change: (page: number) => void;
}) {
  const { t, language } = useLanguage();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const countOnPage = total > 0 ? Math.max(0, end - start + 1) : 0;

  return (
    <nav
      className="shop-actions shop-pagination"
      aria-label={t('storefront.listing')}
    >
      <Button
        className="button-secondary catalog-pagination-btn catalog-pagination-prev"
        disabled={page <= 1}
        onClick={() => change(page - 1)}
      >
        <ChevronLeft size={16} aria-hidden="true" />
        {t('catalog.previous')}
      </Button>
      <div className="catalog-pagination-info">
        <span className="catalog-pagination-text">
          {language === 'th'
            ? `หน้า ${page} จาก ${totalPages} - แสดง ${countOnPage} จาก ${total} รายการ`
            : `Page ${page} of ${totalPages} - showing ${countOnPage} of ${total} items`}
        </span>
        <span className="catalog-visually-hidden">
          {t('catalog.page')} {page} · {total} {t('catalog.definitions')}
        </span>
      </div>
      <Button
        className="catalog-pagination-btn catalog-pagination-next"
        disabled={page * pageSize >= total}
        onClick={() => change(page + 1)}
      >
        {t('catalog.next')}
        <ChevronRight size={16} aria-hidden="true" />
      </Button>
    </nav>
  );
}
