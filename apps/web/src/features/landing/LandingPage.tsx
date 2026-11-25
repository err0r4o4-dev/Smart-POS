import {
  useState,
  type FormEvent,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  ChartLine,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  Flame,
  Globe,
  Heart,
  House,
  MapPin,
  Menu,
  MessageCircle,
  Monitor,
  QrCode,
  Search,
  ShoppingBag,
  ShoppingCart,
  Sparkles,
  Star,
  Store,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react';
import { LanguageSwitcher } from '../../components/ui/LanguageSwitcher';
import { Brand, Loading } from '../../components/ui/primitives';
import { useLanguage } from '../../app/language';
import { useAuth } from '../../app/AuthProvider';
import { paths } from '../../app/routes';
import type { TranslationKey } from '../../i18n';
import {
  businessTypeLabel,
  normalizeBusinessType,
} from '../storefront/business-type';
import { ShopError } from '../storefront/shop-feedback';
import { useShopFavorites } from '../storefront/shop-favorites';
import { useShopDirectory } from '../storefront/useShopDirectory';
import './landing.css';

type Translate = ReturnType<typeof useLanguage>['t'];

const popularSearches: Record<'th' | 'en', string[]> = {
  th: ['ข้าวกะเพรา', 'ก๋วยเตี๋ยว', 'ชาไข่มุก', 'ของทอด', 'ส้มตำ'],
  en: ['Krapao', 'Noodles', 'Bubble tea', 'Fried food', 'Som tam'],
};

const areas: {
  title: TranslationKey;
  description: TranslationKey;
  image: string;
}[] = [
  {
    title: 'landing.areaCampus',
    description: 'landing.areaCampusDescription',
    image: '/images/home/area-campus.webp',
  },
  {
    title: 'landing.areaMarket',
    description: 'landing.areaMarketDescription',
    image: '/images/home/area-market.webp',
  },
  {
    title: 'landing.areaDorm',
    description: 'landing.areaDormDescription',
    image: '/images/home/area-dorm.webp',
  },
  {
    title: 'landing.areaCommunity',
    description: 'landing.areaCommunityDescription',
    image: '/images/home/area-community.webp',
  },
];

const categories: { label: TranslationKey; image: string }[] = [
  {
    label: 'landing.categoryMadeToOrder',
    image: '/images/home/cat-made-to-order.webp',
  },
  { label: 'landing.categoryNoodles', image: '/images/home/cat-noodles.webp' },
  { label: 'landing.categoryIsan', image: '/images/home/cat-isan.webp' },
  { label: 'landing.categoryFried', image: '/images/home/cat-fried.webp' },
  { label: 'landing.categoryDrinks', image: '/images/home/cat-drinks.webp' },
  {
    label: 'landing.categoryDesserts',
    image: '/images/home/cat-desserts.webp',
  },
  { label: 'landing.categoryHealthy', image: '/images/home/cat-healthy.webp' },
  { label: 'landing.categorySnacks', image: '/images/home/cat-snacks.webp' },
];

const steps: {
  title: TranslationKey;
  description: TranslationKey;
  icon: LucideIcon;
}[] = [
  {
    title: 'landing.stepFind',
    description: 'landing.stepFindDescription',
    icon: Search,
  },
  {
    title: 'landing.stepOrder',
    description: 'landing.stepOrderDescription',
    icon: ShoppingBag,
  },
  {
    title: 'landing.stepReceive',
    description: 'landing.stepReceiveDescription',
    icon: UtensilsCrossed,
  },
];

const merchantFeatures: { label: TranslationKey; icon: LucideIcon }[] = [
  { label: 'landing.merchantPos', icon: Monitor },
  { label: 'landing.merchantOrders', icon: ClipboardList },
  { label: 'landing.merchantQr', icon: QrCode },
  { label: 'landing.merchantReports', icon: ChartLine },
];

const shopFilters = [
  { value: 'all', label: 'landing.forYou', icon: Sparkles },
  { value: 'open', label: 'landing.openNow', icon: BadgeCheck },
  { value: 'favorites', label: 'landing.favoriteShops', icon: Heart },
] as const;

function storefrontPhoto(type: string) {
  if (type === 'CAFE' || type === 'BAR') return '/images/home/hero-tea.webp';
  if (type === 'BAKERY') return '/images/home/cat-desserts.webp';
  if (type === 'FAST_FOOD') return '/images/home/shop-grill.webp';
  return '/images/home/cat-made-to-order.webp';
}

function shopSearch(query: string) {
  return `${paths.shop}?q=${encodeURIComponent(query)}`;
}

export function LandingPage() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { state } = useAuth();
  const authenticated = state.status === 'authenticated';
  const loading = state.status === 'loading';

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = query.trim();
    void navigate(value ? shopSearch(value) : paths.shop);
  }

  return (
    <div className="landing-page">
      <a className="skip-link" href="#landing-main">
        {t('landing.skipToContent')}
      </a>
      <header className="landing-header">
        <div className="layout-shell landing-header-inner">
          <Link
            className="landing-brand-link"
            to="/"
            aria-label={t('landing.veloPosHome')}
          >
            <Brand />
          </Link>
          <div className="landing-desktop-navigation">
            <LandingNavigation
              t={t}
              loading={loading}
              authenticated={authenticated}
            />
          </div>
          <div className="landing-mobile-language">
            <LanguageSwitcher />
          </div>
          <details
            className="landing-mobile-menu"
            onToggle={(event) => setMobileMenuOpen(event.currentTarget.open)}
          >
            <summary
              role="button"
              aria-label={t('landing.menu')}
              aria-expanded={mobileMenuOpen}
            >
              <Menu size={22} aria-hidden="true" />
            </summary>
            <LandingNavigation
              t={t}
              loading={loading}
              authenticated={authenticated}
              compactLanguage
            />
          </details>
        </div>
      </header>
      <main id="landing-main" tabIndex={-1}>
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-hero-art" aria-hidden="true">
            <img
              className="landing-hero-food"
              src="/images/home/hero.webp"
              alt=""
              width="478"
              height="370"
              fetchPriority="high"
            />
            <img
              className="landing-hero-tea"
              src="/images/home/hero-tea-cutout.webp"
              alt=""
              width="103"
              height="243"
            />
          </div>
          <div className="landing-container landing-hero-inner">
            <div className="landing-hero-copy">
              <a className="landing-hero-badge" href="#landing-areas">
                <MapPin size={15} aria-hidden="true" />
                {t('landing.heroBadge')}
                <ArrowRight size={13} aria-hidden="true" />
                <span className="sr-only">{t('landing.changeArea')}</span>
              </a>
              <h1 id="landing-title">
                {t('landing.heroTitleLead')}
                <span className="landing-title-accent">
                  {t('landing.heroTitleAccent')}
                </span>
              </h1>
              <p className="landing-hero-description">
                {t('landing.heroDescription')}
              </p>
              <form
                className="landing-search"
                role="search"
                onSubmit={submitSearch}
              >
                <Search size={20} aria-hidden="true" />
                <input
                  type="search"
                  aria-label={t('landing.searchLabel')}
                  placeholder={t('landing.searchPlaceholder')}
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
                <button className="button" type="submit">
                  {t('landing.search')}
                </button>
              </form>
              <div className="landing-popular">
                <span>
                  <Flame size={15} aria-hidden="true" />
                  {t('landing.popular')}
                </span>
                <ul>
                  {popularSearches[language].map((term) => (
                    <li key={term}>
                      <Link to={shopSearch(term)}>{term}</Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>

        <section className="landing-section" aria-labelledby="landing-areas">
          <div className="landing-container">
            <SectionHeading
              id="landing-areas"
              icon={MapPin}
              title={t('landing.areasTitle')}
              description={t('landing.areasDescription')}
              action={{ to: paths.shop, label: t('landing.areasAction') }}
            />
            <ul className="landing-areas" aria-label={t('landing.areasList')}>
              {areas.map(({ title, description, image }) => (
                <li key={title}>
                  <Link className="landing-area" to={shopSearch(t(title))}>
                    <img src={image} alt="" loading="lazy" />
                    <span className="landing-area-copy">
                      <strong>{t(title)}</strong>
                      <span>{t(description)}</span>
                    </span>
                    <span className="landing-area-arrow" aria-hidden="true">
                      <ChevronRight size={16} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section
          className="landing-section"
          aria-labelledby="landing-categories"
        >
          <div className="landing-container">
            <SectionHeading
              id="landing-categories"
              icon={UtensilsCrossed}
              title={t('landing.categoriesTitle')}
              action={{
                to: paths.shop,
                label: t('landing.viewAllCategories'),
              }}
            />
            <ul
              className="landing-categories"
              aria-label={t('landing.categoriesList')}
            >
              {categories.map(({ label, image }) => (
                <li key={label}>
                  <Link className="landing-category" to={shopSearch(t(label))}>
                    <img src={image} alt="" loading="lazy" />
                    {t(label)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <RecommendedShops />

        <section className="landing-section" aria-labelledby="landing-steps">
          <div className="landing-container">
            <div className="landing-steps">
              <div className="landing-steps-intro">
                <h2 id="landing-steps">{t('landing.stepsTitle')}</h2>
                <p>{t('landing.stepsDescription')}</p>
              </div>
              <ol aria-label={t('landing.stepsAria')}>
                {steps.map(({ title, description, icon: Icon }, index) => (
                  <li key={title}>
                    <span className="landing-step-icon">
                      <Icon size={22} aria-hidden="true" />
                    </span>
                    <span className="landing-step-copy">
                      <strong>
                        <span className="landing-step-number">{index + 1}</span>
                        {t(title)}
                      </strong>
                      <span>{t(description)}</span>
                    </span>
                    {index < steps.length - 1 && (
                      <ArrowRight
                        className="landing-step-arrow"
                        size={16}
                        aria-hidden="true"
                      />
                    )}
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        <section
          id="for-merchants"
          className="landing-section landing-merchant-section"
          aria-labelledby="landing-merchant"
        >
          <div className="landing-container">
            <div className="landing-merchant">
              <img
                className="landing-merchant-art"
                src="/images/home/merchant-pos.webp"
                alt=""
                width="160"
                height="110"
                loading="lazy"
              />
              <div className="landing-merchant-copy">
                <h2 id="landing-merchant">{t('landing.merchantTitle')}</h2>
                <p>{t('landing.merchantDescription')}</p>
              </div>
              <ul
                className="landing-merchant-features"
                aria-label={t('landing.merchantFeatures')}
              >
                {merchantFeatures.map(({ label, icon: Icon }) => (
                  <li key={label}>
                    <Icon size={26} strokeWidth={1.6} aria-hidden="true" />
                    {t(label)}
                  </li>
                ))}
              </ul>
              <Link
                className="button landing-merchant-action"
                to={authenticated ? paths.workspace : paths.register}
              >
                {authenticated
                  ? t('landing.goToWorkspace')
                  : t('landing.merchantSignUp')}
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </div>
          </div>
        </section>
      </main>
      <LandingFooter t={t} />
    </div>
  );
}

function SectionHeading({
  id,
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: { to: string; label: string };
  children?: ReactNode;
}) {
  return (
    <div className="landing-section-heading">
      <span className="landing-section-icon">
        <Icon size={18} aria-hidden="true" />
      </span>
      <h2 id={id} tabIndex={-1}>
        {title}
      </h2>
      {description && <p>{description}</p>}
      <div className="landing-section-actions">
        {children}
        {action && (
          <Link className="landing-more-link" to={action.to}>
            {action.label}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        )}
      </div>
    </div>
  );
}

function RecommendedShops() {
  const { t, language } = useLanguage();
  const [filter, setFilter] =
    useState<(typeof shopFilters)[number]['value']>('all');
  const directory = useShopDirectory();
  // Directory favorites have a separate key from the product favorites of any shop.
  const saved = useShopFavorites(':directory');
  const shops = (directory.data ?? [])
    .filter((shop) =>
      filter === 'open'
        ? shop.accepting_orders
        : filter === 'favorites'
          ? saved.isFavorite(shop.slug)
          : true,
    )
    .slice(0, 4);

  return (
    <section className="landing-section" aria-labelledby="landing-shops">
      <div className="landing-container">
        <SectionHeading
          id="landing-shops"
          icon={Star}
          title={t('landing.recommendedTitle')}
          action={{ to: paths.shop, label: t('landing.viewAllShops') }}
        >
          <div
            className="landing-shop-filter"
            role="group"
            aria-label={t('landing.recommendedFilter')}
          >
            {shopFilters.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                <Icon size={15} aria-hidden="true" />
                {t(label)}
              </button>
            ))}
          </div>
        </SectionHeading>
        {directory.isPending && (
          <Loading>{t('storefront.loadingStorefronts')}</Loading>
        )}
        {directory.isError && (
          <ShopError
            error={directory.error}
            retry={() => void directory.refetch()}
          />
        )}
        {directory.isSuccess && (
          <div aria-live="polite">
            {shops.length === 0 ? (
              <p className="landing-shop-empty" role="status">
                {t(
                  filter === 'favorites'
                    ? 'landing.noFavoriteShops'
                    : filter === 'open'
                      ? 'landing.noOpenShops'
                      : 'storefront.noPublishedStoresYet',
                )}
              </p>
            ) : (
              <ul
                className="landing-shops"
                aria-label={t('landing.recommendedTitle')}
              >
                {shops.map((shop) => {
                  const favorite = saved.isFavorite(shop.slug);
                  const type = normalizeBusinessType(shop.business_type);
                  return (
                    <li key={shop.slug}>
                      <article className="landing-shop">
                        <div className="landing-shop-art">
                          <img
                            src={storefrontPhoto(type)}
                            alt=""
                            loading="lazy"
                          />
                          <span
                            className={
                              shop.accepting_orders
                                ? 'landing-shop-badge is-open'
                                : 'landing-shop-badge'
                            }
                          >
                            {t(
                              shop.accepting_orders
                                ? 'landing.openNow'
                                : 'landing.closedNow',
                            )}
                          </span>
                          <button
                            type="button"
                            className="landing-shop-favorite"
                            aria-label={t('landing.favorite', {
                              name: shop.name,
                            })}
                            aria-pressed={favorite}
                            onClick={() => saved.toggle(shop.slug)}
                          >
                            <Heart
                              size={18}
                              aria-hidden="true"
                              fill={favorite ? 'currentColor' : 'none'}
                            />
                          </button>
                        </div>
                        <div className="landing-shop-body">
                          <div className="landing-shop-title">
                            <h3>
                              <Link
                                to={
                                  paths.shop +
                                  '/' +
                                  encodeURIComponent(shop.slug)
                                }
                              >
                                {shop.name}
                              </Link>
                            </h3>
                            {type && (
                              <span>{businessTypeLabel(type, language)}</span>
                            )}
                          </div>
                          <p className="landing-shop-meta">
                            <Store size={14} aria-hidden="true" />
                            {t('landing.onlineStorefront')}
                          </p>
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

function LandingNavigation({
  t,
  loading,
  authenticated,
  compactLanguage = false,
}: {
  t: Translate;
  loading: boolean;
  authenticated: boolean;
  compactLanguage?: boolean;
}) {
  const close = (event: MouseEvent<HTMLElement>) =>
    event.currentTarget.closest('details')?.removeAttribute('open');
  return (
    <nav
      className="landing-navigation"
      aria-label={t('landing.homeNavigation')}
    >
      <div className="landing-nav-links">
        <Link className="landing-nav-link is-active" to="/" aria-current="page">
          <House size={17} aria-hidden="true" />
          {t('landing.navHome')}
        </Link>
        <Link className="landing-nav-link" to={paths.shop}>
          <Search size={17} aria-hidden="true" />
          {t('landing.navExplore')}
        </Link>
        <a className="landing-nav-link" href="#landing-areas" onClick={close}>
          <MapPin size={17} aria-hidden="true" />
          {t('landing.navAreas')}
        </a>
        <a
          className="landing-nav-link"
          href="#landing-categories"
          onClick={close}
        >
          <UtensilsCrossed size={17} aria-hidden="true" />
          {t('landing.navCategories')}
        </a>
      </div>
      <div className="landing-nav-actions">
        {compactLanguage ? (
          <div className="landing-menu-language">
            <LanguageSwitcher />
          </div>
        ) : (
          <LanguageSwitcher />
        )}
        <a className="landing-nav-link" href="#for-merchants" onClick={close}>
          <Store size={17} aria-hidden="true" />
          {t('landing.forMerchants')}
        </a>
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
      </div>
    </nav>
  );
}

function LandingFooter({ t }: { t: Translate }) {
  const { language, setLanguage } = useLanguage();
  const columns: {
    title: TranslationKey;
    links: [TranslationKey, string][];
  }[] = [
    {
      title: 'landing.footerMain',
      links: [
        ['landing.navHome', '/'],
        ['landing.navExplore', paths.shop],
        ['landing.navAreas', '#landing-areas'],
        ['landing.navCategories', '#landing-categories'],
      ],
    },
    {
      title: 'landing.footerMerchants',
      links: [
        ['landing.footerRegister', paths.register],
        ['landing.footerMerchantGuide', paths.help],
        ['landing.footerPricing', paths.help],
      ],
    },
    {
      title: 'landing.footerSupport',
      links: [
        ['landing.footerFaq', paths.help],
        ['landing.footerContact', paths.help],
        ['landing.footerReport', paths.help],
      ],
    },
    {
      title: 'landing.footerTerms',
      links: [
        ['landing.footerTermsOfUse', paths.help],
        ['landing.footerPrivacy', paths.help],
        ['landing.footerCookies', paths.help],
      ],
    },
  ];
  return (
    <footer className="landing-footer">
      <div className="landing-container">
        <nav
          className="landing-footer-grid"
          aria-label={t('landing.footerLinks')}
        >
          <div className="landing-footer-about">
            <h2>{t('landing.footerAbout')}</h2>
            <p>{t('landing.footerAboutDescription')}</p>
          </div>
          {columns.map(({ title, links }) => (
            <div key={title}>
              <h2>{t(title)}</h2>
              <ul>
                {links.map(([label, to]) => (
                  <li key={label}>
                    {to.startsWith('#') ? (
                      <a href={to}>{t(label)}</a>
                    ) : (
                      <Link to={to}>{t(label)}</Link>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="landing-footer-social">
            <h2>{t('landing.footerSocial')}</h2>
            <ul>
              <li>
                <Link to={paths.help} aria-label={t('landing.footerContact')}>
                  <MessageCircle size={18} aria-hidden="true" />
                </Link>
              </li>
              <li>
                <Link to={paths.help} aria-label={t('landing.help')}>
                  <Globe size={18} aria-hidden="true" />
                </Link>
              </li>
              <li>
                <Link to={paths.shop} aria-label={t('landing.navExplore')}>
                  <ShoppingCart size={18} aria-hidden="true" />
                </Link>
              </li>
            </ul>
          </div>
        </nav>
        <div className="landing-footer-bottom">
          <small>
            © {new Date().getFullYear()} VELOPOS. {t('landing.footerRights')}
          </small>
          <a
            className="landing-photo-credits"
            href="/images/home/photo-credits.html"
          >
            {t('landing.photoCredits')}
          </a>
          <label className="landing-footer-language">
            <Globe size={15} aria-hidden="true" />
            <span className="sr-only">{t('common.language')}</span>
            <select
              value={language}
              onChange={(event) =>
                setLanguage(event.target.value === 'en' ? 'en' : 'th')
              }
            >
              <option value="th">ภาษาไทย</option>
              <option value="en">English</option>
            </select>
            <ChevronDown size={14} aria-hidden="true" />
          </label>
        </div>
      </div>
    </footer>
  );
}
