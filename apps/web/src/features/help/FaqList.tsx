import { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';
import { useLanguage } from '../../app/language';
import type { FaqItem } from './faq-content';

export function FaqList({
  items,
  showHeading = false,
}: {
  items: FaqItem[];
  showHeading?: boolean;
}) {
  const { t } = useLanguage();
  const [openFaqs, setOpenFaqs] = useState<Record<string, boolean>>({});

  const toggleFaq = (id: string) => {
    setOpenFaqs((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  if (!items.length) return null;

  return (
    <section
      className="help-faq-section"
      aria-labelledby={showHeading ? 'help-faq-title' : undefined}
    >
      {showHeading && (
        <h2 id="help-faq-title" className="help-section-title">
          <HelpCircle size={20} className="help-icon" aria-hidden="true" />
          {t('help.faqSectionTitle')}
        </h2>
      )}
      <div className="help-faq-list">
        {items.map((faq) => {
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
  );
}
