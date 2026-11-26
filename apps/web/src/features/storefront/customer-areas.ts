import type { TranslationKey } from '../../i18n';

export type CustomerArea = {
  id: 'campus' | 'market' | 'dorm' | 'community';
  title: TranslationKey;
  description: TranslationKey;
  image: string;
};

const art = '/images/customer';

// A static marketing list: there is no area registry API yet (T6.1), so these
// areas never claim which stores belong to them.
export const customerAreas: readonly CustomerArea[] = [
  {
    id: 'campus',
    title: 'landing.areaCampus',
    description: 'landing.areaCampusDescription',
    image: `${art}/area-campus.webp`,
  },
  {
    id: 'market',
    title: 'landing.areaMarket',
    description: 'landing.areaMarketDescription',
    image: `${art}/area-market.webp`,
  },
  {
    id: 'dorm',
    title: 'landing.areaDorm',
    description: 'landing.areaDormDescription',
    image: `${art}/area-dorm.webp`,
  },
  {
    id: 'community',
    title: 'landing.areaCommunity',
    description: 'landing.areaCommunityDescription',
    image: `${art}/area-community.webp`,
  },
];

export function findCustomerArea(id: string | undefined) {
  return customerAreas.find((area) => area.id === id);
}
