import { describe, expect, it } from 'vitest';
import { exactLineCost, exactOrderTotal } from './purchasing-api';

describe('purchasing exact estimates', () => {
  it('rounds HALF_UP per line without binary floating point', () => {
    expect(exactLineCost('0.125', '0.04')).toBe('0.01');
    expect(exactLineCost('0.124', '0.04')).toBe('0.00');
    expect(exactLineCost('3', '0.10')).toBe('0.30');
    expect(
      exactOrderTotal([
        {
          variant_id: 'a',
          purchase_unit_id: 'u',
          quantity: '0.125',
          unit_cost: '0.04',
        },
        {
          variant_id: 'b',
          purchase_unit_id: 'u',
          quantity: '0.125',
          unit_cost: '0.04',
        },
      ]),
    ).toBe('0.02');
  });
  it('preserves maximum cents and rejects overflow', () => {
    expect(exactLineCost('1', '9999999999999999.99')).toBe(
      '9999999999999999.99',
    );
    expect(exactLineCost('2', '9999999999999999.99')).toBeNull();
    expect(
      exactOrderTotal([
        {
          variant_id: 'a',
          purchase_unit_id: 'u',
          quantity: '1',
          unit_cost: '9999999999999999.99',
        },
        {
          variant_id: 'b',
          purchase_unit_id: 'u',
          quantity: '1',
          unit_cost: '0.01',
        },
      ]),
    ).toBeNull();
  });
  it.each(['1e3', '-1', 'NaN', '1.0001', '1000000000000000'])(
    'rejects invalid quantity %s',
    (quantity) => expect(exactLineCost(quantity, '1.00')).toBeNull(),
  );
});
