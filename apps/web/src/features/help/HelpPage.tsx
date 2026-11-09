import { useState, useMemo } from 'react';
import { useLanguage } from '../../app/language';
import type { TranslationKey } from '../../i18n';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Clock,
  CookingPot,
  HelpCircle,
  LifeBuoy,
  ReceiptText,
  Search,
  Settings,
  Store,
  Utensils,
  X,
} from 'lucide-react';
import { StandardPageHeader } from '../../components/ui/StandardPage';
import './help.css';

type CategoryKey =
  'all' | 'getting-started' | 'pos' | 'kitchen' | 'menu' | 'faq';

interface GuideItem {
  id: string;
  category: CategoryKey;
  icon: typeof Store;
  titleKey: TranslationKey;
  bodyKey: TranslationKey;
  secondaryBodyKey?: TranslationKey;
  steps?: TranslationKey[];
}

interface FaqItem {
  id: string;
  category: CategoryKey;
  questionKey: TranslationKey;
  answerKey: TranslationKey;
}

export function HelpPage() {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<CategoryKey>('all');
  const [openFaqs, setOpenFaqs] = useState<Record<string, boolean>>({});

  const toggleFaq = (id: string) => {
    setOpenFaqs((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const categories: { key: CategoryKey; label: string }[] = useMemo(
    () => [
      { key: 'all', label: t('help.categoryAll') },
      { key: 'getting-started', label: t('help.categoryGettingStarted') },
      { key: 'pos', label: t('help.categoryPos') },
      { key: 'kitchen', label: t('help.categoryKitchen') },
      { key: 'menu', label: t('help.categoryMenu') },
      { key: 'faq', label: t('help.categoryFaq') },
    ],
    [t],
  );

  const guides: GuideItem[] = useMemo(
    () => [
      {
        id: 'setup',
        category: 'getting-started',
        icon: Store,
        titleKey: 'help.setupTitle',
        bodyKey: 'help.setupBody',
        steps: ['help.setupStep1', 'help.setupStep2'],
      },
      {
        id: 'orders',
        category: 'kitchen',
        icon: CookingPot,
        titleKey: 'help.ordersTitle',
        bodyKey: 'help.ordersBody',
        secondaryBodyKey: 'help.statusBody',
        steps: ['help.kitchenStep1', 'help.kitchenStep2'],
      },
      {
        id: 'pos',
        category: 'pos',
        icon: ReceiptText,
        titleKey: 'help.posGuideTitle',
        bodyKey: 'help.posGuideBody',
        steps: ['help.posStep1', 'help.posStep2', 'help.posStep3'],
      },
      {
        id: 'menu',
        category: 'menu',
        icon: Utensils,
        titleKey: 'help.menuTitle',
        bodyKey: 'help.menuBody',
        steps: ['help.menuStep1', 'help.menuStep2'],
      },
      {
        id: 'tracking',
        category: 'faq',
        icon: BookOpen,
        titleKey: 'help.trackingTitle',
        bodyKey: 'help.trackingBody',
        secondaryBodyKey: 'help.recoveryBody',
      },
    ],
    [],
  );

  const faqs: FaqItem[] = useMemo(
    () => [
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
    ],
    [],
  );

  const normalizedQuery = search.trim().toLowerCase();

  const filteredGuides = useMemo(() => {
    return guides.filter((guide) => {
      if (activeCategory !== 'all' && guide.category !== activeCategory) {
        return false;
      }
      if (!normalizedQuery) return true;

      const title = t(guide.titleKey).toLowerCase();
      const body = t(guide.bodyKey).toLowerCase();
      const secondary = guide.secondaryBodyKey
        ? t(guide.secondaryBodyKey).toLowerCase()
        : '';
      const stepText = (guide.steps ?? [])
        .map((step) => t(step).toLowerCase())
        .join(' ');

      return (
        title.includes(normalizedQuery) ||
        body.includes(normalizedQuery) ||
        secondary.includes(normalizedQuery) ||
        stepText.includes(normalizedQuery)
      );
    });
  }, [guides, activeCategory, normalizedQuery, t]);

  const filteredFaqs = useMemo(() => {
    return faqs.filter((faq) => {
      if (activeCategory !== 'all' && faq.category !== activeCategory) {
        return false;
      }
      if (!normalizedQuery) return true;

      const question = t(faq.questionKey).toLowerCase();
      const answer = t(faq.answerKey).toLowerCase();

      return (
        question.includes(normalizedQuery) || answer.includes(normalizedQuery)
      );
    });
  }, [faqs, activeCategory, normalizedQuery, t]);

  const totalResultsCount = filteredGuides.length + filteredFaqs.length;

  return (
    <div className="help-center">
      <StandardPageHeader
        icon={<BookOpen size={24} />}
        eyebrow={t('help.eyebrow')}
        title={t('help.title')}
        description={t('help.description')}
        headingTabIndex={-1}
      />

      {/* Search and Filters */}
      <section className="help-search-section" aria-label={t('help.eyebrow')}>
        <div className="help-search-box">
          <Search size={18} className="help-search-icon" aria-hidden="true" />
          <input
            type="search"
            className="help-search-input"
            placeholder={t('help.searchPlaceholder')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label={t('help.searchPlaceholder')}
          />
          {search && (
            <button
              type="button"
              className="help-search-clear"
              onClick={() => setSearch('')}
              aria-label={t('help.searchClear')}
            >
              <X size={16} aria-hidden="true" />
            </button>
          )}
        </div>

        {search.trim() && (
          <span className="help-results-badge" role="status">
            {t('help.searchResultsCount', { count: totalResultsCount })}
          </span>
        )}

        <div
          className="help-category-bar"
          role="tablist"
          aria-label={t('help.categoryAll')}
        >
          {categories.map((cat) => (
            <button
              key={cat.key}
              type="button"
              role="tab"
              aria-selected={activeCategory === cat.key}
              className={`help-category-tab ${
                activeCategory === cat.key ? 'active' : ''
              }`}
              onClick={() => setActiveCategory(cat.key)}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </section>

      {/* Quick Shortcuts (only when not searching or when on 'all' / relevant tab) */}
      {!normalizedQuery && activeCategory === 'all' && (
        <section
          className="help-quick-section"
          aria-labelledby="help-quick-title"
        >
          <h2 id="help-quick-title" className="help-section-title">
            <Store size={20} className="help-icon" aria-hidden="true" />
            {t('help.quickActionsTitle')}
          </h2>
          <div className="help-quick-grid">
            <a href="/pos" className="help-quick-card">
              <div className="help-quick-icon-wrap" aria-hidden="true">
                <ReceiptText size={22} />
              </div>
              <h3>{t('help.quickPos')}</h3>
              <p>{t('help.quickPosDesc')}</p>
              <span className="help-quick-action-link">
                <span>{t('help.quickPos')}</span>
                <ArrowRight size={15} aria-hidden="true" />
              </span>
            </a>

            <a href="/kitchen" className="help-quick-card">
              <div className="help-quick-icon-wrap" aria-hidden="true">
                <CookingPot size={22} />
              </div>
              <h3>{t('help.quickKitchen')}</h3>
              <p>{t('help.quickKitchenDesc')}</p>
              <span className="help-quick-action-link">
                <span>{t('help.quickKitchen')}</span>
                <ArrowRight size={15} aria-hidden="true" />
              </span>
            </a>

            <a href="/menu" className="help-quick-card">
              <div className="help-quick-icon-wrap" aria-hidden="true">
                <Utensils size={22} />
              </div>
              <h3>{t('help.quickMenu')}</h3>
              <p>{t('help.quickMenuDesc')}</p>
              <span className="help-quick-action-link">
                <span>{t('help.quickMenu')}</span>
                <ArrowRight size={15} aria-hidden="true" />
              </span>
            </a>

            <a href="/settings" className="help-quick-card">
              <div className="help-quick-icon-wrap" aria-hidden="true">
                <Settings size={22} />
              </div>
              <h3>{t('help.quickSettings')}</h3>
              <p>{t('help.quickSettingsDesc')}</p>
              <span className="help-quick-action-link">
                <span>{t('help.quickSettings')}</span>
                <ArrowRight size={15} aria-hidden="true" />
              </span>
            </a>
          </div>
        </section>
      )}

      {/* Guides Grid */}
      {filteredGuides.length > 0 && (
        <div className="help-guide-grid help-grid">
          {filteredGuides.map((guide) => {
            const Icon = guide.icon;
            return (
              <article key={guide.id} className="help-guide-card card">
                <div className="help-guide-card-icon" aria-hidden="true">
                  <Icon size={24} className="help-icon" />
                </div>
                <h2>{t(guide.titleKey)}</h2>
                <p>{t(guide.bodyKey)}</p>
                {guide.secondaryBodyKey && <p>{t(guide.secondaryBodyKey)}</p>}

                {guide.steps && guide.steps.length > 0 && (
                  <ul className="help-steps-list">
                    {guide.steps.map((stepKey, idx) => (
                      <li key={idx} className="help-step-item">
                        <CheckCircle2
                          size={15}
                          className="help-step-bullet"
                          aria-hidden="true"
                        />
                        <span>{t(stepKey)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            );
          })}
        </div>
      )}

      {/* FAQs Section */}
      {filteredFaqs.length > 0 && (
        <section className="help-faq-section" aria-labelledby="help-faq-title">
          <h2 id="help-faq-title" className="help-section-title">
            <HelpCircle size={20} className="help-icon" aria-hidden="true" />
            {t('help.faqSectionTitle')}
          </h2>
          <div className="help-faq-list">
            {filteredFaqs.map((faq) => {
              const isOpen = !!openFaqs[faq.id];
              return (
                <div
                  key={faq.id}
                  className={`help-faq-item ${isOpen ? 'open' : ''}`}
                >
                  <button
                    type="button"
                    className="help-faq-trigger"
                    aria-expanded={isOpen}
                    aria-controls={`${faq.id}-answer`}
                    onClick={() => toggleFaq(faq.id)}
                  >
                    <span>{t(faq.questionKey)}</span>
                    <ChevronDown
                      size={18}
                      className="help-faq-chevron"
                      aria-hidden="true"
                    />
                  </button>
                  {isOpen && (
                    <div
                      id={`${faq.id}-answer`}
                      className="help-faq-answer"
                      role="region"
                    >
                      <p>{t(faq.answerKey)}</p>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Empty State when search returns 0 */}
      {totalResultsCount === 0 && (
        <div className="help-empty-state">
          <HelpCircle
            size={36}
            style={{ color: 'var(--text-tertiary)' }}
            aria-hidden="true"
          />
          <h3>{t('help.noResults')}</h3>
          <p>{t('help.noResultsHint')}</p>
        </div>
      )}

      {/* Support Card */}
      <aside className="help-support-card" aria-label={t('help.supportTitle')}>
        <div className="help-support-left">
          <div className="help-support-icon" aria-hidden="true">
            <LifeBuoy size={26} />
          </div>
          <div className="help-support-info">
            <h3>{t('help.supportTitle')}</h3>
            <p>{t('help.supportDescription')}</p>
            <p style={{ marginTop: 4, color: 'var(--text-tertiary)' }}>
              {t('help.supportContact')}
            </p>
          </div>
        </div>
        <div className="help-support-badge">
          <Clock size={15} aria-hidden="true" />
          <span>{t('help.supportHours')}</span>
        </div>
      </aside>
    </div>
  );
}
