import { describe, expect, it } from 'vitest';
import { isManagementRole, workspaceHome, type Role } from './access';

describe('owner-only workspace', () => {
  it('allows OWNER to enter management', () => {
    expect(isManagementRole('OWNER')).toBe(true);
    expect(workspaceHome('OWNER')).toBe('/dashboard');
  });
  it.each<Role>(['MANAGER', 'CASHIER', 'INVENTORY_STAFF', 'PURCHASING_STAFF'])(
    'denies %s management workspace home',
    (role) => {
      expect(isManagementRole(role)).toBe(false);
      expect(workspaceHome(role)).toBe('/403');
    },
  );
});
