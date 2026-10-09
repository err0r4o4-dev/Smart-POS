import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Card, Tag } from '../../components/ui/primitives';
import type { Product, Variant } from '../../lib/catalog-api';
import { useCatalog } from './catalog-hooks';
import { CatalogError, CatalogField } from './CatalogUI';

export function BarcodeManager({
  product,
  variant,
}: {
  product: Product;
  variant: Variant;
}) {
  const catalog = useCatalog();
  const [params] = useSearchParams();
  const [code, setCode] = useState(params.get('barcode') ?? '');
  const [symbology, setSymbology] = useState('CODE128');
  const [source, setSource] = useState('MANUFACTURER');
  const [primary, setPrimary] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const path = `/products/${product.id}/variants/${variant.id}/barcodes`;
  const allowed =
    catalog.tenant.can('catalog.barcode.manage') &&
    product.status !== 'ARCHIVED' &&
    variant.status !== 'ARCHIVED';
  async function action(target: string, method: string, body?: object) {
    setBusy(true);
    setError('');
    try {
      await catalog.request(target, method, body);
      setCode('');
      await catalog.refresh();
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'บาร์โค้ดผิดพลาด');
    } finally {
      setBusy(false);
    }
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    void action(path, 'POST', { code, symbology, source, is_primary: primary });
  }
  return (
    <Card>
      <h3>บาร์โค้ด · {variant.sku}</h3>
      <ul className="catalog-barcode-list">
        {variant.barcodes.map((item) => (
          <li key={item.id}>
            <span>
              <code>{item.code}</code> {item.symbology} · {item.source}{' '}
              {item.is_primary && <Tag tone="amber">หลัก</Tag>}
            </span>
            {allowed && (
              <Button
                className="button-secondary"
                disabled={busy}
                onClick={() => {
                  if (window.confirm(`นำบาร์โค้ด ${item.code} ออกหรือไม่?`))
                    void action(`${path}/${item.id}`, 'DELETE');
                }}
              >
                นำออก
              </Button>
            )}
          </li>
        ))}
      </ul>
      {!variant.barcodes.length && <p>ยังไม่มีบาร์โค้ด</p>}
      {allowed && (
        <form onSubmit={submit}>
          <div className="tenant-form-grid">
            <CatalogField
              label={`บาร์โค้ด ${variant.sku}`}
              value={code}
              change={setCode}
              required
              maxLength={80}
            />
            <label className="tenant-field">
              มาตรฐาน
              <select
                aria-label="มาตรฐาน"
                value={symbology}
                onChange={(event) => setSymbology(event.target.value)}
              >
                {['CODE128', 'EAN13', 'EAN8', 'UPCA'].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            </label>
            <label className="tenant-field">
              แหล่งที่มา
              <select
                aria-label="แหล่งที่มา"
                value={source}
                onChange={(event) => setSource(event.target.value)}
              >
                <option value="MANUFACTURER">ผู้ผลิต</option>
                <option value="ALIAS">Alias</option>
              </select>
            </label>
            <label className="catalog-checkbox">
              <input
                type="checkbox"
                checked={primary}
                onChange={(event) => setPrimary(event.target.checked)}
              />
              ใช้เป็นบาร์โค้ดหลัก
            </label>
          </div>
          <div className="catalog-actions">
            <Button type="submit" disabled={busy}>
              ผูกบาร์โค้ด
            </Button>
            <Button
              className="button-secondary"
              disabled={busy}
              onClick={() =>
                void action(`${path}/generate`, 'POST', { is_primary: primary })
              }
            >
              สร้าง Internal Code 128
            </Button>
          </div>
        </form>
      )}
      <CatalogError error={error} />
    </Card>
  );
}
