import { describe, expect, it } from 'vitest';
import {
  formatSetupAddress,
  parseSetupAddress,
  validateSetupAddress,
} from './setup-address';

describe('standard setup address', () => {
  it('preserves legacy free-text addresses including commas', () => {
    const legacy = '99/9, Old Road, Bangkok';
    expect(parseSetupAddress(legacy).house).toBe(legacy);
    expect(formatSetupAddress(parseSetupAddress(legacy))).toBe(legacy);
  });
  it('round trips structured fields without changing the house number', () => {
    const address = {
      house: '99/9, หมู่ 3',
      province: 'เชียงใหม่',
      district: 'เมืองเชียงใหม่',
      subdistrict: 'ศรีภูมิ',
      postalCode: '50200',
    };
    expect(parseSetupAddress(formatSetupAddress(address))).toEqual(address);
  });
  it('requires all standard address fields, not just a house number', () => {
    expect(validateSetupAddress('')).toEqual({
      house: 'setupAddressRequired',
      province: 'locationProvinceRequired',
      district: 'locationDistrictRequired',
      subdistrict: 'locationSubdistrictRequired',
      postalCode: 'locationPostalCodeRequired',
    });
    expect(validateSetupAddress('99/9')).not.toHaveProperty('house');
    expect(
      validateSetupAddress(
        '99/9, แขวง พระบรมมหาราชวัง, เขต พระนคร, จังหวัด กรุงเทพมหานคร, รหัสไปรษณีย์ 10200',
      ),
    ).toEqual({});
  });
  it('rejects mismatched administrative selections and postcode', () => {
    expect(
      validateSetupAddress(
        '99/9, แขวง พระบรมมหาราชวัง, เขต พระนคร, จังหวัด กรุงเทพมหานคร, รหัสไปรษณีย์ 10200'.replace(
          'พระนคร',
          'เมืองเชียงใหม่',
        ),
      ),
    ).toHaveProperty('district');
    expect(
      validateSetupAddress(
        '99/9, แขวง พระบรมมหาราชวัง, เขต พระนคร, จังหวัด กรุงเทพมหานคร, รหัสไปรษณีย์ 10200'.replace(
          '10200',
          '99999',
        ),
      ),
    ).toHaveProperty('postalCode');
  });
});

it('round trips an address without a house number and uses Bangkok administrative labels', () => {
  const address = {
    house: '',
    province: 'กรุงเทพมหานคร',
    district: 'พระนคร',
    subdistrict: 'พระบรมมหาราชวัง',
    postalCode: '10200',
  };
  const formatted = formatSetupAddress(address);
  expect(formatted.startsWith(',')).toBe(false);
  expect(formatted).toContain('แขวง พระบรมมหาราชวัง, เขต พระนคร');
  expect(parseSetupAddress(formatted)).toEqual(address);
});
