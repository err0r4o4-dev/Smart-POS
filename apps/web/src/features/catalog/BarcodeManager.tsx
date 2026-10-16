import { useLanguage } from '../../app/language';
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
  const { t, labelCode } = useLanguage();

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
      setError(
        problem instanceof Error ? problem.message : t('catalog.barcodeError'),
      );
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
      <h3>
        {t('catalog.barcode')} {variant.sku}
      </h3>
      <ul className="catalog-barcode-list">
        {variant.barcodes.map((item) => (
          <li key={item.id}>
            <span>
              <code>{item.code}</code> {item.symbology} · {item.source}{' '}
              {item.is_primary && (
                <Tag tone="amber">{t('catalog.primary')}</Tag>
              )}
            </span>
            {allowed && (
              <Button
                className="button-secondary"
                disabled={busy}
                onClick={() => {
                  if (
                    window.confirm(
                      t('catalog.removeBarcodeValue0', { value0: item.code }),
                    )
                  )
                    void action(`${path}/${item.id}`, 'DELETE');
                }}
              >
                {t('catalog.remove')}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {!variant.barcodes.length && <p>{t('catalog.noBarcodesYet')}</p>}
      {allowed && (
        <form onSubmit={submit}>
          <div className="tenant-form-grid">
            <CatalogField
              label={t('catalog.barcodeValue0', { value0: variant.sku })}
              value={code}
              change={setCode}
              required
              maxLength={80}
            />
            <label className="tenant-field">
              {t('catalog.standard')}
              <select
                aria-label={t('catalog.standard')}
                value={symbology}
                onChange={(event) => setSymbology(event.target.value)}
              >
                {['CODE128', 'EAN13', 'EAN8', 'UPCA'].map((item) => (
                  <option key={item} value={item}>
                    {labelCode(item)}
                  </option>
                ))}
              </select>
            </label>
            <label className="tenant-field">
              {t('catalog.source')}
              <select
                aria-label={t('catalog.source')}
                value={source}
                onChange={(event) => setSource(event.target.value)}
              >
                <option value="MANUFACTURER">
                  {t('catalog.manufacturer')}
                </option>
                <option value="ALIAS">{t('catalog.alias')}</option>
              </select>
            </label>
            <label className="catalog-checkbox">
              <input
                type="checkbox"
                checked={primary}
                onChange={(event) => setPrimary(event.target.checked)}
              />
              {t('catalog.setAsPrimaryBarcode')}
            </label>
          </div>
          <div className="catalog-actions">
            <Button type="submit" disabled={busy}>
              {t('catalog.linkBarcode')}
            </Button>
            <Button
              className="button-secondary"
              disabled={busy}
              onClick={() =>
                void action(`${path}/generate`, 'POST', { is_primary: primary })
              }
            >
              {t('catalog.generateInternalCode128')}
            </Button>
          </div>
        </form>
      )}
      <CatalogError error={error} />
    </Card>
  );
}
