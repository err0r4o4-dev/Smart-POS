import { useLanguage } from '../../app/language';
import { useState, type FormEvent } from 'react';
import { Card, Button } from '../../components/ui/primitives';
import { WorkspaceLink as Link } from '../../app/WorkspaceNavigation';
import type { Supplier, SupplierProduct } from '../../lib/purchasing-api';
import type { Taxonomy } from '../../lib/catalog-api';
import {
  Field,
  RemoteSelect,
  TextField,
  VariantPicker,
  SupplyTable,
  QueryFeedback,
} from './SupplyUI';
import { useSupplyQuery, type SupplyScope } from './purchasing-hooks';

const blankSupplier = {
  code: '',
  name: '',
  contact_person: '',
  email: '',
  phone: '',
  address: '',
  tax_identifier: '',
  notes: '',
  status: 'ACTIVE',
  revision: 0,
};
export function SupplierForm({
  state,
  initial,
  onSave,
}: {
  state: SupplyScope;
  initial?: Supplier;
  onSave?: (supplier: Supplier) => void;
}) {
  const { t, labelCode } = useLanguage();

  const [input, setInput] = useState(
    initial
      ? (Object.fromEntries(
          Object.keys(blankSupplier).map((key) => [
            key,
            initial[key as keyof Supplier],
          ]),
        ) as typeof blankSupplier)
      : blankSupplier,
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const supplier = await state.run<Supplier>(
        `/suppliers${initial ? '/' + initial.id : ''}`,
        input,
        initial ? 'PATCH' : 'POST',
      );
      onSave?.(supplier);
    } catch {
      return;
    }
  }
  return (
    <Card>
      <form onSubmit={(event) => void submit(event)} className="inventory-form">
        <h2>
          {initial ? t('purchasing.editSupplier') : t('purchasing.addSupplier')}
        </h2>
        {(
          [
            'code',
            'name',
            'contact_person',
            'email',
            'phone',
            'address',
            'tax_identifier',
            'notes',
          ] as const
        ).map((key) => (
          <TextField
            key={key}
            label={key}
            value={input[key]}
            required={key === 'code' || key === 'name'}
            type={key === 'email' ? 'email' : 'text'}
            change={(value) => setInput({ ...input, [key]: value })}
          />
        ))}
        <Field label={t('purchasing.supplierStatus')}>
          <select
            value={input.status}
            onChange={(event) =>
              setInput({ ...input, status: event.target.value })
            }
          >
            {['ACTIVE', 'INACTIVE', 'ARCHIVED'].map((status) => (
              <option key={status} value={status}>
                {labelCode(status)}
              </option>
            ))}
          </select>
        </Field>
        <Button type="submit" disabled={state.busy}>
          {t('purchasing.saveSupplier')}
        </Button>
      </form>
    </Card>
  );
}
export function SupplierProducts({
  state,
  supplierID,
}: {
  state: SupplyScope;
  supplierID: string;
}) {
  const { t, labelCode } = useLanguage();

  const query = useSupplyQuery<SupplierProduct[]>(
    `/suppliers/${supplierID}/products`,
  );
  const [editing, setEditing] = useState<SupplierProduct | undefined>();
  return (
    <>
      <Card>
        <h2>{t('purchasing.supplierProductsUpTo100Entries')}</h2>
        <QueryFeedback
          loading={query.isLoading}
          error={query.error}
          empty={query.data?.length === 0}
        />
        {query.data && (
          <SupplyTable
            headers={[
              t('common.sku'),
              t('purchasing.supplierSku'),
              t('purchasing.costPurchaseUnit'),
              t('purchasing.leadTime'),
              t('purchasing.preferred'),
              t('auth.status'),
              t('catalog.edit'),
            ]}
          >
            {query.data.map((item) => (
              <tr key={item.id}>
                <td>{item.sku}</td>
                <td>{item.supplier_sku}</td>
                <td>{item.unit_cost}</td>
                <td>
                  {item.lead_time_days} {t('purchasing.days')}
                </td>
                <td>{item.is_preferred ? t('purchasing.preferred') : '—'}</td>
                <td>{labelCode(item.status)}</td>
                <td>
                  {state.tenant.can('supplier.update') && (
                    <Button onClick={() => setEditing(item)}>
                      {t('purchasing.editPriceTerms')}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </SupplyTable>
        )}
      </Card>
      {state.tenant.can('supplier.update') && (
        <SupplierProductForm
          key={editing?.id ?? 'new'}
          state={state}
          supplierID={supplierID}
          initial={editing}
          onSave={() => setEditing(undefined)}
        />
      )}
    </>
  );
}
function SupplierProductForm({
  state,
  supplierID,
  initial,
  onSave,
}: {
  state: SupplyScope;
  supplierID: string;
  initial?: SupplierProduct;
  onSave: () => void;
}) {
  const { t } = useLanguage();

  const [input, setInput] = useState({
    variant_id: initial?.variant_id ?? '',
    purchase_unit_id: initial?.purchase_unit_id ?? '',
    supplier_sku: initial?.supplier_sku ?? '',
    unit_cost: initial?.unit_cost ?? '0.00',
    minimum_order_quantity: initial?.minimum_order_quantity ?? '1',
    order_multiple: initial?.order_multiple ?? '1',
    lead_time_days: initial?.lead_time_days ?? 0,
    is_preferred: initial?.is_preferred ?? false,
    status: initial?.status ?? 'ACTIVE',
    revision: initial?.revision ?? 0,
  });
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await state.run(
        `/suppliers/${supplierID}/products${initial ? '/' + initial.id : ''}`,
        input,
        initial ? 'PATCH' : 'POST',
      );
      onSave();
    } catch {
      return;
    }
  }
  return (
    <Card>
      <form className="inventory-form" onSubmit={(event) => void submit(event)}>
        <h2>
          {initial
            ? t('purchasing.editSupplierProduct')
            : t('purchasing.linkSupplierProduct')}
        </h2>
        {!initial && (
          <VariantPicker
            value={input.variant_id}
            change={(variant) =>
              setInput({
                ...input,
                variant_id: variant.id,
                purchase_unit_id: variant.unit_id,
              })
            }
          />
        )}
        <RemoteSelect<Taxonomy>
          label={t('purchasing.purchaseUnit2')}
          path="/units?status=ACTIVE"
          value={input.purchase_unit_id}
          change={(value) => setInput({ ...input, purchase_unit_id: value })}
          display={(unit) => `${unit.code} · ${unit.name}`}
        />
        {(
          [
            'supplier_sku',
            'unit_cost',
            'minimum_order_quantity',
            'order_multiple',
          ] as const
        ).map((key) => (
          <TextField
            key={key}
            label={key}
            value={input[key]}
            change={(value) => setInput({ ...input, [key]: value })}
            required={key !== 'supplier_sku'}
          />
        ))}
        <Field label={t('purchasing.leadTimeDays')}>
          <input
            required
            type="number"
            min="0"
            max="3650"
            value={input.lead_time_days}
            onChange={(event) =>
              setInput({ ...input, lead_time_days: Number(event.target.value) })
            }
          />
        </Field>
        <Field label={t('purchasing.preferredSupplier')}>
          <select
            value={String(input.is_preferred)}
            onChange={(event) =>
              setInput({
                ...input,
                is_preferred: event.target.value === 'true',
              })
            }
          >
            <option value="false">{t('purchasing.notPreferred')}</option>
            <option value="true">
              {t('purchasing.preferredOnePerVariant')}
            </option>
          </select>
        </Field>
        <Field label={t('purchasing.productLinkStatus')}>
          <select
            value={input.status}
            onChange={(event) =>
              setInput({ ...input, status: event.target.value })
            }
          >
            <option>{t('purchasing.active7')}</option>
            <option>{t('purchasing.inactive6')}</option>
          </select>
        </Field>
        <Button type="submit" disabled={state.busy}>
          {t('purchasing.saveSupplierProduct')}
        </Button>
      </form>
      <p>{t('purchasing.purchaseUnitsMustMatchInventoryUnitsOr')}</p>
      <Link to="/units">{t('purchasing.manageUnitsAndConversions')}</Link>
    </Card>
  );
}
