import { useLanguage } from '../../app/language';
import { useRef, useState, type FormEvent } from 'react';
import { WorkspaceLink as Link } from '../../app/WorkspaceNavigation';
import { Button, Card, Tag } from '../../components/ui/primitives';
import { ApiError } from '../../lib/api';
import type { BarcodeLookup } from '../../lib/catalog-api';
import { useCatalog } from './catalog-hooks';
import { CatalogError } from './CatalogUI';

export function BarcodeScanner() {
  const { t } = useLanguage();

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
          ? t('catalog.barcodeNotFoundInThisOrganizationThe')
          : problem instanceof Error
            ? problem.message
            : t('catalog.searchUnavailable'),
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
      <h2>{t('catalog.scanFindBarcode')}</h2>
      <form className="catalog-actions" onSubmit={(event) => void scan(event)}>
        <label className="tenant-field catalog-grow">
          {t('catalog.barcode2')}
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
          {busy ? t('catalog.searching') : t('catalog.findBarcode')}
        </Button>
      </form>
      <small id="scanner-help">
        {t('catalog.keyboardScannersSupportedPressEnterToSearch')}
      </small>
      <CatalogError error={error} />
      {unknown && (
        <div className="catalog-actions">
          <Link to={`/products?search=${encodeURIComponent(code)}`}>
            {t('catalog.findAnExistingProductToLinkThis')}
          </Link>
          {catalog.tenant.can('catalog.create') && (
            <Link to={`/products/new?barcode=${encodeURIComponent(code)}`}>
              {t('catalog.createProduct')}
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
            {result.saleable ? 'ACTIVE' : t('catalog.unavailableArchived')}
          </Tag>
        </p>
      )}
    </Card>
  );
}
