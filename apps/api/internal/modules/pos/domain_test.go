package pos

import (
	"net/url"
	"testing"
)

func TestExactMoney(t *testing.T) {
	for _, test := range []struct {
		price, quantity string
		expected        int64
	}{{"0.10", "3", 30}, {"19.99", "1.125", 2249}, {"0.01", "0.500", 1}, {"100.00", "0.001", 10}, {"9999999999999999.99", "0.001", 1000000000000000}} {
		result, err := lineTotal(test.price, test.quantity)
		if err != nil || result != test.expected {
			t.Fatalf("%s * %s: %d %v", test.price, test.quantity, result, err)
		}
	}
	for _, input := range []string{"-1", "1.001", "1e2", "NaN", "1,000", " 1", "10000000000000000", ""} {
		if _, err := scaled(input, 2); err == nil {
			t.Fatalf("accepted invalid money %q", input)
		}
	}
	if _, err := lineTotal("9999999999999999.99", "999999999999999.999"); err == nil {
		t.Fatal("overflow accepted")
	}
}
func TestPaymentPolicy(t *testing.T) {
	change, err := payment("CASH", "61.00", "100.00")
	if err != nil || change != "39.00" {
		t.Fatal(change, err)
	}
	for _, method := range []string{"QR_MANUAL", "BANK_TRANSFER_MANUAL"} {
		if _, err := payment(method, "61.00", "100.00"); err == nil {
			t.Fatal("noncash change accepted")
		}
		if _, err := payment(method, "61.00", "61.00"); err != nil {
			t.Fatal(err)
		}
	}
	for _, method := range []string{"QR", "CARD", ""} {
		if _, err := payment(method, "61.00", "61.00"); err == nil {
			t.Fatal("unknown method")
		}
	}
	if _, err := payment("CASH", "61.00", "60.99"); err == nil {
		t.Fatal("underpayment")
	}
}
func TestCartValidation(t *testing.T) {
	item := ItemInput{VariantID: "00000000-0000-4000-8000-000000000001", Quantity: "1.125"}
	if validateItems([]ItemInput{item}) != nil {
		t.Fatal("valid cart")
	}
	if validateItems([]ItemInput{item, item}) == nil {
		t.Fatal("duplicate variant")
	}
	item.Quantity = "0"
	if validateItems([]ItemInput{item}) == nil {
		t.Fatal("zero")
	}
}
func TestFilters(t *testing.T) {
	for _, query := range []string{"page=0", "page_size=101", "branch_id=invalid", "from=yesterday"} {
		values, _ := url.ParseQuery(query)
		if _, err := filter(values); err == nil {
			t.Fatalf("accepted %s", query)
		}
	}
}
