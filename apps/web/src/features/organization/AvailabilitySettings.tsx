import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLanguage } from '../../app/language';
import { ApiError } from '../../lib/api';
import { MFARequiredState } from './MFARequiredState';
import {
  getRestaurantAvailability,
  saveRestaurantAvailability,
  type RestaurantAvailability,
} from './availability-api';

const pauses = [
  ['global_pause', 'restaurant.pauseAll'],
  ['dine_in_paused', 'restaurant.dineIn'],
  ['takeaway_paused', 'restaurant.takeawayMode'],
  ['pickup_paused', 'restaurant.pickupMode'],
  ['delivery_paused', 'restaurant.delivery'],
] as const;

export function AvailabilitySettings({
  user,
  organization,
  csrf,
}: {
  user: string;
  organization: string;
  csrf: string;
}) {
  const { t, language } = useLanguage();
  const client = useQueryClient();
  const queryKey = ['tenant', user, organization, 'restaurant-availability'];
  const query = useQuery({
    queryKey,
    queryFn: ({ signal }) => getRestaurantAvailability(organization, signal),
    retry: false,
    refetchOnWindowFocus: false,
  });
  const [draft, setDraft] = useState<RestaurantAvailability>();
  const value = draft ?? query.data;
  const submitting = useRef(false);
  const addWindow = useRef<HTMLButtonElement>(null);
  const save = useMutation({
    mutationFn: (input: RestaurantAvailability) =>
      saveRestaurantAvailability(organization, input, csrf),
    onSettled: () => {
      submitting.current = false;
    },
  });
  const conflict = save.error instanceof ApiError && save.error.status === 409;
  const requiresMFA =
    save.error instanceof ApiError && save.error.code === 'MFA_REQUIRED';
  const [reloadFailed, setReloadFailed] = useState(false);
  const dayNames = new Intl.DateTimeFormat(
    language === 'th' ? 'th-TH' : 'en-GB',
    {
      weekday: 'long',
      timeZone: 'UTC',
    },
  );
  const updateWindow = (
    index: number,
    patch: Partial<RestaurantAvailability['weekly_windows'][number]>,
  ) => {
    if (value)
      setDraft({
        ...value,
        weekly_windows: value.weekly_windows.map((row, i) =>
          i === index ? { ...row, ...patch } : row,
        ),
      });
  };
  return (
    <section
      className="settings-card availability-settings"
      aria-labelledby="availability-settings-heading"
    >
      <header className="settings-card-header">
        <div>
          <h2
            id="availability-settings-heading"
            className="settings-card-title"
          >
            {t('restaurant.availabilityTitle')}
          </h2>
          <p className="settings-card-subtitle">
            {t('restaurant.availabilityDraft')}
          </p>
        </div>
      </header>
      <div className="settings-card-body">
        {query.isPending && (
          <p role="status">{t('restaurant.availabilityLoading')}</p>
        )}
        {query.isError && !value && (
          <>
            <p role="alert">{t('restaurant.loadFailed')}</p>
            <button
              type="button"
              className="settings-btn-secondary"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              {t('restaurant.availabilityReload')}
            </button>
          </>
        )}
        {value && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!draft || conflict || submitting.current) return;
              submitting.current = true;
              save.mutate(draft, {
                // This callback belongs to the mounted form, not the mutation cache.
                onSuccess: (result) => {
                  client.setQueryData<RestaurantAvailability>(
                    queryKey,
                    (current) => (current === undefined ? undefined : result),
                  );
                  setDraft(undefined);
                },
              });
            }}
          >
            <fieldset
              disabled={save.isPending || query.isFetching}
              className="availability-fields"
            >
              <legend>{t('restaurant.availabilityTitle')}</legend>
              <label className="settings-field-group">
                {t('restaurant.availabilityTimezone')}
                <input
                  className="settings-input"
                  value={value.timezone}
                  maxLength={255}
                  required
                  onChange={(event) =>
                    setDraft({ ...value, timezone: event.target.value })
                  }
                />
              </label>
              <p>{t('restaurant.availabilityWindowHint')}</p>
              {value.weekly_windows.length === 0 && (
                <p>{t('restaurant.availabilityEmpty')}</p>
              )}
              {value.weekly_windows.map((row, index) => (
                <fieldset className="availability-window" key={index}>
                  <legend>
                    {t('restaurant.availabilityWindow', { number: index + 1 })}
                  </legend>
                  <label>
                    {t('restaurant.availabilityDay')}
                    <select
                      className="settings-input"
                      value={row.weekday}
                      onChange={(event) =>
                        updateWindow(index, {
                          weekday: Number(event.target.value),
                        })
                      }
                    >
                      {Array.from({ length: 7 }, (_, i) => (
                        <option value={i + 1} key={i}>
                          {dayNames.format(new Date(Date.UTC(2026, 0, 5 + i)))}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t('restaurant.availabilityStart')}
                    <input
                      className="settings-input"
                      required
                      pattern="(?:[01][0-9]|2[0-3]):[0-5][0-9]"
                      value={row.start}
                      onChange={(event) =>
                        updateWindow(index, { start: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    {t('restaurant.availabilityEnd')}
                    <input
                      className="settings-input"
                      required
                      pattern="(?:(?:[01][0-9]|2[0-3]):[0-5][0-9]|24:00)"
                      value={row.end}
                      onChange={(event) =>
                        updateWindow(index, { end: event.target.value })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="settings-btn-secondary"
                    onClick={() => {
                      setDraft({
                        ...value,
                        weekly_windows: value.weekly_windows.filter(
                          (_, i) => i !== index,
                        ),
                      });
                      addWindow.current?.focus();
                    }}
                  >
                    {t('restaurant.availabilityRemove', { number: index + 1 })}
                  </button>
                </fieldset>
              ))}
              <button
                ref={addWindow}
                type="button"
                className="settings-btn-secondary"
                onClick={() =>
                  setDraft({
                    ...value,
                    weekly_windows: [
                      ...value.weekly_windows,
                      { weekday: 1, start: '', end: '' },
                    ],
                  })
                }
              >
                {t('restaurant.availabilityAdd')}
              </button>
              <fieldset className="availability-pauses">
                <legend>{t('restaurant.availabilityPause')}</legend>
                {pauses.map(([field, label]) => (
                  <label key={field}>
                    <input
                      type="checkbox"
                      checked={value[field]}
                      onChange={(event) =>
                        setDraft({ ...value, [field]: event.target.checked })
                      }
                    />{' '}
                    {t(label)}
                  </label>
                ))}
              </fieldset>
              <button
                type="submit"
                className="settings-btn-primary"
                disabled={!draft || conflict}
              >
                {save.isPending
                  ? t('organization.settingsSaving')
                  : t('restaurant.availabilitySave')}
              </button>
            </fieldset>
            {save.isSuccess && !draft && (
              <p role="status">{t('restaurant.saved')}</p>
            )}
            {requiresMFA && <MFARequiredState newTab />}
            {save.isError && !requiresMFA && (
              <p role="alert">
                {t(
                  conflict
                    ? 'restaurant.availabilityConflict'
                    : 'restaurant.availabilitySaveError',
                )}
              </p>
            )}
            {conflict && (
              <button
                type="button"
                className="settings-btn-secondary"
                disabled={query.isFetching}
                onClick={async () => {
                  setReloadFailed(false);
                  const result = await query.refetch();
                  if (result.isSuccess) {
                    setDraft(undefined);
                    save.reset();
                  } else {
                    setReloadFailed(true);
                  }
                }}
              >
                {t('restaurant.availabilityDiscardReload')}
              </button>
            )}
            {reloadFailed && <p role="alert">{t('restaurant.loadFailed')}</p>}
          </form>
        )}
      </div>
    </section>
  );
}
