import { useState } from 'react';
import type { ShopProduct } from '../../lib/storefront-api';
import { exactDecimal } from '../../lib/pos-api';

export type CartEntry = Pick<
  ShopProduct,
  | 'variant_id'
  | 'product_name'
  | 'variant_name'
  | 'sku'
  | 'unit'
  | 'unit_type'
  | 'unit_price'
> & { quantity: string };
function readCart(slug: string): CartEntry[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(`shop-cart:${slug}`) ?? '[]',
    );
    if (!Array.isArray(value) || value.length > 100) return [];
    return value.filter(
      (item): item is CartEntry =>
        typeof item === 'object' &&
        item !== null &&
        [
          'variant_id',
          'product_name',
          'variant_name',
          'sku',
          'unit',
          'unit_type',
          'unit_price',
          'quantity',
        ].every((key) => typeof item[key] === 'string') &&
        exactDecimal(item.quantity, 3) !== null &&
        exactDecimal(item.unit_price) !== null,
    );
  } catch {
    return [];
  }
}
export function useShopCart(slug: string) {
  const [items, setItems] = useState<CartEntry[]>(() => readCart(slug));
  const update = (next: CartEntry[]) => {
    setItems(next);
    try {
      localStorage.setItem(`shop-cart:${slug}`, JSON.stringify(next));
    } catch {
      return;
    }
  };
  return {
    items,
    update,
    add: (product: ShopProduct) => {
      const existing = items.find(
        (item) => item.variant_id === product.variant_id,
      );
      if (!existing && items.length >= 100) return;
      const next = existing
        ? items.map((item) => {
            if (item.variant_id !== product.variant_id) return item;
            const units = (exactDecimal(item.quantity, 3) ?? 0n) + 1000n;
            return {
              ...item,
              quantity: `${units / 1000n}.${(units % 1000n).toString().padStart(3, '0')}`,
            };
          })
        : [...items, { ...product, quantity: '1.000' }];
      update(next);
    },
  };
}
