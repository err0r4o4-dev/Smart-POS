import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button } from '../../components/ui/primitives';
import type { StockLocation } from '../../lib/inventory-api';
import type {
  Supplier,
  SupplierProduct,
  OrderLineInput,
  PurchaseDocument,
} from '../../lib/purchasing-api';
import { exactOrderTotal } from '../../lib/purchasing-api';
import { exactDecimal } from '../../lib/pos-api';
import { useSupplyQuery, type SupplyScope } from './purchasing-hooks';
import { Field, TextField, RemoteSelect, QueryFeedback } from './SupplyUI';

export function OrderForm({
  state,
  initial,
}: {
  state: SupplyScope;
  initial?: PurchaseDocument;
}) {
  const navigate = useNavigate();
  const [supplier, setSupplier] = useState(initial?.supplier_id ?? ''),
    [notes, setNotes] = useState(initial?.notes ?? ''),
    [date, setDate] = useState(initial?.expected_delivery_date ?? '');
  const [lines, setLines] = useState<OrderLineInput[]>(
    initial?.items.map((item) => ({
      variant_id: item.variant_id,
      purchase_unit_id: item.purchase_unit_id,
      quantity: item.quantity,
      unit_cost: item.unit_cost,
    })) ?? [
      {
        variant_id: '',
        purchase_unit_id: '',
        quantity: '1',
        unit_cost: '0.00',
      },
    ],
  );
  const links = useSupplyQuery<SupplierProduct[]>(
    `/suppliers/${supplier}/products`,
    !!supplier,
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await state.run<PurchaseDocument>(
        `/purchasing/orders${initial ? '/' + initial.id : ''}`,
        {
          supplier_id: supplier,
          branch_id: state.branch,
          expected_delivery_date: date,
          notes,
          items: lines,
          ...(initial ? { revision: initial.revision } : {}),
        },
        initial ? 'PATCH' : 'POST',
      );
      navigate('/purchasing/orders/' + result.id);
    } catch {
      return;
    }
  }
  return (
    <Card>
      <form onSubmit={(event) => void submit(event)}>
        <h2>{initial ? 'แก้ไข PO Draft' : 'สร้างใบสั่งซื้อ (Draft)'}</h2>
        <p>
          สาขา:{' '}
          {state.tenant.context?.branches.find(
            (branch) => branch.id === state.branch,
          )?.name ?? 'เลือกสาขาจาก header'}{' '}
          · การสร้าง Draft ไม่เพิ่มสต็อก
        </p>
        {!initial && (
          <RemoteSelect<Supplier>
            label="Supplier"
            path="/suppliers?status=ACTIVE"
            value={supplier}
            change={(value) => {
              setSupplier(value);
              setLines([
                {
                  variant_id: '',
                  purchase_unit_id: '',
                  quantity: '1',
                  unit_cost: '0.00',
                },
              ]);
            }}
            display={(item) => `${item.code} · ${item.name}`}
          />
        )}
        <QueryFeedback
          loading={links.isLoading}
          error={links.error}
          empty={!!supplier && links.data?.length === 0}
        />
        {lines.map((line, index) => (
          <fieldset className="supply-line" key={index}>
            <legend>รายการ {index + 1}</legend>
            <div className="inventory-form">
              <Field label={`Supplier Product ${index + 1}`}>
                <select
                  required
                  value={line.variant_id}
                  onChange={(event) => {
                    const link = links.data?.find(
                      (item) => item.variant_id === event.target.value,
                    );
                    if (link)
                      setLines(
                        lines.map((line, position) =>
                          position === index
                            ? {
                                variant_id: link.variant_id,
                                purchase_unit_id: link.purchase_unit_id,
                                quantity: link.minimum_order_quantity,
                                unit_cost: link.unit_cost,
                              }
                            : line,
                        ),
                      );
                  }}
                >
                  <option value="">เลือกสินค้า</option>
                  {line.variant_id &&
                    !links.data?.some(
                      (item) => item.variant_id === line.variant_id,
                    ) && (
                      <option value={line.variant_id}>
                        Snapshot · {initial?.items[index]?.sku_snapshot}
                      </option>
                    )}
                  {links.data
                    ?.filter((item) => item.status === 'ACTIVE')
                    .map((item) => (
                      <option key={item.id} value={item.variant_id}>
                        {item.sku} · {item.name} / SKU supplier{' '}
                        {item.supplier_sku}
                      </option>
                    ))}
                </select>
              </Field>
              <p>
                Purchase Unit: {line.purchase_unit_id || 'เลือกสินค้า'} · MOQ /
                multiple ตาม Supplier Product
              </p>
              <TextField
                label={`Quantity ${index + 1}`}
                value={line.quantity}
                required
                change={(value) =>
                  setLines(
                    lines.map((line, position) =>
                      position === index ? { ...line, quantity: value } : line,
                    ),
                  )
                }
              />
              <TextField
                label={`Unit cost ${index + 1}`}
                value={line.unit_cost}
                required
                change={(value) =>
                  setLines(
                    lines.map((line, position) =>
                      position === index ? { ...line, unit_cost: value } : line,
                    ),
                  )
                }
              />
            </div>
            <Button
              disabled={lines.length === 1}
              onClick={() =>
                setLines(lines.filter((_, position) => position !== index))
              }
            >
              ลบรายการ {index + 1}
            </Button>
          </fieldset>
        ))}
        <Button
          disabled={lines.length >= 100 || state.busy}
          onClick={() =>
            setLines([
              ...lines,
              {
                variant_id: '',
                purchase_unit_id: '',
                quantity: '1',
                unit_cost: '0.00',
              },
            ])
          }
        >
          เพิ่มรายการ PO
        </Button>
        <div className="inventory-form">
          <TextField
            label="Expected delivery date"
            type="date"
            value={date}
            change={setDate}
          />
          <TextField label="PO Notes" value={notes} change={setNotes} />
        </div>
        <p>
          รวมประมาณการ (HALF_UP ต่อรายการ):{' '}
          {exactOrderTotal(lines) ?? 'ตรวจสอบจำนวนและราคา'} THB — ยอดจาก server
          เป็น authoritative; ไม่คำนวณภาษีที่ไม่ได้กำหนด
        </p>
        <Button
          type="submit"
          disabled={state.busy || !state.branch || !supplier}
        >
          บันทึก PO Draft
        </Button>
      </form>
    </Card>
  );
}
export function ReceivingForm({
  state,
  resource,
  initial,
  onSave,
}: {
  state: SupplyScope;
  resource: 'receipts' | 'returns';
  initial?: PurchaseDocument;
  onSave: (document: PurchaseDocument) => void;
}) {
  const [parent, setParent] = useState(initial?.parent_id ?? '');
  const parentResource = resource === 'receipts' ? 'orders' : 'receipts';
  const query = useSupplyQuery<PurchaseDocument>(
    `/purchasing/${parentResource}/${parent}`,
    !!parent,
  );
  return (
    <Card>
      <h2>
        {resource === 'receipts'
          ? 'ตรวจรับสินค้าจาก PO'
          : 'สร้างคำขอคืน Supplier'}
      </h2>
      <p>
        {resource === 'receipts'
          ? 'รับเฉพาะ accepted quantity; damaged เป็น subset ของ rejected และไม่เป็น owned sellable stock'
          : 'การคืนเป็น allocation อ้างอิง receipt ไม่ใช่ batch/serial proof และไม่ใช่การคืนเงิน'}
      </p>
      {!initial && (
        <RemoteSelect<PurchaseDocument>
          label={resource === 'receipts' ? 'Outstanding PO' : 'Posted Receipt'}
          path={`/purchasing/${parentResource}?branch_id=${state.branch}`}
          value={parent}
          change={setParent}
          display={(item) =>
            `${item.number.slice(0, 8)} · ${item.supplier_snapshot.name} · ${item.status}`
          }
        />
      )}
      <QueryFeedback loading={query.isLoading} error={query.error} />
      {query.data && (
        <InspectionForm
          key={parent + ':' + (initial?.revision ?? 0)}
          state={state}
          resource={resource}
          parent={query.data}
          initial={initial}
          onSave={onSave}
        />
      )}
    </Card>
  );
}
function InspectionForm({
  state,
  resource,
  parent,
  initial,
  onSave,
}: {
  state: SupplyScope;
  resource: 'receipts' | 'returns';
  parent: PurchaseDocument;
  initial?: PurchaseDocument;
  onSave: (document: PurchaseDocument) => void;
}) {
  const [location, setLocation] = useState(initial?.location_id ?? ''),
    [notes, setNotes] = useState(initial?.notes ?? '');
  const [lines, setLines] = useState(
    parent.items.map((item) => {
      const saved = initial?.items.find(
          (line) => line.parent_item_id === item.id,
        ),
        quantity =
          saved?.quantity ??
          (resource === 'receipts' ? item.outstanding_quantity : item.quantity);
      return {
        variant_id: item.variant_id,
        parent_item_id: item.id,
        quantity,
        delivered_quantity: saved?.delivered_quantity ?? quantity,
        rejected_quantity: saved?.rejected_quantity ?? '0',
        damaged_quantity: saved?.damaged_quantity ?? '0',
        reason: saved?.reason ?? '',
      };
    }),
  );
  const validParent =
    resource === 'receipts'
      ? ['ORDERED', 'PARTIALLY_RECEIVED'].includes(parent.status)
      : parent.status === 'POSTED';
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const selected = lines
        .filter((line) => (exactDecimal(line.quantity, 3) ?? 0n) > 0n)
        .map((line) =>
          resource === 'receipts'
            ? line
            : {
                variant_id: line.variant_id,
                parent_item_id: line.parent_item_id,
                quantity: line.quantity,
                reason: line.reason,
              },
        );
      const document = await state.run<PurchaseDocument>(
        `/purchasing/${resource}${initial ? '/' + initial.id : ''}`,
        {
          branch_id: state.branch,
          supplier_id: parent.supplier_id,
          parent_id: parent.id,
          location_id: location,
          notes,
          items: selected,
          ...(initial ? { revision: initial.revision } : {}),
        },
        initial ? 'PATCH' : 'POST',
      );
      onSave(document);
    } catch {
      return;
    }
  }
  return (
    <form onSubmit={(event) => void submit(event)}>
      <h3>
        {parent.number} · {parent.status}
      </h3>
      {!validParent && (
        <p role="alert">
          เอกสารต้นทางยังไม่พร้อม: ต้อง issued PO / posted receipt
        </p>
      )}
      <RemoteSelect<StockLocation>
        label={
          resource === 'receipts'
            ? 'Destination Warehouse'
            : 'Return Source Location'
        }
        path={`/inventory/locations?branch_id=${state.branch}&status=ACTIVE${resource === 'receipts' ? '&type=WAREHOUSE' : ''}`}
        value={location}
        change={setLocation}
        display={(item) => `${item.code} · ${item.name} · ${item.type}`}
      />
      {lines.map((line, index) => (
        <fieldset className="supply-line" key={line.parent_item_id}>
          <legend>
            {parent.items[index].sku_snapshot} ·{' '}
            {parent.items[index].unit_snapshot}
          </legend>
          <p>
            Ordered / received: {parent.items[index].quantity} · outstanding:{' '}
            {parent.items[index].outstanding_quantity} · conversion snapshot:{' '}
            {parent.items[index].conversion_factor}
          </p>
          <div className="inventory-form">
            <TextField
              label={
                resource === 'receipts'
                  ? `Accepted ${index + 1}`
                  : `Return quantity ${index + 1}`
              }
              value={line.quantity}
              required
              change={(value) =>
                setLines(
                  lines.map((line, position) =>
                    position === index ? { ...line, quantity: value } : line,
                  ),
                )
              }
            />
            {resource === 'receipts' &&
              (
                [
                  'delivered_quantity',
                  'rejected_quantity',
                  'damaged_quantity',
                ] as const
              ).map((key) => (
                <TextField
                  key={key}
                  label={`${key} ${index + 1}`}
                  value={line[key]}
                  required
                  change={(value) =>
                    setLines(
                      lines.map((line, position) =>
                        position === index ? { ...line, [key]: value } : line,
                      ),
                    )
                  }
                />
              ))}
            <TextField
              label={`Variance / return reason ${index + 1}`}
              value={line.reason}
              change={(value) =>
                setLines(
                  lines.map((line, position) =>
                    position === index ? { ...line, reason: value } : line,
                  ),
                )
              }
            />
          </div>
        </fieldset>
      ))}
      <p>
        Quantity 0 หมายถึงไม่รวมรายการนี้ ต้องมี accepted / return
        อย่างน้อยหนึ่งรายการ; หลักฐานสินค้าที่ปฏิเสธทั้งหมดโดยไม่มี accepted
        document ยังไม่รองรับ
      </p>
      <TextField label="Inspection Notes" value={notes} change={setNotes} />
      <Button type="submit" disabled={state.busy || !validParent || !location}>
        บันทึก {resource === 'receipts' ? 'Receipt' : 'Supplier Return'} Draft
      </Button>
    </form>
  );
}
