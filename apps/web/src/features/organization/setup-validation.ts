export type ProfileErrorKey =
  | 'setupNameRequired'
  | 'setupNameTooLong'
  | 'setupNameInvalid'
  | 'setupPhoneInvalid';
export type ProfileErrors = Partial<
  Record<'name' | 'contact_phone', ProfileErrorKey>
>;

export function normalizeStorePhone(value: string) {
  return value.trim().replace(/[ -]/g, '');
}

export function validateStoreProfile(profile: {
  name: string;
  contact_phone: string;
}): ProfileErrors {
  const errors: ProfileErrors = {};
  const name = profile.name.trim();
  if (!name) errors.name = 'setupNameRequired';
  else if (Array.from(name).length > 200) errors.name = 'setupNameTooLong';
  else if (
    Array.from(name).some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 || code === 127;
    })
  )
    errors.name = 'setupNameInvalid';
  const phone = normalizeStorePhone(profile.contact_phone);
  if (
    phone &&
    !/^(?:0[689]\d{8}|0[2-57]\d{7}|\+66[689]\d{8}|\+66[2-57]\d{7})$/.test(phone)
  ) {
    errors.contact_phone = 'setupPhoneInvalid';
  }
  return errors;
}
