import { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown, CircleHelp } from 'lucide-react';
import { useLanguage } from '../../app/language';
import type { TranslationKey } from '../../i18n';
import './help-dropdown.css';

const topics: { title: TranslationKey; body: TranslationKey }[] = [
  { title: 'help.setupTitle', body: 'help.setupBody' },
  { title: 'help.menuTitle', body: 'help.menuBody' },
  { title: 'help.ordersTitle', body: 'help.ordersBody' },
  { title: 'help.faqOfflineQ', body: 'help.faqOfflineA' },
];

export function HelpDropdown() {
  const { t } = useLanguage();
  const panelId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div
      className="help-dropdown"
      ref={containerRef}
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget)
        ) {
          setOpen(false);
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="icon-button topbar-help"
        aria-label={t('landing.help')}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <CircleHelp size={20} aria-hidden="true" />
      </button>
      {open && (
        <section
          id={panelId}
          className="help-dropdown-panel"
          aria-labelledby={`${panelId}-title`}
        >
          <h2 id={`${panelId}-title`}>{t('help.title')}</h2>
          {topics.map((topic, index) => {
            const expanded = expandedTopic === topic.title;
            const bodyId = `${panelId}-topic-${index}`;
            return (
              <div className="help-dropdown-topic" key={topic.title}>
                <button
                  type="button"
                  className="help-dropdown-topic-trigger"
                  aria-expanded={expanded}
                  aria-controls={bodyId}
                  onClick={() =>
                    setExpandedTopic(expanded ? null : topic.title)
                  }
                >
                  <span>{t(topic.title)}</span>
                  <ChevronDown size={16} aria-hidden="true" />
                </button>
                <p id={bodyId} hidden={!expanded}>
                  {t(topic.body)}
                </p>
              </div>
            );
          })}
        </section>
      )}
    </div>
  );
}
