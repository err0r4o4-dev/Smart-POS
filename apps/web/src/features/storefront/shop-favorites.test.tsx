import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useShopFavorites } from './shop-favorites';

describe('useShopFavorites', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('starts with empty favorites and toggles item', () => {
    const { result } = renderHook(() => useShopFavorites('test-slug'));
    expect(result.current.isFavorite('var-1')).toBe(false);

    let added: boolean;
    act(() => {
      added = result.current.toggle('var-1');
    });
    expect(added!).toBe(true);
    expect(result.current.isFavorite('var-1')).toBe(true);

    act(() => {
      added = result.current.toggle('var-1');
    });
    expect(added!).toBe(false);
    expect(result.current.isFavorite('var-1')).toBe(false);
  });

  it('persists favorites in localStorage per store', () => {
    const { result: storeA } = renderHook(() => useShopFavorites('store-a'));
    const { result: storeB } = renderHook(() => useShopFavorites('store-b'));

    act(() => {
      storeA.current.toggle('var-1');
    });

    expect(storeA.current.isFavorite('var-1')).toBe(true);
    expect(storeB.current.isFavorite('var-1')).toBe(false);

    const stored = JSON.parse(
      localStorage.getItem('shop-favorites:store-a') || '[]',
    );
    expect(stored).toEqual(['var-1']);
  });
});
