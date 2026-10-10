import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import { AlertCircle, LoaderCircle } from 'lucide-react';
import logoMark from '../../assets/logo-mark.png';

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
export function Brand({
  compact = false,
  className = '',
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <span className={`brand ${compact ? 'brand-compact' : ''} ${className}`.trim()}>
      <span className="brand-mark">
        <img src={logoMark} alt="VELO Icon" className="brand-mark-img" />
      </span>
      {!compact && (
        <span>
          VELO<span className="brand-light">POS</span>
          <small>SMART POS PLATFORM</small>
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
