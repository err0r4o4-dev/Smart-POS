import { ApiError } from './api';
export type CatalogStatus = 'ACTIVE' | 'INACTIVE' | 'ARCHIVED';
export interface ProductInput {
  name: string;
  description: string;
  category_id: string | null;
  brand_id: string | null;
  status: CatalogStatus;
  revision: number;
}
export const blankProduct: ProductInput = {
  name: '',
  description: '',
  category_id: null,
  brand_id: null,
  status: 'ACTIVE',
  revision: 0,
};
export interface Barcode {
  id: string;
  variant_id: string;
  code: string;
  symbology: string;
  source: string;
  is_primary: boolean;
}
export interface VariantInput {
  sku: string;
  name: string;
  attributes: Record<string, string>;
  unit_id: string;
  cost_price: string;
  selling_price: string;
  status: CatalogStatus;
  revision: number;
}
export const blankVariant: VariantInput = {
  sku: '',
  name: 'Default',
  attributes: {},
  unit_id: '',
  cost_price: '0.00',
  selling_price: '',
  status: 'ACTIVE',
  revision: 0,
};
export function validateVariantInput(value: VariantInput): string {
  const money = /^(0|[1-9][0-9]{0,15})(\.[0-9]{1,2})?$/;
  if (
    !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}$/.test(value.sku.trim()) ||
    !value.name.trim() ||
    !value.unit_id
  )
    return 'ระบุ SKU, ชื่อ Variant และหน่วยนับให้ถูกต้อง';
  if (
    !money.test(value.cost_price) ||
    !money.test(value.selling_price) ||
    /^0(?:\.0{1,2})?$/.test(value.selling_price)
  )
    return 'ราคาเป็นทศนิยมไม่เกิน 2 ตำแหน่ง ราคาทุนไม่ติดลบ และราคาขายต้องมากกว่า 0';
  if (
    Object.keys(value.attributes).length > 12 ||
    Object.entries(value.attributes).some(
      ([key, item]) =>
        !key.trim() || key.length > 40 || !item.trim() || item.length > 200,
    )
  )
    return 'คุณลักษณะต้องเป็น key=value ที่ไม่ว่าง สูงสุด 12 รายการ';
  return '';
}
export interface Variant extends VariantInput {
  id: string;
  organization_id: string;
  product_id: string;
  currency: string;
  barcodes: Barcode[];
}
export interface Product extends ProductInput {
  id: string;
  organization_id: string;
  category_name: string;
  brand_name: string;
  variants: Variant[];
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
}
export interface TaxonomyInput {
  name: string;
  description: string;
  status: CatalogStatus;
  revision: number;
  parent_id?: string | null;
  code?: string;
  unit_type?: string;
  base_unit_id?: string | null;
  conversion_factor?: string;
}
export interface Taxonomy extends TaxonomyInput {
  id: string;
  organization_id: string;
}
export interface CatalogPage<Item> {
  items: Item[];
  total: number;
  page: number;
  page_size: number;
}
export interface BarcodeLookup {
  product: Product;
  variant_id: string;
  saleable: boolean;
}
export interface ImportRow {
  line: number;
  product_name: string;
  sku: string;
  barcode: string;
  unit: string;
  errors: string[];
  existing_id: string;
}
export interface ImportResult {
  total: number;
  imported: number;
  updated: number;
  skipped: number;
  failed: number;
}
export interface ImportJob {
  id: string;
  status: string;
  headers: string[];
  rows: ImportRow[];
  total: number;
  valid: number;
  invalid: number;
  duplicates: number;
  new_products: number;
  existing_products: number;
  result: ImportResult | null;
}
export async function uploadCatalog(
  orgID: string,
  file: File,
  mapping: Record<string, string>,
  csrf: string,
  signal?: AbortSignal,
): Promise<ImportJob> {
  const body = new FormData();
  body.append('file', file);
  body.append('mapping', JSON.stringify(mapping));
  const response = await fetch(
    `/api/v1/organizations/${orgID}/products/import/preview`,
    {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'X-CSRF-Token': csrf, Accept: 'application/json' },
      body,
      signal,
    },
  );
  const result = (await response.json()) as {
    data?: ImportJob;
    error?: { message?: string };
  };
  if (!response.ok || !result.data)
    throw new ApiError(
      response.status,
      result.error?.message ?? 'Import unavailable',
    );
  return result.data;
}
export function productInput(product: Product): ProductInput {
  return {
    name: product.name,
    description: product.description,
    category_id: product.category_id,
    brand_id: product.brand_id,
    status: product.status,
    revision: product.revision,
  };
}
export function variantInput(variant: Variant): VariantInput {
  return {
    sku: variant.sku,
    name: variant.name,
    attributes: variant.attributes,
    unit_id: variant.unit_id,
    cost_price: variant.cost_price,
    selling_price: variant.selling_price,
    status: variant.status,
    revision: variant.revision,
  };
}
