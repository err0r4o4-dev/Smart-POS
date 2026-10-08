export type Role =
  'OWNER' | 'MANAGER' | 'CASHIER' | 'INVENTORY_STAFF' | 'PURCHASING_STAFF';
export type Session =
  | { authenticated: false }
  | { authenticated: true; role: Role; permissions: string[] };
export const anonymousSession: Session = { authenticated: false };

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
