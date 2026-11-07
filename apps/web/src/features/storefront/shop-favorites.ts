import { useMemo, useSyncExternalStore } from 'react';

const memory = new Map<string, string>();
const favoritesEvent = 'smartpos-shop-favorites';

function snapshot(slug: string | undefined): string {
  if (!slug) return '[]';
  if (memory.has(slug)) return memory.get(slug)!;
  try {
    return localStorage.getItem(`shop-favorites:${slug}`) ?? '[]';
  } catch {
    return memory.get(slug) ?? '[]';
  }
}

function readFavorites(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === 'string');
  } catch {
    return [];
  }
}

export function useShopFavorites(slug?: string) {
  const value = useSyncExternalStore(
    (notify) => {
      const changed = (event: Event) => {
        if (
          event instanceof StorageEvent &&
          event.key !== null &&
          event.key !== `shop-favorites:${slug}`
        )
          return;
        if (event instanceof CustomEvent && event.detail !== slug) return;
        if (event instanceof StorageEvent && slug) memory.delete(slug);
        notify();
      };
      window.addEventListener('storage', changed);
      window.addEventListener(favoritesEvent, changed);
      return () => {
        window.removeEventListener('storage', changed);
        window.removeEventListener(favoritesEvent, changed);
      };
    },
    () => snapshot(slug),
    () => '[]',
  );

  const favorites = useMemo(() => new Set(readFavorites(value)), [value]);

  const toggle = (variantId: string): boolean => {
    if (!slug) return false;
    const current = readFavorites(snapshot(slug));
    const exists = current.includes(variantId);
    const next = exists
      ? current.filter((id) => id !== variantId)
      : [...current, variantId];
    const serialized = JSON.stringify(next);
    try {
      localStorage.setItem(`shop-favorites:${slug}`, serialized);
      memory.delete(slug);
    } catch {
      memory.set(slug, serialized);
    }
    window.dispatchEvent(new CustomEvent(favoritesEvent, { detail: slug }));
    return !exists;
  };

  return {
    favorites,
    isFavorite: (variantId: string) => favorites.has(variantId),
    toggle,
  };
}
