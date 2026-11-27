import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Clock, Save, Settings, Store } from 'lucide-react';
import { useLanguage } from '../../app/language';
import { useAuth } from '../../app/AuthProvider';
import { useOrganization } from '../../app/OrganizationProvider';
import { paths } from '../../app/routes';
import { StandardPageHeader } from '../../components/ui/StandardPage';
import { ErrorState, Loading } from '../../components/ui/primitives';
import { ApiError } from '../../lib/api';
import { posRequest } from '../../lib/pos-api';
import {
  organizationRequest,
  type Organization,
  type OrganizationInput,
} from '../../lib/organization-api';
import type { ShopSettings } from '../../lib/storefront-api';
import { AvailabilitySettings } from './AvailabilitySettings';
import './settings.css';

interface RestaurantSettingsData {
  branch_id: string;
  closing_time: string;
  timezone: string;
  revision: number;
  period: { start: string; end: string };
}

type Feedback = { error: string } | { saved: true } | null;

export function SettingsPage() {
  const tenant = useOrganization();
  const { state } = useAuth();
  return (
    <SettingsContent
      key={JSON.stringify([
        state.session?.user.id,
        tenant.context?.organization.id,
        tenant.branchID,
      ])}
    />
  );
}

function SettingsContent() {
  const { t } = useLanguage();
  const { state } = useAuth();
  const tenant = useOrganization();
  const org = tenant.context?.organization;
  const user = state.session?.user.id;
  const csrf = state.session?.csrf_token;
  const canSave = Boolean(
    org?.id && org.code && csrf && tenant.can('organization.update'),
  );
  const [draft, setDraft] = useState<Partial<OrganizationInput>>({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const storefront = useQuery({
    queryKey: ['tenant', user, org?.id, 'storefront-settings', tenant.branchID],
    queryFn: async ({ signal }) => {
      try {
        return await posRequest<ShopSettings>(org!.id, '/storefront', {
          signal,
        });
      } catch {
        return null;
      }
    },
    enabled: Boolean(user && org?.id && tenant.can('storefront.manage')),
    retry: false,
  });
  const storefrontPath =
    user && storefront.data?.slug
      ? '/shop/' + encodeURIComponent(storefront.data.slug)
      : paths.shop;

  const name = draft.name ?? org?.name ?? '';
  const phone = draft.contact_phone ?? org?.contact_phone ?? '';
  const email = draft.contact_email ?? org?.contact_email ?? '';
  const address = draft.address ?? org?.address ?? '';

  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave || !org || saving) return;
    const body: OrganizationInput = {
      name,
      code: org.code,
      business_type: org.business_type,
      contact_phone: phone,
      contact_email: email,
      address,
    };
    setSaving(true);
    setFeedback(null);
    try {
      const updated = await organizationRequest<Organization>(
        '/organizations/' + org.id,
        {
          method: 'PATCH',
          csrf,
          body,
        },
      );
      setDraft({
        name: updated.name,
        contact_phone: updated.contact_phone,
        contact_email: updated.contact_email,
        address: updated.address,
      });
      setFeedback({ saved: true });
      void tenant.refresh();
    } catch (err) {
      setFeedback({ error: err instanceof Error ? err.message : '' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-page">
      <StandardPageHeader
        icon={<Settings size={26} />}
        title={t('organization.settingsTitle')}
        description={t('organization.settingsDescription')}
        actions={
          <div className="settings-heading-actions">
            <Link
              to={storefrontPath}
              className="settings-btn-secondary"
              target="_blank"
              rel="noreferrer"
            >
              <Store size={17} aria-hidden="true" />
              {t('organization.settingsStorefront')}
            </Link>
            {canSave && (
              <button
                type="submit"
                form="settings-form"
                className="settings-btn-primary"
                disabled={saving}
              >
                <Save size={17} aria-hidden="true" />
                {saving
                  ? t('organization.settingsSaving')
                  : t('organization.settingsSave')}
              </button>
            )}
          </div>
        }
      />
      <SaveFeedback
        feedback={feedback}
        success={t('organization.settingsSaved')}
      />
      {org?.business_type === 'RESTAURANT' &&
        tenant.context?.membership.role === 'OWNER' &&
        user &&
        csrf && (
          <AvailabilitySettings user={user} organization={org.id} csrf={csrf} />
        )}
      <div className="settings-grid">
        <div className="settings-column">
          <section className="settings-card" aria-labelledby="store-info-title">
            <header className="settings-card-header">
              <div className="settings-card-icon" aria-hidden="true">
                <Store size={20} />
              </div>
              <div>
                <h2 id="store-info-title" className="settings-card-title">
                  {t('organization.settingsStoreInfo')}
                </h2>
                <p className="settings-card-subtitle">
                  {t('organization.settingsStoreInfoDescription')}
                </p>
              </div>
            </header>
            <form
              id="settings-form"
              onSubmit={(event) => void saveDetails(event)}
              className="settings-card-body"
            >
              <div className="settings-field-group">
                <label className="settings-label" htmlFor="store-name">
                  {t('organization.settingsRestaurantName')}{' '}
                  <span className="settings-required">*</span>
                </label>
                <input
                  id="store-name"
                  type="text"
                  required
                  maxLength={200}
                  className="settings-input"
                  value={name}
                  readOnly={!canSave || saving}
                  onChange={(event) =>
                    setDraft({ ...draft, name: event.target.value })
                  }
                />
              </div>
              <div className="settings-form-row">
                <div className="settings-field-group">
                  <label className="settings-label" htmlFor="store-phone">
                    {t('organization.settingsPhone')}
                  </label>
                  <input
                    id="store-phone"
                    type="tel"
                    maxLength={30}
                    className="settings-input"
                    value={phone}
                    readOnly={!canSave || saving}
                    onChange={(event) =>
                      setDraft({ ...draft, contact_phone: event.target.value })
                    }
                  />
                </div>
                <div className="settings-field-group">
                  <label className="settings-label" htmlFor="store-email">
                    {t('organization.settingsEmail')}
                  </label>
                  <input
                    id="store-email"
                    type="email"
                    className="settings-input"
                    value={email}
                    readOnly={!canSave || saving}
                    onChange={(event) =>
                      setDraft({ ...draft, contact_email: event.target.value })
                    }
                  />
                </div>
              </div>
              <div className="settings-field-group">
                <label className="settings-label" htmlFor="store-address">
                  {t('organization.settingsAddress')}
                </label>
                <textarea
                  id="store-address"
                  rows={2}
                  maxLength={1000}
                  className="settings-textarea"
                  value={address}
                  readOnly={!canSave || saving}
                  onChange={(event) =>
                    setDraft({ ...draft, address: event.target.value })
                  }
                />
              </div>
            </form>
          </section>
        </div>
        <div className="settings-column">
          <ClosingHours />
          {tenant.can('storefront.manage') && (
            <section
              className="settings-card"
              aria-labelledby="storefront-card-title"
            >
              <header className="settings-card-header">
                <div className="settings-card-icon" aria-hidden="true">
                  <Store size={18} />
                </div>
                <div>
                  <h2
                    id="storefront-card-title"
                    className="settings-card-title"
                  >
                    {t('organization.settingsOnlineStore')}
                  </h2>
                  <p className="settings-card-subtitle">
                    {t('organization.settingsOnlineDescription')}
                  </p>
                </div>
              </header>
              <div className="settings-card-body">
                <Link
                  to={paths.storefrontSettings}
                  className="settings-btn-secondary"
                >
                  <Store size={16} aria-hidden="true" />
                  {t('organization.settingsGoOnline')}
                </Link>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function SaveFeedback({
  feedback,
  success,
}: {
  feedback: Feedback;
  success: string;
}) {
  const { t, localize } = useLanguage();
  if (!feedback) return null;
  if ('error' in feedback) {
    return (
      <div className="settings-toast settings-toast-error" role="alert">
        {feedback.error
          ? localize(feedback.error)
          : t('organization.settingsSaveError')}
      </div>
    );
  }
  return (
    <div className="settings-toast settings-toast-success" role="status">
      <CheckCircle2 size={18} aria-hidden="true" />
      {success}
    </div>
  );
}

function ClosingHours() {
  const { t, localize, language } = useLanguage();
  const { state } = useAuth();
  const tenant = useOrganization();
  const client = useQueryClient();
  const branch = tenant.branchID;
  const org = tenant.context?.organization.id;
  const user = state.session?.user.id;
  const csrf = state.session?.csrf_token;
  const canManage = tenant.can('storefront.manage');
  const key = ['tenant', user, org, 'restaurant-settings', branch];
  const query = useQuery({
    queryKey: key,
    queryFn: ({ signal }) =>
      posRequest<RestaurantSettingsData>(
        org!,
        '/restaurant/settings?branch_id=' + encodeURIComponent(branch),
        { signal },
      ),
    enabled: Boolean(user && org && branch && canManage),
    retry: false,
  });
  const [draft, setDraft] = useState<{
    time: string;
    base: RestaurantSettingsData;
  } | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const saved = query.data;

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!org || !csrf || !draft || saving || conflict || !canManage) return;
    setSaving(true);
    setFeedback(null);
    try {
      await client.cancelQueries({ queryKey: key, exact: true });
      const updated = await posRequest<RestaurantSettingsData>(
        org,
        '/restaurant/settings',
        {
          method: 'PATCH',
          csrf,
          body: {
            branch_id: branch,
            closing_time: draft.time,
            timezone: draft.base.timezone,
            revision: draft.base.revision,
          },
        },
      );
      if (!active.current) return;
      client.setQueryData(key, updated);
      setDraft(null);
      setFeedback({ saved: true });
    } catch (err) {
      setConflict(err instanceof ApiError && err.status === 409);
      setFeedback({ error: err instanceof Error ? err.message : '' });
    } finally {
      setSaving(false);
    }
  }

  async function reload() {
    const refreshed = await query.refetch();
    if (!refreshed.isSuccess) return;
    setDraft((previous) =>
      previous ? { ...previous, base: refreshed.data } : null,
    );
    setConflict(false);
  }

  function formatTime(value?: string) {
    return value && saved
      ? new Date(value).toLocaleString(language === 'th' ? 'th-TH' : 'en-GB', {
          timeZone: saved.timezone,
        })
      : '—';
  }

  if (!canManage) return null;
  return (
    <section className="settings-card" aria-labelledby="hours-title">
      <header className="settings-card-header">
        <div className="settings-card-icon" aria-hidden="true">
          <Clock size={18} />
        </div>
        <div>
          <h2 id="hours-title" className="settings-card-title">
            {t('organization.settingsHours')}
          </h2>
          <p className="settings-card-subtitle">
            {t('organization.settingsHoursDescription')}
          </p>
        </div>
      </header>
      <div className="settings-card-body">
        {!branch ? (
          <p>{t('restaurant.selectBranch')}</p>
        ) : query.isPending ? (
          <Loading>{t('organization.setupLoading')}</Loading>
        ) : query.error && !saved ? (
          <ErrorState
            message={localize(query.error.message)}
            retry={() => void query.refetch()}
          />
        ) : (
          saved && (
            <>
              <div className="settings-hours-info">
                <h3 className="settings-hours-title">
                  {t('organization.settingsCycleTitle')}
                </h3>
                <div className="settings-hours-cycle">
                  {t('organization.settingsCurrentPeriod', {
                    start: formatTime(saved.period?.start),
                    end: formatTime(saved.period?.end),
                  })}
                </div>
                <div className="settings-hours-time">
                  {t('organization.settingsClosingRange', {
                    time: saved.closing_time,
                  })}
                </div>
                <small className="settings-hours-notice">
                  {t('organization.settingsCycleExplanation')}
                </small>
              </div>
              <SaveFeedback
                feedback={feedback}
                success={t('organization.settingsHoursSaved')}
              />
              {conflict && (
                <button
                  type="button"
                  className="button button-secondary"
                  disabled={query.isFetching}
                  onClick={() => void reload()}
                >
                  {t('organization.settingsReloadHours')}
                </button>
              )}
              {conflict && query.error && (
                <p role="alert">{localize(query.error.message)}</p>
              )}
              <form
                onSubmit={(event) => void save(event)}
                className="settings-hours-edit-panel"
              >
                <div className="settings-field-group">
                  <label
                    className="settings-label"
                    htmlFor="closing-time-input"
                  >
                    {t('organization.settingsClosingTime')}
                  </label>
                  <input
                    id="closing-time-input"
                    type="time"
                    className="settings-input"
                    required
                    disabled={saving || !csrf}
                    value={draft?.time ?? saved.closing_time}
                    onChange={(event) =>
                      setDraft({
                        time: event.target.value,
                        base: draft?.base ?? saved,
                      })
                    }
                  />
                </div>
                <button
                  type="submit"
                  className="button button-primary settings-hours-btn"
                  disabled={
                    saving ||
                    conflict ||
                    !csrf ||
                    !draft ||
                    draft.time === saved.closing_time
                  }
                >
                  {saving
                    ? t('organization.settingsSaving')
                    : t('organization.settingsSaveClosing')}
                </button>
              </form>
            </>
          )
        )}
      </div>
    </section>
  );
}
