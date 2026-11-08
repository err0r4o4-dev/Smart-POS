import type { ReactNode } from 'react';
import { LoginLayout } from './LoginLayout';

export function AuthLayout({
  children,
  titleId = 'account-title',
  story = 'recover',
}: {
  children: ReactNode;
  titleId?: string;
  story?: 'recover' | 'reset';
}) {
  return (
    <LoginLayout titleId={titleId} story={story}>
      {children}
    </LoginLayout>
  );
}
