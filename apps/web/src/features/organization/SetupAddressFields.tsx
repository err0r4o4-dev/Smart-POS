import addressData from '../../../public/data/thai-addresses.json';
import { useLanguage } from '../../app/language';
import {
  formatSetupAddress,
  parseSetupAddress,
  type SetupAddress,
} from './setup-address';
import type { ProfileErrors } from './setup-validation';

export function SetupAddressFields({
  value,
  onChange,
  errors,
  onBlur,
}: {
  value: string;
  onChange: (value: string) => void;
  errors: ProfileErrors;
  onBlur?: () => void;
}) {
  const { t } = useLanguage();
  const address = parseSetupAddress(value);
  const province = addressData.provinces.find(
    (row) => row[1] === address.province,
  );
  const district = addressData.districts.find(
    (row) => row[1] === province?.[0] && row[2] === address.district,
  );
  const change = (patch: Partial<SetupAddress>) =>
    onChange(formatSetupAddress({ ...address, ...patch }));
  const requiredMarker = (
    <span className="setup-required" aria-hidden="true">
      {' '}
      *
    </span>
  );
  const fieldError = (key: keyof SetupAddress) =>
    errors[key] && (
      <span
        id={'setup-address-' + key + '-error'}
        className="setup-field-error"
        role="alert"
      >
        {t(`organization.${errors[key]}`)}
      </span>
    );
  const select = (
    key: 'province' | 'district' | 'subdistrict',
    options: Array<{ value: string; label: string }>,
    disabled: boolean,
  ) => {
    const labelKey =
      key === 'province'
        ? 'Province'
        : key === 'district'
          ? 'District'
          : 'Subdistrict';
    const error = errors[key];
    return (
      <label className="tenant-field setup-field">
        <span className="setup-field-label">
          {t(`organization.location${labelKey}`)}
          {requiredMarker}
        </span>
        <select
          id={'setup-address-' + key}
          className="setup-select-element"
          aria-label={t(`organization.location${labelKey}`)}
          aria-invalid={Boolean(error)}
          aria-describedby={
            error ? 'setup-address-' + key + '-error' : undefined
          }
          value={address[key]}
          disabled={disabled}
          required
          onBlur={onBlur}
          onChange={(event) => {
            const next = event.target.value;
            if (key === 'province')
              change({
                province: next,
                district: '',
                subdistrict: '',
                postalCode: '',
              });
            else if (key === 'district')
              change({ district: next, subdistrict: '', postalCode: '' });
            else
              change({
                subdistrict: next,
                postalCode: String(
                  addressData.subdistricts.find(
                    (row) => row[1] === district?.[0] && row[2] === next,
                  )?.[4] ?? '',
                ),
              });
          }}
        >
          <option value="">
            {t(`organization.locationSelect${labelKey}`)}
          </option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {error && (
          <span
            id={'setup-address-' + key + '-error'}
            className="setup-field-error"
            role="alert"
          >
            {t(`organization.${error}`)}
          </span>
        )}
      </label>
    );
  };
  return (
    <>
      <div className="setup-form-row">
        <label className="tenant-field setup-field">
          <span className="setup-field-label">
            {t('organization.setupStoreAddress')}
            {requiredMarker}
          </span>
          <input
            aria-label={t('organization.setupStoreAddress')}
            id="setup-address-house"
            required
            onBlur={onBlur}
            aria-invalid={Boolean(errors.house)}
            aria-describedby={
              errors.house ? 'setup-address-house-error' : undefined
            }
            autoComplete="address-line1"
            value={address.house}
            placeholder={t('organization.setupAddressExample')}
            onChange={(event) => change({ house: event.target.value })}
          />
          {fieldError('house')}
        </label>
      </div>
      <div className="setup-form-grid">
        {select(
          'province',
          addressData.provinces.map((row) => ({
            value: String(row[1]),
            label: String(row[1]),
          })),
          false,
        )}
        {select(
          'district',
          addressData.districts
            .filter((row) => row[1] === province?.[0])
            .map((row) => ({ value: String(row[2]), label: String(row[2]) })),
          !province,
        )}
      </div>
      <div className="setup-form-grid">
        {select(
          'subdistrict',
          addressData.subdistricts
            .filter((row) => row[1] === district?.[0])
            .map((row) => ({ value: String(row[2]), label: String(row[2]) })),
          !district,
        )}
        <label className="tenant-field setup-field">
          <span className="setup-field-label">
            {t('organization.locationPostalCode')}
            {requiredMarker}
          </span>
          <input
            aria-label={t('organization.locationPostalCode')}
            id="setup-address-postalCode"
            aria-required="true"
            onBlur={onBlur}
            aria-invalid={Boolean(errors.postalCode)}
            aria-describedby={
              errors.postalCode ? 'setup-address-postalCode-error' : undefined
            }
            autoComplete="postal-code"
            value={address.postalCode}
            readOnly
          />
          {fieldError('postalCode')}
        </label>
      </div>
    </>
  );
}
