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
  if (error)
    return (
      <div role="alert" className="tenant-error">
        <p>{error instanceof Error ? error.message : 'โหลดข้อมูลไม่สำเร็จ'}</p>
        {retry && (
          <Button
            className="button-secondary"
            onClick={retry}
            disabled={loading}
          >
            ลองโหลดข้อมูลอีกครั้ง
          </Button>
        )}
      </div>
    );
  if (loading) return <Loading>กำลังโหลดข้อมูล…</Loading>;
  return empty ? <p role="status">{emptyMessage}</p> : null;
}
