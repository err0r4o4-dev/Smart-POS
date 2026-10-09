import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ArrowLeft, ArrowUpRight, ShieldCheck } from 'lucide-react';
import { Brand, Button, Tag } from '../components/ui/primitives';

export function AuthLayout({ children }: { children?: ReactNode } = {}) {
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
        <small>SmartPOS · Golden Amber Glass</small>
      </section>
      <section className="auth-form-section">
        <Link to="/dashboard" className="back-link">
          <ArrowLeft size={18} />
          Back to overview
        </Link>
        <div className="auth-form">
          {children ?? (
            <>
              <Tag tone="amber">Authentication layout preview</Tag>
              <h2>A secure start.</h2>
              <p>
                This is a presentation, not a working sign-in page.
                Authentication will be implemented in Phase 1.
              </p>
              <form
                onSubmit={(event) => event.preventDefault()}
                aria-label="Unavailable sign-in preview"
              >
                <fieldset disabled>
                  <label htmlFor="email">Email address</label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="off"
                    placeholder="Email input unavailable"
                  />
                  <label htmlFor="password">Password</label>
                  <input
                    id="password"
                    type="password"
                    autoComplete="off"
                    placeholder="Password input unavailable"
                  />
                  <Button type="submit" disabled>
                    Sign in unavailable
                  </Button>
                </fieldset>
              </form>
              <p className="auth-security">
                <ShieldCheck size={20} aria-hidden="true" />
                Planned: server sessions, CSRF protection and role-based access.
                No credentials are collected.
              </p>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
