import type { TranslationKey } from '../../i18n';

type Guide = { id: string; body: TranslationKey; steps?: TranslationKey[] };

export const merchantGuide = {
  menu: {
    id: 'menu',
    body: 'help.menuBody',
    steps: ['help.menuStep1', 'help.menuStep2'],
  },
  setup: { id: 'setup', body: 'help.setupBody', steps: ['help.setupStep1'] },
  orders: {
    id: 'orders',
    body: 'help.ordersBody',
    steps: ['help.kitchenStep1', 'help.kitchenStep2'],
  },
  kitchen: { id: 'faq-kitchen', body: 'help.faqKitchenQueueA' },
  offline: { id: 'faq-offline', body: 'help.faqOfflineA' },
  tracking: { id: 'tracking', body: 'help.trackingBody' },
} satisfies Record<string, Guide>;

export function findMerchantGuide(question: string): Guide | undefined {
  if (/คิวครัว|ไม่ขึ้นครัว|kitchen queue|kitchen.*missing/.test(question))
    return merchantGuide.kitchen;
  if (/ตั้งค่าร้าน|เปิดร้าน|set ?up|store settings/.test(question))
    return merchantGuide.setup;
  if (/เมนู|menu/.test(question)) return merchantGuide.menu;
  if (/ติดตาม|tracking/.test(question)) return merchantGuide.tracking;
  if (/ครัว|ออเดอร์|kitchen|\border/.test(question))
    return merchantGuide.orders;
  if (/ค้าง|ออฟไลน์|offline|connection|frozen/.test(question))
    return merchantGuide.offline;
  return undefined;
}
