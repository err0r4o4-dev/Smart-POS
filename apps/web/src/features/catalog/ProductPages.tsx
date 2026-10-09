import { useState, type FormEvent } from 'react';
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom';
import { Package } from 'lucide-react';
import { Button, Card, Tag } from '../../components/ui/primitives';
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
import { BarcodeScanner } from './BarcodeScanner';
import { BarcodeManager } from './BarcodeManager';

export function ProductsPage() {
  const catalog = useCatalog();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') ?? '');
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [brand, setBrand] = useState<string | null>(null);
  const [sort, setSort] = useState('name');
  const queryParams = new URLSearchParams({
    search: params.get('search') ?? '',
    page: String(page),
    page_size: '20',
    status,
    sort,
    ...(category ? { category_id: category } : {}),
    ...(brand ? { brand_id: brand } : {}),
  });
  const query = useCatalogQuery<CatalogPage<Product>>(
    `/products?${queryParams}`,
  );
  const categories = useTaxonomyOptions('categories');
  const brands = useTaxonomyOptions('brands');
  return (
    <div className="catalog-page">
      <CatalogHeader title="สินค้า">
        <>
          {catalog.tenant.can('catalog.create') && (
            <Link className="button" to="/products/new">
              เพิ่มสินค้า
            </Link>
          )}
          {catalog.tenant.can('catalog.import') && (
            <Link className="button button-secondary" to="/products/import">
              นำเข้าสินค้า
            </Link>
          )}
          {catalog.tenant.can('catalog.labels.print') && (
            <Link className="button button-secondary" to="/products/labels">
              พิมพ์ฉลาก
            </Link>
          )}
        </>
      </CatalogHeader>
      <CatalogNav />
      <BarcodeScanner />
      <Card>
        <form
          className="catalog-filters"
          onSubmit={(event) => {
            event.preventDefault();
            setParams(search ? { search } : {});
            setPage(1);
          }}
        >
          <label className="tenant-field">
            ค้นหาชื่อ / SKU / บาร์โค้ด
            <input
              maxLength={200}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className="tenant-field">
            กรองสถานะ
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="">ACTIVE / INACTIVE</option>
              {['ACTIVE', 'INACTIVE', 'ARCHIVED'].map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <TaxonomySelect
            label="กรองหมวดหมู่"
            value={category}
            items={categories.data ?? []}
            change={(value) => {
              setCategory(value);
              setPage(1);
            }}
          />
          <TaxonomySelect
            label="กรองแบรนด์"
            value={brand}
            items={brands.data ?? []}
            change={(value) => {
              setBrand(value);
              setPage(1);
            }}
          />
          <label className="tenant-field">
            เรียงตาม
            <select
              value={sort}
              onChange={(event) => {
                setSort(event.target.value);
                setPage(1);
              }}
            >
              <option value="name">ชื่อ A–Z</option>
              <option value="-name">ชื่อ Z–A</option>
              <option value="-updated">แก้ไขล่าสุด</option>
              <option value="updated">แก้ไขเก่าสุด</option>
            </select>
          </label>
          <Button type="submit">ค้นหาสินค้า</Button>
        </form>
        <CatalogLoading pending={query.isPending} />
        <CatalogError error={query.error ?? categories.error ?? brands.error} />
        {query.data && (
          <>
            <div className="catalog-table-wrap">
              <table className="catalog-table">
                <thead>
                  <tr>
                    <th>สินค้า</th>
                    <th>SKU / บาร์โค้ด</th>
                    <th>หมวดหมู่ / แบรนด์</th>
                    <th>ราคาขาย</th>
                    <th>สถานะ</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.items.map((product) => (
                    <tr key={product.id}>
                      <td>
                        <div className="catalog-product-cell">
                          <span
                            className="catalog-image"
                            aria-label="ยังไม่มีรูปสินค้า"
                          >
                            <Package aria-hidden="true" />
                          </span>
                          <Link to={`/products/${product.id}`}>
                            {product.name}
                          </Link>
                        </div>
                      </td>
                      <td>
                        {product.variants.map((variant) => (
                          <div key={variant.id}>
                            <code>{variant.sku}</code>
                            <small>
                              {variant.barcodes.find((item) => item.is_primary)
                                ?.code ?? 'ยังไม่มีบาร์โค้ด'}
                            </small>
                          </div>
                        ))}
                      </td>
                      <td>
                        {product.category_name || '—'}
                        <small>{product.brand_name || '—'}</small>
                      </td>
                      <td>
                        {product.variants.map((variant) => (
                          <div key={variant.id}>
                            {variant.selling_price} {variant.currency}
                          </div>
                        ))}
                      </td>
                      <td>
                        <Tag
                          tone={
                            product.status === 'ACTIVE' ? 'success' : 'neutral'
                          }
                        >
                          {product.status}
                        </Tag>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!query.data.items.length && (
              <p className="empty-state">
                ไม่พบสินค้า เริ่มด้วยการสร้างหน่วยนับและเพิ่มสินค้า
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
  const { id = '' } = useParams();
  const catalog = useCatalog();
  const query = useCatalogQuery<Product>(`/products/${id}`);
  return (
    <div className="catalog-page">
      <CatalogHeader title="รายละเอียดสินค้า">
        {catalog.tenant.can('catalog.update') && (
          <Link className="button" to={`/products/${id}/edit`}>
            แก้ไขสินค้า
          </Link>
        )}
        <Link to="/products">กลับรายการสินค้า</Link>
      </CatalogHeader>
      <CatalogNav />
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
                <Tag
                  tone={query.data.status === 'ACTIVE' ? 'success' : 'neutral'}
                >
                  {query.data.status}
                </Tag>
                <p>{query.data.description || 'ไม่มีคำอธิบาย'}</p>
                <p>
                  หมวดหมู่: {query.data.category_name || '—'} • แบรนด์:{' '}
                  {query.data.brand_name || '—'}
                </p>
              </div>
            </div>
            <p className="notice">
              รูปสินค้า: storage ยังไม่ถูกตั้งค่า • ดูยอดสต็อกจริงตามสาขาได้ที่{' '}
              <Link to="/inventory/balances">Inventory balances</Link> • POS
              ยังไม่เริ่ม
            </p>
          </Card>
          {query.data.variants.map((variant) => (
            <div key={variant.id}>
              <Card>
                <h2>{variant.name}</h2>
                <dl className="catalog-dl">
                  <dt>SKU</dt>
                  <dd>{variant.sku}</dd>
                  <dt>ราคาทุน / ราคาขาย</dt>
                  <dd>
                    {variant.cost_price} / {variant.selling_price}{' '}
                    {variant.currency}
                  </dd>
                  <dt>สถานะ</dt>
                  <dd>{variant.status}</dd>
                  {Object.entries(variant.attributes).map(([key, value]) => (
                    <div className="catalog-dl-row" key={key}>
                      <dt>{key}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
              <BarcodeManager product={query.data!} variant={variant} />
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
  const brands = useTaxonomyOptions('brands');
  const units = useTaxonomyOptions('units');
  if (
    (edit && query.isPending) ||
    categories.isPending ||
    brands.isPending ||
    units.isPending
  )
    return <CatalogLoading pending />;
  const error =
    (edit ? query.error : null) ??
    categories.error ??
    brands.error ??
    units.error;
  if (error) return <CatalogError error={error} />;
  return (
    <ProductEditor
      key={edit ? id : 'new'}
      initial={edit ? query.data : undefined}
      categories={categories.data ?? []}
      brands={brands.data ?? []}
      units={units.data ?? []}
    />
  );
}
function ProductEditor({
  initial,
  categories,
  brands,
  units,
}: {
  initial?: Product;
  categories: Parameters<typeof ProductFields>[0]['categories'];
  brands: Parameters<typeof ProductFields>[0]['brands'];
  units: Parameters<typeof VariantFields>[0]['units'];
}) {
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
          `/products/${product.id}${params.get('barcode') ? `?barcode=${encodeURIComponent(params.get('barcode')!)}` : ''}`,
        );
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : 'บันทึกไม่ได้');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="catalog-page">
      <CatalogHeader title={initial ? 'แก้ไขสินค้า' : 'เพิ่มสินค้า'}>
        <Link to={initial ? `/products/${initial.id}` : '/products'}>
          ยกเลิก / กลับรายการ
        </Link>
      </CatalogHeader>
      <CatalogNav />
      <Card>
        <form onSubmit={(event) => void submit(event)}>
          <h2>ข้อมูลสินค้า</h2>
          <ProductFields
            value={value}
            change={setValue}
            categories={categories}
            brands={brands}
            archive={!!initial && catalog.tenant.can('catalog.archive')}
          />
          {!initial && (
            <>
              <h2>Variants · รายการขาย</h2>
              {variants.map((variant, index) => (
                <fieldset className="catalog-variant-fieldset" key={index}>
                  <legend>Variant {index + 1}</legend>
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
                      นำ Variant {index + 1} ออก
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
                เพิ่ม Variant อีกแบบ
              </Button>
            </>
          )}
          <p className="notice">
            SKU ถาวรและไม่ใช้ซ้ำหลัง archive • ราคาเป็นทศนิยมแบบ exact •
            บาร์โค้ดผูกหลังบันทึกสินค้า • รูปสินค้าใช้ placeholder
            จนกว่าจะตั้งค่า storage
          </p>
          <CatalogError error={error} />
          {saved && <p role="status">บันทึกสินค้าแล้ว</p>}
          <Button type="submit" disabled={busy || !units.length}>
            {busy ? 'กำลังบันทึก…' : 'บันทึกสินค้า'}
          </Button>
          {!units.length && (
            <p role="alert">
              ต้องสร้าง <Link to="/units">หน่วยนับ</Link> ก่อนเพิ่มสินค้า
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
