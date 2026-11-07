import type { UseQueryResult } from '@tanstack/react-query';
import { ErrorState, Loading } from '../../components/ui/primitives';

export function QueryState({
  query,
}: {
  query: Pick<UseQueryResult<unknown>, 'isPending' | 'error' | 'refetch'>;
}) {
  if (query.isPending) return <Loading />;
  if (query.error)
    return (
      <ErrorState
        message={
          query.error instanceof Error
            ? query.error.message
            : 'โหลดข้อมูลไม่สำเร็จ'
        }
        retry={() => {
          void query.refetch();
        }}
      />
    );
  return null;
}

export function CommandState({
  command,
}: {
  command: { error: unknown; isSuccess: boolean; uncertain: boolean };
}) {
  return (
    <>
      {command.error ? (
        <ErrorState
          message={
            command.error instanceof Error
              ? command.error.message
              : 'บันทึกไม่สำเร็จ'
          }
        />
      ) : null}
      {command.uncertain ? (
        <p role="status">
          ยังไม่ทราบผลการบันทึก กดบันทึกอีกครั้งเพื่อตรวจรายการเดิม
          ระบบจะไม่สร้างรายการซ้ำ
        </p>
      ) : null}
      {command.isSuccess ? <p role="status">บันทึกข้อมูลแล้ว</p> : null}
    </>
  );
}
