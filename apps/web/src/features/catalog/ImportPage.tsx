import { useState } from 'react';
import { Button, Card } from '../../components/ui/primitives';
import { uploadCatalog, type ImportJob } from '../../lib/catalog-api';
import { useCatalog } from './catalog-hooks';
import { CatalogHeader, CatalogNav, CatalogError } from './CatalogUI';
const fields = [
  'product_name',
  'sku',
  'barcode',
  'symbology',
  'category',
  'brand',
  'unit',
  'cost_price',
  'selling_price',
];
export function ImportPage() {
  const catalog = useCatalog();
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [mode, setMode] = useState('CREATE');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function preview() {
    if (!file) return;
    setBusy(true);
    setError('');
    try {
      const result = await uploadCatalog(
        catalog.orgID,
        file,
        mapping,
        catalog.csrf,
        catalog.controller.current.signal,
      );
      setJob(result);
      setHeaders(result.headers);
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'อ่านไฟล์ไม่ได้');
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (
      !job ||
      !window.confirm(
        `นำเข้า ${job.total} แถว แบบ ${mode} หรือไม่? ระบบจะตรวจซ้ำและบันทึกทั้งชุดใน transaction เดียว`,
      )
    )
      return;
    setBusy(true);
    setError('');
    try {
      const result = await catalog.request<ImportJob>(
        `/products/import/${job.id}/confirm`,
        'POST',
        { mode },
      );
      setJob(result);
      await catalog.refresh();
    } catch (problem) {
      setError(
        problem instanceof Error
          ? problem.message
          : 'นำเข้าไม่ได้ กรุณาดู preview ใหม่',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="catalog-page">
      <CatalogHeader title="นำเข้าสินค้า CSV / XLSX" />
      <CatalogNav />
      <Card>
        <h2>1. เลือกไฟล์และตรวจข้อมูล</h2>
        <p>
          สูงสุด 5 MiB / 2,000 แถว • XLSX ต้องมี sheet1 แผ่นเดียว ไม่มีสูตร •
          ช่องบาร์โค้ดต้องเป็น Text เพื่อเก็บเลขศูนย์นำหน้า
        </p>
        <p>
          ต้องมี product_name, sku, unit, cost_price, selling_price •
          category/brand/unit ต้องมีอยู่และ ACTIVE • 1 แถว = 1 สินค้าใหม่พร้อม
          Default Variant
        </p>
        <label className="tenant-field">
          ไฟล์สินค้า
          <input
            type="file"
            accept=".csv,.xlsx"
            onChange={(event) => {
              const next = event.target.files?.[0] ?? null;
              setJob(null);
              setHeaders([]);
              setMapping({});
              setError('');
              if (next && next.size > 5 * 1024 * 1024) {
                setError('ไฟล์เกิน 5 MiB');
                setFile(null);
              } else setFile(next);
            }}
          />
        </label>
        {headers.length > 0 && (
          <>
            <h3>2. จับคู่คอลัมน์</h3>
            <div className="tenant-form-grid">
              {fields.map((field) => (
                <label className="tenant-field" key={field}>
                  {field}
                  <select
                    aria-label={field}
                    value={
                      mapping[field] ??
                      headers.find(
                        (header) => header.toLowerCase() === field,
                      ) ??
                      ''
                    }
                    onChange={(event) => {
                      setMapping({ ...mapping, [field]: event.target.value });
                      setJob(null);
                    }}
                  >
                    <option value="">ไม่ระบุ</option>
                    {headers.map((header) => (
                      <option key={header} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
          </>
        )}
        <Button disabled={!file || busy} onClick={() => void preview()}>
          {busy ? 'กำลังตรวจ…' : 'ตรวจและแสดง Preview'}
        </Button>
        <CatalogError error={error} />
      </Card>
      {job && (
        <Card>
          <h2>3. ผลตรวจและยืนยัน</h2>
          <p role="status">
            ทั้งหมด {job.total} • ถูกต้อง {job.valid} • ผิดพลาด {job.invalid} •
            SKU เดิม {job.duplicates} • ใหม่ {job.new_products}
          </p>
          <div className="catalog-table-wrap">
            <table className="catalog-table">
              <thead>
                <tr>
                  <th>แถว</th>
                  <th>สินค้า / SKU</th>
                  <th>บาร์โค้ด</th>
                  <th>ผลตรวจ</th>
                </tr>
              </thead>
              <tbody>
                {job.rows.map((row) => (
                  <tr key={row.line}>
                    <td>{row.line}</td>
                    <td>
                      {row.product_name}
                      <small>{row.sku}</small>
                    </td>
                    <td>{row.barcode || '—'}</td>
                    <td>
                      {row.errors.length
                        ? row.errors.join(' • ')
                        : row.existing_id
                          ? 'SKU เดิม'
                          : 'พร้อมสร้างใหม่'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="tenant-field">
            จัดการ SKU เดิม
            <select
              aria-label="จัดการ SKU เดิม"
              value={mode}
              disabled={busy || job.status === 'COMPLETED'}
              onChange={(event) => setMode(event.target.value)}
            >
              <option value="CREATE">Create New — ปฏิเสธ SKU เดิม</option>
              <option value="SKIP">Skip Existing — ข้าม SKU เดิม</option>
              <option value="UPDATE">
                Update Existing — แก้ชื่อ, หน่วย, ราคา และข้อมูลที่ระบุ
              </option>
            </select>
          </label>
          <p className="notice">
            บาร์โค้ดที่เป็นของ SKU อื่นต้องแก้ก่อน • ไม่มี partial success •
            Preview หมดอายุ 1 ชั่วโมง • Confirm ซ้ำ job/mode เดิมไม่สร้างซ้ำ
          </p>
          {job.status !== 'COMPLETED' && (
            <Button
              disabled={
                busy ||
                job.invalid > 0 ||
                (mode === 'CREATE' && job.duplicates > 0)
              }
              onClick={() => void confirm()}
            >
              ยืนยันนำเข้า
            </Button>
          )}
          {job.result && (
            <p role="status">
              นำเข้าเสร็จ: สร้าง {job.result.imported} • แก้ไข{' '}
              {job.result.updated} • ข้าม {job.result.skipped} • ล้มเหลว{' '}
              {job.result.failed}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
