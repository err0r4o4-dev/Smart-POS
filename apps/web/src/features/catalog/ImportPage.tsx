import { useLanguage } from '../../app/language';
import { useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  FileSpreadsheet,
  UploadCloud,
  X,
} from 'lucide-react';
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
  const { t } = useLanguage();

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
      setError(t('catalog.fileExceeds5Mb'));
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
      setError(
        problem instanceof Error
          ? problem.message
          : t('catalog.unableToReadFile'),
      );
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (
      !job ||
      !window.confirm(
        t('catalog.importValue0RowsUsingValue1TheSystem', {
          value0: job.total,
          value1: mode,
        }),
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
          : t('catalog.importUnavailableGenerateANewPreview'),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="catalog-page">
      <CatalogHeader title={t('catalog.importProductsCsvXlsx')}>
        <Link className="button button-secondary" to="/products">
          <ArrowLeft size={16} aria-hidden="true" />
          {t('catalog.backReturnToList')}
        </Link>
      </CatalogHeader>
      <CatalogNav />
      <Card>
        <div className="import-card-header">
          <h2>{t('catalog.step1SelectFileAndValidate')}</h2>
          <p className="import-card-subtitle">
            {t('catalog.uploadACsvOrXlsxFileTo')}
          </p>
        </div>

        <div className="import-guidelines-grid">
          <div className="import-guide-card">
            <div className="import-guide-header">
              <span className="import-guide-icon">
                <FileSpreadsheet size={18} aria-hidden="true" />
              </span>
              <h3>{t('catalog.fileRequirements')}</h3>
            </div>
            <ul className="import-guide-list">
              <li>
                <strong>{t('catalog.sizeAndRows')}</strong>{' '}
                {t('catalog.upTo5Mb2000Rows')}
              </li>
              <li>
                <strong>{t('catalog.fileFormat')}</strong> <code>.csv</code>{' '}
                {t('catalog.or')} <code>.xlsx</code>{' '}
                {t('catalog.sheet1OnlyNoFormulas')}
              </li>
              <li>
                <strong>{t('catalog.barcodeColumn')}</strong>{' '}
                {t('catalog.useTextFormatToPreserveLeadingZeros')}
              </li>
            </ul>
          </div>

          <div className="import-guide-card">
            <div className="import-guide-header">
              <span className="import-guide-icon">
                <CheckCircle2 size={18} aria-hidden="true" />
              </span>
              <h3>{t('catalog.dataRequirements')}</h3>
            </div>
            <ul className="import-guide-list">
              <li>
                <strong>{t('catalog.requiredColumns')}</strong>
                <div className="import-req-tags">
                  <code>product_name</code>
                  <code>sku</code>
                  <code>unit</code>
                  <code>cost_price</code>
                  <code>selling_price</code>
                </div>
              </li>
              <li>
                <strong>{t('catalog.referencedData')}</strong>{' '}
                <code>category</code>, <code>brand</code>, <code>unit</code>{' '}
                {t('catalog.mustExistInTheSystemAndBe')}
              </li>
              <li>
                <strong>{t('catalog.structure')}</strong>{' '}
                {t('catalog.step1Row1NewProductWithA')}
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
              aria-label={t('catalog.productFile')}
              className="import-file-input-hidden"
              onChange={(event) => {
                const next = event.target.files?.[0] ?? null;
                if (next) handleFile(next);
              }}
            />
            <label
              htmlFor="catalog-file-input"
              className="import-dropzone-label"
            >
              <span className="sr-only">{t('catalog.productFile')}</span>
              <div className="import-dropzone-icon">
                <UploadCloud size={28} aria-hidden="true" />
              </div>
              <div className="import-dropzone-text">
                <strong>{t('catalog.chooseAFileOrDragItHere')}</strong>
                <p>{t('catalog.csvAndXlsxSupportedUpTo5')}</p>
              </div>
              <span
                className="button button-secondary import-dropzone-btn"
                aria-hidden="true"
              >
                {t('catalog.chooseLocalFile')}
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
                <Tag tone="success">{t('catalog.readyToValidate')}</Tag>
              </div>
              <span className="import-file-meta">
                {formatFileSize(file.size)}
              </span>
            </div>
            <div className="import-file-actions">
              <label
                htmlFor="catalog-file-input"
                className="button button-secondary button-compact"
              >
                {t('catalog.changeFile')}
              </label>
              <input
                id="catalog-file-input"
                type="file"
                accept=".csv,.xlsx"
                aria-label={t('catalog.productFile')}
                className="import-file-input-hidden"
                onChange={(event) => {
                  const next = event.target.files?.[0] ?? null;
                  if (next) handleFile(next);
                }}
              />
              <Button
                className="button-secondary button-compact import-remove-btn"
                onClick={clearFile}
                aria-label={t('catalog.clearFile')}
              >
                <X size={15} aria-hidden="true" />
                <span>{t('catalog.clearFile')}</span>
              </Button>
            </div>
          </div>
        )}
        {headers.length > 0 && (
          <>
            <h3>{t('catalog.step2MapColumns')}</h3>
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
                    <option value="">{t('catalog.notProvided')}</option>
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
            {busy ? t('catalog.validating') : t('catalog.validateAndPreview')}
          </Button>
          {file && !busy && (
            <span className="import-action-hint">
              {t('catalog.readyToValidateColumnMappingsAndGenerate')}
            </span>
          )}
        </div>
        <CatalogError error={error} />
      </Card>
      {job && (
        <Card>
          <h2>{t('catalog.step3ValidationAndConfirmation')}</h2>
          <p role="status">
            {t('common.all')} {job.total} {t('catalog.valid')} {job.valid}{' '}
            {t('catalog.errors')} {job.invalid} {t('catalog.existingSku')}{' '}
            {job.duplicates} {t('catalog.new')} {job.new_products}
          </p>
          <div className="catalog-table-wrap">
            <table className="catalog-table">
              <thead>
                <tr>
                  <th>{t('catalog.rows')}</th>
                  <th>{t('common.productSku')}</th>
                  <th>{t('catalog.barcode2')}</th>
                  <th>{t('catalog.validationResult')}</th>
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
                          ? t('catalog.existingSku2')
                          : t('catalog.readyToCreate')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="tenant-field">
            {t('catalog.handleExistingSkus')}
            <select
              aria-label={t('catalog.handleExistingSkus')}
              value={mode}
              disabled={busy || job.status === 'COMPLETED'}
              onChange={(event) => setMode(event.target.value)}
            >
              <option value="CREATE">
                {t('catalog.createNewRejectExistingSkus')}
              </option>
              <option value="SKIP">
                {t('catalog.skipExistingSkipExistingSkus')}
              </option>
              <option value="UPDATE">
                {t('catalog.updateExistingUpdateNameUnitPriceAnd')}
              </option>
            </select>
          </label>
          <p className="notice">
            {t('catalog.resolveBarcodesOwnedByAnotherSkuFirst')}
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
              {t('catalog.confirmImport')}
            </Button>
          )}
          {job.result && (
            <p role="status">
              {t('catalog.importCompletedCreated')} {job.result.imported}{' '}
              {t('catalog.updated')} {job.result.updated} {t('catalog.skipped')}{' '}
              {job.result.skipped} {t('catalog.failed')} {job.result.failed}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
