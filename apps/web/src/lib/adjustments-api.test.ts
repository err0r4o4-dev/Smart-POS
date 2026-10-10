import { expect, it } from 'vitest';
import { settlementMethods } from './adjustments-api';

it('separates no-money, collection and refund methods without floating point', () => {
  expect(settlementMethods('0.00')).toEqual(['NONE']);
  expect(settlementMethods('0.01')).toEqual([
    'CASH',
    'QR_MANUAL',
    'BANK_TRANSFER_MANUAL',
  ]);
  expect(settlementMethods('-0.01')).toEqual([
    'CASH_REFUND',
    'MANUAL_BANK_REFUND',
    'MANUAL_ORIGINAL_METHOD_REFUND',
  ]);
  expect(settlementMethods('999999999999999.99')[0]).toBe('CASH');
});
