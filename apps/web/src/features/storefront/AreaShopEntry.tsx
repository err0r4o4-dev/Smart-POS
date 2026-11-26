import { useEffect, useState } from 'react';
import { skipToken, useQuery } from '@tanstack/react-query';
import { ArrowRight, MapPin, Store } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { useLanguage } from '../../app/language';
import { paths } from '../../app/routes';
import { Card, Loading, Tag } from '../../components/ui/primitives';
import { StandardPageHeader } from '../../components/ui/StandardPage';
import {
  organizationRequest,
  type Organization,
} from '../../lib/organization-api';
import {
  storefrontRequest,
  type ShopDirectoryEntry,
} from '../../lib/storefront-api';
import { ShopError } from './shop-feedback';

export function AreaShopEntry() {
  const { t } = useLanguage();
  const { state, refresh } = useAuth();
  const userID = state.session?.user.id;
  const owned = useQuery({
    queryKey: ['tenant', userID, 'store-exploration'],
    queryFn: ({ signal }) =>
      organizationRequest<Pick<Organization, 'id' | 'name'>[]>(
        '/organizations',
        { signal },
      ),
    enabled: !!userID,
    gcTime: 0,
    retry: false,
  });

  if (state.status === 'loading' || (userID && owned.isPending)) {
    return <Loading>{t('storefront.loadingStorefronts')}</Loading>;
  }
  if (state.status === 'error' || (userID && owned.isError)) {
    return (
      <Card className="storefront-status">
        <p role="alert">{t('storefront.areaLookupFailed')}</p>
        <button
          className="button"
          onClick={() => void (userID ? owned.refetch() : refresh())}
        >
          {t('common.retry')}
        </button>
      </Card>
    );
  }
  if (userID && owned.data?.length) {
    return (
      <section className="shop-directory-results">
        <StandardPageHeader
          icon={<Store size={24} />}
          title={t('storefront.ownedStores')}
          actions={
            <Link className="button" to={paths.workspace}>
              {t('landing.goToWorkspace')}
            </Link>
          }
        />
        <ul
          className="shop-directory-list"
          data-view="list"
          aria-label={t('storefront.ownedStores')}
        >
          {owned.data.map((shop) => (
            <li className="shop-directory-card" key={shop.id}>
              <div className="shop-directory-store-icon">
                <Store size={38} aria-hidden="true" />
              </div>
              <div className="shop-directory-store-copy">
                <h3>{shop.name}</h3>
              </div>
            </li>
          ))}
        </ul>
      </section>
    );
  }
  return <NearbyShops />;
}

type Position = { latitude: number; longitude: number };

function NearbyShops() {
  const { t } = useLanguage();
  const [attempt, setAttempt] = useState(0);
  const [position, setPosition] = useState<Position | null | undefined>(
    undefined,
  );

  useEffect(() => {
    let active = true;
    const start = window.setTimeout(() => {
      if (!navigator.geolocation) {
        setPosition(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        ({ coords: { latitude, longitude } }) => {
          if (active) setPosition({ latitude, longitude });
        },
        () => {
          if (active) setPosition(null);
        },
        { timeout: 10000, maximumAge: 60000 },
      );
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(start);
    };
  }, [attempt]);

  const nearby = useQuery({
    queryKey: ['storefront-nearby', position],
    queryFn: position
      ? ({ signal }) =>
          storefrontRequest<ShopDirectoryEntry[]>('/discovery/nearby', {
            body: position,
            signal,
          })
      : skipToken,
    gcTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  return (
    <section className="shop-directory-results">
      <StandardPageHeader
        icon={<MapPin size={24} />}
        title={t('storefront.nearbyStores')}
        description={t('storefront.nearbyRadius')}
        actions={
          <Link className="button secondary" to={paths.shop}>
            {t('landing.viewAllShops')}
          </Link>
        }
      />
      {(position === undefined || (position && nearby.isPending)) && (
        <Loading>{t('storefront.findingNearbyStores')}</Loading>
      )}
      {position === null && (
        <Card className="storefront-status">
          <p role="status">{t('storefront.locationUnavailable')}</p>
          <button
            className="button"
            onClick={() => {
              setPosition(undefined);
              setAttempt((value) => value + 1);
            }}
          >
            {t('common.retry')}
          </button>
        </Card>
      )}
      {nearby.error && (
        <ShopError error={nearby.error} retry={() => void nearby.refetch()} />
      )}
      {nearby.data?.length === 0 && (
        <Card className="storefront-status">
          <p>{t('storefront.noNearbyStores')}</p>
        </Card>
      )}
      {!!nearby.data?.length && (
        <ul
          className="shop-directory-list"
          data-view="list"
          aria-label={t('storefront.nearbyStores')}
        >
          {nearby.data.map((shop) => (
            <li className="shop-directory-card" key={shop.slug}>
              <div className="shop-directory-store-icon">
                <Store size={38} aria-hidden="true" />
              </div>
              <div className="shop-directory-store-copy">
                <h3>{shop.name}</h3>
                <Tag tone={shop.accepting_orders ? 'success' : 'neutral'}>
                  {t(
                    shop.accepting_orders
                      ? 'storefront.acceptingOrders'
                      : 'storefront.notAcceptingOrders',
                  )}
                </Tag>
              </div>
              <Link
                className="button"
                to={`${paths.shop}/${encodeURIComponent(shop.slug)}`}
              >
                {t('storefront.viewStore')}
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
