import { describe, expect, it } from 'vitest';
import { normalizeStorePhone, validateStoreProfile } from './setup-validation';

describe('setup store profile', () => {
  it('rejects blank and oversized names without restricting Thai names', () => {
    expect(validateStoreProfile({ name: '  ', contact_phone: '' }).name).toBe(
      'setupNameRequired',
    );
    expect(
      validateStoreProfile({ name: 'ก'.repeat(201), contact_phone: '' }).name,
    ).toBe('setupNameTooLong');
    expect(
      validateStoreProfile({ name: 'ร้าน อร่อย & Co. ๒', contact_phone: '' }),
    ).toEqual({});
  });
  it.each(['0812345678', '02 123-4567', '+66 81-234-5678', '+6621234567', ''])(
    'accepts optional phone: %s',
    (contact_phone) => {
      expect(validateStoreProfile({ name: 'Cafe', contact_phone })).toEqual({});
    },
  );
  it.each([
    '08123abc',
    '123',
    '0000000000',
    '+660812345678',
    '08123456789',
    '0812/345678',
  ])('rejects malformed phone: %s', (contact_phone) => {
    expect(
      validateStoreProfile({ name: 'Cafe', contact_phone }).contact_phone,
    ).toBe('setupPhoneInvalid');
  });
  it('normalizes separators without changing the country code', () => {
    expect(normalizeStorePhone(' +66 81-234-5678 ')).toBe('+66812345678');
  });
});
