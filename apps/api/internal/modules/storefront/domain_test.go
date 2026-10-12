package storefront

import (
	"smartpos/api/internal/modules/organization"
	"strings"
	"testing"
	"time"
)

func TestOrderInputValidation(t *testing.T) {
	valid := OrderInput{Items: []ItemInput{{VariantID: "11111111-1111-4111-8111-111111111111", Quantity: "1.000"}}, QuoteID: strings.Repeat("a", 64), AccessToken: strings.Repeat("b", 64), CustomerName: "  ลูกค้า  ", ContactPhone: " 081-234-5678 "}
	if err := valid.validate(); err != nil {
		t.Fatal(err)
	}
	if valid.CustomerName != "ลูกค้า" || valid.ContactPhone != "081-234-5678" {
		t.Fatal("contact must be normalized")
	}
	for name, change := range map[string]func(*OrderInput){
		"missing token":     func(input *OrderInput) { input.AccessToken = "" },
		"short token":       func(input *OrderInput) { input.AccessToken = "token" },
		"invalid phone":     func(input *OrderInput) { input.ContactPhone = "<script>" },
		"empty name":        func(input *OrderInput) { input.CustomerName = " " },
		"control character": func(input *OrderInput) { input.CustomerNote = "a\x00b" },
		"oversized note":    func(input *OrderInput) { input.CustomerNote = strings.Repeat("ก", 1001) },
		"empty cart":        func(input *OrderInput) { input.Items = nil },
		"duplicate variant": func(input *OrderInput) { input.Items = append(input.Items, input.Items[0]) },
		"invalid variant":   func(input *OrderInput) { input.Items = []ItemInput{{VariantID: "foreign", Quantity: "1"}} },
	} {
		t.Run(name, func(t *testing.T) {
			input := valid
			input.Items = append([]ItemInput{}, valid.Items...)
			change(&input)
			if input.validate() == nil {
				t.Fatal("invalid input accepted")
			}
		})
	}
}

func TestSeparateSourceInputAndTerminalSelection(t *testing.T) {
	front := "11111111-1111-4111-8111-111111111111"
	back := "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA"
	input := SettingsInput{Slug: "source-shop", Name: "Synthetic shop", TerminalID: front, OnlineTerminalID: back}
	if err := input.validate(); err != nil || input.OnlineTerminalID != strings.ToLower(back) {
		t.Fatalf("valid separate source: %+v error %v", input, err)
	}
	shop := Settings{TerminalID: front, OnlineTerminalID: input.OnlineTerminalID}
	if shop.orderTerminalID() != strings.ToLower(back) {
		t.Fatal("online terminal must override the front source")
	}
	shop.OnlineTerminalID = ""
	if shop.orderTerminalID() != front {
		t.Fatal("legacy shared-source configuration must be preserved")
	}
	for _, invalid := range []string{front, "not-a-terminal"} {
		input.OnlineTerminalID = invalid
		if input.validate() == nil {
			t.Fatalf("invalid separate source accepted: %s", invalid)
		}
	}
}
func TestSettingsValidation(t *testing.T) {
	input := SettingsInput{Slug: "test-shop", Name: "ร้านทดสอบ", TerminalID: "11111111-1111-4111-8111-111111111111"}
	if input.validate() != nil {
		t.Fatal("valid settings rejected")
	}
	for _, slug := range []string{"", "ab", "UPPERCASE", "shop--name", "shop-", "../shop", "ร้านค้า"} {
		next := input
		next.Slug = slug
		if next.validate() == nil {
			t.Fatalf("accepted slug %q", slug)
		}
	}
	input.AcceptingOrders = true
	if input.validate() == nil {
		t.Fatal("unpublished shop accepts orders")
	}
}
func TestOrderTransitionsNeverCreatePaidState(t *testing.T) {
	states := []string{"PENDING", "PREPARING", "READY", "COMPLETED", "CANCELLED", "REJECTED", "EXPIRED"}
	for _, current := range states {
		if canTransition(current, "COMPLETED") {
			t.Fatal("staff transition must not fabricate sale")
		}
	}
	for _, terminal := range states[3:] {
		for _, next := range states {
			if canTransition(terminal, next) {
				t.Fatalf("terminal %s allowed %s", terminal, next)
			}
		}
	}
	if !canTransition("PENDING", "PREPARING") || !canTransition("PREPARING", "READY") || canTransition("PENDING", "READY") {
		t.Fatal("preparation flow invalid")
	}
}
func TestOrderExpiryDoesNotDropLinkedPaymentWork(t *testing.T) {
	now := time.Now()
	cart := "11111111-1111-4111-8111-111111111111"
	if effectiveStatus("READY", now, nil, now) != "EXPIRED" {
		t.Fatal("expiry boundary not respected")
	}
	if effectiveStatus("READY", now.Add(-time.Hour), &cart, now) != "READY" {
		t.Fatal("linked cart must be reconciled")
	}
	if effectiveStatus("COMPLETED", now.Add(-time.Hour), nil, now) != "COMPLETED" {
		t.Fatal("completed history changed")
	}
}
func TestBranchAuthorization(t *testing.T) {
	if !branchAllowed(organization.Member{Role: "OWNER"}, "branch") {
		t.Fatal("owner denied")
	}
	actor := organization.Member{Role: "CASHIER", BranchIDs: []string{"assigned"}}
	if !branchAllowed(actor, "assigned") || branchAllowed(actor, "foreign") {
		t.Fatal("branch scope violated")
	}
}
func TestTrackingHashAndFingerprint(t *testing.T) {
	token := strings.Repeat("a", 64)
	if accessHash(token) == token || len(accessHash(token)) != 64 || accessHash(token) == accessHash(strings.Repeat("b", 64)) {
		t.Fatal("tracking token must be stored hashed")
	}
	if digest(OrderInput{CustomerName: "one"}) == digest(OrderInput{CustomerName: "two"}) {
		t.Fatal("request fingerprint does not bind contact")
	}
}
