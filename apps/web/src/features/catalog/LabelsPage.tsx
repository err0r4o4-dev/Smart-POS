import { useLanguage } from '../../app/language';
import { useState, type CSSProperties } from 'react';
import {
  ArrowLeft,
  Printer,
  Info,
  AlertCircle,
  Barcode as BarcodeIcon,
  SlidersHorizontal,
} from 'lucide-react';
import { WorkspaceLink as Link } from '../../app/WorkspaceNavigation';
import { Button, Card, Tag } from '../../components/ui/primitives';
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
  const { t } = useLanguage();

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
    product.data?.variants?.find((item) => item.id === variantID) ??
    product.data?.variants?.[0];
  const barcode =
    variant?.barcodes?.find((item) => item.id === barcodeID) ??
    variant?.barcodes?.find((item) => item.is_primary) ??
    variant?.barcodes?.[0];

  let minimum = 0;
  if (barcode)
    minimum = Math.ceil(
      (barcodeBits(barcode.code, barcode.symbology).length + 24) * 0.25 + 6,
    );
  const tooSmall = !!barcode && width < minimum;

  return (
    <div className="catalog-page catalog-labels-page">
      <CatalogHeader title={t('catalog.barcodeLabelsPrintPreview')}>
        <Link className="button button-secondary" to="/products">
          <ArrowLeft size={16} aria-hidden="true" />
          {t('catalog.backReturnToList')}
        </Link>
      </CatalogHeader>
      <CatalogNav />

      <Card className="catalog-print-controls">
        <div className="catalog-print-card-header">
          <h2>{t('catalog.printBarcodeLabels')}</h2>
          <p className="catalog-print-card-subtitle">
            {t('catalog.selectProductsSetLabelDimensionsAndPreview')}
          </p>
        </div>

        {/* ส่วนที่ 1: เลือกสินค้าและบาร์โค้ด */}
        <section className="catalog-print-section">
          <div className="catalog-print-section-header">
            <h3>
              <BarcodeIcon size={18} aria-hidden="true" />
              {t('catalog.selectProductAndBarcode')}
            </h3>
            <p>{t('catalog.findAndSelectTheProductVariantAnd')}</p>
          </div>
          <div className="catalog-print-grid-products">
            <label className="tenant-field">
              {t('catalog.findProductsForLabels')}
              <input
                value={search}
                maxLength={200}
                placeholder={t('catalog.searchNameOrSku')}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>
            <label className="tenant-field">
              {t('catalog.productForLabels')}
              <select
                aria-label={t('catalog.productForLabels')}
                value={productID}
                onChange={(event) => {
                  setProductID(event.target.value);
                  setVariantID('');
                  setBarcodeID('');
                }}
              >
                <option value="">
                  {t('catalog.selectProductSearchByNameSku')}
                </option>
                {products.data?.items?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="tenant-field">
              {t('catalog.variantForLabels')}
              <select
                aria-label={t('catalog.variantForLabels')}
                value={variant?.id ?? ''}
                onChange={(event) => {
                  setVariantID(event.target.value);
                  setBarcodeID('');
                }}
              >
                <option value="">{t('catalog.selectVariant')}</option>
                {product.data?.variants?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.sku} · {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="tenant-field">
              {t('catalog.barcodeForLabels')}
              <select
                aria-label={t('catalog.barcodeForLabels')}
                value={barcode?.id ?? ''}
                onChange={(event) => setBarcodeID(event.target.value)}
              >
                <option value="">{t('catalog.selectBarcode')}</option>
                {variant?.barcodes?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.code} · {item.symbology}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {/* ส่วนที่ 2: ขนาดฉลากและการพิมพ์ */}
        <section className="catalog-print-section">
          <div className="catalog-print-section-header">
            <h3>
              <SlidersHorizontal size={18} aria-hidden="true" />
              {t('catalog.labelDimensionsAndPrinting')}
            </h3>
            <p>{t('catalog.setWidthHeightAndTheNumberOf')}</p>
          </div>
          <div className="catalog-print-grid-settings">
            <label className="tenant-field">
              {t('catalog.widthMm')}
              <select
                aria-label={t('catalog.widthMm')}
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
              {t('catalog.heightMm')}
              <select
                aria-label={t('catalog.heightMm')}
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
              {t('catalog.labelCount')}
              <input
                aria-label={t('catalog.labelCount')}
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
        </section>

        <CatalogLoading
          pending={products.isPending || (!!productID && product.isPending)}
        />
        <CatalogError error={products.error ?? product.error} />

        {/* ข้อมูลสถานะและคำแนะนำ */}
        {!barcode && (
          <div
            className="catalog-print-notice catalog-print-notice-info"
            role="status"
          >
            <Info size={18} aria-hidden="true" />
            <span>{t('catalog.selectAVariantWithABarcodeBefore')}</span>
          </div>
        )}
        {tooSmall && (
          <div
            className="catalog-print-notice catalog-print-notice-warning"
            role="alert"
          >
            <AlertCircle size={18} aria-hidden="true" />
            <span>
              {t('catalog.thisLabelMustBeAtLeast')} {minimum}{' '}
              {t('catalog.mmWideToPreserveModuleWidthAnd')}
            </span>
          </div>
        )}

        {/* สรุปข้อมูลฉลากที่เลือก */}
        {barcode && variant && product.data && (
          <div className="catalog-print-summary">
            <div className="catalog-print-summary-info">
              <span className="catalog-print-summary-title">
                {product.data.name} · {variant.name}
              </span>
              <span className="catalog-print-summary-meta">
                SKU: {variant.sku} {t('catalog.code')} {barcode.code} (
                {barcode.symbology}) • {variant.selling_price}{' '}
                {variant.currency}
              </span>
            </div>
            <Tag tone="neutral">
              {width} × {height} mm • {copies} {t('catalog.labels')}
            </Tag>
          </div>
        )}

        {/* แถบปุ่มสั่งการ */}
        <div className="catalog-print-actions">
          <Button
            disabled={!barcode || tooSmall || product.isFetching}
            onClick={() => window.print()}
          >
            <Printer size={16} aria-hidden="true" />
            {t('catalog.openPrintPreviewPrint')}
          </Button>
        </div>
        <p className="catalog-print-note">
          {t('catalog.browserPrintingOnlyDirectThermalPrinterCommands')}
        </p>
      </Card>

      {/* แผ่นตัวอย่างพิมพ์ */}
      {barcode && variant && product.data && (
        <section
          className="catalog-print-sheet-card"
          aria-label={t('catalog.labelPreview')}
        >
          <div className="catalog-print-preview-header">
            <div>
              <h2>{t('catalog.printPreview2')}</h2>
              <p className="catalog-print-preview-meta">
                {t('catalog.labelSize')} {width} × {height}{' '}
                {t('catalog.mmTotal')} {copies} {t('catalog.labels')}
              </p>
            </div>
            <Button className="button-secondary" onClick={() => window.print()}>
              <Printer size={16} aria-hidden="true" />
              {t('catalog.print')} {copies} {t('catalog.labels')}
            </Button>
          </div>
          <div
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
                  SKU: {variant.sku} • {variant.selling_price}{' '}
                  {variant.currency}
                </small>
                <BarcodeSVG barcode={barcode} />
                <span className="catalog-label-code">{barcode.code}</span>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
