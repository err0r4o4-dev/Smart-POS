import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useShopCart } from './shop-cart';

const product = {
  variant_id: '11111111-1111-4111-8111-111111111111',
  product_name: 'สินค้าทดสอบ',
  variant_name: 'Default',
  sku: 'TEST',
  unit: 'ชิ้น',
  unit_type: 'COUNT',
  unit_price: '19.99',
  available: '10.000',
  saleable: true,
  published: true,
};
beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

it('synchronizes header and catalog snapshots and does not lose rapid additions', () => {
  const first = renderHook(() => useShopCart('shared-cart'));
  const second = renderHook(() => useShopCart('shared-cart'));
  act(() => {
    first.result.current.add(product, '2.000');
    first.result.current.add(product, '3.000');
  });
  expect(first.result.current.items[0].quantity).toBe('5.000');
  expect(second.result.current.items[0].quantity).toBe('5.000');
  act(() => second.result.current.update([]));
  expect(first.result.current.items).toEqual([]);
});

it('accepts exact fractional weight but rejects fractional count and excess stock', () => {
  const cart = renderHook(() => useShopCart('decimal-cart'));
  act(() => {
    expect(cart.result.current.add(product, '0.125')).toBe(false);
    expect(cart.result.current.add(product, '11.000')).toBe(false);
  });
  act(() => {
    expect(
      cart.result.current.add({ ...product, unit_type: 'WEIGHT' }, '0.125'),
    ).toBe(true);
  });
  expect(cart.result.current.items[0].quantity).toBe('0.125');
});

it('updates from matching storage events without sharing another store cart', () => {
  const first = renderHook(() => useShopCart('first-store'));
  const second = renderHook(() => useShopCart('second-store'));
  act(() => {
    localStorage.setItem(
      'shop-cart:first-store',
      JSON.stringify([{ ...product, quantity: '2.000' }]),
    );
    window.dispatchEvent(
      new StorageEvent('storage', { key: 'shop-cart:first-store' }),
    );
  });
  expect(first.result.current.items[0].quantity).toBe('2.000');
  expect(second.result.current.items).toEqual([]);
});

it('keeps a shared in-memory cart when browser storage is unavailable', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('storage unavailable');
  });
  const first = renderHook(() => useShopCart('storage-unavailable'));
  const second = renderHook(() => useShopCart('storage-unavailable'));
  act(() => first.result.current.add(product, '2.000'));
  expect(first.result.current.items[0].quantity).toBe('2.000');
  expect(second.result.current.items[0].quantity).toBe('2.000');
});
