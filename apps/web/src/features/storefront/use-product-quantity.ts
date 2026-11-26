import { useState } from 'react';
import {
  exactDecimal,
  isKnownStockPolicy,
  MAX_LINE_QUANTITY,
} from '../../lib/pos-api';
import type { ShopProduct } from '../../lib/storefront-api';

/** Exact milli-unit quantity as the shortest decimal text, e.g. 2500n -> "2.5". */
export function quantityText(value: bigint) {
  const remainder = (value % 1000n)
    .toString()
    .padStart(3, '0')
    .replace(/0+$/, '');
  return `${value / 1000n}${remainder ? `.${remainder}` : ''}`;
}

/**
 * Quantity selection rules shared by the product card and the menu dialog:
 * whole units for COUNT/PACKAGING, the remaining stock after what is already in
 * the cart, and the maximum line quantity.
 */
export function useProductQuantity(product: ShopProduct, cartQuantity: string) {
  const stock = exactDecimal(product.available ?? '', 3) ?? 0n;
  const menuOnly = product.stock_policy === 'MENU_ONLY';
  const cartUnits = exactDecimal(cartQuantity, 3) ?? 0n;
  const remaining =
    (menuOnly
      ? MAX_LINE_QUANTITY
      : stock < MAX_LINE_QUANTITY
        ? stock
        : MAX_LINE_QUANTITY) - cartUnits;
  const whole = ['COUNT', 'PACKAGING'].includes(product.unit_type);
  const step = whole ? 1000n : 1n;
  const [quantity, setQuantity] = useState(() =>
    !whole && remaining > 0n && remaining < 1000n
      ? quantityText(remaining)
      : '1',
  );
  const units = exactDecimal(quantity, 3);
  const valid =
    units !== null &&
    units > 0n &&
    units <= remaining &&
    (!whole || units % 1000n === 0n);
  const ready =
    product.saleable &&
    isKnownStockPolicy(product.stock_policy) &&
    (menuOnly || stock >= step);
  return {
    quantity,
    setQuantity,
    units,
    step,
    whole,
    remaining,
    valid,
    ready,
    menuOnly,
    stock,
    cartUnits,
  };
}
