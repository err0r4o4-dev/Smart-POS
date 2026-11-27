import { HelpCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLanguage } from '../../app/language';
import { LanguageSwitcher } from '../../components/ui/LanguageSwitcher';
import { StandardPageHeader } from '../../components/ui/StandardPage';
import { FaqList } from './FaqList';
import { faqs } from './faq-content';
import './help.css';

export function FaqPage() {
  const { t } = useLanguage();

  return (
    <main className="help-center public-faq-page">
      <StandardPageHeader
        icon={<HelpCircle size={24} />}
        title={t('help.faqSectionTitle')}
        headingTabIndex={-1}
        actions={
          <>
            <Link className="button secondary" to="/">
              {t('landing.navHome')}
            </Link>
            <LanguageSwitcher />
          </>
        }
      />
      <FaqList items={faqs} />
    </main>
  );
}
