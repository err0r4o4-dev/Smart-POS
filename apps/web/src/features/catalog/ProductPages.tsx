import { useLanguage } from '../../app/language';
import { useMemo, useState, type FormEvent } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { WorkspaceLink as Link } from '../../app/WorkspaceNavigation';
import { useWorkspaceNavigate as useNavigate } from '../../app/useWorkspaceNavigate';
import {
  Archive,
  ArrowLeft,
  Check,
  CheckCircle2,
  ClipboardList,
  Eye,
  Layers,
  Package,
  PauseCircle,
  Plus,
} from 'lucide-react';
import { Button, Card, Tag } from '../../components/ui/primitives';
import {
  StandardContextBar,
  StandardFilterCard,
  StandardKpiCard,
  StandardKpiGrid,
  StandardSearchField,
  StandardStatusTabs,
} from '../../components/ui/StandardPage';
import { QueryFeedback } from '../../components/feedback/QueryFeedback';
import {
  productInput,
  blankProduct,
  blankVariant,
  validateVariantInput,
  type Product,
  type CatalogPage,
  type ProductInput,
  type VariantInput,
} from '../../lib/catalog-api';
import {
  useCatalog,
  useCatalogQuery,
  useTaxonomyOptions,
} from './catalog-hooks';
import {
  CatalogError,
  CatalogHeader,
  CatalogLoading,
  CatalogNav,
  TaxonomySelect,
  Pagination,
} from './CatalogUI';
import { ProductFields, VariantFields, VariantEditor } from './ProductForm';

function statusTone(status: string): 'success' | 'amber' | 'neutral' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'INACTIVE') return 'amber';
  return 'neutral';
}

