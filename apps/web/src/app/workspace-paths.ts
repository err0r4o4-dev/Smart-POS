export type BusinessArea = 'management';

const businessRoots = [
  '/dashboard',
  '/pos',
  '/orders',
  '/kitchen',
  '/menu',
  '/sales',
  '/receipts',
  '/refunds',
  '/settings',
];

function matchesRoot(pathname: string, root: string) {
  return pathname === root || pathname.startsWith(root + '/');
}

export function isBusinessPath(path: string) {
  const pathname = path.split(/[?#]/, 1)[0];
  return businessRoots.some((root) => matchesRoot(pathname, root));
}

export function businessArea(pathname: string): BusinessArea | undefined {
  if (isBusinessPath(pathname)) return 'management';
  return undefined;
}

export function workspacePath(path: string, _area?: BusinessArea) {
  void _area;
  return path;
}
