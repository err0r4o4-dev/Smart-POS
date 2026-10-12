import { Button } from '../../components/ui/primitives';

export function ShopError({
  error,
  retry,
}: {
  error: unknown;
  retry?: () => void;
}) {
  return (
    <div className="error-state" role="alert">
      <p>
        {error instanceof Error ? error.message : 'ไม่พบข้อมูลที่เข้าถึงได้'}
      </p>
      {retry && (
        <Button className="button-secondary" onClick={retry}>
          ลองอีกครั้ง
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
  return (
    <nav className="shop-actions shop-pagination" aria-label="หน้ารายการ">
      <Button
        className="button-secondary"
        disabled={page <= 1}
        onClick={() => change(page - 1)}
      >
        ก่อนหน้า
      </Button>
      <span>
        หน้า {page} · {total} รายการ
      </span>
      <Button
        className="button-secondary"
        disabled={page * pageSize >= total}
        onClick={() => change(page + 1)}
      >
        ถัดไป
      </Button>
    </nav>
  );
}
