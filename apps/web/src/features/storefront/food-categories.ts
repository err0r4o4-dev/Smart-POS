import type { TranslationKey } from '../../i18n';

export const foodCategories = [
  { code: 'made-to-order', label: 'landing.categoryMadeToOrder' },
  { code: 'noodles', label: 'landing.categoryNoodles' },
  { code: 'isan', label: 'landing.categoryIsan' },
  { code: 'fried', label: 'landing.categoryFried' },
  { code: 'drinks', label: 'landing.categoryDrinks' },
  { code: 'desserts', label: 'landing.categoryDesserts' },
  { code: 'healthy', label: 'landing.categoryHealthy' },
  { code: 'snacks', label: 'landing.categorySnacks' },
] as const satisfies ReadonlyArray<{ code: string; label: TranslationKey }>;

export function foodCategory(code: string | null | undefined) {
  return foodCategories.find((category) => category.code === code);
}
