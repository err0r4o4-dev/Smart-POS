import { describe, expect, it } from 'vitest';
import { validReturnQuantity } from './returns-api';

describe('exact return quantities', () => {
  it.each(['1', '0.001', '3.125'])(
    'accepts %s within historical balance',
    (value) => {
      expect(validReturnQuantity(value, '3.125')).toBe(true);
    },
  );
  it.each(['0', '-1', '1e0', '0.0001', '3.126', '', 'NaN', '01'])(
    'rejects %s',
    (value) => {
      expect(validReturnQuantity(value, '3.125')).toBe(false);
    },
  );
  it('does not round beyond Number precision', () => {
    expect(
      validReturnQuantity('999999999999999.999', '999999999999999.998'),
    ).toBe(false);
  });
});
