import type { Role } from './access';

export const paths = {
  dashboard: '/dashboard',
  posPreview: '/preview/pos',
  authPreview: '/preview/auth',
  help: '/help',
  forbidden: '/403',
  notFound: '/404',
} as const;

export interface NavigationItem {
  to: string;
  label: string;
  icon: 'dashboard' | 'pos' | 'auth' | 'help';
  permission?: string;
  roles?: Role[];
}
export const navigation: NavigationItem[] = [
  { to: paths.dashboard, label: 'Overview', icon: 'dashboard' },
  { to: paths.posPreview, label: 'POS layout', icon: 'pos' },
  { to: paths.authPreview, label: 'Authentication layout', icon: 'auth' },
  { to: paths.help, label: 'Getting started', icon: 'help' },
];
