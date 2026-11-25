import type { TranslationKey } from '../../i18n';

/**
 * Display-only sample recommendations shown until the storefront API provides
 * ratings, reviews, distance and area data. Every card that uses these values is
 * labelled as a sample in the UI. Delete this file when real data is available.
 */
export interface SampleShop {
  id: string;
  name: TranslationKey;
  category: TranslationKey;
  area: TranslationKey;
  image: string;
  rating: string;
  reviews: number;
  distanceMeters: number;
  badge: 'open' | 'freeDelivery';
  openedRank: number;
}

export const sampleShops: SampleShop[] = [
  {
    id: 'krapao',
    name: 'landing.sampleKrapao',
    category: 'landing.categoryMadeToOrder',
    area: 'landing.areaMarket',
    image: '/images/home/shop-krapao.svg',
    rating: '4.8',
    reviews: 326,
    distanceMeters: 300,
    badge: 'open',
    openedRank: 3,
  },
  {
    id: 'noodles',
    name: 'landing.sampleNoodles',
    category: 'landing.categoryNoodles',
    area: 'landing.areaCampus',
    image: '/images/home/shop-noodles.svg',
    rating: '4.6',
    reviews: 189,
    distanceMeters: 450,
    badge: 'open',
    openedRank: 2,
  },
  {
    id: 'tea',
    name: 'landing.sampleTea',
    category: 'landing.categoryDrinks',
    area: 'landing.areaDorm',
    image: '/images/home/shop-tea.svg',
    rating: '4.7',
    reviews: 512,
    distanceMeters: 600,
    badge: 'open',
    openedRank: 4,
  },
  {
    id: 'grill',
    name: 'landing.sampleGrill',
    category: 'landing.categoryIsan',
    area: 'landing.areaCommunity',
    image: '/images/home/shop-grill.svg',
    rating: '4.5',
    reviews: 278,
    distanceMeters: 1200,
    badge: 'freeDelivery',
    openedRank: 1,
  },
];

export type SampleSort = 'forYou' | 'topRated' | 'newShops';

export function sortSampleShops(shops: SampleShop[], sort: SampleSort) {
  if (sort === 'topRated')
    return [...shops].sort(
      (a, b) => Number(b.rating) - Number(a.rating) || b.reviews - a.reviews,
    );
  if (sort === 'newShops')
    return [...shops].sort((a, b) => a.openedRank - b.openedRank);
  return shops;
}

export function formatDistance(meters: number, language: 'th' | 'en') {
  if (meters < 1000) return `≈ ${meters} ${language === 'th' ? 'ม.' : 'm'}`;
  const km = (meters / 1000).toFixed(1);
  return `≈ ${km} ${language === 'th' ? 'กม.' : 'km'}`;
}
