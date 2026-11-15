import addressData from '../../../public/data/thai-addresses.json';

export type SetupAddress = {
  house: string;
  province: string;
  district: string;
  subdistrict: string;
  postalCode: string;
};

export function parseSetupAddress(value: string): SetupAddress {
  const parts = value.split(', ');
  const address: SetupAddress = {
    house: value,
    province: '',
    district: '',
    subdistrict: '',
    postalCode: '',
  };
  const prefixes = [
    ['postalCode', 'รหัสไปรษณีย์ '],
    ['province', 'จังหวัด '],
    ['district', 'อำเภอ '],
    ['district', 'เขต '],
    ['subdistrict', 'ตำบล '],
    ['subdistrict', 'แขวง '],
  ] as const;
  for (const [key, prefix] of prefixes) {
    const last = parts.at(-1);
    if (last?.startsWith(prefix)) {
      address[key] = last.slice(prefix.length);
      parts.pop();
    }
  }
  address.house = parts.join(', ');
  return address;
}

export function formatSetupAddress(address: SetupAddress) {
  const bangkok = address.province === 'กรุงเทพมหานคร';
  return [
    address.house,
    address.subdistrict && (bangkok ? 'แขวง ' : 'ตำบล ') + address.subdistrict,
    address.district && (bangkok ? 'เขต ' : 'อำเภอ ') + address.district,
    address.province && 'จังหวัด ' + address.province,
    address.postalCode && 'รหัสไปรษณีย์ ' + address.postalCode,
  ]
    .filter(Boolean)
    .join(', ');
}

export type SetupAddressErrors = Partial<
  Record<
    keyof SetupAddress,
    | 'setupAddressRequired'
    | 'locationProvinceRequired'
    | 'locationDistrictRequired'
    | 'locationSubdistrictRequired'
    | 'locationPostalCodeRequired'
  >
>;

export function validateSetupAddress(value: string): SetupAddressErrors {
  const address = parseSetupAddress(value);
  const province = addressData.provinces.find(
    (row) => row[1] === address.province,
  );
  const district = addressData.districts.find(
    (row) => row[1] === province?.[0] && row[2] === address.district,
  );
  const subdistrict = addressData.subdistricts.find(
    (row) => row[1] === district?.[0] && row[2] === address.subdistrict,
  );
  const errors: SetupAddressErrors = {};
  if (!address.house.trim()) errors.house = 'setupAddressRequired';
  if (!province) errors.province = 'locationProvinceRequired';
  if (!district) errors.district = 'locationDistrictRequired';
  if (!subdistrict) errors.subdistrict = 'locationSubdistrictRequired';
  if (
    !/^\d{5}$/.test(address.postalCode) ||
    !subdistrict ||
    address.postalCode !== String(subdistrict[4])
  )
    errors.postalCode = 'locationPostalCodeRequired';
  return errors;
}
