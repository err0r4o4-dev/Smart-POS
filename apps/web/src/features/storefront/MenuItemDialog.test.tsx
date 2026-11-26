import { fireEvent, screen, within } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { ShopProduct } from '../../lib/storefront-api';
import { render } from '../../test/render';
import { MenuItemDialog } from './MenuItemDialog';

const product: ShopProduct = {
  variant_id: '11111111-1111-4111-8111-111111111111',
  product_name: 'ข้าวผัด',
  variant_name: 'จานปกติ',
  sku: 'RICE',
  unit: 'จาน',
  unit_type: 'COUNT',
  unit_price: '65.00',
  available: '3.000',
  stock_policy: 'TRACKED',
  saleable: true,
  published: true,
  category_name: 'อาหารจานเดียว',
  image_url: 'https://example.com/rice.jpg',
};

function open(props: Partial<Parameters<typeof MenuItemDialog>[0]> = {}) {
  const onAdd = vi.fn();
  const onClose = vi.fn();
  const view = render(
    <MenuItemDialog
      product={product}
      cartQuantity="0.000"
      disabled={false}
      onAdd={onAdd}
      onClose={onClose}
      {...props}
    />,
  );
  return { onAdd, onClose, ...view };
}

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute('open', '');
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  });
});

it('shows the product details in a named modal dialog', () => {
  open();
  const dialog = screen.getByRole('dialog', { name: 'ข้าวผัด' });
  expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled();
  const scope = within(dialog);
  expect(scope.getByRole('img', { name: 'ข้าวผัด' })).toHaveAttribute(
    'src',
    'https://example.com/rice.jpg',
  );
  expect(scope.getByText('฿65.00')).toBeVisible();
  expect(scope.getByText('จานปกติ')).toBeVisible();
  expect(scope.getByText('อาหารจานเดียว')).toBeVisible();
  expect(scope.getByRole('spinbutton', { name: 'จำนวน ข้าวผัด' })).toHaveValue(
    1,
  );
});

it('adds the chosen whole quantity and closes', () => {
  const { onAdd, onClose } = open();
  const dialog = within(screen.getByRole('dialog'));
  fireEvent.click(dialog.getByRole('button', { name: 'เพิ่มจำนวน ข้าวผัด' }));
  fireEvent.click(dialog.getByRole('button', { name: 'เพิ่มลงตะกร้า' }));
  expect(onAdd).toHaveBeenCalledWith('2');
  expect(onClose).toHaveBeenCalled();
});

it('closes from the close button without adding', () => {
  const { onAdd, onClose } = open();
  fireEvent.click(screen.getByRole('button', { name: 'ปิดรายละเอียดเมนู' }));
  expect(onClose).toHaveBeenCalled();
  expect(onAdd).not.toHaveBeenCalled();
});

it('reports a native close such as Escape to the owner', () => {
  const { onClose } = open();
  fireEvent(screen.getByRole('dialog'), new Event('close'));
  expect(onClose).toHaveBeenCalled();
});

it('blocks adding when the cart already holds all available stock', () => {
  open({
    product: { ...product, available: '1.000' },
    cartQuantity: '1.000',
  });
  const dialog = within(screen.getByRole('dialog'));
  expect(dialog.getByRole('button', { name: 'เพิ่มลงตะกร้า' })).toBeDisabled();
  expect(dialog.getByText('จำนวนพร้อมขายอยู่ในตะกร้าแล้ว')).toBeVisible();
});

it('shows a sold-out item as unavailable', () => {
  open({ product: { ...product, is_sold_out: true, available: '0.000' } });
  const dialog = within(screen.getByRole('dialog'));
  expect(dialog.getByText('หมดชั่วคราว')).toBeVisible();
  expect(dialog.getByRole('button', { name: 'เพิ่มลงตะกร้า' })).toBeDisabled();
});

it('uses a neutral placeholder instead of a stand-in food photo', () => {
  open({ product: { ...product, image_url: undefined } });
  const dialog = within(screen.getByRole('dialog'));
  expect(dialog.queryByRole('img')).toBeNull();
  expect(dialog.getByText('ยังไม่มีรูปสินค้า')).toBeVisible();
});

it('renders nothing and opens no modal without a product', () => {
  render(
    <MenuItemDialog
      product={null}
      cartQuantity="0.000"
      disabled={false}
      onAdd={vi.fn()}
      onClose={vi.fn()}
    />,
  );
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(HTMLDialogElement.prototype.showModal).not.toHaveBeenCalled();
});
