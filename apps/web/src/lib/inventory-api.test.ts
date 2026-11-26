import { describe, expect, it } from 'vitest';
import {
  quantityVariance,
  scaledQuantity,
  variancePercent,
} from './inventory-api';

describe('exact inventory quantities', () => {
  it('preserves decimal precision and large quantities without Number conversion', () => {
    expect(scaledQuantity('999999999999999.999')).toBe(999999999999999999n);
    expect(quantityVariance('0.1', '0.3')).toBe('0.200');
    expect(quantityVariance('999999999999999.999', '999999999999999.998')).toBe(
      '-0.001',
    );
  });
  it('calculates signed variance and handles zero expected stock explicitly', () => {
    expect(quantityVariance('10', '7')).toBe('-3.000');
    expect(variancePercent('10', '7')).toBe('-30.00%');
    expect(variancePercent('0', '8')).toBe('—');
    expect(variancePercent('3', '4')).toBe('33.33%');
  });
  it.each(['NaN', '1e3', '1.0001', '1,000', ''])(
    'rejects invalid exact quantity %s',
    (value) => {
      expect(() => scaledQuantity(value)).toThrow('Invalid quantity');
    },
  );
});
