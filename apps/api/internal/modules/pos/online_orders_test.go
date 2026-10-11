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
