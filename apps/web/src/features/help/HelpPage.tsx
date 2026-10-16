import { useLanguage } from '../../app/language';
import { BookOpen, Code2, ShieldCheck } from 'lucide-react';
import { Card, Tag } from '../../components/ui/primitives';

export function HelpPage() {
  const { t } = useLanguage();

  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t('help.developerWorkspace')}</p>
          <h1 tabIndex={-1}>{t('help.buildOnSolidGround')}</h1>
          <p>{t('help.aPracticalStartingPointForTheFive')}</p>
        </div>
        <Tag tone="amber">{t('dashboard.phase0')}</Tag>
      </div>
      <div className="help-grid">
        <Card>
          <Code2 className="help-icon" />
          <h2>{t('help.startLocally')}</h2>
          <p>{t('help.fromTheRepositoryRootWithNode24')}</p>
          <pre>
            <code>npm ci{'\n'}npm run stack:up</code>
          </pre>
          <p>{t('help.openLocalhost8088ForTheCompleteSame')}</p>
        </Card>
        <Card>
          <ShieldCheck className="help-icon" />
          <h2>{t('help.knowTheBoundary')}</h2>
          <p>{t('help.signInAndSelectYourOrganizationTo')}</p>
          <p>{t('help.healthStatusIsRealModulePageCounts')}</p>
        </Card>
        <Card>
          <BookOpen className="help-icon" />
          <h2>{t('help.followTheRoadmap')}</h2>
          <p>{t('help.identityCatalogInventoryPosSalesPurchasingShelves')}</p>
          <p>{t('help.detailedContractsModuleOwnershipAndAcceptanceGates')}</p>
        </Card>
      </div>
    </>
  );
}
