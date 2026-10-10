import { useState } from 'react';
import { useOrganization } from '../../app/OrganizationProvider';
import { Button } from '../../components/ui/primitives';
import type { ProductBatch, QualityBalance } from '../../lib/quality-api';
import { Field, QueryFeedback } from '../purchasing/SupplyUI';
import { useSupplyQuery } from '../purchasing/purchasing-hooks';
import './quality.css';

export interface BatchSelection {
  batch_id: string | null;
  batch_verified: boolean;
}

export function BatchPicker({
  variant,
  branch,
  location,
  value,
  change,
  disabled,
  label = 'Batch/Lot',
  sellableOnly = false,
}: {
  variant: string;
  branch?: string;
  location?: string;
  value: BatchSelection;
  change: (value: BatchSelection) => void;
  disabled?: boolean;
  label?: string;
  sellableOnly?: boolean;
}) {
  const tenant = useOrganization();
  const [page, setPage] = useState(1);
  const selectedBranch = branch ?? tenant.branchID;
  const path = `/quality/${location ? 'batches' : 'lots'}?${new URLSearchParams({ branch_id: selectedBranch, variant_id: variant, location_id: location ?? '', page: String(page) })}`;
  const query = useSupplyQuery<(ProductBatch | QualityBalance)[]>(
    path,
    !!variant && !!selectedBranch && tenant.can('quality.read'),
  );
  const options = query.data ?? [];
  return (
    <fieldset className="quality-batch-picker" disabled={disabled}>
      <Field label={label}>
        <select
          value={value.batch_id ?? ''}
          onChange={(event) =>
            change({
              batch_id: event.target.value || null,
              batch_verified: false,
            })
          }
        >
          <option value="">Untracked · ไม่ทราบ lot (ตามนโยบาย)</option>
          {value.batch_id &&
            !options.some(
              (item) =>
                ('batch_id' in item ? item.batch_id : item.id) ===
                value.batch_id,
            ) && (
              <option value={value.batch_id}>
                Selected lot · {value.batch_id}
              </option>
            )}
          {options
            .filter((item) => !('batch_id' in item) || item.batch_id !== null)
            .map((item) => {
              const stock = 'batch_id' in item ? item : null;
              return (
                <option
                  key={item.id}
                  value={stock ? stock.batch_id! : item.id}
                  disabled={sellableOnly && stock !== null && !stock.sellable}
                >
                  {item.lot_number} · Expiry {item.expires_on ?? 'Unknown'}
                  {stock
                    ? ` · ${stock.quantity} · ${stock.sellable ? 'Eligible' : 'BLOCKED'}`
                    : ` · ${(item as ProductBatch).status}`}
                </option>
              );
            })}
        </select>
      </Field>
      <QueryFeedback loading={query.isLoading} error={query.error} />
      <div className="catalog-actions">
        <Button
          type="button"
          disabled={page === 1 || query.isFetching}
          onClick={() => setPage(page - 1)}
        >
          Previous lots
        </Button>
        <span>Page {page}</span>
        <Button
          type="button"
          disabled={options.length < 100 || query.isFetching}
          onClick={() => setPage(page + 1)}
        >
          Next lots
        </Button>
      </div>
      {value.batch_id && (
        <label>
          <input
            type="checkbox"
            checked={value.batch_verified}
            onChange={(event) =>
              change({ ...value, batch_verified: event.target.checked })
            }
          />
          ตรวจฉลาก lot จริงแล้ว / Physically verified selected lot
        </label>
      )}
      <small>
        FEFO เป็นคำแนะนำ ไม่ยืนยัน lot แทนผู้ปฏิบัติงาน / Never auto-attested.
        Unknown dates are not expiry assurance.
      </small>
    </fieldset>
  );
}

export function CartBatchPicker({
  initial,
  save,
  busy,
  actionLabel = 'ใช้ lot นี้ / Apply lot',
  ...props
}: Omit<Parameters<typeof BatchPicker>[0], 'value' | 'change' | 'disabled'> & {
  initial: BatchSelection;
  save: (value: BatchSelection) => Promise<unknown>;
  busy: boolean;
  actionLabel?: string;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div>
      <BatchPicker {...props} value={value} change={setValue} disabled={busy} />
      <Button
        type="button"
        disabled={busy || (!!value.batch_id && !value.batch_verified)}
        onClick={() => void save(value)}
      >
        {actionLabel}
      </Button>
    </div>
  );
}
