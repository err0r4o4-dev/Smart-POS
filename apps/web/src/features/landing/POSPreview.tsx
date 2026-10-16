import { useLanguage } from '../../app/language';
import { useEffect, useRef, type PointerEvent } from 'react';
import {
  ArrowRight,
  Barcode,
  Check,
  CheckCheck,
  ChevronRight,
  Coffee,
  Package,
  ReceiptText,
  ShoppingBag,
  ShoppingBasket,
} from 'lucide-react';

const products = [
  { icon: Coffee, name: 'landing.drinks', tone: 'yellow' },
  { icon: ShoppingBag, name: 'landing.dailyEssentials', tone: 'blue' },
  { icon: Package, name: 'landing.generalProducts', tone: 'pink' },
] as const;

export function POSPreview() {
  const { t } = useLanguage();

  const previewRef = useRef<HTMLElement>(null);

  function resetTilt() {
    previewRef.current?.style.removeProperty('--preview-rotate-x');
    previewRef.current?.style.removeProperty('--preview-rotate-y');
  }

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const capability = window.matchMedia(
      '(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine) and (min-width: 1024px)',
    );
    capability.addEventListener('change', resetTilt);
    return () => capability.removeEventListener('change', resetTilt);
  }, []);

  function tiltPreview(event: PointerEvent<HTMLElement>) {
    if (
      event.pointerType !== 'mouse' ||
      typeof window.matchMedia !== 'function' ||
      !window.matchMedia(
        '(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine) and (min-width: 1024px)',
      ).matches
    ) {
      resetTilt();
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const horizontal = Math.max(
      -1,
      Math.min(1, ((event.clientX - bounds.left) / bounds.width - 0.5) * 2),
    );
    const vertical = Math.max(
      -1,
      Math.min(1, ((event.clientY - bounds.top) / bounds.height - 0.5) * 2),
    );
    event.currentTarget.style.setProperty(
      '--preview-rotate-x',
      `${-vertical * 3}deg`,
    );
    event.currentTarget.style.setProperty(
      '--preview-rotate-y',
      `${horizontal * 3}deg`,
    );
  }

  return (
    <figure
      ref={previewRef}
      className="landing-preview"
      aria-labelledby="landing-preview-caption"
      onPointerMove={tiltPreview}
      onPointerLeave={resetTilt}
      onPointerCancel={resetTilt}
    >
      <div className="landing-preview-glow" aria-hidden="true" />
      <div className="landing-preview-orbits" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div
        className="landing-preview-float landing-preview-float-top"
        aria-hidden="true"
      >
        <Barcode size={25} strokeWidth={1.7} />
        <span className="landing-preview-label">
          {t('landing.everyStoreTaskInOnePlace')}
        </span>
      </div>
      <div className="landing-pos-window" aria-hidden="true">
        <div className="landing-pos-topbar">
          <span className="landing-pos-brand">
            <ShoppingBasket size={19} /> VELO POS
          </span>
          <span className="landing-pos-demo">{t('landing.demo')}</span>
        </div>
        <div className="landing-pos-content">
          <div className="landing-pos-products">
            <div className="landing-pos-heading">
              <span>{t('landing.yourProducts')}</span>
              <span>
                {t('landing.viewAll')} <ChevronRight size={12} />
              </span>
            </div>
            <div className="landing-pos-search">
              <Barcode size={14} /> {t('landing.findProductsOrScanABarcode')}
            </div>
            <div className="landing-pos-product-grid">
              {products.map(({ icon: Icon, name, tone }) => (
                <div className="landing-pos-product" key={name}>
                  <div
                    className={`landing-product-art landing-product-${tone}`}
                  >
                    <Icon size={36} strokeWidth={1.5} />
                  </div>
                  <span>{t(name)}</span>
                  <small>{t('landing.readyToSell')}</small>
                </div>
              ))}
            </div>
            <div className="landing-pos-stock">
              <span>
                <span className="landing-status-dot" />{' '}
                {t('landing.connectedStockManagement')}
              </span>
              <CheckCheck size={15} />
            </div>
          </div>
          <div className="landing-pos-cart">
            <span className="landing-pos-cart-title">
              <ReceiptText size={16} /> {t('landing.saleItems')}
            </span>
            {products.slice(0, 2).map(({ icon: Icon, name }) => (
              <div className="landing-pos-cart-row" key={name}>
                <span className="landing-cart-item">
                  <Icon size={18} />
                </span>
                <div>
                  <span>{t(name)}</span>
                  <span className="landing-skeleton" />
                </div>
                <span>×1</span>
              </div>
            ))}
            <div className="landing-cart-total">
              <span className="landing-skeleton" />
              <span className="landing-skeleton" />
            </div>
            <span className="landing-pos-checkout">
              {t('landing.readyForSales')} <ArrowRight size={14} />
            </span>
          </div>
        </div>
      </div>
      <div
        className="landing-preview-float landing-preview-float-bottom"
        aria-hidden="true"
      >
        <span className="landing-preview-check">
          <Check size={18} />
        </span>
        <div>
          <strong>{t('landing.everythingWorksTogether')}</strong>
          <span>{t('landing.productsStockSales')}</span>
        </div>
      </div>
      <figcaption id="landing-preview-caption">
        {t('landing.illustrativePosPreviewNotActualSalesData')}
      </figcaption>
    </figure>
  );
}
