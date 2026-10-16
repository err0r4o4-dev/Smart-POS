import { useLanguage } from '../../app/language';
import { useState, type FormEvent } from 'react';
import { Button, Card, Tag } from '../../components/ui/primitives';
import type {
  CatalogPage,
  Taxonomy,
  TaxonomyInput,
} from '../../lib/catalog-api';
import {
  CatalogError,
  CatalogField,
  CatalogHeader,
  CatalogLoading,
  CatalogNav,
  StatusSelect,
  TaxonomySelect,
  Pagination,
} from './CatalogUI';
import {
  useCatalog,
  useCatalogQuery,
  useTaxonomyOptions,
} from './catalog-hooks';

type Kind = 'categories' | 'brands' | 'units';
const labels = {
  categories: 'catalog.categories',
  brands: 'catalog.brands',
  units: 'catalog.units',
} as const;

function statusTone(status: string): 'success' | 'amber' | 'neutral' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'INACTIVE') return 'amber';
  return 'neutral';
}
const permissions = {
  categories: 'catalog.category.manage',
  brands: 'catalog.brand.manage',
  units: 'catalog.unit.manage',
};
function blank(kind: Kind): TaxonomyInput {
  return {
    name: '',
    description: '',
    status: 'ACTIVE',
    revision: 0,
    ...(kind === 'categories' ? { parent_id: null } : {}),
    ...(kind === 'units'
      ? {
          code: '',
          unit_type: 'COUNT',
          base_unit_id: null,
          conversion_factor: '1',
        }
      : {}),
  };
}
function inputOf(item: Taxonomy, kind: Kind): TaxonomyInput {
  return {
    ...blank(kind),
    name: item.name,
    description: item.description,
    status: item.status,
    revision: item.revision,
    ...(kind === 'categories' ? { parent_id: item.parent_id ?? null } : {}),
    ...(kind === 'units'
      ? {
          code: item.code,
          unit_type: item.unit_type,
          base_unit_id: item.base_unit_id ?? null,
          conversion_factor: item.conversion_factor,
        }
      : {}),
  };
}
export function TaxonomyPage({ kind }: { kind: Kind }) {
  const { t, labelCode } = useLanguage();

  const catalog = useCatalog();
  const allowed = catalog.tenant.can(permissions[kind]);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<Taxonomy | null>(null);
  const [value, setValue] = useState<TaxonomyInput>(blank(kind));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const query = useCatalogQuery<CatalogPage<Taxonomy>>(
    `/${kind}?page=${page}&page_size=20&search=${encodeURIComponent(search)}&status=${status}`,
  );
  const options = useTaxonomyOptions(kind);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      await catalog.request(
        `/${kind}${editing ? `/${editing.id}` : ''}`,
        editing ? 'PATCH' : 'POST',
        value,
      );
      setEditing(null);
      setValue(blank(kind));
      await catalog.refresh();
      setSaved(true);
    } catch (problem) {
      setError(
        problem instanceof Error ? problem.message : t('catalog.unableToSave'),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="catalog-page">
      <CatalogHeader title={t(labels[kind])} />
      <CatalogNav />
      <Card>
        <div className="catalog-filters">
          <CatalogField
            label={t('catalog.searchValue0', { value0: t(labels[kind]) })}
            value={search}
            change={(next) => {
              setSearch(next);
              setPage(1);
            }}
          />
          <label className="tenant-field">
            {t('catalog.filterStatus')}
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">{t('catalog.activeInactive2')}</option>
              {['ACTIVE', 'INACTIVE', 'ARCHIVED'].map((item) => (
                <option key={item} value={item}>
                  {labelCode(item)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <CatalogLoading pending={query.isPending} />
        <CatalogError error={query.error ?? options.error} />
        {query.data && (
          <>
            <div className="catalog-table-wrap">
              <table className="catalog-table">
                <thead>
                  <tr>
                    <th>{t('common.name')}</th>
                    {kind === 'units' && (
                      <>
                        <th>{t('catalog.codeType')}</th>
                        <th>{t('catalog.conversion')}</th>
                      </>
                    )}
                    <th>{t('auth.status')}</th>
                    {allowed && <th>{t('catalog.manage')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {query.data.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        {item.name}
                        <small>{item.description}</small>
                        {kind === 'categories' && item.parent_id && (
                          <small>
                            {t('catalog.parentCategory')}{' '}
                            {options.data?.find(
                              (parent) => parent.id === item.parent_id,
                            )?.name ?? item.parent_id}
                          </small>
                        )}
                      </td>
                      {kind === 'units' && (
                        <>
                          <td>
                            {item.code}
                            <small>{labelCode(item.unit_type)}</small>
                          </td>
                          <td>
                            {item.conversion_factor}{' '}
                            {item.base_unit_id
                              ? `× ${options.data?.find((unit) => unit.id === item.base_unit_id)?.name ?? t('catalog.baseUnit')}`
                              : t('catalog.baseUnit')}
                          </td>
                        </>
                      )}
                      <td>
                        <Tag tone={statusTone(item.status)}>
                          {labelCode(item.status)}
                        </Tag>
                      </td>
                      {allowed && (
                        <td>
                          <Button
                            className="button-secondary"
                            onClick={() => {
                              setEditing(item);
                              setValue(inputOf(item, kind));
                              setSaved(false);
                            }}
                          >
                            {t('catalog.edit')} {item.name}
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!query.data.items.length && (
              <p>
                {t('catalog.noneYet')}
                {t(labels[kind])}
              </p>
            )}
            <Pagination page={page} total={query.data.total} change={setPage} />
          </>
        )}
      </Card>
      {allowed && (
        <Card>
          <h2>
            {editing
              ? t('catalog.editValue02', { value0: editing.name })
              : t('catalog.addValue0', { value0: t(labels[kind]) })}
          </h2>
          <form onSubmit={(event) => void submit(event)}>
            <div className="tenant-form-grid">
              <CatalogField
                label={t('catalog.value0Name', { value0: t(labels[kind]) })}
                required
                value={value.name}
                change={(name) => setValue({ ...value, name })}
              />
              <StatusSelect
                value={value.status}
                archive={!!editing}
                change={(next) => setValue({ ...value, status: next })}
              />
              <CatalogField
                label={t('catalog.value0Description', {
                  value0: t(labels[kind]),
                })}
                value={value.description}
                maxLength={2000}
                change={(description) => setValue({ ...value, description })}
              />
              {kind === 'categories' && (
                <TaxonomySelect
                  label={t('catalog.parentCategory2')}
                  value={value.parent_id ?? null}
                  items={(options.data ?? []).filter(
                    (item) => item.id !== editing?.id,
                  )}
                  change={(parent_id) => setValue({ ...value, parent_id })}
                />
              )}
              {kind === 'units' && (
                <>
                  <CatalogField
                    label={t('catalog.unitCode')}
                    required
                    maxLength={50}
                    value={value.code ?? ''}
                    change={(code) => setValue({ ...value, code })}
                  />
                  <label className="tenant-field">
                    {t('catalog.unitType')}
                    <select
                      value={value.unit_type}
                      onChange={(event) =>
                        setValue({ ...value, unit_type: event.target.value })
                      }
                    >
                      {['COUNT', 'WEIGHT', 'VOLUME', 'PACKAGING'].map(
                        (item) => (
                          <option key={item} value={item}>
                            {labelCode(item)}
                          </option>
                        ),
                      )}
                    </select>
                  </label>
                  <TaxonomySelect
                    label={t('catalog.baseUnit')}
                    value={value.base_unit_id ?? null}
                    items={(options.data ?? []).filter(
                      (item) => !item.base_unit_id && item.id !== editing?.id,
                    )}
                    change={(base_unit_id) =>
                      setValue({
                        ...value,
                        base_unit_id,
                        conversion_factor: base_unit_id
                          ? value.conversion_factor
                          : '1',
                      })
                    }
                  />
                  <CatalogField
                    label={t('catalog.baseUnitsPer1Unit')}
                    required
                    value={value.conversion_factor ?? '1'}
                    change={(conversion_factor) =>
                      setValue({ ...value, conversion_factor })
                    }
                  />
                </>
              )}
            </div>
            {kind === 'units' && (
              <p className="notice">
                {t('catalog.conversionIsExactMetadata6DecimalPlaces')}
              </p>
            )}
            <CatalogError error={error} />
            {saved && <p role="status">{t('catalog.saved')}</p>}
            <div className="catalog-actions">
              <Button type="submit" disabled={busy}>
                {busy
                  ? t('catalog.saving')
                  : t('catalog.saveValue0', { value0: t(labels[kind]) })}
              </Button>
              {editing && (
                <Button
                  className="button-secondary"
                  onClick={() => {
                    setEditing(null);
                    setValue(blank(kind));
                  }}
                >
                  {t('catalog.cancelEditing')}
                </Button>
              )}
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
