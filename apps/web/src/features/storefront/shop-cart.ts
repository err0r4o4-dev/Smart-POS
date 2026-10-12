import { useMemo, useSyncExternalStore } from 'react';
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
const memory = new Map<string, string>();
const cartEvent = 'smartpos-shop-cart';
function snapshot(slug: string | undefined) {
  if (!slug) return '[]';
  if (memory.has(slug)) return memory.get(slug)!;
  try {
    return localStorage.getItem(`shop-cart:${slug}`) ?? '[]';
  } catch {
    return memory.get(slug) ?? '[]';
  }
}
function readCart(value: string): CartEntry[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed) || parsed.length > 100) return [];
    return parsed.filter(
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
export function useShopCart(slug?: string) {
  const value = useSyncExternalStore(
    (notify) => {
      const changed = (event: Event) => {
        if (
          event instanceof StorageEvent &&
          event.key !== null &&
          event.key !== `shop-cart:${slug}`
        )
          return;
        if (event instanceof CustomEvent && event.detail !== slug) return;
        if (event instanceof StorageEvent && slug) memory.delete(slug);
        notify();
      };
      window.addEventListener('storage', changed);
      window.addEventListener(cartEvent, changed);
      return () => {
        window.removeEventListener('storage', changed);
        window.removeEventListener(cartEvent, changed);
      };
    },
    () => snapshot(slug),
    () => '[]',
  );
  const items = useMemo(() => readCart(value), [value]);
  const update = (next: CartEntry[]) => {
    if (!slug) return;
    const serialized = JSON.stringify(next);
    try {
      localStorage.setItem(`shop-cart:${slug}`, serialized);
      memory.delete(slug);
    } catch {
      memory.set(slug, serialized);
    }
    window.dispatchEvent(new CustomEvent(cartEvent, { detail: slug }));
  };
  return {
    items,
    update,
    add: (product: ShopProduct, quantity = '1.000') => {
      const current = readCart(snapshot(slug));
      const units = exactDecimal(quantity, 3);
      if (
        units === null ||
        units <= 0n ||
        (['COUNT', 'PACKAGING'].includes(product.unit_type) &&
          units % 1000n !== 0n)
      )
        return false;
      const existing = current.find(
        (item) => item.variant_id === product.variant_id,
      );
      if (!existing && current.length >= 100) return false;
      const total =
        units + (existing ? (exactDecimal(existing.quantity, 3) ?? 0n) : 0n);
      if (
        !product.saleable ||
        total > (exactDecimal(product.available, 3) ?? 0n)
      )
        return false;
      const next = existing
        ? current.map((item) => {
            if (item.variant_id !== product.variant_id) return item;
            return {
              ...item,
              quantity: `${total / 1000n}.${(total % 1000n).toString().padStart(3, '0')}`,
            };
          })
        : [
            ...current,
            {
              ...product,
              quantity: `${units / 1000n}.${(units % 1000n).toString().padStart(3, '0')}`,
            },
          ];
      update(next);
      return true;
    },
  };
}
