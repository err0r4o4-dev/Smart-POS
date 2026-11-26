import { useEffect, useRef, useState } from 'react';
import { Minus, PackageOpen, Plus, ShoppingCart, X } from 'lucide-react';
import { useLanguage } from '../../app/language';
import { moneyText } from '../../lib/pos-api';
import type { ShopProduct } from '../../lib/storefront-api';
import { quantityText, useProductQuantity } from './use-product-quantity';

type Props = {
  product: ShopProduct | null;
  cartQuantity: string;
  disabled: boolean;
  onAdd: (quantity: string) => void;
  onClose: () => void;
};

export function MenuItemDialog(props: Props) {
  if (!props.product) return null;
  // Remount per product so quantity state never leaks between items.
  return (
    <OpenMenuItemDialog
      key={props.product.variant_id}
      {...props}
      product={props.product}
    />
  );
}

function OpenMenuItemDialog({
  product,
  cartQuantity,
  disabled,
  onAdd,
  onClose,
}: Props & { product: ShopProduct }) {
  const { t } = useLanguage();
  const dialog = useRef<HTMLDialogElement>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const {
    quantity,
    setQuantity,
    units,
    step,
    whole,
    remaining,
    valid,
    ready,
    menuOnly,
  } = useProductQuantity(product, cartQuantity);
  const titleId = `menu-item-${product.variant_id}`;
  const inputId = `${titleId}-quantity`;
  const errorId = `${titleId}-error`;
  const blocked = disabled || !ready || product.is_sold_out === true;

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (!element.open) element.showModal();
    const closed = () => onClose();
    element.addEventListener('close', closed);
    return () => element.removeEventListener('close', closed);
  }, [onClose]);

  const close = () => {
    if (dialog.current?.open) dialog.current.close();
    else onClose();
  };

  return (
    <dialog
      ref={dialog}
      className="customer-menu-dialog"
      aria-labelledby={titleId}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself.
        if (event.target === event.currentTarget) close();
      }}
    >
      <div className="customer-menu-dialog-body">
        <button
          type="button"
          className="customer-menu-close"
          aria-label={t('storefront.customer.menuClose')}
          onClick={close}
        >
          <X size={20} aria-hidden="true" />
        </button>
        <div className="customer-menu-media">
          {product.image_url && !imageFailed ? (
            <img
              src={product.image_url}
              alt={product.product_name}
              referrerPolicy="no-referrer"
              onError={() => setImageFailed(true)}
            />
          ) : (
            <div className="catalog-product-placeholder">
              <PackageOpen size={48} strokeWidth={1.2} aria-hidden="true" />
              <span>{t('catalog.noProductImageYet')}</span>
            </div>
          )}
        </div>
        <div className="customer-menu-info">
          {product.category_name && (
            <span className="customer-menu-category">
              {product.category_name}
            </span>
          )}
          <h2 id={titleId}>{product.product_name}</h2>
          <p className="customer-menu-variant">{product.variant_name}</p>
          <strong className="customer-menu-price">
            ฿{moneyText(product.unit_price)}
          </strong>
          {product.is_sold_out ? (
            <p className="customer-menu-state">{t('storefront.soldOut')}</p>
          ) : (
            !ready && (
              <p className="customer-menu-state">
                {t('storefront.productUnavailableForSale')}
              </p>
            )
          )}
          <div className="customer-menu-actions">
            <div className="catalog-quantity">
              <button
                type="button"
                className="button"
                aria-label={t('storefront.decreaseQuantityForValue0', {
                  value0: product.product_name,
                })}
                disabled={blocked || units === null || units <= step}
                onClick={() => {
                  if (units !== null) setQuantity(quantityText(units - step));
                }}
              >
                <Minus size={15} aria-hidden="true" />
              </button>
              <label className="sr-only" htmlFor={inputId}>
                {t('pos.quantity')} {product.product_name}
              </label>
              <input
                id={inputId}
                type="number"
                inputMode={whole ? 'numeric' : 'decimal'}
                min={quantityText(step)}
                max={quantityText(remaining > 0n ? remaining : 0n)}
                step={quantityText(step)}
                value={quantity}
                disabled={blocked || remaining < step}
                aria-invalid={!valid && ready && remaining >= step}
                aria-describedby={
                  !valid && ready && remaining >= step ? errorId : undefined
                }
                onChange={(event) => setQuantity(event.target.value)}
              />
              <button
                type="button"
                className="button"
                aria-label={t('storefront.increaseQuantityForValue02', {
                  value0: product.product_name,
                })}
                disabled={blocked || units === null || units + step > remaining}
                onClick={() => {
                  if (units !== null) setQuantity(quantityText(units + step));
                }}
              >
                <Plus size={15} aria-hidden="true" />
              </button>
            </div>
            <button
              type="button"
              className="button customer-menu-add"
              disabled={blocked || !valid}
              onClick={() => {
                onAdd(quantity);
                close();
              }}
            >
              <ShoppingCart size={18} aria-hidden="true" />
              {t('storefront.addToCart')}
            </button>
          </div>
          {!valid && ready && remaining >= step && (
            <small id={errorId} className="catalog-quantity-error">
              {t('storefront.enterQuantity')}
              {whole ? t('storefront.whole') : ''}
              {t('storefront.greaterThan0AndNoMoreThan')}{' '}
              {quantityText(remaining)} {product.unit}
            </small>
          )}
          {ready && remaining < step && !menuOnly && (
            <small className="catalog-cart-limit">
              {t('storefront.allAvailableQuantityIsAlreadyInYour')}
            </small>
          )}
        </div>
      </div>
    </dialog>
  );
}
