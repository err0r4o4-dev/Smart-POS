package customers

import (
	"net/url"
	"testing"
)

func TestNormalizeOptionalCustomer(t *testing.T) {
	input := Input{Code: " c-01 ", Name: "  สมชาย  ", Phone: "+66 (81) 234-5678", Email: " TEST@Example.COM "}
	if err := input.normalize(); err != nil || input.Code != "C-01" || input.Name != "สมชาย" || input.Phone != "+66812345678" || input.Email != "test@example.com" || input.MarketingConsent {
		t.Fatalf("normalization failed: %v", err)
	}
	if err := (&Input{Code: "WALKIN-RECORD"}).normalize(); err != nil {
		t.Fatal("all personal fields must be optional", err)
	}
}

func TestRejectCustomerInput(t *testing.T) {
	for _, input := range []Input{{Code: "BAD CODE"}, {Code: "OK", Phone: "not a phone"}, {Code: "OK", Email: "Name <a@b.com>"}, {Code: "OK", Name: "bad\nname"}, {Code: "OK", Notes: "bad\x00notes"}, {Code: "OK", Status: "DELETED"}} {
		if input.normalize() == nil {
			t.Fatal("unsafe input accepted")
		}
	}
}

func TestBoundedCustomerFilters(t *testing.T) {
	for _, values := range []url.Values{{"page_size": {"101"}}, {"page": {"0"}}, {"group_id": {"other"}}, {"status": {"DELETED"}}, {"from": {"yesterday"}}, {"from": {"2026-10-11T00:00:00Z"}, "to": {"2026-10-10T00:00:00Z"}}} {
		if _, err := filter(values); err == nil {
			t.Fatal("unbounded or invalid filter accepted")
		}
	}
	value, err := filter(url.Values{})
	if err != nil || value.Page != 1 || value.PageSize != 25 {
		t.Fatal("bad default pagination")
	}
}

func TestMaskCustomer(t *testing.T) {
	value := Customer{Input: Input{Code: "C1", Name: "Example", Phone: "+66812345678", Email: "private@example.com", Notes: "private note", MarketingConsent: true}}
	value.mask()
	if value.Phone != "••••5678" || value.Email != "••••" || value.Notes != "" || value.MarketingConsent {
		t.Fatal("cashier projection leaks personal data")
	}
}
