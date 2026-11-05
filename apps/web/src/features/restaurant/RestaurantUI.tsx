import { useState } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import { Button, ErrorState, Loading } from '../../components/ui/primitives';
import { Field } from '../inventory/InventoryUI';
import type { CatalogPage, Product, Taxonomy } from '../../lib/catalog-api';
import { useRestaurantQuery } from './restaurant-hooks';

export interface Choice {
  id: string;
  name: string;
  unit: string;
  unitType: string;
}
export function QueryState({
  query,
}: {
  query: Pick<UseQueryResult<unknown>, 'isPending' | 'error' | 'refetch'>;
}) {
  if (query.isPending) return <Loading />;
  if (query.error)
    return (
      <ErrorState
        message={
          query.error instanceof Error
            ? query.error.message
            : 'โหลดข้อมูลไม่สำเร็จ'
        }
        retry={() => {
          void query.refetch();
        }}
      />
    );
  return null;
}

export function CommandState({
  command,
}: {
  command: { error: unknown; isSuccess: boolean; uncertain: boolean };
}) {
  return (
    <>
      {command.error ? (
        <ErrorState
          message={
            command.error instanceof Error
              ? command.error.message
              : 'บันทึกไม่สำเร็จ'
          }
        />
      ) : null}
      {command.uncertain ? (
        <p role="status">
          ยังไม่ทราบผลการบันทึก กดบันทึกอีกครั้งเพื่อตรวจรายการเดิม
          ระบบจะไม่สร้างรายการซ้ำ
        </p>
      ) : null}
      {command.isSuccess ? <p role="status">บันทึกข้อมูลแล้ว</p> : null}
    </>
  );
}

export function VariantSelect({
  label,
  value,
  change,
  disabled = false,
}: {
  label: string;
  value: Choice | null;
  change: (choice: Choice | null) => void;
  disabled?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const products = useRestaurantQuery<CatalogPage<Product>>(
    `/products?status=ACTIVE&page_size=20&page=${page}&search=${encodeURIComponent(search)}`,
    'catalog.read',
  );
  const [unitPage, setUnitPage] = useState(1);
  const units = useRestaurantQuery<CatalogPage<Taxonomy>>(
    `/units?status=ACTIVE&page_size=100&page=${unitPage}`,
    'catalog.read',
  );
  const unitMap = new Map(
    (units.data?.items ?? []).map((unit) => [unit.id, unit]),
  );
  const choices = (products.data?.items ?? []).flatMap((product) =>
    product.variants
      .filter(
        (variant) =>
          variant.status === 'ACTIVE' && unitMap.has(variant.unit_id),
      )
      .map((variant) => ({
        id: variant.id,
        name: `${product.name} / ${variant.name} (${variant.sku})`,
        unit: unitMap.get(variant.unit_id)?.code ?? '',
        unitType: unitMap.get(variant.unit_id)?.unit_type ?? '',
      })),
  );
  return (
    <fieldset disabled={disabled} className="restaurant-picker">
      <legend>{label}</legend>
      <Field label={`ค้นหา${label}`}>
        <input
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
      </Field>
      <QueryState query={products} />
      <QueryState query={units} />
      <Field label={label}>
        <select
          required
          value={value?.id ?? ''}
          onChange={(event) =>
            change(
              choices.find((choice) => choice.id === event.target.value) ??
                null,
            )
          }
        >
          <option value="">เลือก{label}</option>
          {value && !choices.some((choice) => choice.id === value.id) ? (
            <option value={value.id}>
              {value.name} · {value.unit}
            </option>
          ) : null}
          {choices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.name} · {choice.unit}
            </option>
          ))}
        </select>
      </Field>
      <div className="catalog-actions">
        <Button
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
          aria-label={`หน้าก่อนหน้า ${label}`}
        >
          ก่อนหน้า
        </Button>
        <Button
          disabled={
            !products.data ||
            page * products.data.page_size >= products.data.total
          }
          onClick={() => setPage(page + 1)}
          aria-label={`หน้าถัดไป ${label}`}
        >
          ถัดไป
        </Button>
        {units.data && units.data.total > 100 ? (
          <Field label={`หน้าหน่วย ${label}`}>
            <select
              value={unitPage}
              onChange={(event) => setUnitPage(Number(event.target.value))}
            >
              {Array.from(
                { length: Math.ceil(units.data.total / 100) },
                (_, index) => (
                  <option key={index} value={index + 1}>
                    {index + 1}
                  </option>
                ),
              )}
            </select>
          </Field>
        ) : null}
      </div>
    </fieldset>
  );
}
