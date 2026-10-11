import { useState, type FormEvent } from 'react';
import { WorkspaceLink as Link } from '../../app/WorkspaceNavigation';
import { useOrganization } from '../../app/OrganizationProvider';
import type {
  InventoryDocument,
  InventoryItem,
  ReorderPoint,
  StockLocation,
} from '../../lib/inventory-api';
import { quantityVariance, variancePercent } from '../../lib/inventory-api';
import { Button, Card } from '../../components/ui/primitives';
import { BatchPicker, type BatchSelection } from '../quality/BatchPicker';
import { untrackedBatch } from '../../lib/quality-api';
import { Field, Table, VariantPicker } from './InventoryUI';
import type { InventoryRun as Run } from './inventory-hooks';

export function LocationEditor({
  branch,
  locations,
  run,
  busy,
  initial,
}: {
  branch: string;
  locations: StockLocation[];
  run: Run;
  busy: boolean;
  initial?: StockLocation;
}) {
  const [editing, setEditing] = useState(!initial);
  const [code, setCode] = useState(initial?.code ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [type, setType] = useState(initial?.type ?? 'WAREHOUSE');
  const [status, setStatus] = useState(initial?.status ?? 'ACTIVE');
  const [parent, setParent] = useState(initial?.parent_location_id ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await run(
        `/locations${initial ? '/' + initial.id : ''}`,
        initial ? 'PATCH' : 'POST',
        {
          branch_id: branch,
          code: code.toUpperCase(),
          name,
          type,
          status,
          parent_location_id: parent || null,
          description,
          revision: initial?.revision ?? 0,
        },
      );
      if (initial) setEditing(false);
      else {
        setCode('');
        setName('');
      }
    } catch {
      return;
    }
  }
  if (!editing)
    return (
      <Button
        type="button"
        className="button-secondary"
        onClick={() => setEditing(true)}
      >
        แก้ไข {initial?.code}
      </Button>
    );
  return (
    <form onSubmit={(event) => void submit(event)} className="inventory-form">
      <h3>{initial ? 'แก้ไข Location' : 'สร้าง Location'}</h3>
      <Field label="Location code">
        <input
          required
          maxLength={80}
          value={code}
          onChange={(event) => setCode(event.target.value)}
        />
      </Field>
      <Field label="Location name">
        <input
          required
          maxLength={200}
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Field>
      <Field label="Location type">
        <select value={type} onChange={(event) => setType(event.target.value)}>
          {['WAREHOUSE', 'SALES_FLOOR', 'SHELF', 'QUARANTINE', 'DAMAGED'].map(
            (item) => (
              <option key={item}>{item}</option>
            ),
          )}
        </select>
      </Field>
      <Field label="Parent location (navigation only)">
        <select
          value={parent}
          onChange={(event) => setParent(event.target.value)}
        >
          <option value="">ไม่มี parent</option>
          {parent && !locations.some((item) => item.id === parent) && (
            <option value={parent}>Selected parent {parent}</option>
          )}
          {locations.map((item) => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Location status">
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option>ACTIVE</option>
          <option>INACTIVE</option>
        </select>
      </Field>
      <Field label="Location description">
        <textarea
          maxLength={2000}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>
      <Button disabled={busy || !branch} type="submit">
        บันทึก Location
      </Button>
    </form>
  );
}
export function CommandEditor({
  resource,
  locations,
  destinations = [],
  branchChoices = [],
  destinationBranch = '',
  setDestinationBranch,
  run,
  busy,
  created,
}: {
  resource: string;
  locations: StockLocation[];
  destinations?: StockLocation[];
  branchChoices?: { id: string; name: string }[];
  destinationBranch?: string;
  setDestinationBranch?: (id: string) => void;
  run: Run;
  busy: boolean;
  created?: (doc: InventoryDocument) => void;
}) {
  const [location, setLocation] = useState('');
  const [destination, setDestination] = useState('');
  const [type, setType] = useState('INCREASE');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [assigned, setAssigned] = useState('');
  const [items, setItems] = useState<
    ({ variant_id: string; quantity: string } & BatchSelection)[]
  >([{ variant_id: '', quantity: '', ...untrackedBatch }]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (
      resource === 'opening-balances' &&
      !window.confirm('ยืนยัน Opening Balance ครั้งเดียวต่อ stock identity?')
    )
      return;
    try {
      const doc = await run<InventoryDocument>(`/${resource}`, 'POST', {
        location_id: location,
        reason_code: reason,
        notes,
        items: items.map((item) => ({
          ...item,
          quantity: resource === 'counts' ? '0' : item.quantity,
        })),
        ...(resource === 'transfers'
          ? { destination_location_id: destination }
          : {}),
        ...(resource === 'adjustments' ? { adjustment_type: type } : {}),
        ...(resource === 'counts' && assigned ? { assigned_to: assigned } : {}),
      });
      if (created) created(doc);
      setReason('');
      setItems([{ variant_id: '', quantity: '', ...untrackedBatch }]);
    } catch {
      return;
    }
  }
  return (
    <Card>
      <form className="inventory-form" onSubmit={(event) => void submit(event)}>
        <h2>
          {resource === 'opening-balances'
            ? 'Opening Balance'
            : 'สร้าง ' + resource}
        </h2>
        <p>
          Draft/physical count ไม่เปลี่ยน stock; CORRECTION คือ target quantity
          แบบ snapshot-version validation
        </p>
        <Field label="Source / Count Location">
          <select
            required
            value={location}
            onChange={(event) => setLocation(event.target.value)}
          >
            <option value="">เลือก Location</option>
            {location && !locations.some((item) => item.id === location) && (
              <option value={location}>Selected location {location}</option>
            )}
            {locations.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name} · {item.type}
              </option>
            ))}
          </select>
        </Field>
        {resource === 'transfers' && (
          <>
            <Field label="Destination branch">
              <select
                value={destinationBranch}
                onChange={(event) => {
                  setDestinationBranch?.(event.target.value);
                  setDestination('');
                }}
              >
                {branchChoices.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Destination location">
              <select
                required
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
              >
                <option value="">เลือกปลายทาง</option>
                {destination &&
                  !destinations.some((item) => item.id === destination) && (
                    <option value={destination}>
                      Selected destination {destination}
                    </option>
                  )}
                {destinations
                  .filter(
                    (item) =>
                      !item.is_system &&
                      item.status === 'ACTIVE' &&
                      item.id !== location,
                  )
                  .map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </Field>
          </>
        )}
        {resource === 'adjustments' && (
          <Field label="Adjustment type">
            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              {['INCREASE', 'DECREASE', 'CORRECTION'].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </Field>
        )}
        {resource === 'counts' && (
          <Field label="Assigned counter user UUID (optional)">
            <input
              value={assigned}
              onChange={(event) => setAssigned(event.target.value)}
            />
          </Field>
        )}
        {items.map((item, index) => (
          <fieldset key={index}>
            <legend>Item {index + 1}</legend>
            <VariantPicker
              value={item.variant_id}
              change={(value) =>
                setItems(
                  items.map((row, position) =>
                    position === index
                      ? { ...row, variant_id: value, ...untrackedBatch }
                      : row,
                  ),
                )
              }
            />
            {resource !== 'counts' && (
              <BatchPicker
                key={`${item.variant_id}:${location}`}
                variant={item.variant_id}
                branch={
                  locations.find((value) => value.id === location)?.branch_id
                }
                location={
                  resource === 'transfers' || type === 'DECREASE'
                    ? location
                    : undefined
                }
                value={item}
                label={`Batch/Lot ${index + 1}`}
                change={(selection) =>
                  setItems(
                    items.map((value, position) =>
                      position === index ? { ...value, ...selection } : value,
                    ),
                  )
                }
              />
            )}
            {resource !== 'counts' && (
              <Field label={`Quantity ${index + 1}`}>
                <input
                  required
                  inputMode="decimal"
                  pattern="[0-9]+(\.[0-9]{1,3})?"
                  value={item.quantity}
                  onChange={(event) =>
                    setItems(
                      items.map((row, position) =>
                        position === index
                          ? { ...row, quantity: event.target.value }
                          : row,
                      ),
                    )
                  }
                />
              </Field>
            )}
            {items.length > 1 && (
              <Button
                type="button"
                className="button-secondary"
                onClick={() =>
                  setItems(items.filter((_, position) => position !== index))
                }
              >
                นำ Item {index + 1} ออก
              </Button>
            )}
          </fieldset>
        ))}
        <Button
          type="button"
          className="button-secondary"
          disabled={items.length >= 100}
          onClick={() =>
            setItems([
              ...items,
              { variant_id: '', quantity: '', ...untrackedBatch },
            ])
          }
        >
          เพิ่ม Item
        </Button>
        <Field label="Reason / Reference">
          <input
            required
            maxLength={100}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        <Field label="Notes">
          <textarea
            maxLength={2000}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </Field>
        <Button disabled={busy} type="submit">
          {resource === 'opening-balances'
            ? 'Post Opening Balance'
            : 'สร้างเอกสาร'}
        </Button>
      </form>
    </Card>
  );
}
export function DocumentDetails({
  doc,
  resource,
  run,
  busy,
  updated,
}: {
  doc: InventoryDocument;
  resource: string;
  run: Run;
  busy: boolean;
  updated?: (doc: InventoryDocument) => void;
}) {
  const tenant = useOrganization();
  const [observed, setObserved] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      doc.items.map((item) => [item.variant_id, item.counted_quantity ?? '']),
    ),
  );
  const prefix = doc.kind.toLowerCase();
  const steps: Record<string, string[]> = {
    DRAFT: ['submit', 'cancel'],
    PENDING_APPROVAL: ['approve', 'reject', 'cancel'],
    IN_PROGRESS: ['submit', 'cancel'],
    SUBMITTED: ['approve', 'cancel'],
    APPROVED: [doc.kind === 'TRANSFER' ? 'dispatch' : 'post', 'cancel'],
    DISPATCHED: ['receive'],
  };
  async function act(action: string) {
    if (
      ['post', 'dispatch', 'receive'].includes(action) &&
      !window.confirm(
        `ยืนยัน ${action}? การเปลี่ยน stock ต้องใช้ compensating operation เพื่อแก้ไข`,
      )
    )
      return;
    try {
      const result = await run<InventoryDocument>(
        `/${resource}/${doc.id}/${action}`,
        'POST',
        { revision: doc.revision },
      );
      updated?.(result);
    } catch {
      return;
    }
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await run<InventoryDocument>(
        `/counts/${doc.id}/items`,
        'PATCH',
        {
          revision: doc.revision,
          items: doc.items.map((item) => ({
            variant_id: item.variant_id,
            counted_quantity: observed[item.variant_id],
          })),
        },
      );
      updated?.(result);
    } catch {
      return;
    }
  }
  const canSave =
    doc.kind === 'COUNT' &&
    doc.status === 'IN_PROGRESS' &&
    tenant.can('inventory.count.update') &&
    branchAllowed(doc.branch_id) &&
    (!doc.assigned_to ||
      doc.assigned_to === tenant.context?.membership.user_id ||
      ['OWNER', 'MANAGER'].includes(tenant.context?.membership.role ?? ''));
  function branchAllowed(branchID: string | null) {
    return (
      tenant.context?.branches.some(
        (branch) => branch.id === branchID && branch.status === 'ACTIVE',
      ) ?? false
    );
  }
  function actionAllowed(action: string) {
    const elevated = ['OWNER', 'MANAGER'].includes(
      tenant.context?.membership.role ?? '',
    );
    if (
      action === 'cancel' &&
      doc.created_by !== tenant.context?.membership.user_id &&
      !elevated
    )
      return false;
    if (
      action === 'submit' &&
      doc.kind === 'COUNT' &&
      doc.assigned_to &&
      doc.assigned_to !== tenant.context?.membership.user_id &&
      !elevated
    )
      return false;
    if (action === 'receive') return branchAllowed(doc.destination_branch_id);
    if (!branchAllowed(doc.branch_id)) return false;
    return (
      doc.kind !== 'TRANSFER' ||
      action === 'dispatch' ||
      branchAllowed(doc.destination_branch_id)
    );
  }
  return (
    <Card>
      <h2>
        {doc.kind} · {doc.id}
      </h2>
      <p>
        Status: <strong>{doc.status}</strong> · Revision: {doc.revision}
      </p>
      <p>
        Reason: {doc.reason_code} · {doc.notes}
      </p>
      <p>
        Source: {doc.location_id} · Destination:{' '}
        {doc.destination_location_id ?? '—'} · Transit:{' '}
        {doc.transit_location_id ?? '—'}
      </p>
      <p>
        Creator: {doc.created_by} · Assigned: {doc.assigned_to ?? '—'} ·
        Approver: {doc.approved_by ?? '—'}
      </p>
      <p>
        Dispatched: {doc.dispatched_by ?? '—'} · Received:{' '}
        {doc.received_by ?? '—'} · Posted: {doc.posted_by ?? '—'}
      </p>
      <form onSubmit={(event) => void save(event)}>
        <Table
          headers={[
            'SKU / Unit',
            'Quantity / Expected',
            'Counted',
            'Variance / %',
            'Counter / Time',
          ]}
        >
          {doc.items.map((item: InventoryItem) => (
            <tr key={item.variant_id}>
              <td>
                {item.sku ?? item.variant_id}
                <br />
                {item.unit}
              </td>
              <td>
                {doc.kind === 'COUNT' ? item.expected_quantity : item.quantity}
              </td>
              <td>
                {canSave ? (
                  <Field label={`Counted ${item.sku ?? item.variant_id}`}>
                    <input
                      required
                      inputMode="decimal"
                      pattern="[0-9]+(\.[0-9]{1,3})?"
                      value={observed[item.variant_id]}
                      onChange={(event) =>
                        setObserved({
                          ...observed,
                          [item.variant_id]: event.target.value,
                        })
                      }
                    />
                  </Field>
                ) : (
                  (item.counted_quantity ?? '—')
                )}
              </td>
              <td>
                {item.expected_quantity && item.counted_quantity ? (
                  <>
                    {quantityVariance(
                      item.expected_quantity,
                      item.counted_quantity,
                    )}
                    <br />
                    {variancePercent(
                      item.expected_quantity,
                      item.counted_quantity,
                    )}
                  </>
                ) : (
                  '—'
                )}
              </td>
              <td>
                {item.counted_by ?? '—'}
                <br />
                {item.counted_at ?? '—'}
              </td>
            </tr>
          ))}
        </Table>
        {canSave && (
          <Button disabled={busy} type="submit">
            Save Physical Count
          </Button>
        )}
      </form>
      <div className="catalog-actions">
        {(steps[doc.status] ?? [])
          .filter(actionAllowed)
          .filter(
            (action) => !(doc.kind !== 'ADJUSTMENT' && action === 'reject'),
          )
          .filter((action) =>
            tenant.can(
              `inventory.${prefix}.${action === 'submit' ? (doc.kind === 'COUNT' ? 'update' : 'create') : action === 'cancel' ? 'create' : action === 'reject' ? 'approve' : action}`,
            ),
          )
          .map((action) => (
            <Button
              key={action}
              disabled={busy}
              onClick={() => void act(action)}
            >
              {action}
            </Button>
          ))}
      </div>
      <Link to="/inventory/movements">
        Related immutable ledger — filter by Variant / location
      </Link>
      <h3>Audit history</h3>
      {doc.history?.length ? (
        <ul>
          {doc.history.map((event, index) => (
            <li key={index}>
              {event.event_type} · {event.actor_id} · {event.created_at}
            </li>
          ))}
        </ul>
      ) : (
        <p>
          ประวัติจะโหลดใหม่หลังบันทึก; ไม่ใช่ comprehensive denied-request audit
        </p>
      )}
    </Card>
  );
}
export function ReorderEditor({
  branch,
  run,
  busy,
  initial,
}: {
  branch: string;
  run: Run;
  busy: boolean;
  initial?: ReorderPoint;
}) {
  const [variant, setVariant] = useState(initial?.variant_id ?? '');
  const [minimum, setMinimum] = useState(initial?.minimum_quantity ?? '');
  const [target, setTarget] = useState(initial?.target_quantity ?? '');
  const [status, setStatus] = useState(initial?.status ?? 'ACTIVE');
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await run('/reorder-points', 'PUT', {
        branch_id: branch,
        variant_id: variant,
        minimum_quantity: minimum,
        target_quantity: target,
        status,
      });
    } catch {
      return;
    }
  }
  return (
    <form className="inventory-form" onSubmit={(event) => void submit(event)}>
      <h3>{initial ? 'แก้ไข' : 'ตั้งค่า'} Reorder Point</h3>
      <p>
        ประเมิน active WAREHOUSE + SALES_FLOOR + SHELF; ไม่รวม
        quarantine/damaged/transit
      </p>
      <VariantPicker value={variant} change={setVariant} />
      <Field label="Minimum Quantity">
        <input
          required
          inputMode="decimal"
          value={minimum}
          onChange={(event) => setMinimum(event.target.value)}
        />
      </Field>
      <Field label="Target Quantity">
        <input
          required
          inputMode="decimal"
          value={target}
          onChange={(event) => setTarget(event.target.value)}
        />
      </Field>
      <Field label="Reorder status">
        <select
          value={status}
          onChange={(event) => setStatus(event.target.value)}
        >
          <option>ACTIVE</option>
          <option>INACTIVE</option>
        </select>
      </Field>
      <Button disabled={busy} type="submit">
        Save Reorder Point
      </Button>
    </form>
  );
}
