import { useLanguage } from '../../app/language';
import { Button } from '../../components/ui/primitives';

export function ShopError({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  const { t, localize } = useLanguage();

  return (
    <div className="error-state" role="alert">
      <p>
        {localize(
          (error instanceof Error
            ? error.message
            : t('storefront.noAccessibleDataFound')) ?? '',
        )}
      </p>
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
  const { t } = useLanguage();

  return (
    <nav
      className="shop-actions shop-pagination"
      aria-label={t('storefront.listing')}
    >
      <Button
        className="button-secondary"
        disabled={page <= 1}
        onClick={() => change(page - 1)}
      >
        {t('catalog.previous')}
      </Button>
      <span>
        {t('catalog.page')} {page} · {total} {t('catalog.definitions')}
      </span>
      <Button
        className="button-secondary"
        disabled={page * pageSize >= total}
        onClick={() => change(page + 1)}
      >
        {t('catalog.next')}
      </Button>
    </nav>
  );
}
