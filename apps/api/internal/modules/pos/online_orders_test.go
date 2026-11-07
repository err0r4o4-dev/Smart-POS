package pos

import "testing"

func TestEstimateOnlineLineUsesExactPOSRounding(t *testing.T) {
	for _, sample := range []struct {
		price, quantity, unit string
		want                  int64
	}{{"0.01", "0.500", "WEIGHT", 1}, {"19.99", "3.000", "COUNT", 5997}, {"12.34", "1.125", "WEIGHT", 1388}, {"0.01", "0.001", "WEIGHT", 0}} {
		actual, err := EstimateOnlineLine(sample.price, sample.quantity, sample.unit)
		if err != nil || actual != sample.want {
			t.Fatalf("%+v: %d %v", sample, actual, err)
		}
	}
	for _, sample := range []struct{ price, quantity, unit string }{{"0.00", "1", "COUNT"}, {"1", "0", "COUNT"}, {"1", "1.1", "COUNT"}, {"1", "-1", "WEIGHT"}, {"1", "1.0001", "WEIGHT"}, {"9999999999999999.99", "999999999999999.999", "WEIGHT"}} {
		if _, err := EstimateOnlineLine(sample.price, sample.quantity, sample.unit); err == nil {
			t.Fatalf("invalid line accepted: %+v", sample)
		}
	}
}

func TestPrepaidOnlineOrderDeliveryFeeMath(t *testing.T) {
	for _, tc := range []struct {
		cartTotal, shippingFee, expectedTotal string
		match                                 bool
	}{
		{"100.00", "0.00", "100.00", true},
		{"100.00", "30.00", "130.00", true},
		{"10.50", "25.00", "35.50", true},
		{"100.00", "30.00", "100.00", false},
		{"100.00", "0.00", "130.00", false},
	} {
		cartScaled, err1 := scaled(tc.cartTotal, 2)
		shippingScaled, err2 := scaled(tc.shippingFee, 2)
		expectedScaled, err3 := scaled(tc.expectedTotal, 2)
		if err1 != nil || err2 != nil || err3 != nil {
			t.Fatalf("unexpected scaling error: %v %v %v", err1, err2, err3)
		}
		matches := (cartScaled+shippingScaled == expectedScaled)
		if matches != tc.match {
			t.Fatalf("expected match=%v for cart=%s, ship=%s, total=%s", tc.match, tc.cartTotal, tc.shippingFee, tc.expectedTotal)
		}
	}
}
