import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Button, Card, Tag } from '../../components/ui/primitives';
import { ApiError } from '../../lib/api';
import type { BarcodeLookup } from '../../lib/catalog-api';
import { useCatalog } from './catalog-hooks';
import { CatalogError } from './CatalogUI';

export function BarcodeScanner() {
  const catalog = useCatalog();
  const [code, setCode] = useState('');
  const [result, setResult] = useState<BarcodeLookup | null>(null);
  const [error, setError] = useState('');
  const [unknown, setUnknown] = useState(false);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const field = useRef<HTMLInputElement>(null);
  async function scan(event: FormEvent) {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setUnknown(false);
    setResult(null);
    try {
      setResult(
        await catalog.request<BarcodeLookup>(
          `/barcodes/lookup?code=${encodeURIComponent(code.replace(/[\r\n]+$/, ''))}`,
        ),
      );
    } catch (problem) {
      setUnknown(problem instanceof ApiError && problem.status === 404);
      setError(
        problem instanceof ApiError && problem.status === 404
          ? 'ไม่พบบาร์โค้ดในองค์กรนี้ ไม่สามารถระบุชื่อสินค้าอัตโนมัติ'
          : problem instanceof Error
            ? problem.message
            : 'ค้นหาไม่ได้',
      );
    } finally {
      pending.current = false;
      setBusy(false);
      field.current?.focus();
      field.current?.select();
    }
  }
  return (
    <Card className="catalog-scanner">
      <h2>สแกน / ค้นหาบาร์โค้ด</h2>
      <form className="catalog-actions" onSubmit={(event) => void scan(event)}>
        <label className="tenant-field catalog-grow">
          บาร์โค้ด
          <input
            ref={field}
            value={code}
            maxLength={80}
            required
            onChange={(event) => setCode(event.target.value)}
            autoComplete="off"
            aria-describedby="scanner-help"
          />
        </label>
        <Button type="submit" disabled={busy}>
          {busy ? 'กำลังค้นหา…' : 'ค้นหาบาร์โค้ด'}
        </Button>
      </form>
      <small id="scanner-help">
        รองรับเครื่องสแกนแบบคีย์บอร์ด กด Enter เพื่อค้นหา •
        ไม่เพิ่มสินค้าจากการสแกนซ้ำ
      </small>
      <CatalogError error={error} />
      {unknown && (
        <div className="catalog-actions">
          <Link to={`/products?search=${encodeURIComponent(code)}`}>
            ค้นหาสินค้าที่มีอยู่เพื่อผูกบาร์โค้ด
          </Link>
          {catalog.tenant.can('catalog.create') && (
            <Link to={`/products/new?barcode=${encodeURIComponent(code)}`}>
              สร้างสินค้าใหม่
            </Link>
          )}
        </div>
      )}
      {result && (
        <p role="status">
          <Link to={`/products/${result.product.id}`}>
            {result.product.name}
          </Link>{' '}
          •{' '}
          {
            result.product.variants.find(
              (item) => item.id === result.variant_id,
            )?.sku
          }{' '}
          <Tag tone={result.saleable ? 'success' : 'error'}>
            {result.saleable ? 'ACTIVE' : 'ไม่พร้อมขาย / archived'}
          </Tag>
        </p>
      )}
    </Card>
  );
}
