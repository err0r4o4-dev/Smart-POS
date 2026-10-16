import { useLanguage } from '../../app/language';
import { Button, Loading } from '../ui/primitives';

export function QueryFeedback({
  loading,
  error,
  empty = false,
  retry,
  emptyMessage = 'ไม่พบข้อมูล ลองปรับเงื่อนไขค้นหาหรือเลือกสาขาอื่น',
}: {
  loading: boolean;
  error: unknown;
  empty?: boolean;
  retry?: () => void;
  emptyMessage?: string;
}) {
  const { t, localize } = useLanguage();

  if (error)
    return (
      <div role="alert" className="tenant-error">
        <p>
          {localize(
            (error instanceof Error
              ? error.message
              : t('shell.unableToLoadData')) ?? '',
          )}
        </p>
        {retry && (
          <Button
            className="button-secondary"
            onClick={retry}
            disabled={loading}
          >
            {t('shell.tryLoadingAgain')}
          </Button>
        )}
      </div>
    );
  if (loading) return <Loading>{t('shell.loadingData')}</Loading>;
  return empty ? <p role="status">{localize(emptyMessage)}</p> : null;
}
