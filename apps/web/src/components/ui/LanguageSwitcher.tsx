import { Check } from 'lucide-react';
import { useLanguage } from '../../app/language';
import './language-switcher.css';

export function LanguageSwitcher() {
  const { language, setLanguage, t } = useLanguage();
  return (
    <div
      className="language-switcher"
      role="group"
      aria-label={t('common.language')}
    >
      {(['th', 'en'] as const).map((value) => (
        <button
          key={value}
          type="button"
          lang={value}
          aria-label={value === 'th' ? 'ไทย' : 'English'}
          aria-pressed={language === value}
          onClick={() => setLanguage(value)}
        >
          <Check size={13} aria-hidden="true" />
          {value === 'th' ? 'ไทย' : 'EN'}
        </button>
      ))}
    </div>
  );
}
