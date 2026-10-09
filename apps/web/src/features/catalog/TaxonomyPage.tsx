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
const labels = { categories: 'หมวดหมู่', brands: 'แบรนด์', units: 'หน่วยนับ' };
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
      setError(problem instanceof Error ? problem.message : 'บันทึกไม่ได้');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="catalog-page">
      <CatalogHeader title={labels[kind]} />
      <CatalogNav />
      <Card>
        <div className="catalog-filters">
          <CatalogField
            label={`ค้นหา${labels[kind]}`}
            value={search}
            change={(next) => {
              setSearch(next);
              setPage(1);
            }}
          />
          <label className="tenant-field">
            กรองสถานะ
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">ACTIVE / INACTIVE</option>
              {['ACTIVE', 'INACTIVE', 'ARCHIVED'].map((item) => (
                <option key={item}>{item}</option>
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
                    <th>ชื่อ</th>
                    {kind === 'units' && (
                      <>
                        <th>รหัส / ประเภท</th>
                        <th>Conversion</th>
                      </>
                    )}
                    <th>สถานะ</th>
                    {allowed && <th>จัดการ</th>}
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
                            หมวดแม่:{' '}
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
                            <small>{item.unit_type}</small>
                          </td>
                          <td>
                            {item.conversion_factor}{' '}
                            {item.base_unit_id
                              ? `× ${options.data?.find((unit) => unit.id === item.base_unit_id)?.name ?? 'หน่วยฐาน'}`
                              : 'หน่วยฐาน'}
                          </td>
                        </>
                      )}
                      <td>
                        <Tag>{item.status}</Tag>
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
                            แก้ไข {item.name}
                          </Button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!query.data.items.length && <p>ยังไม่มี{labels[kind]}</p>}
            <Pagination page={page} total={query.data.total} change={setPage} />
          </>
        )}
      </Card>
      {allowed && (
        <Card>
          <h2>{editing ? `แก้ไข ${editing.name}` : `เพิ่ม${labels[kind]}`}</h2>
          <form onSubmit={(event) => void submit(event)}>
            <div className="tenant-form-grid">
              <CatalogField
                label={`ชื่อ${labels[kind]}`}
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
                label={`คำอธิบาย${labels[kind]}`}
                value={value.description}
                maxLength={2000}
                change={(description) => setValue({ ...value, description })}
              />
              {kind === 'categories' && (
                <TaxonomySelect
                  label="หมวดหมู่แม่"
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
                    label="รหัสหน่วยนับ"
                    required
                    maxLength={50}
                    value={value.code ?? ''}
                    change={(code) => setValue({ ...value, code })}
                  />
                  <label className="tenant-field">
                    ประเภทหน่วยนับ
                    <select
                      value={value.unit_type}
                      onChange={(event) =>
                        setValue({ ...value, unit_type: event.target.value })
                      }
                    >
                      {['COUNT', 'WEIGHT', 'VOLUME', 'PACKAGING'].map(
                        (item) => (
                          <option key={item}>{item}</option>
                        ),
                      )}
                    </select>
                  </label>
                  <TaxonomySelect
                    label="หน่วยฐาน"
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
                    label="จำนวนหน่วยฐานต่อ 1 หน่วย"
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
                Conversion เป็น metadata แบบ exact (6 ตำแหน่ง)
                ไม่มีการปรับสต็อกอัตโนมัติ • หน่วยที่ถูกอ้างอิงแก้โครงสร้างหรือ
                archive ไม่ได้
              </p>
            )}
            <CatalogError error={error} />
            {saved && <p role="status">บันทึกแล้ว</p>}
            <div className="catalog-actions">
              <Button type="submit" disabled={busy}>
                {busy ? 'กำลังบันทึก…' : `บันทึก${labels[kind]}`}
              </Button>
              {editing && (
                <Button
                  className="button-secondary"
                  onClick={() => {
                    setEditing(null);
                    setValue(blank(kind));
                  }}
                >
                  ยกเลิกการแก้ไข
                </Button>
              )}
            </div>
          </form>
        </Card>
      )}
    </div>
  );
}
