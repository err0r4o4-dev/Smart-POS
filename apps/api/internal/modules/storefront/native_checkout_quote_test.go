package storefront

import (
	"errors"
	"testing"
)

func TestNativeCheckoutConfirmationBindsModeAndFinalTotal(t *testing.T) {
	menu := nativeMenuQuote{Subtotal: "279.95", ConfirmationID: "menu-projection"}
	pickup, err := priceNativeCheckout(menu, "PICKUP", "15.25")
	if err != nil || pickup.Total != "279.95" || pickup.DeliveryFee != "0.00" {
		t.Fatalf("pickup: %+v, %v", pickup, err)
	}
	delivery, err := priceNativeCheckout(menu, "DELIVERY", "15.25")
	if err != nil || delivery.Total != "295.20" || delivery.DeliveryFee != "15.25" || delivery.ConfirmationID == pickup.ConfirmationID {
		t.Fatalf("delivery: %+v, %v", delivery, err)
	}
	takeaway, err := priceNativeCheckout(menu, "TAKEAWAY", "15.25")
	if err != nil || takeaway.ConfirmationID == pickup.ConfirmationID {
		t.Fatalf("same total in a different mode: %+v, %v", takeaway, err)
	}
	free, err := priceNativeCheckout(menu, "DELIVERY", "0")
	if err != nil || free.Total != pickup.Total || free.ConfirmationID == pickup.ConfirmationID || free.ConfirmationID == delivery.ConfirmationID {
		t.Fatalf("free delivery: %+v, %v", free, err)
	}
	if _, err = priceNativeCheckout(menu, "DELIVERY", "15.251"); !errors.Is(err, ErrInput) {
		t.Fatalf("fractional minor unit: %v", err)
	}
	if _, err = priceNativeCheckout(menu, "", "0"); !errors.Is(err, ErrInput) {
		t.Fatalf("missing mode: %v", err)
	}
}