export function ProductsPage() {
  const { t, labelCode } = useLanguage();

  const catalog = useCatalog();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') ?? '');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [sort, setSort] = useState('name');
  const queryParams = new URLSearchParams({
    search: params.get('search') ?? '',
    page: String(page),
    page_size: '20',
    status,
    sort,
    ...(category ? { category_id: category } : {}),
  });
  const query = useCatalogQuery<CatalogPage<Product>>(
    `/products?${queryParams}`,
  );
  const categories = useTaxonomyOptions('categories');
  const items = useMemo(() => query.data?.items ?? [], [query.data?.items]);
  const totalProducts = query.data?.total ?? 0;
  const activeCount = useMemo(
    () => items.filter((item) => item.status === 'ACTIVE').length,
    [items],
  );
  const inactiveCount = useMemo(
    () => items.filter((item) => item.status === 'INACTIVE').length,
    [items],
  );
  const archivedCount = useMemo(
    () => items.filter((item) => item.status === 'ARCHIVED').length,
    [items],
  );

  return (
    <div className="catalog-page">
      <CatalogHeader title={t('catalog.restaurantItems')}>
        <>
          <Link className="button button-secondary" to="/settings/storefront">
            <Eye size={15} aria-hidden="true" />
            <span>{t('storefront.publishedProducts')}</span>
          </Link>
          {catalog.tenant.can('catalog.create') && (
            <Link className="button sales-new-sale-btn" to="/menu/new">
              <Plus size={16} aria-hidden="true" />
              <span>{t('catalog.addProduct')}</span>
            </Link>
          )}
        </>
      </CatalogHeader>
      <CatalogNav />

      <StandardKpiGrid label={t('catalog.restaurantItems')}>
        <StandardKpiCard
          icon={<Package size={20} />}
          tone="amber"
          label={t('catalog.restaurantItems')}
          value={`${totalProducts} ${t('pos.itemsUnit')}`}
          subtext={t('catalog.sharedOrganizationCatalog')}
          sparkline
        />
        <StandardKpiCard
          icon={<CheckCircle2 size={20} />}
          tone="success"
          label={labelCode('ACTIVE')}
          value={`${activeCount} ${t('pos.itemsUnit')}`}
          subtext={t('pos.ofAllItems')}
          trendUp
        />
        <StandardKpiCard
          icon={<Layers size={20} />}
          tone="amber"
          label={t('catalog.categories')}
          value={`${categories.data?.length ?? 0} ${t('pos.itemsUnit')}`}
        />
      </StandardKpiGrid>

      <StandardFilterCard
        useForm
        onSubmit={(event) => {
          event.preventDefault();
          setParams(search ? { search } : {});
          setPage(1);
        }}
        onReset={() => {
          setSearch('');
          setParams({});
          setStatus('');
          setCategory(null);
          setSort('name');
          setPage(1);
        }}
        searchSubmit
        searchLabel={t('common.searchProducts')}
      >
        <StandardSearchField
          label={t('catalog.searchRestaurantItems')}
          maxLength={200}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <label className="sales-filter-field">
          <span>{t('catalog.filterStatus')}</span>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="">{t('catalog.activeInactive')}</option>
            {['ACTIVE', 'INACTIVE', 'ARCHIVED'].map((item) => (
              <option key={item} value={item}>
                {labelCode(item)}
              </option>
            ))}
          </select>
        </label>
        <TaxonomySelect
          label={t('catalog.filterCategory')}
          value={category}
          items={categories.data ?? []}
          change={(value) => {
            setCategory(value);
            setPage(1);
          }}
        />
        <label className="sales-filter-field">
          <span>{t('catalog.sortBy')}</span>
          <select
            value={sort}
            onChange={(event) => {
              setSort(event.target.value);
              setPage(1);
            }}
          >
            <option value="name">{t('catalog.nameAZ')}</option>
            <option value="-name">{t('catalog.nameZA')}</option>
            <option value="-updated">{t('catalog.updated2')}</option>
            <option value="updated">{t('catalog.oldestUpdated')}</option>
          </select>
        </label>
      </StandardFilterCard>

      <Card className="sales-table-card">
        <StandardStatusTabs
          ariaLabel={t('catalog.filterStatus')}
          value={status}
          onChange={(next) => {
            setStatus(next);
            setPage(1);
          }}
          tabs={[
            {
              key: '',
              label: t('common.all'),
              count: status === '' ? totalProducts : items.length,
              icon: <ClipboardList size={15} aria-hidden="true" />,
            },
            {
              key: 'ACTIVE',
              label: labelCode('ACTIVE'),
              count: activeCount,
              icon: <CheckCircle2 size={15} aria-hidden="true" />,
            },
            {
              key: 'INACTIVE',
              label: labelCode('INACTIVE'),
              count: inactiveCount,
              icon: <PauseCircle size={15} aria-hidden="true" />,
            },
            {
              key: 'ARCHIVED',
              label: labelCode('ARCHIVED'),
              count: archivedCount,
              icon: <Archive size={15} aria-hidden="true" />,
            },
          ]}
        />
        <QueryFeedback
          loading={query.isFetching || categories.isFetching}
          error={query.error ?? categories.error}
          retry={() => {
            void query.refetch();
            void categories.refetch();
          }}
        />
        {query.data && (
          <>
            <div
              className="catalog-table-wrap table-scroll sales-history-table"
              tabIndex={0}
              role="region"
              aria-label={t('catalog.productList')}
            >
              <table className="catalog-table record-table">
                <thead>
                  <tr>
                    <th>{t('catalog.restaurantItems')}</th>
                    <th>{t('common.sku')}</th>
                    <th>{t('catalog.categories')}</th>
                    <th className="sales-amount">
                      {t('catalog.sellingPrice')}
                    </th>
                    <th>{t('auth.status')}</th>
                    <th>{t('catalog.definitions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.items.map((product) => (
                    <tr key={product.id}>
                      <td>
                        <div className="catalog-product-cell">
                          <span
                            className="sales-doc-icon catalog-image"
                            aria-label={t('catalog.noProductImageYet')}
                          >
                            <Package size={18} aria-hidden="true" />
                          </span>
                          <Link to={`/menu/${product.id}`}>
                            <strong>{product.name}</strong>
                          </Link>
                        </div>
                      </td>
                      <td>
                        {product.variants.map((variant) => (
                          <div key={variant.id}>
                            <code>{variant.sku}</code>
                          </div>
                        ))}
                      </td>
                      <td>
                        <strong className="sales-branch-name">
                          {product.category_name || '—'}
                        </strong>
                      </td>
                      <td className="sales-amount">
                        {product.variants.map((variant) => (
                          <div key={variant.id}>
                            <strong>
                              ฿{variant.selling_price} {variant.currency}
                            </strong>
                          </div>
                        ))}
                      </td>
                      <td>
                        <Tag tone={statusTone(product.status)}>
                          {product.status === 'ACTIVE' && (
                            <Check size={12} aria-hidden="true" />
                          )}
                          <span>{labelCode(product.status)}</span>
                        </Tag>
                      </td>
                      <td>
                        <div className="sales-row-actions">
                          <Link
                            to={`/menu/${product.id}`}
                            className="button button-secondary sales-detail-link"
                          >
                            <Eye size={15} aria-hidden="true" />
                            <span>{t('pos.viewDetails')}</span>
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!query.data.items.length && (
              <p className="empty-state sales-empty-message">
                {t('catalog.noProductsFoundStartByCreatingUnits')}
              </p>
            )}
            <Pagination page={page} total={query.data.total} change={setPage} />
          </>
        )}
      </Card>
    </div>
  );
}
export function ProductDetailsPage() {
  const { t, labelCode } = useLanguage();

  const { id = '' } = useParams();
  const catalog = useCatalog();
  const query = useCatalogQuery<Product>(`/products/${id}`);
  return (
    <div className="catalog-page">
      <CatalogHeader title={t('catalog.productDetails')}>
        <Link className="button button-secondary sales-export-btn" to="/menu">
          <ArrowLeft size={16} aria-hidden="true" />
          <span>{t('catalog.backToProducts')}</span>
        </Link>
        <Link className="button button-secondary" to="/settings/storefront">
          <Eye size={15} aria-hidden="true" />
          <span>{t('storefront.publishedProducts')}</span>
        </Link>
        {catalog.tenant.can('catalog.update') && (
          <Link className="button sales-new-sale-btn" to={`/menu/${id}/edit`}>
            <span>{t('catalog.editProduct')}</span>
          </Link>
        )}
      </CatalogHeader>
      <CatalogNav />
      <StandardContextBar />
      <CatalogLoading pending={query.isPending} />
      <CatalogError error={query.error} />
      {query.data && (
        <>
          <Card>
            <div className="catalog-product-summary">
              <span className="catalog-image catalog-image-large">
                <Package size={40} />
              </span>
              <div>
                <h2>{query.data.name}</h2>
                <Tag tone={statusTone(query.data.status)}>
                  {labelCode(query.data.status)}
                </Tag>
                <p>{query.data.description || t('catalog.noDescription')}</p>
                <p>
                  {t('catalog.category')} {query.data.category_name || '—'}
                </p>
              </div>
            </div>
          </Card>
          {query.data.variants.map((variant) => (
            <div key={variant.id}>
              <Card>
                <h2>{variant.name}</h2>
                <dl className="catalog-dl">
                  <dt>{t('common.sku')}</dt>
                  <dd>{variant.sku}</dd>
                  <dt>{t('catalog.costSellingPrice')}</dt>
                  <dd>
                    {variant.cost_price} / {variant.selling_price}{' '}
                    {variant.currency}
                  </dd>
                  <dt>{t('auth.status')}</dt>
                  <dd>
                    <Tag tone={statusTone(variant.status)}>
                      {labelCode(variant.status)}
                    </Tag>
                  </dd>
                  {Object.entries(variant.attributes).map(([key, value]) => (
                    <div className="catalog-dl-row" key={key}>
                      <dt>{key}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
export function ProductEditorPage({ edit = false }: { edit?: boolean }) {
  const { id = '' } = useParams();
  const query = useCatalogQuery<Product>(`/products/${id}`, edit);
  const categories = useTaxonomyOptions('categories');
  const units = useTaxonomyOptions('units');
  if ((edit && query.isPending) || categories.isPending || units.isPending)
    return <CatalogLoading pending />;
  const error = (edit ? query.error : null) ?? categories.error ?? units.error;
  if (error) return <CatalogError error={error} />;
  return (
    <ProductEditor
      key={edit ? id : 'new'}
      initial={edit ? query.data : undefined}
      categories={categories.data ?? []}
      units={units.data ?? []}
    />
  );
}
function ProductEditor({
  initial,
  categories,
  units,
}: {
  initial?: Product;
  categories: Parameters<typeof ProductFields>[0]['categories'];
  units: Parameters<typeof VariantFields>[0]['units'];
}) {
  const { t } = useLanguage();

  const catalog = useCatalog();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [value, setValue] = useState<ProductInput>(
    initial ? productInput(initial) : { ...blankProduct },
  );
  const [variants, setVariants] = useState<VariantInput[]>([
    { ...blankVariant },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!initial) {
      const invalid = variants.map(validateVariantInput).find(Boolean);
      if (invalid) {
        setError(invalid);
        return;
      }
    }
    setBusy(true);
    setError('');
    setSaved(false);
    try {
      const product = await catalog.request<Product>(
        `/products${initial ? `/${initial.id}` : ''}`,
        initial ? 'PATCH' : 'POST',
        initial ? value : { ...value, variants },
      );
      await catalog.refresh();
      if (initial) {
        setValue(productInput(product));
        setSaved(true);
      } else
        navigate(
          `/menu/${product.id}${params.get('barcode') ? `?barcode=${encodeURIComponent(params.get('barcode')!)}` : ''}`,
        );
    } catch (problem) {
      setError(
        problem instanceof Error ? problem.message : t('catalog.unableToSave'),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="catalog-page">
      <CatalogHeader
        title={initial ? t('catalog.editProduct') : t('catalog.addProduct')}
      >
        <Link className="button button-secondary" to="/settings/storefront">
          <Eye size={15} aria-hidden="true" />
          <span>{t('storefront.publishedProducts')}</span>
        </Link>
        <Link
          className="button button-secondary"
          to={initial ? `/menu/${initial.id}` : '/menu'}
        >
          <ArrowLeft size={16} aria-hidden="true" />
          {t('catalog.backReturnToList')}
        </Link>
      </CatalogHeader>
      <CatalogNav />
      <StandardContextBar />
      <Card>
        <form onSubmit={(event) => void submit(event)}>
          <h2>{t('catalog.productInformation')}</h2>
          <ProductFields
            value={value}
            change={setValue}
            categories={categories}
            archive={!!initial && catalog.tenant.can('catalog.archive')}
          />
          {!initial && (
            <div className="catalog-variants-section">
              <h2>{t('catalog.variantsSaleItems')}</h2>
              {variants.map((variant, index) => (
                <fieldset className="catalog-variant-fieldset" key={index}>
                  <legend>
                    {t('catalog.variant')} {index + 1}
                  </legend>
                  <VariantFields
                    value={variant}
                    change={(next) =>
                      setVariants((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? next : item,
                        ),
                      )
                    }
                    units={units}
                  />
                  {variants.length > 1 && (
                    <Button
                      className="button-secondary"
                      onClick={() =>
                        setVariants((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      {t('catalog.removeVariant', { number: index + 1 })}
                    </Button>
                  )}
                </fieldset>
              ))}
              <Button
                className="button-secondary"
                disabled={variants.length >= 100}
                onClick={() =>
                  setVariants((current) => [...current, { ...blankVariant }])
                }
              >
                {t('catalog.addAnotherVariant')}
              </Button>
            </div>
          )}
          <p className="notice">
            {t('catalog.skusArePermanentAndCannotBeReused')}
          </p>
          <CatalogError error={error} />
          {saved && <p role="status">{t('catalog.productSaved')}</p>}
          <Button type="submit" disabled={busy || !units.length}>
            {busy ? t('catalog.saving') : t('catalog.saveProduct')}
          </Button>
          {!units.length && (
            <p role="alert">
              {t('catalog.create')}{' '}
              <Link to="/menu/units">{t('catalog.units')}</Link>{' '}
              {t('catalog.beforeAddingProducts')}
            </p>
          )}
        </form>
      </Card>
      {initial && initial.status !== 'ARCHIVED' && (
        <>
          {initial.variants.map((variant) => (
            <VariantEditor
              key={variant.id}
              variant={variant}
              units={units}
              productID={initial.id}
            />
          ))}
          {catalog.tenant.can('catalog.create') && (
            <VariantEditor units={units} productID={initial.id} />
          )}
        </>
      )}
    </div>
  );
}
