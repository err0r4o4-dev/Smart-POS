import { useLanguage } from '../../app/language';
import { BookOpen, Store, CookingPot } from 'lucide-react';
import { Card } from '../../components/ui/primitives';
import { StandardPageHeader } from '../../components/ui/StandardPage';

export function HelpPage() {
  const { t } = useLanguage();

  return (
    <>
      <StandardPageHeader
        icon={<BookOpen size={24} />}
        eyebrow={t('help.eyebrow')}
        title={t('help.title')}
        description={t('help.description')}
        headingTabIndex={-1}
      />
      <div className="help-grid">
        <Card>
          <Store className="help-icon" />
          <h2>{t('help.setupTitle')}</h2>
          <p>{t('help.setupBody')}</p>
          <p>{t('help.menuBody')}</p>
        </Card>
        <Card>
          <CookingPot className="help-icon" />
          <h2>{t('help.ordersTitle')}</h2>
          <p>{t('help.ordersBody')}</p>
          <p>{t('help.statusBody')}</p>
        </Card>
        <Card>
          <BookOpen className="help-icon" />
          <h2>{t('help.trackingTitle')}</h2>
          <p>{t('help.trackingBody')}</p>
          <p>{t('help.recoveryBody')}</p>
        </Card>
      </div>
    </>
  );
}
