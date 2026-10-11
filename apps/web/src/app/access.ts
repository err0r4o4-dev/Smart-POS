export type Role =
  'OWNER' | 'MANAGER' | 'CASHIER' | 'INVENTORY_STAFF' | 'PURCHASING_STAFF';
export type Session =
  | { authenticated: false }
  | { authenticated: true; role: Role; permissions: string[] };
export const anonymousSession: Session = { authenticated: false };

export type WorkspaceArea = 'management' | 'staff' | 'account';
export const managementRoles: Role[] = ['OWNER', 'MANAGER'];
export const roleLabels: Record<Role, string> = {
  OWNER: 'เจ้าของร้าน',
  MANAGER: 'ผู้จัดการ',
  CASHIER: 'แคชเชียร์',
  INVENTORY_STAFF: 'พนักงานคลัง',
  PURCHASING_STAFF: 'พนักงานจัดซื้อ',
};

export function isManagementRole(role: Role) {
  return managementRoles.includes(role);
}

export function workspaceHome(role: Role) {
  return isManagementRole(role) ? '/manage/dashboard' : '/work';
}

export function canAccess(
  session: Session,
  permission?: string,
  roles?: Role[],
): boolean {
  if (!permission && !roles) return true;
  if (!session.authenticated) return false;
  return (
    (!roles || roles.includes(session.role)) &&
    (!permission || session.permissions.includes(permission))
  );
}
