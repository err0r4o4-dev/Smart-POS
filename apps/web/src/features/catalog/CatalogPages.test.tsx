import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import { ApiError } from '../../lib/api';
import {
  blankVariant,
  validateVariantInput,
  type Taxonomy,
} from '../../lib/catalog-api';
import { BarcodeScanner } from './BarcodeScanner';
import { VariantEditor } from './ProductForm';
import { ImportPage } from './ImportPage';
import { TaxonomyPage } from './TaxonomyPage';
import { ProductEditorPage, ProductsPage } from './ProductPages';

const mocks = vi.hoisted(() => ({
  request: vi.fn(),
  refresh: vi.fn(),
  upload: vi.fn(),
  can: vi.fn(),
  query: vi.fn(),
}));
vi.mock('./catalog-hooks', () => ({
  useCatalog: () => ({
    orgID: 'organization-a',
    csrf: 'csrf',
    controller: { current: { signal: new AbortController().signal } },
    tenant: { can: mocks.can },
    request: mocks.request,
    refresh: mocks.refresh,
  }),
  useCatalogQuery: mocks.query,
  useTaxonomyOptions: () => ({
    data: [{ id: 'unit-a', name: 'Can', status: 'ACTIVE' }],
    isPending: false,
  }),
}));
vi.mock('../../lib/catalog-api', async (original) => ({
  ...(await original<typeof import('../../lib/catalog-api')>()),
  uploadCatalog: mocks.upload,
}));
const unit = { id: 'unit-a', name: 'Can', status: 'ACTIVE' } as Taxonomy;
function mount(element: React.ReactNode) {
  return render(<MemoryRouter>{element}</MemoryRouter>);
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.can.mockReturnValue(true);
  mocks.refresh.mockResolvedValue(undefined);
  mocks.query.mockReturnValue({
    data: { items: [], total: 0 },
    isPending: false,
  });
});
it.each(['-1', '0.001', '1e2', 'NaN', '01', '10000000000000000'])(
  'rejects non-exact cost price %s',
  (cost_price) => {
    expect(
      validateVariantInput({
        ...blankVariant,
        sku: 'CAN',
        unit_id: unit.id,
        selling_price: '18.00',
        cost_price,
      }),
    ).not.toBe('');
  },
);
it('allows exact maximum prices, normalized SKU and bounded attributes', () => {
  expect(
    validateVariantInput({
      ...blankVariant,
      sku: ' coke-325 ',
      unit_id: unit.id,
      cost_price: '0.00',
      selling_price: '9999999999999999.99',
      attributes: { size: '325ml' },
    }),
  ).toBe('');
});
it('blocks zero selling price and incomplete attributes before a variant request', async () => {
  mount(<VariantEditor productID="product-a" units={[unit]} />);
  fireEvent.change(screen.getByLabelText('SKU'), { target: { value: 'CAN' } });
  fireEvent.change(screen.getByLabelText('หน่วยนับ Variant'), {
    target: { value: unit.id },
  });
  fireEvent.change(screen.getByLabelText('ราคาขาย'), {
    target: { value: '0.00' },
  });
  fireEvent.submit(
    screen.getByRole('button', { name: 'บันทึก Variant' }).closest('form')!,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('ราคาขายต้องมากกว่า 0');
  expect(mocks.request).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('ราคาขาย'), {
    target: { value: '18.00' },
  });
  fireEvent.change(screen.getByLabelText('คุณลักษณะ Variant'), {
    target: { value: 'size=' },
  });
  fireEvent.submit(
    screen.getByRole('button', { name: 'บันทึก Variant' }).closest('form')!,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('key=value');
  expect(mocks.request).not.toHaveBeenCalled();
});

it('displays selected file details and allows clearing the file', () => {
  mount(<ImportPage />);
  const input = screen.getByLabelText('ไฟล์สินค้า');
  fireEvent.change(input, {
    target: {
      files: [
        new File(['sku\nCAN'], 'products.xlsx', {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        }),
      ],
    },
  });
  expect(screen.getByText('products.xlsx')).toBeVisible();
  expect(screen.getByText(/พร้อมตรวจสอบ/)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: 'ยกเลิกไฟล์' }));
  expect(screen.queryByText('products.xlsx')).toBeNull();
});
it('creates a saleable variant with string prices and refreshes only after success', async () => {
  mocks.request.mockResolvedValue({});
  mount(<VariantEditor productID="product-a" units={[unit]} />);
  fireEvent.change(screen.getByLabelText('SKU'), { target: { value: 'CAN' } });
  fireEvent.change(screen.getByLabelText('หน่วยนับ Variant'), {
    target: { value: unit.id },
  });
  fireEvent.change(screen.getByLabelText('ราคาขาย'), {
    target: { value: '18.00' },
  });
  fireEvent.submit(
    screen.getByRole('button', { name: 'บันทึก Variant' }).closest('form')!,
  );
  expect(await screen.findByRole('status')).toHaveTextContent(
    'บันทึก Variant แล้ว',
  );
  expect(mocks.request).toHaveBeenCalledWith(
    '/products/product-a/variants',
    'POST',
    expect.objectContaining({
      selling_price: '18.00',
      cost_price: '0.00',
      unit_id: unit.id,
    }),
  );
  expect(mocks.refresh).toHaveBeenCalledOnce();
});
it('renders the variants section and notice with proper spacing containers on create-product', () => {
  const { container } = mount(<ProductEditorPage />);
  expect(
    container.querySelector('.catalog-variants-section'),
  ).toBeInTheDocument();
  expect(container.querySelector('.notice')).toBeInTheDocument();
});
it('validates the default variant on the create-product page', () => {
  mount(<ProductEditorPage />);
  fireEvent.submit(
    screen.getByRole('button', { name: 'บันทึกสินค้า' }).closest('form')!,
  );
  expect(screen.getByRole('alert')).toHaveTextContent('SKU');
  expect(mocks.request).not.toHaveBeenCalled();
});
it('shows an empty list and hides mutation actions for read-only roles', () => {
  mocks.can.mockReturnValue(false);
  mount(<ProductsPage />);
  expect(screen.getByText(/ไม่พบสินค้า เริ่มด้วย/)).toBeVisible();
  expect(screen.queryByRole('link', { name: 'เพิ่มสินค้า' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'นำเข้าสินค้า' })).toBeNull();
});
it('hides taxonomy management for a role without its specific permission', () => {
  mocks.can.mockReturnValue(false);
  mount(<TaxonomyPage kind="categories" />);
  expect(screen.queryByRole('button', { name: 'บันทึกหมวดหมู่' })).toBeNull();
});
it('shows unknown barcode actions without fabricating a product', async () => {
  mocks.request.mockRejectedValue(new ApiError(404, 'Not found'));
  mount(<BarcodeScanner />);
  fireEvent.change(screen.getByLabelText('บาร์โค้ด'), {
    target: { value: '00123' },
  });
  fireEvent.submit(
    screen.getByRole('button', { name: 'ค้นหาบาร์โค้ด' }).closest('form')!,
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'ไม่พบบาร์โค้ดในองค์กรนี้',
  );
  expect(screen.getByRole('link', { name: 'สร้างสินค้าใหม่' })).toHaveAttribute(
    'href',
    '/products/new?barcode=00123',
  );
  expect(screen.getByLabelText('บาร์โค้ด')).toHaveFocus();
});
it('deduplicates in-flight Enter scans and uses a read-only lookup', async () => {
  let finish!: (value: unknown) => void;
  mocks.request.mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  mount(<BarcodeScanner />);
  fireEvent.change(screen.getByLabelText('บาร์โค้ด'), {
    target: { value: '036000291452' },
  });
  const form = screen
    .getByRole('button', { name: 'ค้นหาบาร์โค้ด' })
    .closest('form')!;
  fireEvent.submit(form);
  fireEvent.submit(form);
  expect(mocks.request).toHaveBeenCalledOnce();
  expect(mocks.request).toHaveBeenCalledWith(
    '/barcodes/lookup?code=036000291452',
  );
  finish({
    product: {
      id: 'product-a',
      name: 'Coke',
      variants: [{ id: 'variant-a', sku: 'CAN' }],
    },
    variant_id: 'variant-a',
    saleable: true,
  });
  await screen.findByRole('status');
});
it('blocks confirmation of an invalid import and shows row-level errors', async () => {
  mocks.upload.mockResolvedValue({
    id: 'job-a',
    status: 'PREVIEW',
    headers: ['sku'],
    total: 1,
    valid: 0,
    invalid: 1,
    duplicates: 0,
    new_products: 1,
    rows: [
      {
        line: 2,
        product_name: 'Coke',
        sku: 'CAN',
        barcode: '',
        existing_id: '',
        errors: ['Unknown unit'],
      },
    ],
    result: null,
  });
  mount(<ImportPage />);
  fireEvent.change(screen.getByLabelText('ไฟล์สินค้า'), {
    target: {
      files: [new File(['sku\nCAN'], 'catalog.csv', { type: 'text/csv' })],
    },
  });
  fireEvent.click(screen.getByRole('button', { name: 'ตรวจและแสดง Preview' }));
  expect(await screen.findByText('Unknown unit')).toBeVisible();
  expect(screen.getByRole('button', { name: 'ยืนยันนำเข้า' })).toBeDisabled();
  await waitFor(() =>
    expect(mocks.upload).toHaveBeenCalledWith(
      'organization-a',
      expect.any(File),
      {},
      'csrf',
      expect.any(AbortSignal),
    ),
  );
  expect(mocks.request).not.toHaveBeenCalled();
});
