import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { Brand, Tag } from '../components/ui/primitives';

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main id="main-content" className="auth-shell">
      <section className="auth-story">
        <Brand />
        <div>
          <Tag tone="amber">INTELLIGENT RETAIL</Tag>
          <h1 tabIndex={-1}>
            Less complexity.
            <br />
            More possibility.
          </h1>
          <p>One connected workspace for the way your store works.</p>
          <div className="auth-art" aria-hidden="true">
            <span />
            <span />
            <span />
            <ArrowUpRight size={88} />
          </div>
        </div>
        <small>VELO · Smart POS Platform</small>
      </section>
      <section className="auth-form-section">
        <Link to="/" className="back-link">
          <ArrowLeft size={18} />
          กลับหน้าหลักและทางเข้า
        </Link>
        <div className="auth-form">{children}</div>
      </section>
    </main>
  );
}
