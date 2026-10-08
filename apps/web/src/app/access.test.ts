import { describe, expect, it } from 'vitest';
import { anonymousSession, canAccess } from './access';

describe('access foundation', () => {
  it('allows public presentations only for anonymous visitors', () => {
    expect(canAccess(anonymousSession)).toBe(true);
    expect(canAccess(anonymousSession, 'pos.checkout')).toBe(false);
  });
  it('requires both permission and allowed role', () => {
    const cashier = {
      authenticated: true as const,
      role: 'CASHIER' as const,
      permissions: ['pos.checkout'],
    };
    expect(canAccess(cashier, 'pos.checkout', ['CASHIER'])).toBe(true);
    expect(canAccess(cashier, 'inventory.adjust')).toBe(false);
    expect(canAccess(cashier, 'pos.checkout', ['OWNER'])).toBe(false);
  });
});
