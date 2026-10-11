export type BusinessArea = 'management' | 'staff';

const businessRoots = [
  '/products',
  '/categories',
  '/brands',
  '/units',
  '/inventory',
  '/suppliers',
  '/purchasing',
  '/shelves',
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
  '/employees',
  '/roles',
];
const managementRoots = [
  '/settings',
  '/employees',
  '/roles',
  '/pricing',
  '/promotions',
  '/discount-approvals',
];

function matchesRoot(pathname: string, root: string) {
  return pathname === root || pathname.startsWith(root + '/');
}

export function businessArea(pathname: string): BusinessArea | undefined {
  if (matchesRoot(pathname, '/manage')) return 'management';
  if (matchesRoot(pathname, '/work')) return 'staff';
  return undefined;
}

export function isBusinessPath(path: string) {
  const pathname = path.split(/[?#]/, 1)[0];
  return businessRoots.some((root) => matchesRoot(pathname, root));
}

export function isManagementPath(path: string) {
  return managementRoots.some((root) =>
    matchesRoot(path.split(/[?#]/, 1)[0], root),
  );
}

export function workspacePath(path: string, area?: BusinessArea) {
  if (!area || !isBusinessPath(path)) return path;
  return (
    (area === 'management' || isManagementPath(path) ? '/manage' : '/work') +
    path
  );
}
