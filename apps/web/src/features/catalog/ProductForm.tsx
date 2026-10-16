import { useLanguage } from '../../app/language';
import { useState, type FormEvent } from 'react';
import { Button, Card } from '../../components/ui/primitives';
import type {
  ProductInput,
  VariantInput,
  Taxonomy,
  Variant,
} from '../../lib/catalog-api';
import {
  variantInput,
  blankVariant,
  validateVariantInput,
} from '../../lib/catalog-api';
import {
  CatalogError,
  CatalogField,
  TaxonomySelect,
  StatusSelect,
} from './CatalogUI';
import { useCatalog } from './catalog-hooks';

export function ProductFields({
  value,
  change,
  categories,
  brands,
  archive,
}: {
  value: ProductInput;
  change: (value: ProductInput) => void;
  categories: Taxonomy[];
  brands: Taxonomy[];
  archive: boolean;
}) {
  const { t } = useLanguage();

  return (
    <div className="tenant-form-grid">
      <CatalogField
        label={t('catalog.productName')}
        required
        value={value.name}
        change={(name) => change({ ...value, name })}
      />
      <StatusSelect
        value={value.status}
        change={(status) => change({ ...value, status })}
        archive={archive}
      />
      <TaxonomySelect
        label={t('catalog.productCategory')}
        value={value.category_id}
        items={categories}
        change={(category_id) => change({ ...value, category_id })}
      />
      <TaxonomySelect
        label={t('catalog.productBrand')}
        value={value.brand_id}
        items={brands}
        change={(brand_id) => change({ ...value, brand_id })}
      />
      <label className="tenant-field catalog-wide">
        {t('catalog.description')}
        <textarea
          maxLength={2000}
          rows={3}
          value={value.description}
          onChange={(event) =>
            change({ ...value, description: event.target.value })
          }
        />
      </label>
    </div>
  );
}
export function VariantFields({
  value,
  change,
  units,
  existing = false,
  archive = false,
}: {
  value: VariantInput;
  change: (value: VariantInput) => void;
  units: Taxonomy[];
  existing?: boolean;
  archive?: boolean;
}) {
  const { t } = useLanguage();

  const attributes = Object.entries(value.attributes);
  return (
    <div className="tenant-form-grid">
      <CatalogField
        label={t('common.sku')}
        value={value.sku}
        required
        maxLength={80}
        pattern="[A-Za-z0-9][A-Za-z0-9_.\-]{0,79}"
        disabled={existing}
        change={(sku) => change({ ...value, sku })}
      />
      <CatalogField
        label={t('catalog.variantName')}
        value={value.name}
        required
        change={(name) => change({ ...value, name })}
      />
      <TaxonomySelect
        label={t('catalog.variantUnit')}
        value={value.unit_id}
        required
        items={units}
        change={(unit_id) => change({ ...value, unit_id: unit_id ?? '' })}
      />
      <StatusSelect
        label={t('catalog.variantStatus')}
        value={value.status}
        archive={archive}
        change={(status) => change({ ...value, status })}
      />
      <CatalogField
        label={t('catalog.costPrice')}
        value={value.cost_price}
        required
        pattern="(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?"
        change={(cost_price) => change({ ...value, cost_price })}
      />
      <CatalogField
        label={t('catalog.sellingPrice')}
        value={value.selling_price}
        required
        pattern="(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?"
        change={(selling_price) => change({ ...value, selling_price })}
      />
      <div className="catalog-wide">
        <label className="tenant-field">
          {t('catalog.attributesSizeFlavorPackaging')}
          <textarea
            rows={2}
            aria-label={t('catalog.variantAttributes')}
            value={attributes.map(([key, item]) => `${key}=${item}`).join('\n')}
            onChange={(event) => {
              const next: Record<string, string> = {};
              for (const line of event.target.value.split('\n')) {
                const position = line.indexOf('=');
                if (position > 0)
                  next[line.slice(0, position)] = line.slice(position + 1);
                else if (line) next[line] = '';
              }
              change({ ...value, attributes: next });
            }}
          />
        </label>
        <small>{t('catalog.oneKeyValuePerLineUpTo')}</small>
      </div>
    </div>
  );
}
export function VariantEditor({
  variant,
  units,
  productID,
}: {
  variant?: Variant;
  units: Taxonomy[];
  productID: string;
}) {
  const { t } = useLanguage();

  const catalog = useCatalog();
  const [value, setValue] = useState(
    variant ? variantInput(variant) : { ...blankVariant },
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    const invalid = validateVariantInput(value);
    if (invalid) {
      setError(invalid);
      return;
    }
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const result = await catalog.request<Variant>(
        `/products/${productID}/variants${variant ? `/${variant.id}` : ''}`,
        variant ? 'PATCH' : 'POST',
        value,
      );
      if (variant) setValue(variantInput(result));
      else setValue({ ...blankVariant });
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
    <Card>
      <h3>
        {variant
          ? t('catalog.editValue0', { value0: variant.sku })
          : t('catalog.addVariant')}
      </h3>
      <form onSubmit={(event) => void submit(event)}>
        <VariantFields
          value={value}
          change={setValue}
          units={units}
          existing={!!variant}
          archive={catalog.tenant.can('catalog.archive')}
        />
        <CatalogError error={error} />
        {saved && <p role="status">{t('catalog.variantSaved')}</p>}
        <Button
          type="submit"
          disabled={
            busy ||
            (!variant && !catalog.tenant.can('catalog.create')) ||
            (!!variant && !catalog.tenant.can('catalog.update'))
          }
        >
          {busy ? t('catalog.saving') : t('catalog.saveVariant')}
        </Button>
      </form>
    </Card>
  );
}
