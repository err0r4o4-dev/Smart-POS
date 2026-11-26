import { useLanguage } from '../../app/language';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Boxes,
  Check,
  CircleDot,
  Cpu,
  Database,
  Layers3,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Terminal,
} from 'lucide-react';
import modules from '../../../../../packages/contracts/routes.json';
import { useReadiness } from '../../hooks/useReadiness';
import {
  Button,
  Card,
  ErrorState,
  Loading,
  Tag,
} from '../../components/ui/primitives';

export function DashboardPage() {
  const { t } = useLanguage();

  const readiness = useReadiness();
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">{t('dashboard.yourWorkspaceReimagined')}</p>
          <h1 tabIndex={-1}>{t('dashboard.aSmarterStart')}</h1>
          <p>{t('dashboard.theFoundationForConnectedConfidentRetail')}</p>
        </div>
        <Tag tone="amber">
          <CircleDot size={14} aria-hidden="true" />
          {t('dashboard.phase0Foundation')}
        </Tag>
      </div>
      <section className="hero">
        <div className="hero-copy">
          <span className="hero-kicker">
            <Sparkles size={16} aria-hidden="true" />
            {t('dashboard.builtToGrowWithYou')}
          </span>
          <h2>
            {t('dashboard.smartFoundations')}
            <br />
            {t('dashboard.smarterRetail')}
          </h2>
          <p>
            {t('dashboard.fromTheFirstProductToTheNext')}
            <br className="desktop-break" />
            {t('dashboard.oneConsideredArchitectureReadyForWhatComes')}
          </p>
          <Link className="button" to="/help">
            {t('dashboard.exploreTheFoundation')}
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
          <span className="hero-disclaimer">
            {t('dashboard.developmentWorkspaceNoLiveRetailData')}
          </span>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-orbit orbit-one" />
          <div className="art-orbit orbit-two" />
          <div className="art-core">
            <Boxes size={52} strokeWidth={1.4} />
            <span>SmartPOS</span>
          </div>
          <div className="art-label label-catalog">
            <Layers3 size={18} />
            {t('catalog.catalog')}
          </div>
          <div className="art-label label-inventory">
            <Database size={18} />
            {t('dashboard.inventory')}
          </div>
          <div className="art-label label-intelligence">
            <Sparkles size={18} />
            {t('dashboard.intelligence')}
          </div>
        </div>
      </section>
      <div
        className="foundation-stats"
        aria-label={t('dashboard.architectureScopeNotBusinessMetrics')}
      >
        <Card>
          <span className="stat-icon">
            <Boxes />
          </span>
          <div>
            <strong>
              {modules.length}
              <small>{t('dashboard.plannedModules')}</small>
            </strong>
            <p>{t('dashboard.connectedByClearBoundaries')}</p>
          </div>
        </Card>
        <Card>
          <span className="stat-icon">
            <Layers3 />
          </span>
          <div>
            <strong>
              {modules.reduce((total, item) => total + item.routes.length, 0)}
              <small>{t('dashboard.plannedPages')}</small>
            </strong>
            <p>{t('dashboard.documentedNotYetImplemented')}</p>
          </div>
        </Card>
        <Card>
          <span className="stat-icon">
            <ShieldCheck />
          </span>
          <div>
            <strong>
              {t('dashboard.phase0')}
              <small>{t('dashboard.foundationFirst')}</small>
            </strong>
            <p>{t('dashboard.noSimulatedBusinessActivity')}</p>
          </div>
        </Card>
      </div>
      <div className="dashboard-grid">
        <Card className="service-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{t('dashboard.realTimeReadiness')}</p>
              <h2>{t('dashboard.systemConnection')}</h2>
            </div>
            <Button
              className="button-icon button-secondary"
              aria-label={t('dashboard.refreshServiceStatus')}
              onClick={() => void readiness.refetch()}
              disabled={readiness.isFetching}
            >
              <RefreshCw size={18} aria-hidden="true" />
            </Button>
          </div>
          <p className="muted">
            {t('dashboard.liveStatusFromTheGoApiChecked')}
          </p>
          {readiness.isPending ? (
            <Loading />
          ) : readiness.isError ? (
            <ErrorState
              message={readiness.error.message}
              retry={() => void readiness.refetch()}
            />
          ) : (
            <div className="service-ready" role="status">
              <span className="ready-icon">
                <Check />
              </span>
              <div>
                <strong>{t('dashboard.apiDatabaseReady')}</strong>
                <p>{t('dashboard.connectionAndMigrationVersionVerified')}</p>
              </div>
              <Tag tone="success">{t('dashboard.connected')}</Tag>
            </div>
          )}
          <div className="service-notes">
            <span>
              <Database size={17} aria-hidden="true" />
              {t('dashboard.postgresqlTransactionalFoundation')}
            </span>
            <span>
              <Cpu size={17} aria-hidden="true" />
              {t('dashboard.aiServiceInternalHealthOnlyNoPredictions')}
            </span>
          </div>
        </Card>
        <Card className="next-card">
          <Tag tone="amber">{t('dashboard.upNextPhase1')}</Tag>
          <h2>{t('dashboard.makeItYourStore')}</h2>
          <p>
            {t('dashboard.secureIdentityOrganizationsBranchesAndAnAccurate')}
          </p>
          <ul>
            <li>
              <Check size={16} aria-hidden="true" />
              {t('dashboard.serverManagedSessionsPermissions')}
            </li>
            <li>
              <Check size={16} aria-hidden="true" />
              {t('dashboard.productsUnitsBarcodeHandling')}
            </li>
          </ul>
          <Link to="/help" className="text-link">
            {t('dashboard.readTheDevelopmentPath')}
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
        </Card>
      </div>
      <section className="module-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">{t('dashboard.oneConnectedPlatform')}</p>
            <h2>{t('dashboard.designedForTheWholeStore')}</h2>
          </div>
          <span className="muted">
            {t('dashboard.businessModulesArePlanned')}
          </span>
        </div>
        <div className="module-grid">
          {modules.map((item, index) => (
            <div className="module-item" key={item.module}>
              <span className="module-number">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div>
                <h3>{item.name}</h3>
                <span>
                  {item.routes.length} {t('dashboard.plannedPages2')}
                </span>
              </div>
              <span className="module-phase">P{item.phase}</span>
            </div>
          ))}
        </div>
      </section>
      <div className="foundation-footnote">
        <Terminal size={18} aria-hidden="true" />
        <p>{t('dashboard.exploreThePosAndAuthenticationLayoutPreviews')}</p>
      </div>
    </>
  );
}
