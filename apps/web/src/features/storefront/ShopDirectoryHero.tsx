import { ArrowDown, ArrowRight, Flame, MapPin, Search } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLanguage } from '../../app/language';
import { paths } from '../../app/routes';
import '../landing/landing.css';
import './shop-discovery.css';

export function ShopDirectoryHero({
  suggestions = [],
}: {
  suggestions?: readonly string[];
}) {
  const { t } = useLanguage();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';

  function search(value: string, resetFilters = false) {
    const next = new URLSearchParams(params);
    next.delete('type');
    if (value) next.set('q', value);
    else next.delete('q');
    next.delete('page');
    if (resetFilters) {
      next.delete('filter');
      next.delete('category');
      next.delete('sort');
    }
    if (next.toString() !== params.toString()) {
      setParams(next, { replace: true, preventScrollReset: true });
    }
  }

  function showResults() {
    document.getElementById('storefront-results')?.focus();
  }

  return (
    <div className="landing-page shop-discovery-hero">
      <section className="landing-hero" aria-labelledby="shop-discovery-title">
        <div className="landing-hero-art" aria-hidden="true">
          <img
            src="/images/home/reference/hero-meal.webp"
            alt=""
            width="807"
            height="238"
            fetchPriority="high"
          />
        </div>
        <div className="landing-container landing-hero-inner">
          <div className="landing-hero-copy">
            <Link className="landing-hero-badge" to={paths.areas}>
              <MapPin size={15} aria-hidden="true" />
              {t('landing.heroBadge')}
              <ArrowRight size={13} aria-hidden="true" />
              <span className="sr-only">{t('landing.changeArea')}</span>
            </Link>
            <h1 id="shop-discovery-title">
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
              onSubmit={(event) => {
                event.preventDefault();
                if (query !== query.trim()) search(query.trim());
                showResults();
              }}
            >
              <Search size={20} aria-hidden="true" />
              <input
                type="search"
                aria-label={t('storefront.searchStores')}
                placeholder={t('storefront.customer.searchByName')}
                value={query}
                onChange={(event) => search(event.target.value)}
              />
              <button className="button" type="submit">
                {t('landing.search')}
                <ArrowRight size={17} aria-hidden="true" />
              </button>
            </form>
            {suggestions.length > 0 && (
              <div className="landing-popular">
                <span>
                  <Flame size={15} aria-hidden="true" />
                  {t('landing.trySearching')}
                </span>
                <ul>
                  {suggestions.map((name) => (
                    <li key={name}>
                      <button
                        type="button"
                        onClick={() => {
                          search(name);
                          showResults();
                        }}
                      >
                        {name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <button
              type="button"
              className="button button-secondary landing-browse-link"
              onClick={() => {
                if (query || params.size) search('', true);
                showResults();
              }}
            >
              {t('landing.viewAllShops')}
              <ArrowDown size={17} aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
