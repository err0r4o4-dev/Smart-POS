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
        <h2>{initial ? 'แก้ไข Supplier' : 'เพิ่ม Supplier'}</h2>
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
        <Field label="Supplier status">
          <select
            value={input.status}
            onChange={(event) =>
              setInput({ ...input, status: event.target.value })
            }
          >
            {['ACTIVE', 'INACTIVE', 'ARCHIVED'].map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>
        </Field>
        <Button type="submit" disabled={state.busy}>
          บันทึก Supplier
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
  const query = useSupplyQuery<SupplierProduct[]>(
    `/suppliers/${supplierID}/products`,
  );
  const [editing, setEditing] = useState<SupplierProduct | undefined>();
  return (
    <>
      <Card>
        <h2>สินค้าจาก Supplier · สูงสุด 100 รายการ</h2>
        <QueryFeedback
          loading={query.isLoading}
          error={query.error}
          empty={query.data?.length === 0}
        />
        {query.data && (
          <SupplyTable
            headers={[
              'SKU',
              'Supplier SKU',
              'ต้นทุน/หน่วยซื้อ',
              'Lead time',
              'Preferred',
              'สถานะ',
              'แก้ไข',
            ]}
          >
            {query.data.map((item) => (
              <tr key={item.id}>
                <td>{item.sku}</td>
                <td>{item.supplier_sku}</td>
                <td>{item.unit_cost}</td>
                <td>{item.lead_time_days} วัน</td>
                <td>{item.is_preferred ? 'Preferred' : '—'}</td>
                <td>{item.status}</td>
                <td>
                  {state.tenant.can('supplier.update') && (
                    <Button onClick={() => setEditing(item)}>
                      แก้ไขราคา/เงื่อนไข
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
          {initial ? 'แก้ไข Supplier Product' : 'เชื่อม Supplier Product'}
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
          label="Purchase Unit"
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
        <Field label="Lead time (days)">
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
        <Field label="Preferred Supplier">
          <select
            value={String(input.is_preferred)}
            onChange={(event) =>
              setInput({
                ...input,
                is_preferred: event.target.value === 'true',
              })
            }
          >
            <option value="false">ไม่ใช่ Preferred</option>
            <option value="true">Preferred (หนึ่งรายต่อ Variant)</option>
          </select>
        </Field>
        <Field label="Product link status">
          <select
            value={input.status}
            onChange={(event) =>
              setInput({ ...input, status: event.target.value })
            }
          >
            <option>ACTIVE</option>
            <option>INACTIVE</option>
          </select>
        </Field>
        <Button type="submit" disabled={state.busy}>
          บันทึก Supplier Product
        </Button>
      </form>
      <p>
        Purchase Unit ต้องตรงหน่วย Inventory หรือมี direct conversion
        ไปยังหน่วยนั้น ต้นทุนย้อนหลังไม่เปลี่ยนตามราคาปัจจุบัน
      </p>
      <Link to="/units">จัดการหน่วยและ conversion</Link>
    </Card>
  );
}
