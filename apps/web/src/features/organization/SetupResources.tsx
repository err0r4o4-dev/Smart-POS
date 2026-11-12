import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../app/AuthProvider';
import { useOrganization } from '../../app/OrganizationProvider';
import { useLanguage } from '../../app/language';
import { Button } from '../../components/ui/primitives';
import { QueryFeedback } from '../../components/feedback/QueryFeedback';
import { organizationRequest } from '../../lib/organization-api';
import type { InventoryPageData, StockLocation } from '../../lib/inventory-api';
import { CommandEditor, LocationEditor } from '../inventory/InventoryForms';
import { useInventoryCommand } from '../inventory/inventory-hooks';
import { StorefrontSettingsPage } from '../storefront/OnlineOrderPages';

export type SetupResource = 'source' | 'stock' | 'storefront';

export function SetupResources({ resource }: { resource: SetupResource }) {
  const { t } = useLanguage();
  const tenant = useOrganization();
  const inventory = useInventoryCommand();
  const [page, setPage] = useState(1);
  const locations = useQuery({
    queryKey: [...inventory.key, 'setup-locations', page],
    queryFn: ({ signal }) =>
      organizationRequest<InventoryPageData<StockLocation>>(
        `${inventory.base}/locations?branch_id=${encodeURIComponent(tenant.branchID)}&status=ACTIVE&page_size=100&page=${page}`,
        { signal },
      ),
    enabled: resource !== 'storefront',
    retry: false,
  });
  if (resource === 'storefront') return <StorefrontSettingsPage embedded />;
  const choices = (locations.data?.items ?? []).filter(
    (location) =>
      location.branch_id === tenant.branchID &&
      location.status === 'ACTIVE' &&
      !location.is_system &&
      ['WAREHOUSE', 'SALES_FLOOR', 'SHELF'].includes(location.type),
  );
  return (
    <section
      className="setup-form-section catalog-page"
      aria-label={t('organization.setupConfigureSource')}
    >
      <QueryFeedback
        loading={locations.isPending}
        error={locations.error}
        retry={() => void locations.refetch()}
      />
      <QueryFeedback loading={inventory.busy} error={inventory.error} />
      {inventory.success && <p role="status">{inventory.success}</p>}
      {locations.isSuccess && (
        <>
          {resource === 'source' ? (
            <>
              <LocationEditor
                branch={tenant.branchID}
                locations={choices}
                run={inventory.run}
                busy={inventory.busy}
              />
              <TerminalSetupForm locations={choices} />
            </>
          ) : (
            <CommandEditor
              resource="opening-balances"
              locations={choices}
              run={inventory.run}
              busy={inventory.busy}
            />
          )}
          {(locations.data.total > 100 || page > 1) && (
            <div className="tenant-actions">
              <Button
                type="button"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                {t('organization.setupBack')}
              </Button>
              <span>{page}</span>
              <Button
                type="button"
                disabled={page * 100 >= locations.data.total}
                onClick={() => setPage(page + 1)}
              >
                {t('organization.setupNext')}
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function TerminalSetupForm({ locations }: { locations: StockLocation[] }) {
  const { t } = useLanguage();
  const { state } = useAuth();
  const tenant = useOrganization();
  const client = useQueryClient();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const controller = useRef(new AbortController());
  const submitting = useRef(false);
  useEffect(() => {
    const current = new AbortController();
    controller.current = current;
    return () => current.abort();
  }, []);
  const command = useMutation({
    retry: false,
    mutationFn: async () => {
      const signal = controller.current.signal;
      const result = await organizationRequest(
        `/organizations/${tenant.context!.organization.id}/pos/terminals`,
        {
          method: 'POST',
          csrf: state.session?.csrf_token,
          signal,
          body: {
            branch_id: tenant.branchID,
            code: code.trim().toUpperCase(),
            name: name.trim(),
            stock_location_id: location,
            status: 'ACTIVE',
          },
        },
      );
      signal.throwIfAborted();
      return result;
    },
    onSuccess: () =>
      client.invalidateQueries({
        queryKey: [
          'tenant',
          state.session?.user.id,
          tenant.context!.organization.id,
        ],
      }),
  });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (
      submitting.current ||
      command.isPending ||
      !code.trim() ||
      !name.trim() ||
      !locations.some((entry) => entry.id === location)
    )
      return;
    submitting.current = true;
    command.mutate(undefined, {
      onSettled: () => {
        submitting.current = false;
      },
    });
  };
  return (
    <form className="inventory-form" onSubmit={submit}>
      <h3>{t('pos.configureTerminal')}</h3>
      <QueryFeedback loading={command.isPending} error={command.error} />
      {command.isSuccess && (
        <p role="status">{t('organization.setupSourceSaved')}</p>
      )}
      <label className="setup-field">
        <span>{t('pos.terminalCode')}</span>
        <input
          required
          disabled={command.isPending}
          maxLength={80}
          value={code}
          onChange={(event) => {
            command.reset();
            setCode(event.target.value);
          }}
        />
      </label>
      <label className="setup-field">
        <span>{t('pos.terminalName')}</span>
        <input
          required
          disabled={command.isPending}
          maxLength={200}
          value={name}
          onChange={(event) => {
            command.reset();
            setName(event.target.value);
          }}
        />
      </label>
      <label className="setup-field">
        <span>{t('pos.sellingStockLocation')}</span>
        <select
          required
          disabled={command.isPending}
          value={location}
          onChange={(event) => {
            command.reset();
            setLocation(event.target.value);
          }}
        >
          <option value="">{t('pos.selectLocation')}</option>
          {locations.map((entry) => (
            <option key={entry.id} value={entry.id}>
              {entry.name} ({entry.type})
            </option>
          ))}
        </select>
      </label>
      <Button
        type="submit"
        disabled={
          command.isPending ||
          command.isSuccess ||
          !code.trim() ||
          !name.trim() ||
          !locations.some((entry) => entry.id === location)
        }
      >
        {t('pos.createTerminal')}
      </Button>
    </form>
  );
}
