export type BusinessArea = 'management';

const businessRoots = [
  '/restaurant',
  '/products',
  '/categories',
  '/brands',
  '/units',
  '/inventory',
  '/suppliers',
  '/purchasing',
  '/sales',
  '/receipts',
  '/pos',
  '/customers',
  '/online-orders',
  '/loyalty',
  '/pricing',
  '/promotions',
  '/discount-approvals',
  '/settings',
];

function matchesRoot(pathname: string, root: string) {
  return pathname === root || pathname.startsWith(root + '/');
}

export function businessArea(pathname: string): BusinessArea | undefined {
  if (matchesRoot(pathname, '/manage')) return 'management';
  return undefined;
}

export function isBusinessPath(path: string) {
  const pathname = path.split(/[?#]/, 1)[0];
  return businessRoots.some((root) => matchesRoot(pathname, root));
}

export function workspacePath(path: string, area?: BusinessArea) {
  if (!area || !isBusinessPath(path)) return path;
  return '/manage' + path;
}
