import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  anonymousSession,
  canAccess,
  managementRoles,
  roleLabels,
  type Role,
} from './access';

describe('access foundation', () => {
  it('allows public presentations only for anonymous visitors', () => {
    expect(canAccess(anonymousSession)).toBe(true);
    expect(canAccess(anonymousSession, 'pos.checkout')).toBe(false);
  });
  it('requires both permission and allowed role', () => {
    const owner = {
      authenticated: true as const,
      role: 'OWNER' as const,
      permissions: ['pos.checkout'],
    };
    expect(canAccess(owner, 'pos.checkout', ['OWNER'])).toBe(true);
    expect(canAccess(owner, 'inventory.adjust')).toBe(false);
    expect(canAccess(owner, 'pos.checkout', [])).toBe(false);
  });
  it('exposes OWNER as the only supported role', () => {
    expectTypeOf<Role>().toEqualTypeOf<'OWNER'>();
    expect(managementRoles).toEqual(['OWNER']);
    expect(Object.keys(roleLabels)).toEqual(['OWNER']);
  });
  it.each([
    'MANAGER',
    'CASHIER',
    'INVENTORY_STAFF',
    'PURCHASING_STAFF',
    'UNKNOWN',
    '',
  ])('rejects runtime role %s even with a granted permission', (role) => {
    const staleSession = {
      authenticated: true as const,
      role,
      permissions: ['pos.checkout'],
    };
    expect(canAccess(staleSession, 'pos.checkout')).toBe(false);
    expect(canAccess(staleSession, 'pos.checkout', ['OWNER'])).toBe(false);
  });
});
