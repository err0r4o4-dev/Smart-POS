import { Link } from 'react-router-dom';
import { ArrowLeft, ShieldX, Unplug } from 'lucide-react';
import { Tag } from '../../components/ui/primitives';

export function SystemPage({ forbidden = false }: { forbidden?: boolean }) {
  const Icon = forbidden ? ShieldX : Unplug;
  return (
    <main id="main-content" className="standalone">
      <Icon size={54} strokeWidth={1.3} aria-hidden="true" />
      <Tag tone="amber">
        {forbidden ? '403 · ACCESS DENIED' : '404 · NOT FOUND'}
      </Tag>
      <h1 tabIndex={-1}>
        {forbidden ? 'This space is restricted.' : 'Nothing on this shelf.'}
      </h1>
      <p>
        {forbidden
          ? 'บัญชีหรือบทบาทปัจจุบันไม่มีสิทธิ์เข้าถึงหน้านี้ กรุณากลับพื้นที่ทำงานหรือติดต่อเจ้าของร้าน'
          : 'This page does not exist or is a planned feature that is not yet available.'}
      </p>
      <Link to="/workspace" className="button">
        <ArrowLeft size={18} aria-hidden="true" />
        กลับพื้นที่ทำงาน
      </Link>
    </main>
  );
}
