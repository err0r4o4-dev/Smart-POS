import { useState } from 'react';
import { CheckCircle2, FileSpreadsheet, UploadCloud, X } from 'lucide-react';
import { WorkspaceLink as Link } from '../../app/WorkspaceNavigation';
import { Button, Card, Tag } from '../../components/ui/primitives';
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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function ImportPage() {
  const catalog = useCatalog();
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<ImportJob | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [mode, setMode] = useState('CREATE');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);

  function handleFile(next: File) {
    setJob(null);
    setHeaders([]);
    setMapping({});
    setError('');
    if (next.size > 5 * 1024 * 1024) {
      setError('ไฟล์เกิน 5 MB');
      setFile(null);
    } else {
      setFile(next);
    }
  }

  function clearFile() {
    setFile(null);
    setJob(null);
    setHeaders([]);
    setMapping({});
    setError('');
  }
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
      <CatalogHeader title="นำเข้าสินค้า CSV / XLSX">
        <Link to="/products">ยกเลิก / กลับรายการ</Link>
      </CatalogHeader>
      <CatalogNav />
      <Card>
        <div className="import-card-header">
          <h2>1. เลือกไฟล์และตรวจข้อมูล</h2>
          <p className="import-card-subtitle">
            อัปโหลดไฟล์ CSV หรือ XLSX เพื่อนำเข้าแค็ตตาล็อกสินค้าและบาร์โค้ดเข้าสู่ระบบ
          </p>
        </div>

        <div className="import-guidelines-grid">
          <div className="import-guide-card">
            <div className="import-guide-header">
              <span className="import-guide-icon">
                <FileSpreadsheet size={18} aria-hidden="true" />
              </span>
              <h3>ข้อกำหนดของไฟล์</h3>
            </div>
            <ul className="import-guide-list">
              <li>
                <strong>ขนาดและปริมาณ:</strong> สูงสุด 5 MB / 2,000 แถว
              </li>
              <li>
                <strong>รูปแบบไฟล์:</strong> <code>.csv</code> หรือ <code>.xlsx</code> (เฉพาะ sheet1 แผ่นเดียว ไม่มีสูตร)
              </li>
              <li>
                <strong>ช่องบาร์โค้ด:</strong> ตั้งประเภทเป็น Text เพื่อเก็บเลขศูนย์นำหน้า
              </li>
            </ul>
          </div>

          <div className="import-guide-card">
            <div className="import-guide-header">
              <span className="import-guide-icon">
                <CheckCircle2 size={18} aria-hidden="true" />
              </span>
              <h3>ข้อกำหนดข้อมูล</h3>
            </div>
            <ul className="import-guide-list">
              <li>
                <strong>คอลัมน์ที่จำเป็น:</strong>
                <div className="import-req-tags">
                  <code>product_name</code>
                  <code>sku</code>
                  <code>unit</code>
                  <code>cost_price</code>
                  <code>selling_price</code>
                </div>
              </li>
              <li>
                <strong>ข้อมูลอ้างอิง:</strong> <code>category</code>, <code>brand</code>, <code>unit</code> ต้องมีอยู่ในระบบและ ACTIVE
              </li>
              <li>
                <strong>โครงสร้าง:</strong> 1 แถว = 1 สินค้าใหม่พร้อม Default Variant
              </li>
            </ul>
          </div>
        </div>

        {!file ? (
          <div
            className={`import-dropzone ${isDragging ? 'is-dragging' : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(event) => {
              event.preventDefault();
              setIsDragging(false);
              const dropped = event.dataTransfer.files?.[0];
              if (dropped) handleFile(dropped);
            }}
          >
            <input
              id="catalog-file-input"
              type="file"
              accept=".csv,.xlsx"
              aria-label="ไฟล์สินค้า"
              className="import-file-input-hidden"
              onChange={(event) => {
                const next = event.target.files?.[0] ?? null;
                if (next) handleFile(next);
              }}
            />
            <label htmlFor="catalog-file-input" className="import-dropzone-label">
              <span className="sr-only">ไฟล์สินค้า</span>
              <div className="import-dropzone-icon">
                <UploadCloud size={28} aria-hidden="true" />
              </div>
              <div className="import-dropzone-text">
                <strong>คลิกเลือกไฟล์ หรือลากไฟล์มาวางที่นี่</strong>
                <p>รองรับไฟล์ .CSV และ .XLSX (ขนาดไม่เกิน 5 MB / สูงสุด 2,000 แถว)</p>
              </div>
              <span className="button button-secondary import-dropzone-btn" aria-hidden="true">
                เลือกไฟล์จากเครื่อง
              </span>
            </label>
          </div>
        ) : (
          <div className="import-selected-file-card">
            <div className="import-file-badge">
              <FileSpreadsheet size={22} aria-hidden="true" />
            </div>
            <div className="import-file-info">
              <div className="import-file-name-row">
                <strong className="import-file-name">{file.name}</strong>
                <Tag tone="success">พร้อมตรวจสอบ</Tag>
              </div>
              <span className="import-file-meta">{formatFileSize(file.size)}</span>
            </div>
            <div className="import-file-actions">
              <label htmlFor="catalog-file-input" className="button button-secondary button-compact">
                เปลี่ยนไฟล์
              </label>
              <input
                id="catalog-file-input"
                type="file"
                accept=".csv,.xlsx"
                aria-label="ไฟล์สินค้า"
                className="import-file-input-hidden"
                onChange={(event) => {
                  const next = event.target.files?.[0] ?? null;
                  if (next) handleFile(next);
                }}
              />
              <Button
                className="button-secondary button-compact import-remove-btn"
                onClick={clearFile}
                aria-label="ยกเลิกไฟล์"
              >
                <X size={15} aria-hidden="true" />
                <span>ยกเลิกไฟล์</span>
              </Button>
            </div>
          </div>
        )}
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
        <div className="import-action-bar">
          <Button disabled={!file || busy} onClick={() => void preview()}>
            {busy ? 'กำลังตรวจ…' : 'ตรวจและแสดง Preview'}
          </Button>
          {file && !busy && (
            <span className="import-action-hint">
              พร้อมส่งข้อมูลเพื่อตรวจความถูกต้องของคอลัมน์และสร้างพรีวิว
            </span>
          )}
        </div>
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
