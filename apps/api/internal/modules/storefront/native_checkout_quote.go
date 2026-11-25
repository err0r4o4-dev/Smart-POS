package storefront

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/pricing"
	"smartpos/api/internal/modules/restaurant"
)

type nativeCheckoutQuote struct {
	Menu           nativeMenuQuote
	Mode           string
	DeliveryFee    string
	Total          string
	ConfirmationID string
}

type nativeCheckoutDelivery struct {
	origin, destination *nativeDeliveryPoint
	radiusMeters        int64
	fee                 string
}

// The caller must hold the scoped restaurant lock, authenticate the cart,
// establish selling eligibility, and supply server settings and a confirmed
// delivery point. Committed replays do not enter this new-checkout path.
func checkNativeCheckoutAdmission(ctx context.Context, tx pgx.Tx, org string, items []nativeMenuLineInput, mode, confirmed string, canSell bool, at time.Time, delivery *nativeCheckoutDelivery) (nativeCheckoutQuote, error) {
	// Dine-in requires scoped session proof, which this path cannot validate yet.
	if mode == "DINE_IN" {
		return nativeCheckoutQuote{}, ErrNotFound
	}
	denial, err := restaurant.CheckLockedOrderAdmission(ctx, tx, org, mode, canSell, at)
	if err != nil {
		return nativeCheckoutQuote{}, err
	}
	if denial != "" {
		return nativeCheckoutQuote{}, ErrClosed
	}
	var fee string
	if mode == "DELIVERY" {
		if delivery == nil {
			return nativeCheckoutQuote{}, ErrInput
		}
		if err := checkNativeDeliveryArea(delivery.origin, delivery.destination, delivery.radiusMeters); err != nil {
			return nativeCheckoutQuote{}, err
		}
		fee = delivery.fee
	}
	return revalidateNativeCheckoutQuote(ctx, tx, org, items, mode, fee, confirmed)
}

// configuredDeliveryFee is loaded by the caller from server settings
// in the same transaction as the menu, never from the customer request.
func priceNativeCheckout(menu nativeMenuQuote, mode, configuredDeliveryFee string) (nativeCheckoutQuote, error) {
	var fee int64
	switch mode {
	case "DINE_IN", "TAKEAWAY", "PICKUP":
	case "DELIVERY":
		var err error
		fee, err = pricing.Decimal(configuredDeliveryFee, 2)
		if err != nil {
			return nativeCheckoutQuote{}, ErrInput
		}
	default:
		return nativeCheckoutQuote{}, ErrInput
	}
	subtotal, err := pricing.Decimal(menu.Subtotal, 2)
	if err != nil || subtotal <= 0 || fee > pricing.Maximum-subtotal || menu.ConfirmationID == "" {
		return nativeCheckoutQuote{}, ErrInput
	}
	result := nativeCheckoutQuote{Menu: menu, Mode: mode, DeliveryFee: money(fee), Total: money(subtotal + fee)}
	result.ConfirmationID = digest(struct {
		Version, Menu, Mode, Fee, Total string
	}{"native-checkout-v1", menu.ConfirmationID, mode, result.DeliveryFee, result.Total})
	return result, nil
}

// revalidateNativeCheckoutQuote requires the organization lock. It compares
// prices only; the checkout caller must enforce authority and mode eligibility.
func revalidateNativeCheckoutQuote(ctx context.Context, tx pgx.Tx, org string, items []nativeMenuLineInput, mode, configuredDeliveryFee, confirmed string) (nativeCheckoutQuote, error) {
	if confirmed == "" {
		return nativeCheckoutQuote{}, ErrQuote
	}
	menu, err := quoteNativeMenu(ctx, tx, org, items)
	if errors.Is(err, ErrInput) || errors.Is(err, ErrNotFound) || errors.Is(err, ErrStock) || errors.Is(err, ErrQuote) {
		return nativeCheckoutQuote{}, ErrQuote
	}
	if err != nil {
		return nativeCheckoutQuote{}, err
	}
	current, err := priceNativeCheckout(menu, mode, configuredDeliveryFee)
	if err != nil {
		return nativeCheckoutQuote{}, err
	}
	if current.ConfirmationID != confirmed {
		return nativeCheckoutQuote{}, ErrQuote
	}
	return current, nil
}
