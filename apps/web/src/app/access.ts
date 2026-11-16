export type Role = 'OWNER';
export type Session =
  | { authenticated: false }
  | { authenticated: true; role: string; permissions: string[] };
export const anonymousSession: Session = { authenticated: false };

export type WorkspaceArea = 'management' | 'account';
export const managementRoles: Role[] = ['OWNER'];
export const roleLabels: Record<Role, string> = {
  OWNER: 'เจ้าของร้าน',
};

export function isManagementRole(role: string): role is Role {
  return role === 'OWNER';
}

export function workspaceHome(role: string) {
  return isManagementRole(role) ? '/dashboard' : '/403';
}

export function canAccess(
  session: Session,
  permission?: string,
  roles?: Role[],
): boolean {
  if (!permission && !roles) return true;
  if (!session.authenticated || !isManagementRole(session.role)) return false;
  return (
    (!roles || roles.includes(session.role)) &&
    (!permission || session.permissions.includes(permission))
  );
}
