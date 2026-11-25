package storefront

import (
	"errors"
	"math"
	"testing"
)

func TestNativeDeliveryArea(t *testing.T) {
	restaurant := &nativeDeliveryPoint{latitude: 13, longitude: 100}
	for _, tc := range []struct {
		name        string
		origin, end *nativeDeliveryPoint
		meters      int64
		want        error
	}{
		{"within radius", restaurant, &nativeDeliveryPoint{13.009, 100}, 1001, nil},
		{"outside radius", restaurant, &nativeDeliveryPoint{13.009, 100}, 1000, errNativeDeliveryOutsideArea},
		{"missing restaurant location", nil, restaurant, 1000, ErrInput},
		{"missing destination", restaurant, nil, 1000, ErrInput},
		{"unconfigured radius", restaurant, restaurant, 0, ErrInput},
		{"non-finite destination", restaurant, &nativeDeliveryPoint{13, math.NaN()}, 1000, ErrInput},
		{"invalid origin", &nativeDeliveryPoint{91, 100}, restaurant, 1000, ErrInput},
		{"across date line", &nativeDeliveryPoint{0, 179.999}, &nativeDeliveryPoint{0, -179.999}, 250, nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if err := checkNativeDeliveryArea(tc.origin, tc.end, tc.meters); !errors.Is(err, tc.want) {
				t.Fatalf("checkNativeDeliveryArea() = %v; want %v", err, tc.want)
			}
		})
	}
}
