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
  return (
    <div className="pos-pagination">
      <Button disabled={busy || page <= 1} onClick={() => change(page - 1)}>
        ก่อนหน้า
      </Button>
      <span>
        หน้า {page} · ทั้งหมด {total} รายการ
      </span>
      <Button
        disabled={busy || page * 25 >= total}
        onClick={() => change(page + 1)}
      >
        ถัดไป
      </Button>
    </div>
  );
}
