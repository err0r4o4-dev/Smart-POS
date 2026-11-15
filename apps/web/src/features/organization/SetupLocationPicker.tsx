import { useCallback, useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap, Marker } from 'leaflet';
import { useLanguage } from '../../app/language';
import { Button } from '../../components/ui/primitives';
import type { SetupLocation } from './setup-api';
import 'leaflet/dist/leaflet.css';

export type LocationMapStatus = 'loading' | 'ready' | 'error';
type AddressData = {
  provinces: [number, string, string][];
  districts: [number, number, string, string][];
  subdistricts: [number, number, string, string, string][];
};

const emptyAddressData: AddressData = {
  provinces: [],
  districts: [],
  subdistricts: [],
};

export function SetupLocationPicker({
  value,
  onChange,
  onMapStatusChange,
}: {
  value?: SetupLocation;
  onChange: (value: SetupLocation) => void;
  onMapStatusChange?: (status: LocationMapStatus) => void;
}) {
  const { t } = useLanguage();
  const [latitude, setLatitude] = useState(value ? String(value.latitude) : '');
  const [longitude, setLongitude] = useState(
    value ? String(value.longitude) : '',
  );
  const enabled = true;
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<
    Array<{ display_name: string; lat: string; lon: string }>
  >([]);
  const [addressData, setAddressData] = useState<AddressData>(emptyAddressData);
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const onMapStatusChangeRef = useRef(onMapStatusChange);
  const valueRef = useRef(value);
  const request = useRef<AbortController | null>(null);
  const active = useRef(true);
  const lastSearch = useRef(0);
  const selectionVersion = useRef(0);
  const reverseRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    onChangeRef.current = onChange;
    onMapStatusChangeRef.current = onMapStatusChange;
    valueRef.current = value;
  }, [onChange, onMapStatusChange, value]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      selectionVersion.current += 1;
      request.current?.abort();
      reverseRequest.current?.abort();
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    void fetch('/data/thai-addresses.json', { credentials: 'same-origin' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: unknown) => {
        if (
          !cancelled &&
          data &&
          typeof data === 'object' &&
          !Array.isArray(data) &&
          Array.isArray((data as Partial<AddressData>).provinces) &&
          Array.isArray((data as Partial<AddressData>).districts) &&
          Array.isArray((data as Partial<AddressData>).subdistricts)
        )
          setAddressData(data as AddressData);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  const reverseLookup = useCallback(
    (lat: number, lon: number) => {
      reverseRequest.current?.abort();
      const controller = new AbortController();
      reverseRequest.current = controller;
      const endpoint =
        import.meta.env.VITE_LOCATION_REVERSE_URL ||
        'https://photon.komoot.io/reverse';
      const url = new URL(endpoint, window.location.origin);
      url.searchParams.set('lat', String(lat));
      url.searchParams.set('lon', String(lon));
      void fetch(url, {
        signal: controller.signal,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      })
        .then((response) => (response.ok ? response.json() : null))
        .then((data: unknown) => {
          if (controller.signal.aborted || !data || typeof data !== 'object')
            return;
          const raw = data as {
            properties?: Record<string, unknown>;
            features?: Array<{ properties?: Record<string, unknown> }>;
          };
          const properties =
            raw.properties ?? raw.features?.[0]?.properties ?? {};
          const current = valueRef.current;
          const getText = (...keys: string[]) =>
            keys
              .map((key) => properties[key])
              .find(
                (value): value is string =>
                  typeof value === 'string' && value.trim() !== '',
              ) ?? '';
          const street = [getText('house_number'), getText('street')]
            .filter(Boolean)
            .join(' ');
          const province = getText('state', 'province');
          const district = getText('county', 'district', 'city_district');
          const subdistrict = getText('suburb', 'village', 'municipality');
          const postalCode = getText('postcode');
          const provinceRow = addressData.provinces.find(
            (row) => province.includes(row[1]) || row[1].includes(province),
          );
          const districtRow = addressData.districts.find(
            (row) =>
              row[1] === provinceRow?.[0] &&
              (district.includes(row[2]) || row[2].includes(district)),
          );
          const subdistrictRow = addressData.subdistricts.find(
            (row) =>
              row[1] === districtRow?.[0] &&
              (subdistrict.includes(row[2]) || row[2].includes(subdistrict)),
          );
          onChangeRef.current({
            ...current,
            latitude: lat,
            longitude: lon,
            address: street || current?.address || '',
            details: current?.details ?? '',
            province_id: provinceRow?.[0],
            province: provinceRow?.[1] ?? province,
            district_id: districtRow?.[0],
            district: districtRow?.[2] ?? district,
            subdistrict_id: subdistrictRow?.[0],
            subdistrict: subdistrictRow?.[2] ?? subdistrict,
            postal_code: subdistrictRow?.[4] ?? postalCode,
            confirmed: false,
          });
        })
        .catch(() => undefined);
    },
    [addressData],
  );
  const showLocationErrors = Boolean(value && !value.confirmed);
  const change = (patch: Partial<SetupLocation>) => {
    selectionVersion.current += 1;
    setError('');
    const next = {
      latitude: latitude.trim() ? Number(latitude) : NaN,
      longitude: longitude.trim() ? Number(longitude) : NaN,
      address: '',
      details: '',
      ...value,
      ...patch,
    };
    const valid =
      Number.isFinite(next.latitude) &&
      Math.abs(next.latitude) <= 90 &&
      Number.isFinite(next.longitude) &&
      Math.abs(next.longitude) <= 180 &&
      Boolean(next.address.trim()) &&
      next.address.length <= 1000 &&
      Boolean(next.province_id && next.district_id && next.subdistrict_id) &&
      /^\d{5}$/.test(next.postal_code ?? '') &&
      next.details.length <= 1000;
    onChange({ ...next, confirmed: patch.confirmed === true && valid });
  };
  useEffect(() => {
    if (!enabled || !host.current) return;
    let disposed = false;
    onMapStatusChangeRef.current?.('loading');
    void import('leaflet')
      .then((leaflet) => {
        if (disposed || !host.current) return;
        const view = leaflet.map(host.current).setView([13.7563, 100.5018], 13);
        map.current = view;
        leaflet
          .tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            referrerPolicy: 'origin',
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          })
          .on('tileerror', () => setError(t('organization.locationMapFailed')))
          .addTo(view);
        view.on('click', (event) => {
          selectionVersion.current += 1;
          setError('');
          const { lat, lng } = event.latlng.wrap();
          setLatitude(lat.toFixed(6));
          setLongitude(lng.toFixed(6));
          reverseLookup(Number(lat.toFixed(6)), Number(lng.toFixed(6)));
          const current = valueRef.current;
          onChangeRef.current({
            address: '',
            details: '',
            ...current,
            latitude: Number(lat.toFixed(6)),
            longitude: Number(lng.toFixed(6)),
            confirmed: false,
          });
        });
        marker.current = leaflet
          .marker([13.7563, 100.5018], {
            opacity: 0,
            icon: leaflet.divIcon({
              className: 'setup-map-pin',
              html: '<span></span>',
              iconSize: [24, 24],
              iconAnchor: [12, 24],
            }),
          })
          .addTo(view);
        const selected = valueRef.current;
        if (
          selected &&
          Number.isFinite(selected.latitude) &&
          Number.isFinite(selected.longitude)
        ) {
          marker.current
            .setLatLng([selected.latitude, selected.longitude])
            .setOpacity(1);
          view.setView([selected.latitude, selected.longitude], 16);
        }
        onMapStatusChangeRef.current?.('ready');
      })
      .catch(() => {
        if (!disposed) {
          setError(t('organization.locationMapFailed'));
          onMapStatusChangeRef.current?.('error');
        }
      });
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
  }, [enabled, reverseLookup, t]);

  useEffect(() => {
    if (
      latitude.trim() === '' ||
      longitude.trim() === '' ||
      !Number.isFinite(Number(latitude)) ||
      !Number.isFinite(Number(longitude)) ||
      Math.abs(Number(latitude)) > 90 ||
      Math.abs(Number(longitude)) > 180
    )
      return;
    marker.current
      ?.setLatLng([Number(latitude), Number(longitude)])
      .setOpacity(1);
    map.current?.panTo([Number(latitude), Number(longitude)]);
  }, [latitude, longitude]);

  const search = async () => {
    if (!query.trim() || busy || Date.now() - lastSearch.current < 1100) return;
    lastSearch.current = Date.now();
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError('');
    setResults([]);
    try {
      const endpoint = import.meta.env.VITE_LOCATION_SEARCH_URL;
      if (!endpoint)
        throw new Error(t('organization.locationSearchUnavailable'));
      const url = new URL(endpoint, window.location.origin);
      url.searchParams.set('q', query.trim());
      url.searchParams.set('format', 'jsonv2');
      url.searchParams.set('limit', '5');
      const response = await fetch(url, {
        signal: controller.signal,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      if (!response.ok) throw new Error(t('organization.locationSearchFailed'));
      const data: unknown = await response.json();
      if (!Array.isArray(data))
        throw new Error(t('organization.locationSearchFailed'));
      const matches = data.filter(
        (entry): entry is { display_name: string; lat: string; lon: string } =>
          Boolean(
            entry &&
            typeof entry.display_name === 'string' &&
            typeof entry.lat === 'string' &&
            entry.lat.trim() !== '' &&
            typeof entry.lon === 'string' &&
            entry.lon.trim() !== '' &&
            Number.isFinite(Number(entry.lat)) &&
            Number.isFinite(Number(entry.lon)) &&
            Math.abs(Number(entry.lat)) <= 90 &&
            Math.abs(Number(entry.lon)) <= 180,
          ),
      );
      if (active.current && !controller.signal.aborted) {
        setResults(matches);
        if (!matches.length) setError(t('organization.locationNoResults'));
      }
    } catch (failure) {
      if (active.current && !controller.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : t('organization.locationSearchFailed'),
        );
    } finally {
      if (active.current && request.current === controller) setBusy(false);
    }
  };

  return (
    <section className="setup-location">
      <p>{t('organization.locationPrivacy')}</p>
      {import.meta.env.VITE_LOCATION_SEARCH_URL && (
        <div className="setup-form-grid">
          <label className="tenant-field setup-field">
            <span className="setup-field-label">
              {t('organization.locationSearch')}
            </span>
            <input
              value={query}
              maxLength={200}
              onChange={(event) => {
                request.current?.abort();
                setBusy(false);
                setResults([]);
                setQuery(event.target.value);
              }}
            />
          </label>
          <Button
            type="button"
            disabled={busy || !query.trim()}
            onClick={() => void search()}
          >
            {busy
              ? t('organization.locationSearching')
              : t('organization.locationSearchAction')}
          </Button>
        </div>
      )}
      {results.length > 0 && (
        <ul>
          {results.map((result, index) => (
            <li key={index}>
              <Button
                type="button"
                onClick={() => {
                  setLatitude(result.lat);
                  setLongitude(result.lon);
                  reverseLookup(Number(result.lat), Number(result.lon));
                  change({
                    latitude: Number(result.lat),
                    longitude: Number(result.lon),
                    address: result.display_name,
                  });
                  setResults([]);
                }}
              >
                {result.display_name}
              </Button>
            </li>
          ))}
        </ul>
      )}

      {enabled && (
        <div
          ref={host}
          className="setup-location-map"
          aria-label={t('organization.locationMap')}
        />
      )}

      <Button
        type="button"
        onClick={() => {
          setError('');
          if (!navigator.geolocation) {
            setError(t('organization.locationGpsFailed'));
            return;
          }
          const version = ++selectionVersion.current;
          navigator.geolocation.getCurrentPosition(
            (position) => {
              if (!active.current || selectionVersion.current !== version)
                return;
              selectionVersion.current += 1;
              setLatitude(String(position.coords.latitude));
              setLongitude(String(position.coords.longitude));
              reverseLookup(
                position.coords.latitude,
                position.coords.longitude,
              );
              const current = valueRef.current;
              onChangeRef.current({
                address: '',
                details: '',
                ...current,
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                confirmed: false,
              });
            },
            () => {
              if (active.current && selectionVersion.current === version)
                setError(t('organization.locationGpsFailed'));
            },
            { timeout: 10000, maximumAge: 0 },
          );
        }}
      >
        {t('organization.locationUseCurrent')}
      </Button>
      <div className="setup-form-grid">
        <label className="tenant-field setup-field">
          <span className="setup-field-label">
            {t('organization.setupStoreAddress')}
          </span>
          <input
            value={value?.address ?? ''}
            maxLength={1000}
            onChange={(event) => change({ address: event.target.value })}
          />
          {showLocationErrors && !value?.address?.trim() && (
            <span className="setup-field-error" role="alert">
              {t('organization.locationAddressRequired')}
            </span>
          )}
        </label>
        <label className="tenant-field setup-field">
          <span className="setup-field-label">
            {t('organization.locationDetails')}
          </span>
          <input
            value={value?.details ?? ''}
            maxLength={1000}
            onChange={(event) => change({ details: event.target.value })}
          />
        </label>
      </div>
      <div className="setup-form-grid">
        <label className="tenant-field setup-field">
          <span className="setup-field-label">
            {t('organization.locationProvince')} *
          </span>
          <select
            className="setup-select-element"
            aria-label={t('organization.locationProvince')}
            value={value?.province_id ?? ''}
            onChange={(event) => {
              const provinceID = Number(event.target.value) || undefined;
              change({
                province_id: provinceID,
                province:
                  addressData.provinces.find(
                    (row) => row[0] === provinceID,
                  )?.[1] ?? '',
                district_id: undefined,
                district: '',
                subdistrict_id: undefined,
                subdistrict: '',
                postal_code: '',
              });
            }}
          >
            <option value="">{t('organization.locationSelectProvince')}</option>
            {addressData.provinces.map((row) => (
              <option key={row[0]} value={row[0]}>
                {row[1]}
              </option>
            ))}
          </select>
          {showLocationErrors && !value?.province_id && (
            <span className="setup-field-error" role="alert">
              {t('organization.locationProvinceRequired')}
            </span>
          )}
        </label>
        <label className="tenant-field setup-field">
          <span className="setup-field-label">
            {t('organization.locationDistrict')} *
          </span>
          <select
            className="setup-select-element"
            aria-label={t('organization.locationDistrict')}
            value={value?.district_id ?? ''}
            onChange={(event) => {
              const districtID = Number(event.target.value) || undefined;
              change({
                district_id: districtID,
                district:
                  addressData.districts.find(
                    (row) => row[0] === districtID,
                  )?.[2] ?? '',
                subdistrict_id: undefined,
                subdistrict: '',
                postal_code: '',
              });
            }}
            disabled={!value?.province_id}
          >
            <option value="">{t('organization.locationSelectDistrict')}</option>
            {addressData.districts
              .filter((row) => row[1] === value?.province_id)
              .map((row) => (
                <option key={row[0]} value={row[0]}>
                  {row[2]}
                </option>
              ))}
          </select>
          {showLocationErrors && !value?.district_id && (
            <span className="setup-field-error" role="alert">
              {t('organization.locationDistrictRequired')}
            </span>
          )}
        </label>
      </div>
      <div className="setup-form-grid">
        <label className="tenant-field setup-field">
          <span className="setup-field-label">
            {t('organization.locationSubdistrict')} *
          </span>
          <select
            className="setup-select-element"
            aria-label={t('organization.locationSubdistrict')}
            value={value?.subdistrict_id ?? ''}
            onChange={(event) => {
              const subdistrictID = Number(event.target.value) || undefined;
              const row = addressData.subdistricts.find(
                (entry) => entry[0] === subdistrictID,
              );
              change({
                subdistrict_id: subdistrictID,
                subdistrict: row?.[2] ?? '',
                postal_code: row?.[4] ?? '',
              });
            }}
            disabled={!value?.district_id}
          >
            <option value="">
              {t('organization.locationSelectSubdistrict')}
            </option>
            {addressData.subdistricts
              .filter((row) => row[1] === value?.district_id)
              .map((row) => (
                <option key={row[0]} value={row[0]}>
                  {row[2]}
                </option>
              ))}
          </select>
          {showLocationErrors && !value?.subdistrict_id && (
            <span className="setup-field-error" role="alert">
              {t('organization.locationSubdistrictRequired')}
            </span>
          )}
        </label>
        <label className="tenant-field setup-field">
          <span className="setup-field-label">
            {t('organization.locationPostalCode')} *
          </span>
          <input
            aria-label={t('organization.locationPostalCode')}
            inputMode="numeric"
            maxLength={5}
            value={value?.postal_code ?? ''}
            onChange={(event) =>
              change({
                postal_code: event.target.value.replace(/\D/g, '').slice(0, 5),
              })
            }
          />
          {showLocationErrors && !/^\d{5}$/.test(value?.postal_code ?? '') && (
            <span className="setup-field-error" role="alert">
              {t('organization.locationPostalCodeRequired')}
            </span>
          )}
        </label>
      </div>
      <Button
        type="button"
        disabled={
          !value?.address?.trim() ||
          !value.province_id ||
          !value.district_id ||
          !value.subdistrict_id ||
          !/^\d{5}$/.test(value.postal_code ?? '')
        }
        onClick={() => change({ confirmed: true })}
      >
        {t('organization.locationConfirm')}
      </Button>
      <p role="status">
        {value?.confirmed
          ? t('organization.locationConfirmed')
          : t('organization.locationPickHint')}
      </p>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
