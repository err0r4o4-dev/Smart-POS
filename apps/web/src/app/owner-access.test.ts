import { describe, expect, it } from 'vitest';
import { isManagementRole, workspaceHome, type Role } from './access';

describe('owner-only workspace', () => {
  it('allows OWNER to enter management', () => {
    expect(isManagementRole('OWNER')).toBe(true);
    expect(workspaceHome('OWNER')).toBe('/manage/dashboard');
  });
  it.each<Role>(['MANAGER', 'CASHIER', 'INVENTORY_STAFF', 'PURCHASING_STAFF'])(
    'keeps %s in the neutral account area',
    (role) => {
      expect(isManagementRole(role)).toBe(false);
      expect(workspaceHome(role)).toBe('/account');
    },
  );
});
