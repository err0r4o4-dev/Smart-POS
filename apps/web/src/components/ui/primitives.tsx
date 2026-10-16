import { useLanguage } from '../../app/language';
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
    <span
      className={`brand ${compact ? 'brand-compact' : ''} ${className}`.trim()}
    >
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
export function Loading({ children }: { children?: ReactNode }) {
  const { t } = useLanguage();
  return (
    <p role="status" className="feedback">
      <LoaderCircle className="spin" size={18} aria-hidden="true" />
      {children ?? t('shell.checkingServiceReadiness')}
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
  const { t, localize } = useLanguage();

  return (
    <div role="alert" className="error-state">
      <AlertCircle size={20} aria-hidden="true" />
      <div>
        <strong>{t('shell.serviceNotReady')}</strong>
        <p>{localize(message ?? '')}</p>
        {retry && (
          <Button className="button-secondary" onClick={retry}>
            {t('shell.tryAgain')}
          </Button>
        )}
      </div>
    </div>
  );
}
