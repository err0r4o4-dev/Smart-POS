import { Button } from '../ui/primitives';

export function PageError() {
  return (
    <main className="standalone" role="alert">
      <h1>ไม่สามารถแสดงหน้านี้ได้</h1>
      <p>
        ลองโหลดหน้าอีกครั้ง หากกำลังบันทึกหรือชำระเงิน
        ให้ตรวจสอบสถานะรายการก่อนทำซ้ำ
      </p>
      <Button onClick={() => window.location.reload()}>โหลดหน้าอีกครั้ง</Button>
    </main>
  );
}
