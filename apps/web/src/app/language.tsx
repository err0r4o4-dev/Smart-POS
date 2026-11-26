import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  localize,
  translate,
  messages,
  type Language,
  type TranslationKey,
  type TranslationParams,
  type UiMessage,
} from '../i18n';

const storageKey = 'smartpos.language';
function readLanguage(): Language {
  try {
    return localStorage.getItem(storageKey) === 'en' ? 'en' : 'th';
  } catch {
    return 'th';
  }
}

interface LanguageContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey, params?: TranslationParams) => string;
  localize: (value: string) => string;
  labelCode: (value: string | null | undefined) => string;
  messageText: (value: UiMessage) => string;
  formatDateTime: (
    value: string | number | Date,
    mode?: 'date' | 'time' | 'datetime',
  ) => string;
}
const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({
  children,
  initialLanguage,
}: {
  children: ReactNode;
  initialLanguage?: Language;
}) {
  const [language, setLanguage] = useState<Language>(
    initialLanguage ?? readLanguage,
  );
  useEffect(() => {
    document.documentElement.lang = language;
    try {
      localStorage.setItem(storageKey, language);
    } catch {
      /* A blocked preference store must not prevent switching. */
    }
  }, [language]);
  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t: (key: TranslationKey, params?: TranslationParams) =>
        translate(language, key, params),
      localize: (value: string) => localize(language, value),
      messageText: (value: UiMessage) =>
        typeof value === 'string'
          ? localize(language, value)
          : translate(language, value.key, value.params),
      labelCode: (value: string | null | undefined) => {
        if (!value) return '';
        const labels = messages[language].statuses;
        return Object.hasOwn(labels, value)
          ? labels[value as keyof typeof labels]
          : value;
      },
      formatDateTime: (
        value: string | number | Date,
        mode: 'date' | 'time' | 'datetime' = 'datetime',
      ) => {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return '—';
        return new Intl.DateTimeFormat(
          language === 'th' ? 'th-TH-u-ca-gregory' : 'en-GB',
          {
            ...(mode !== 'time' ? { dateStyle: 'medium' as const } : {}),
            ...(mode !== 'date' ? { timeStyle: 'short' as const } : {}),
          },
        ).format(date);
      },
    }),
    [language],
  );
  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

// The provider and consumer form the public language entry point.
// eslint-disable-next-line react-refresh/only-export-components
export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error('useLanguage requires LanguageProvider');
  return context;
}
