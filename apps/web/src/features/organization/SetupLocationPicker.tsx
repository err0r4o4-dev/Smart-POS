import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap, Marker } from 'leaflet';
import { useLanguage } from '../../app/language';
import { Button } from '../../components/ui/primitives';
import type { SetupLocation } from './setup-api';
import 'leaflet/dist/leaflet.css';

export function SetupLocationPicker({
  value,
  onChange,
}: {
  value?: SetupLocation;
  onChange: (value: SetupLocation) => void;
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
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value);
  const request = useRef<AbortController | null>(null);
  const active = useRef(true);
  const lastSearch = useRef(0);
  const selectionVersion = useRef(0);
  useEffect(() => {
    onChangeRef.current = onChange;
    valueRef.current = value;
  }, [onChange, value]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      selectionVersion.current += 1;
      request.current?.abort();
    };
  }, []);
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
    onChange({
      ...next,
      confirmed:
        Number.isFinite(next.latitude) &&
        Math.abs(next.latitude) <= 90 &&
        Number.isFinite(next.longitude) &&
        Math.abs(next.longitude) <= 180 &&
        Boolean(next.address.trim()) &&
        next.address.length <= 1000 &&
        next.details.length <= 1000,
    });
  };
  useEffect(() => {
    if (!enabled || !host.current) return;
    let disposed = false;
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
          onChangeRef.current({
            address: '',
            details: '',
            ...valueRef.current,
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
      })
      .catch(() => {
        if (!disposed) setError(t('organization.locationMapFailed'));
      });
    return () => {
      disposed = true;
      map.current?.remove();
      map.current = null;
      marker.current = null;
    };
  }, [enabled, t]);

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
              onChangeRef.current({
                address: '',
                details: '',
                ...valueRef.current,
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
      {error && <p role="alert">{error}</p>}
      <p role="status">
        {value?.confirmed
          ? t('organization.locationConfirmed')
          : t('organization.locationPickHint')}
      </p>

    </section>
  );
}
