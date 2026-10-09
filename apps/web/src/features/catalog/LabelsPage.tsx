import { useState, type CSSProperties } from 'react';
import { Button, Card } from '../../components/ui/primitives';
import type { Product, CatalogPage, Barcode } from '../../lib/catalog-api';
import { useCatalogQuery } from './catalog-hooks';
import {
  CatalogHeader,
  CatalogNav,
  CatalogError,
  CatalogLoading,
} from './CatalogUI';
import { barcodeBits } from './barcode-encoding';

function BarcodeSVG({ barcode }: { barcode: Barcode }) {
  const bits = barcodeBits(barcode.code, barcode.symbology);
  const quiet = 12;
  return (
    <svg
      className="catalog-barcode-svg"
      role="img"
      aria-label={`${barcode.symbology} ${barcode.code}`}
      viewBox={`0 0 ${bits.length + quiet * 2} 50`}
      preserveAspectRatio="none"
    >
      <rect width={bits.length + quiet * 2} height={50} fill="white" />
      {Array.from(bits, (bit, index) =>
        bit === '1' ? (
          <rect
            key={index}
            x={index + quiet}
            y={0}
            width={1}
            height={50}
            fill="black"
          />
        ) : null,
      )}
    </svg>
  );
}
export function LabelsPage() {
  const [search, setSearch] = useState('');
  const [productID, setProductID] = useState('');
  const [variantID, setVariantID] = useState('');
  const [barcodeID, setBarcodeID] = useState('');
  const [copies, setCopies] = useState(1);
  const [width, setWidth] = useState(120);
  const [height, setHeight] = useState(40);
  const products = useCatalogQuery<CatalogPage<Product>>(
    `/products?page_size=20&search=${encodeURIComponent(search)}`,
  );
  const product = useCatalogQuery<Product>(
    productID ? `/products/${productID}/labels` : '/products?page_size=1',
    !!productID,
  );
  const variant =
    product.data?.variants.find((item) => item.id === variantID) ??
    product.data?.variants[0];
  const barcode =
    variant?.barcodes.find((item) => item.id === barcodeID) ??
    variant?.barcodes.find((item) => item.is_primary) ??
    variant?.barcodes[0];
  let minimum = 0;
  if (barcode)
    minimum = Math.ceil(
      (barcodeBits(barcode.code, barcode.symbology).length + 24) * 0.25 + 6,
    );
  const tooSmall = !!barcode && width < minimum;
  return (
    <div className="catalog-page catalog-labels-page">
      <CatalogHeader title="ฉลากบาร์โค้ด / Print Preview" />
      <CatalogNav />
      <Card className="catalog-print-controls">
        <h2>เลือกสินค้าและ Variant</h2>
        <div className="tenant-form-grid">
          <label className="tenant-field">
            ค้นหาสินค้าสำหรับฉลาก
            <input
              value={search}
              maxLength={200}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className="tenant-field">
            สินค้าสำหรับฉลาก
            <select
              aria-label="สินค้าสำหรับฉลาก"
              value={productID}
              onChange={(event) => {
                setProductID(event.target.value);
                setVariantID('');
                setBarcodeID('');
              }}
            >
              <option value="">เลือกสินค้า (ค้นหาชื่อ / SKU ได้)</option>
              {products.data?.items.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="tenant-field">
            Variant สำหรับฉลาก
            <select
              aria-label="Variant สำหรับฉลาก"
              value={variant?.id ?? ''}
              onChange={(event) => {
                setVariantID(event.target.value);
                setBarcodeID('');
              }}
            >
              <option value="">เลือก Variant</option>
              {product.data?.variants.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.sku} · {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="tenant-field">
            บาร์โค้ดสำหรับฉลาก
            <select
              aria-label="บาร์โค้ดสำหรับฉลาก"
              value={barcode?.id ?? ''}
              onChange={(event) => setBarcodeID(event.target.value)}
            >
              <option value="">เลือกบาร์โค้ด</option>
              {variant?.barcodes.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.code} · {item.symbology}
                </option>
              ))}
            </select>
          </label>
          <label className="tenant-field">
            ความกว้าง (mm)
            <select
              value={width}
              onChange={(event) => setWidth(Number(event.target.value))}
            >
              {[60, 80, 120, 240].map((item) => (
                <option key={item} value={item}>
                  {item} mm
                </option>
              ))}
            </select>
          </label>
          <label className="tenant-field">
            ความสูง (mm)
            <select
              value={height}
              onChange={(event) => setHeight(Number(event.target.value))}
            >
              {[40, 50, 60].map((item) => (
                <option key={item} value={item}>
                  {item} mm
                </option>
              ))}
            </select>
          </label>
          <label className="tenant-field">
            จำนวนฉลาก
            <input
              type="number"
              min={1}
              max={100}
              value={copies}
              onChange={(event) =>
                setCopies(
                  Math.min(100, Math.max(1, Number(event.target.value) || 1)),
                )
              }
            />
          </label>
        </div>
        <CatalogLoading
          pending={products.isPending || (!!productID && product.isPending)}
        />
        <CatalogError error={products.error ?? product.error} />
        {!barcode && <p>เลือก Variant ที่มีบาร์โค้ดก่อนพิมพ์</p>}
        {tooSmall && (
          <p role="alert">
            ฉลากนี้ต้องกว้างอย่างน้อย {minimum} mm เพื่อรักษา module width และ
            quiet zone
          </p>
        )}
        <Button
          disabled={!barcode || tooSmall || product.isFetching}
          onClick={() => window.print()}
        >
          เปิด Print Preview / พิมพ์
        </Button>
        <p>
          ใช้ browser printing เท่านั้น ยังไม่รองรับคำสั่ง thermal printer
          โดยตรง • ตรวจสแกนกับเครื่องจริงก่อนใช้งาน
        </p>
      </Card>
      {barcode && variant && product.data && (
        <section
          aria-label="ตัวอย่างฉลาก"
          className="catalog-print-sheet"
          style={
            {
              '--label-width': `${width}mm`,
              '--label-height': `${height}mm`,
            } as CSSProperties
          }
        >
          {Array.from({ length: copies }, (_, index) => (
            <article key={index} className="catalog-label">
              <strong>
                {product.data.name} · {variant.name}
              </strong>
              <small>
                SKU: {variant.sku} • {variant.selling_price} {variant.currency}
              </small>
              <BarcodeSVG barcode={barcode} />
              <span className="catalog-label-code">{barcode.code}</span>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
