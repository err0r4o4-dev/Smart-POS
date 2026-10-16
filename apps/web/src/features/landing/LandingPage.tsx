import { LanguageSwitcher } from '../../components/ui/LanguageSwitcher';
import { useLanguage } from '../../app/language';
import { Link } from 'react-router-dom';
import {
  ArrowDown,
  ArrowRight,
  Boxes,
  Check,
  Layers3,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  Store,
} from 'lucide-react';
import { useAuth } from '../../app/AuthProvider';
import { paths } from '../../app/routes';
import { Brand } from '../../components/ui/primitives';
import { POSPreview } from './POSPreview';
import { useLandingReveal } from './useLandingReveal';
import './landing.css';

const steps = [
  {
    number: '01',
    icon: Store,
    title: 'landing.setUpYourStoreAndBranches',
    description: 'landing.addStoreBranchAndStaffDetailsTo',
  },
  {
    number: '02',
    icon: Boxes,
    title: 'landing.addProductsAndManageStock',
    description: 'landing.organizeProductsSetPricesAndBarcodesAnd',
  },
  {
    number: '03',
    icon: ReceiptText,
    title: 'landing.startSellingAndTrackSales',
    description: 'landing.sellWithPosIssueReceiptsAndReview',
  },
] as const;
const features = [
  {
    icon: Layers3,
    title: 'landing.productsAndStockConnected',
    description: 'landing.manageProductDetailsAndStockMovementsIn',
  },
  {
    icon: Store,
    title: 'landing.keepStoresAndBranchesOrganized',
    description: 'landing.workInEachBranchSContextAnd',
  },
  {
    icon: ShieldCheck,
    title: 'landing.giveYourTeamTheRightAccess',
    description: 'landing.manageStaffRolesAndPermissionsSoEach',
  },
] as const;

export function LandingPage() {
  const { t } = useLanguage();

  const landingRef = useLandingReveal();
  const { state } = useAuth();
  const authenticated = state.status === 'authenticated';
  const loading = state.status === 'loading';
  return (
    <div className="landing-page" ref={landingRef}>
      <a className="skip-link" href="#landing-main">
        {t('landing.skipToContent')}
      </a>
      <header className="landing-header">
        <div className="landing-container landing-header-inner">
          <Link
            className="landing-brand-link"
            to="/"
            aria-label={t('landing.veloPosHome')}
          >
            <Brand />
          </Link>
          <nav
            className="landing-navigation"
            aria-label={t('landing.homeNavigation')}
          >
            <Link className="landing-shop-link" to={paths.shop}>
              {t('landing.onlineStorefront')}
            </Link>
            <a className="landing-nav-guide" href="#how-it-works">
              {t('landing.howItWorks')}
            </a>
            <LanguageSwitcher />
            {loading ? (
              <button className="button" type="button" disabled>
                {t('landing.checking')}
              </button>
            ) : (
              <Link
                className="button"
                to={authenticated ? paths.workspace : paths.login}
              >
                {authenticated ? t('landing.goToWorkspace') : t('auth.signIn')}
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main id="landing-main" tabIndex={-1}>
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-container landing-hero-inner">
            <div className="landing-hero-copy">
              <span className="landing-eyebrow landing-hero-badge">
                <Sparkles size={15} aria-hidden="true" />{' '}
                {t('landing.smartToolsSimplerRetail')}
              </span>
              <h1 id="landing-title">
                {t('landing.simplifyYourStore')}
                <br />
                {t('landing.sell')}
                <span className="landing-title-accent">
                  {t('landing.withConfidence')}
                </span>
              </h1>
              <p className="landing-hero-description">
                {t('landing.makeEveryDayAtYourStoreEasier')}
                <br className="landing-desktop-break" />{' '}
                {t('landing.connectSalesProductsAndStockInOne')}
                <br className="landing-desktop-break" />{' '}
                {t('landing.soYouHaveTimeForWhatMatters')}
              </p>
              <div className="landing-hero-actions">
                {loading ? (
                  <button className="button" type="button" disabled>
                    {t('landing.checking')}
                  </button>
                ) : (
                  <Link
                    className="button"
                    to={authenticated ? paths.workspace : paths.register}
                  >
                    {authenticated
                      ? t('landing.goToWorkspace')
                      : t('landing.getStarted')}
                    <ArrowRight size={18} aria-hidden="true" />
                  </Link>
                )}
                <a className="button button-secondary" href="#how-it-works">
                  {t('landing.seeHowItWorks')}
                  <ArrowDown size={16} aria-hidden="true" />
                </a>
              </div>
              <ul
                className="landing-hero-benefits"
                aria-label={t('landing.smartposBenefits')}
              >
                {[
                  t('landing.stayOrganized'),
                  t('landing.connectEveryStoreTask'),
                  t('landing.growWithYourBusiness'),
                ].map((benefit) => (
                  <li key={benefit}>
                    <Check size={14} aria-hidden="true" />
                    {benefit}
                  </li>
                ))}
              </ul>
            </div>
            <POSPreview />
          </div>
        </section>
        <section
          id="how-it-works"
          className="landing-how"
          aria-labelledby="landing-how-title"
        >
          <div className="landing-container">
            <div className="landing-section-heading">
              <p className="landing-eyebrow">{t('landing.anEasyStart')}</p>
              <h2 id="landing-how-title">
                {t('landing.readyForYourStoreIn3Steps')}
              </h2>
              <p>{t('landing.fromInitialSetupToInStoreSales')}</p>
            </div>
            <ol className="landing-steps" data-landing-reveal="idle">
              {steps.map(({ number, icon: Icon, title, description }) => (
                <li className="landing-step" key={number}>
                  <div className="landing-step-top">
                    <span className="landing-step-number">{number}</span>
                    <Icon size={25} strokeWidth={1.6} aria-hidden="true" />
                  </div>
                  <h3>{t(title)}</h3>
                  <p>{t(description)}</p>
                </li>
              ))}
            </ol>
            <div className="landing-note">
              <Sparkles size={19} aria-hidden="true" />
              <p>
                <strong>{t('landing.startWithWhatYourStoreNeedsThen')}</strong>{' '}
                {t('landing.toolsForSalesStockAndYourTeam')}
              </p>
            </div>
          </div>
        </section>
        <section
          className="landing-features"
          aria-labelledby="landing-features-title"
        >
          <div className="landing-container">
            <div className="landing-feature-panel">
              <p className="landing-eyebrow">
                {t('landing.designedForTheWayStoresWork')}
              </p>
              <h2 id="landing-features-title">
                {t('landing.everyPartOfYourStoreConnected')}
                <br />
                {t('landing.inOnePlace')}
              </h2>
              <p className="landing-feature-intro">
                {t('landing.simplifyBackOfficeWorkAndHelpYour')}
              </p>
              <div className="landing-feature-grid" data-landing-reveal="idle">
                {features.map(({ icon: Icon, title, description }) => (
                  <article key={title}>
                    <span className="landing-feature-icon">
                      <Icon size={23} strokeWidth={1.7} aria-hidden="true" />
                    </span>
                    <h3>{t(title)}</h3>
                    <p>{t(description)}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
      <footer className="landing-footer">
        <div className="landing-container landing-footer-inner">
          <nav
            className="landing-footer-navigation"
            aria-label={t('landing.footerLinks')}
          >
            <Link to={paths.help}>{t('landing.help')}</Link>
            <a href="#how-it-works">{t('landing.gettingStarted')}</a>
          </nav>
          <div className="landing-footer-links">
            <small>© {new Date().getFullYear()} VELO POS · SmartPOS</small>
          </div>
        </div>
      </footer>
    </div>
  );
}
