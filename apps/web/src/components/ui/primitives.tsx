import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { AlertCircle, LoaderCircle, ShoppingBag } from 'lucide-react';

export function Button({
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={`button ${className}`} {...props} />;
}
export function Card({
  className = '',
  ...props
}: HTMLAttributes<HTMLElement>) {
  return <section className={`card ${className}`} {...props} />;
}
export function Tag({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: 'neutral' | 'amber' | 'success' | 'error';
}) {
  return <span className={`tag tag-${tone}`}>{children}</span>;
}
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="brand">
      <span className="brand-mark">
        <ShoppingBag size={23} aria-hidden="true" />
      </span>
      {!compact && (
        <span>
          Smart<span className="brand-light">POS</span>
          <small>INTELLIGENT RETAIL</small>
        </span>
      )}
    </span>
  );
}
export function Loading({
  children = 'Checking service readiness…',
}: {
  children?: ReactNode;
}) {
  return (
    <p role="status" className="feedback">
      <LoaderCircle className="spin" size={18} aria-hidden="true" />
      {children}
    </p>
  );
}
export function ErrorState({
  message,
  retry,
}: {
  message: string;
  retry?: () => void;
}) {
  return (
    <div role="alert" className="error-state">
      <AlertCircle size={20} aria-hidden="true" />
      <div>
        <strong>Service not ready</strong>
        <p>{message}</p>
        {retry && (
          <Button className="button-secondary" onClick={retry}>
            Try again
          </Button>
        )}
      </div>
    </div>
  );
}
