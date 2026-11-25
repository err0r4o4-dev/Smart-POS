import type { TranslationKey } from '../../i18n';

export type CategoryKey =
  'all' | 'getting-started' | 'pos' | 'kitchen' | 'menu' | 'faq';

export interface FaqItem {
  id: string;
  category: CategoryKey;
  questionKey: TranslationKey;
  answerKey: TranslationKey;
}

export const faqs: FaqItem[] = [
  {
    id: 'faq-kitchen',
    category: 'kitchen',
    questionKey: 'help.faqKitchenQueueQ',
    answerKey: 'help.faqKitchenQueueA',
  },
  {
    id: 'faq-permission',
    category: 'getting-started',
    questionKey: 'help.faqPermissionQ',
    answerKey: 'help.faqPermissionA',
  },
  {
    id: 'faq-shift',
    category: 'pos',
    questionKey: 'help.faqShiftQ',
    answerKey: 'help.faqShiftA',
  },
  {
    id: 'faq-offline',
    category: 'faq',
    questionKey: 'help.faqOfflineQ',
    answerKey: 'help.faqOfflineA',
  },
  {
    id: 'faq-online-order',
    category: 'menu',
    questionKey: 'help.faqOnlineOrderQ',
    answerKey: 'help.faqOnlineOrderA',
  },
];
