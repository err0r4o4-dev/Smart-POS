import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { useOrganization } from '../../app/OrganizationProvider';
import { Button, Card, Tag } from '../../components/ui/primitives';
import { CartBatchPicker } from '../quality/BatchPicker';
import { untrackedBatch } from '../../lib/quality-api';
import type { StockLocation } from '../../lib/inventory-api';
import type { Member } from '../../lib/organization-api';
import type {
  Shelf,
  ShelfAssignment,
  ReplenishmentTask,
  ReplenishmentSuggestion,
  SupplyPage,
} from '../../lib/purchasing-api';
import {
  useSupplyScope,
  useSupplyQuery,
  type SupplyScope,
} from './purchasing-hooks';
import {
  Field,
  TextField,
  SupplyNav,
  SupplyFeedback,
  SupplyTable,
  Pagination,
  QueryFeedback,
  RemoteSelect,
  VariantPicker,
} from './SupplyUI';

const titles: Record<string, string> = {
  overview: 'ชั้นวางสินค้า',
  new: 'เพิ่มชั้นวาง',
  detail: 'รายละเอียดชั้นวาง',
  layout: 'ผังชั้นวาง',
  replenishments: 'เติมสินค้าเข้าชั้นวาง',
  discrepancies: 'ผลต่างตรวจนับชั้นวาง',
};
export function ShelfPage({ view }: { view: string }) {
  const auth = useAuth(),
    tenant = useOrganization(),
    { id } = useParams();
  return (
    <ShelfScreen
      key={`${auth.state.session?.user.id}:${tenant.context?.organization.id}:${tenant.branchID}:${view}:${id ?? ''}`}
      view={view}
      id={id}
    />
  );
}
function ShelfScreen({ view, id }: { view: string; id?: string }) {
  const state = useSupplyScope(),
    [search, setSearch] = useState(''),
    [page, setPage] = useState(1),
    [status, setStatus] = useState(''),
    [selected, setSelected] = useState('');
  const list = useSupplyQuery<SupplyPage<Shelf>>(
    `/shelves?branch_id=${state.branch}&search=${encodeURIComponent(search)}&status=${status}&page=${page}&page_size=20`,
    !!state.branch && ['overview', 'layout'].includes(view),
  );
  return (
    <section className="catalog-page supply-page">
      <header className="catalog-header">
        <div>
          <p className="eyebrow">SHELVES · PHASE 4</p>
          <h1>{titles[view]}</h1>
          <p>
            Recorded stock คือยอดใน Inventory Ledger ไม่ใช่จำนวนจริงก่อนตรวจนับ
          </p>
        </div>
        {state.tenant.can('shelf.manage') && (
          <Link className="button" to="/shelves/new">
            เพิ่มชั้นวาง
          </Link>
        )}
      </header>
      <SupplyNav shelves />
      <SupplyFeedback state={state} />
      {!state.branch ? (
        <p role="alert">เลือกสาขาจาก header ก่อนทำรายการ</p>
      ) : (
        <>
          {view === 'new' && <ShelfForm state={state} />}
          {view === 'detail' && id && <ShelfDetail state={state} id={id} />}
          {['overview', 'layout'].includes(view) && (
            <>
              <div className="catalog-actions">
                <TextField
                  label="ค้นหาชั้นวาง / Zone"
                  value={search}
                  change={(value) => {
                    setSearch(value);
                    setPage(1);
                  }}
                />
                <Field label="สถานะชั้นวาง">
                  <select
                    value={status}
                    onChange={(event) => {
                      setStatus(event.target.value);
                      setPage(1);
                    }}
                  >
                    <option value="">ทุกสถานะ</option>
                    {['ACTIVE', 'INACTIVE', 'ARCHIVED'].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <QueryFeedback
                loading={list.isLoading}
                error={list.error}
                empty={list.data?.total === 0}
              />
              {view === 'overview' ? (
                <Card>
                  <SupplyTable
                    headers={[
                      'Code',
                      'Shelf / Zone',
                      'Assignments',
                      'Low stock',
                      'Status',
                      'รายละเอียด',
                    ]}
                  >
                    {list.data?.items.map((shelf) => (
                      <tr key={shelf.id}>
                        <td>{shelf.code}</td>
                        <td>
                          {shelf.name}
                          <br />
                          {shelf.zone}
                        </td>
                        <td>{shelf.assignment_count}</td>
                        <td>{shelf.low_stock_count}</td>
                        <td>
                          <Tag>{shelf.status}</Tag>
                        </td>
                        <td>
                          <Link to={'/shelves/' + shelf.id}>เปิดชั้นวาง</Link>
                        </td>
                      </tr>
                    ))}
                  </SupplyTable>
                </Card>
              ) : (
                <>
                  <p>
                    ผัง 2D แบบข้อมูลตาม Zone / Code — ไม่ใช่ตำแหน่งทางกายภาพหรือ
                    AI optimization
                  </p>
                  <div className="supply-layout">
                    {list.data?.items.map((shelf) => (
                      <Card key={shelf.id}>
                        <h2>
                          {shelf.zone || 'ไม่ระบุ Zone'} · {shelf.code}
                        </h2>
                        <p>
                          {shelf.name} · {shelf.status}
                        </p>
                        <p>
                          {shelf.assignment_count} assignments ·{' '}
                          {shelf.low_stock_count} ต่ำกว่า minimum
                        </p>
                        <Button onClick={() => setSelected(shelf.id)}>
                          ดู Slots / สินค้า
                        </Button>
                        <Link to={'/shelves/' + shelf.id}> จัดการ</Link>
                      </Card>
                    ))}
                  </div>
                  {selected && (
                    <ShelfDetail
                      key={selected}
                      state={state}
                      id={selected}
                      readonly
                    />
                  )}
                </>
              )}
              <Pagination
                page={page}
                total={list.data?.total ?? 0}
                change={setPage}
              />
            </>
          )}
          {view === 'replenishments' && <Replenishments state={state} />}
          {view === 'discrepancies' && (
            <>
              <RemoteSelect<Shelf>
                label="ชั้นวาง"
                path={`/shelves?branch_id=${state.branch}`}
                value={selected}
                change={setSelected}
                display={(shelf) => `${shelf.code} · ${shelf.name}`}
              />
              <p>
                ผลตรวจนับล่าสุดเป็น snapshot; การอนุมัติและปรับสต็อกใช้
                Inventory Count workflow เดิมเท่านั้น
              </p>
              {selected && (
                <ShelfDetail
                  key={selected}
                  state={state}
                  id={selected}
                  readonly
                  discrepancies
                />
              )}
              <Link to="/shelves/counts">สร้าง / ตรวจสอบ Count</Link>
            </>
          )}
        </>
      )}
    </section>
  );
}
function ShelfForm({
  state,
  initial,
}: {
  state: SupplyScope;
  initial?: Shelf;
}) {
  const navigate = useNavigate(),
    [code, setCode] = useState(initial?.code ?? ''),
    [name, setName] = useState(initial?.name ?? ''),
    [zone, setZone] = useState(initial?.zone ?? ''),
    [description, setDescription] = useState(initial?.description ?? ''),
    [status, setStatus] = useState(initial?.status ?? 'ACTIVE'),
    [location, setLocation] = useState(initial?.stock_location_id ?? '');
  return (
    <Card>
      <h2>{initial ? 'แก้ไขชั้นวาง' : 'สร้างชั้นวางจาก Inventory Location'}</h2>
      <form
        className="inventory-form"
        onSubmit={(event) => {
          event.preventDefault();
          void state
            .run<Shelf>(
              initial ? `/shelves/${initial.id}` : '/shelves',
              {
                branch_id: initial?.branch_id ?? state.branch,
                stock_location_id: location,
                code,
                name,
                zone,
                description,
                status,
                revision: initial?.revision ?? 0,
              },
              initial ? 'PATCH' : 'POST',
            )
            .then((result) => {
              if (!initial) navigate('/shelves/' + result.id);
            })
            .catch(() => {});
        }}
      >
        <TextField label="Shelf Code" value={code} change={setCode} required />
        <TextField label="Shelf Name" value={name} change={setName} required />
        <TextField label="Zone" value={zone} change={setZone} />
        <TextField
          label="รายละเอียดชั้นวาง"
          value={description}
          change={setDescription}
        />
        {initial ? (
          <p>
            Inventory Location: <code>{location}</code> (ไม่สามารถย้าย location
            ที่ผูกไว้)
          </p>
        ) : (
          <RemoteSelect<StockLocation>
            label="Inventory Shelf Location"
            path={`/inventory/locations?branch_id=${state.branch}&status=ACTIVE`}
            value={location}
            change={setLocation}
            display={(item) => `${item.code} · ${item.name} · ${item.type}`}
          />
        )}
        <Field label="Shelf Status">
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            {['ACTIVE', 'INACTIVE', 'ARCHIVED'].map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </Field>
        <p>
          ผูกได้เฉพาะ active SHELF / SALES_FLOOR; สร้าง location ที่ Inventory
          ก่อน และหนึ่ง location ต่อหนึ่ง shelf
        </p>
        <Button type="submit" disabled={state.busy || !state.branch}>
          บันทึกชั้นวาง
        </Button>
      </form>
    </Card>
  );
}
function ShelfDetail({
  state,
  id,
  readonly = false,
  discrepancies = false,
}: {
  state: SupplyScope;
  id: string;
  readonly?: boolean;
  discrepancies?: boolean;
}) {
  const query = useSupplyQuery<Shelf>(`/shelves/${id}`);
  const shelf = query.data;
  return (
    <>
      <QueryFeedback loading={query.isLoading} error={query.error} />
      {shelf && (
        <>
          <Card>
            <h2>
              {shelf.code} · {shelf.name}
            </h2>
            <p>
              {shelf.zone} · {shelf.status} · Location{' '}
              <code>{shelf.stock_location_id}</code>
            </p>
            <SupplyTable
              headers={
                discrepancies
                  ? [
                      'Slot / SKU',
                      'Recorded now',
                      'Count snapshot',
                      'Expected / Counted / Variance',
                      'Count review',
                    ]
                  : [
                      'Slot / SKU',
                      'Recorded',
                      'Min / Target / Capacity',
                      'Status',
                      'Latest count',
                    ]
              }
            >
              {shelf.assignments.map((item) => (
                <tr key={item.id}>
                  <td>
                    {item.slot_code}
                    <br />
                    {item.sku} · {item.name}
                  </td>
                  <td>
                    {item.recorded_quantity} {item.unit}
                  </td>
                  {discrepancies ? (
                    <>
                      <td>
                        {item.last_count?.counted_at ?? 'ยังไม่ตรวจนับ'}
                        <br />
                        {item.last_count?.status}
                      </td>
                      <td>
                        {item.last_count
                          ? `${item.last_count.expected_quantity} / ${item.last_count.counted_quantity} / ${item.last_count.variance}`
                          : '—'}
                      </td>
                      <td>
                        {item.last_count && (
                          <Link
                            to={
                              '/inventory/counts/' + item.last_count.document_id
                            }
                          >
                            เปิด Count
                          </Link>
                        )}
                      </td>
                    </>
                  ) : (
                    <>
                      <td>
                        {item.minimum_quantity} / {item.target_quantity} /{' '}
                        {item.capacity_quantity} {item.unit}
                      </td>
                      <td>
                        <Tag>{item.status}</Tag>
                      </td>
                      <td>
                        {item.last_count ? (
                          <Link
                            to={
                              '/inventory/counts/' + item.last_count.document_id
                            }
                          >
                            {item.last_count.status} · Δ{' '}
                            {item.last_count.variance}
                          </Link>
                        ) : (
                          'ยังไม่ตรวจนับ'
                        )}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </SupplyTable>
            {shelf.assignments.length === 0 && (
              <p>ยังไม่มีสินค้าในชั้นวางนี้</p>
            )}
          </Card>
          {!readonly && (
            <>
              {state.tenant.can('shelf.manage') && (
                <ShelfForm key={shelf.revision} state={state} initial={shelf} />
              )}
              <Card>
                <h2>Slots ตามลำดับ</h2>
                {shelf.slots.map((slot) => (
                  <Tag key={slot.id}>
                    {slot.position} · {slot.code}
                  </Tag>
                ))}
                {shelf.status === 'ACTIVE' &&
                  state.tenant.can('shelf.manage') && (
                    <SlotForm state={state} shelfID={id} />
                  )}
              </Card>
              {shelf.status === 'ACTIVE' &&
                state.tenant.can('shelf.assignment.manage') && (
                  <>
                    <AssignmentForm state={state} shelf={shelf} />
                    {shelf.assignments.map((item) => (
                      <AssignmentForm
                        key={`${item.id}:${item.revision}`}
                        state={state}
                        shelf={shelf}
                        initial={item}
                      />
                    ))}
                  </>
                )}
            </>
          )}
        </>
      )}
    </>
  );
}
function SlotForm({ state, shelfID }: { state: SupplyScope; shelfID: string }) {
  const [code, setCode] = useState(''),
    [position, setPosition] = useState('0');
  return (
    <form
      className="inventory-form"
      onSubmit={(event) => {
        event.preventDefault();
        void state
          .run(`/shelves/${shelfID}/slots`, {
            code,
            position: Number(position),
          })
          .then(() => setCode(''))
          .catch(() => {});
      }}
    >
      <TextField label="Slot Code" value={code} change={setCode} required />
      <TextField
        label="Slot Position"
        value={position}
        change={setPosition}
        type="number"
        required
      />
      <Button type="submit" disabled={state.busy}>
        เพิ่ม Slot
      </Button>
    </form>
  );
}
function AssignmentForm({
  state,
  shelf,
  initial,
}: {
  state: SupplyScope;
  shelf: Shelf;
  initial?: ShelfAssignment;
}) {
  const [slot, setSlot] = useState(initial?.slot_id ?? ''),
    [variant, setVariant] = useState(initial?.variant_id ?? ''),
    [minimum, setMinimum] = useState(initial?.minimum_quantity ?? '0'),
    [target, setTarget] = useState(initial?.target_quantity ?? '1'),
    [capacity, setCapacity] = useState(initial?.capacity_quantity ?? '1'),
    [status, setStatus] = useState(initial?.status ?? 'ACTIVE');
  return (
    <Card>
      <h2>
        {initial ? `แก้ไข Assignment · ${initial.sku}` : 'กำหนดสินค้าให้ Slot'}
      </h2>
      <form
        className="inventory-form"
        onSubmit={(event) => {
          event.preventDefault();
          void state
            .run(
              `/shelves/${shelf.id}/assignments${initial ? '/' + initial.id : ''}`,
              {
                slot_id: slot,
                variant_id: variant,
                minimum_quantity: minimum,
                target_quantity: target,
                capacity_quantity: capacity,
                status,
                revision: initial?.revision ?? 0,
              },
              initial ? 'PATCH' : 'POST',
            )
            .catch(() => {});
        }}
      >
        {initial ? (
          <p>
            {initial.slot_code} · {initial.sku} (identity คงเดิม)
          </p>
        ) : (
          <>
            <Field label="Slot">
              <select
                required
                value={slot}
                onChange={(event) => setSlot(event.target.value)}
              >
                <option value="">เลือก Slot</option>
                {shelf.slots
                  .filter(
                    (item) =>
                      !shelf.assignments.some(
                        (assignment) => assignment.slot_id === item.id,
                      ),
                  )
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code}
                    </option>
                  ))}
              </select>
            </Field>
            <VariantPicker
              value={variant}
              change={(item) => setVariant(item.id)}
            />
          </>
        )}
        <TextField
          label="Minimum quantity"
          value={minimum}
          change={setMinimum}
          required
        />
        <TextField
          label="Target quantity"
          value={target}
          change={setTarget}
          required
        />
        <TextField
          label="Capacity quantity"
          value={capacity}
          change={setCapacity}
          required
        />
        <Field label="Assignment Status">
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option>ACTIVE</option>
            <option>INACTIVE</option>
          </select>
        </Field>
        <p>
          หน่วย Inventory เท่านั้น · 0 ≤ minimum ≤ target ≤ capacity; capacity
          คือ configured maximum ไม่ใช่พื้นที่กายภาพ
        </p>
        <Button type="submit" disabled={state.busy}>
          บันทึก Assignment
        </Button>
      </form>
    </Card>
  );
}
function Replenishments({ state }: { state: SupplyScope }) {
  const [page, setPage] = useState(1),
    [suggestionPage, setSuggestionPage] = useState(1),
    [status, setStatus] = useState(''),
    [search, setSearch] = useState(''),
    [selected, setSelected] = useState('');
  const tasks = useSupplyQuery<SupplyPage<ReplenishmentTask>>(
      `/shelves/replenishments?branch_id=${state.branch}&page=${page}&page_size=20&status=${status}&search=${encodeURIComponent(search)}`,
    ),
    suggestions = useSupplyQuery<SupplyPage<ReplenishmentSuggestion>>(
      `/shelves/replenishments/suggestions?branch_id=${state.branch}&page=${suggestionPage}&page_size=20`,
    );
  return (
    <>
      <Card>
        <h2>คำแนะนำเติมสินค้า</h2>
        <p>
          target − recorded โดยจำกัดด้วย warehouse stock และแผนเติมอื่น; task
          ไม่จองสต็อกและตรวจ stock/capacity ใหม่ตอน complete
        </p>
        <QueryFeedback
          loading={suggestions.isLoading}
          error={suggestions.error}
          empty={suggestions.data?.total === 0}
        />
        <SupplyTable
          headers={[
            'Shelf / SKU',
            'Recorded / Minimum',
            'Target / Capacity',
            'Warehouse available',
            'Suggested',
            'Review',
          ]}
        >
          {suggestions.data?.items.map((item) => (
            <tr key={item.id}>
              <td>
                {item.shelf_name}
                <br />
                {item.sku}
              </td>
              <td>
                {item.recorded_quantity} / {item.minimum_quantity}
              </td>
              <td>
                {item.target_quantity} / {item.capacity_quantity}
              </td>
              <td>
                {item.source_name} · {item.available_quantity}
              </td>
              <td>
                {item.suggested_quantity}
                <br />
                {item.explanation}
              </td>
              <td>
                {state.tenant.can('shelf.replenishment.create') && (
                  <CartBatchPicker
                    actionLabel="สร้าง Task"
                    variant={item.variant_id}
                    location={item.source_location_id}
                    label={`Batch/Lot ${item.sku}`}
                    initial={untrackedBatch}
                    busy={state.busy}
                    sellableOnly
                    save={(selection) =>
                      state
                        .run<ReplenishmentTask>('/shelves/replenishments', {
                          assignment_id: item.assignment_id,
                          source_location_id: item.source_location_id,
                          quantity: item.suggested_quantity,
                          ...selection,
                        })
                        .then((task) => setSelected(task.id))
                        .catch(() => {})
                    }
                  />
                )}
              </td>
            </tr>
          ))}
        </SupplyTable>
        <Pagination
          page={suggestionPage}
          total={suggestions.data?.total ?? 0}
          change={setSuggestionPage}
        />
      </Card>
      <Card>
        <h2>Replenishment Tasks</h2>
        <div className="catalog-actions">
          <TextField
            label="ค้นหา Task / SKU"
            value={search}
            change={(value) => {
              setSearch(value);
              setPage(1);
            }}
          />
          <Field label="Task Status">
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">ทุกสถานะ</option>
              {[
                'OPEN',
                'ASSIGNED',
                'IN_PROGRESS',
                'COMPLETED',
                'CANCELLED',
              ].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </Field>
        </div>
        <QueryFeedback
          loading={tasks.isLoading}
          error={tasks.error}
          empty={tasks.data?.total === 0}
        />
        <SupplyTable
          headers={[
            'Shelf / SKU',
            'Source',
            'Quantity',
            'Status',
            'Assignee',
            'รายละเอียด',
          ]}
        >
          {tasks.data?.items.map((task) => (
            <tr key={task.id}>
              <td>
                {task.shelf_name}
                <br />
                {task.sku}
              </td>
              <td>{task.source_name}</td>
              <td>{task.quantity}</td>
              <td>
                <Tag>{task.status}</Tag>
              </td>
              <td>
                <code>{task.assigned_to ?? 'ยังไม่มอบหมาย'}</code>
              </td>
              <td>
                <Button onClick={() => setSelected(task.id)}>เปิด Task</Button>
              </td>
            </tr>
          ))}
        </SupplyTable>
        <Pagination
          page={page}
          total={tasks.data?.total ?? 0}
          change={setPage}
        />
      </Card>
      {selected && <TaskDetail key={selected} state={state} id={selected} />}
    </>
  );
}
function TaskDetail({ state, id }: { state: SupplyScope; id: string }) {
  const query = useSupplyQuery<ReplenishmentTask>(
      `/shelves/replenishments/${id}`,
    ),
    members = useSupplyQuery<Member[]>(
      '/members',
      state.tenant.can('employee.read') &&
        state.tenant.can('shelf.replenishment.assign'),
    ),
    [assignee, setAssignee] = useState(''),
    [reason, setReason] = useState(''),
    [confirm, setConfirm] = useState(false);
  const task = query.data;
  async function act(action: string) {
    if (!task) return;
    await state.run(`/shelves/replenishments/${id}/${action}`, {
      revision: task.revision,
      reason,
      ...(action === 'assign' ? { assigned_to: assignee } : {}),
    });
    setConfirm(false);
  }
  return (
    <Card>
      <h2>Task Detail</h2>
      <QueryFeedback loading={query.isLoading} error={query.error} />
      {task && (
        <>
          <p>
            <code>{task.id}</code> · {task.status} · {task.quantity} หน่วย
            Inventory
          </p>
          <p>
            Assignment <code>{task.assignment_id}</code> · Source{' '}
            <code>{task.source_location_id}</code>
          </p>
          <Link to={'/shelves/' + task.shelf_id}>เปิด Shelf</Link>
          <TextField label="เหตุผล Task" value={reason} change={setReason} />
          {state.tenant.can('shelf.replenishment.assign') &&
            ['OPEN', 'ASSIGNED'].includes(task.status) && (
              <>
                <QueryFeedback
                  loading={members.isLoading}
                  error={members.error}
                />
                <Field label="ผู้รับผิดชอบ Task">
                  <select
                    value={assignee}
                    onChange={(event) => setAssignee(event.target.value)}
                  >
                    <option value="">เลือกพนักงาน</option>
                    {members.data
                      ?.filter(
                        (member) =>
                          member.status === 'ACTIVE' &&
                          (member.role === 'OWNER' ||
                            member.branch_ids.includes(state.branch)) &&
                          member.permissions.includes(
                            'shelf.replenishment.complete',
                          ),
                      )
                      .map((member) => (
                        <option key={member.user_id} value={member.user_id}>
                          {member.display_name} · {member.role}
                        </option>
                      ))}
                  </select>
                </Field>
                <Button
                  disabled={state.busy || !assignee}
                  onClick={() => {
                    void act('assign').catch(() => {});
                  }}
                >
                  มอบหมาย Task
                </Button>
              </>
            )}
          {state.tenant.can('shelf.replenishment.complete') &&
            ['OPEN', 'ASSIGNED'].includes(task.status) && (
              <Button
                disabled={state.busy}
                onClick={() => {
                  void act('start').catch(() => {});
                }}
              >
                เริ่ม Task
              </Button>
            )}
          {state.tenant.can('shelf.replenishment.complete') &&
            task.status === 'IN_PROGRESS' && (
              <>
                <Field label="ยืนยันย้ายสินค้าจริง">
                  <input
                    type="checkbox"
                    checked={confirm}
                    onChange={(event) => setConfirm(event.target.checked)}
                  />
                  ฉันตรวจสอบการย้ายสินค้าแล้ว
                </Field>
                <Button
                  disabled={state.busy || !confirm}
                  onClick={() => {
                    void act('complete').catch(() => {});
                  }}
                >
                  Complete Task / Post Transfer
                </Button>
              </>
            )}
          {state.tenant.can('shelf.replenishment.create') &&
            ['OPEN', 'ASSIGNED', 'IN_PROGRESS'].includes(task.status) && (
              <Button
                disabled={state.busy || !reason.trim()}
                onClick={() => {
                  void act('cancel').catch(() => {});
                }}
              >
                ยกเลิก Task
              </Button>
            )}
          {task.transfer_id && (
            <p>
              <Link to={'/inventory/transfers/' + task.transfer_id}>
                เปิด Native Inventory Transfer
              </Link>
            </p>
          )}
        </>
      )}
    </Card>
  );
}
