package restaurant

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestSetupRoutesAreRegistered(t *testing.T) {
	router := chi.NewRouter()
	(Handler{Service: &Service{}}).TenantRoutes(router)
	seen := map[string]bool{}
	if err := chi.Walk(router, func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		seen[method+" "+route] = true
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	for _, route := range []string{
		"GET /restaurant/setup",
		"PUT /restaurant/setup/profile",
		"PUT /restaurant/setup/services",
		"PUT /restaurant/setup/tables",
		"PUT /restaurant/setup/menu",
		"PUT /restaurant/setup/payments",
		"PUT /restaurant/setup/orders",
		"POST /restaurant/setup/complete",
	} {
		if !seen[route] {
			t.Fatalf("missing route %s", route)
		}
	}
}

func TestSetupSixStepsAndExactAmounts(t *testing.T) {
	for i, key := range []string{"profile", "services", "tables", "menu", "payments", "orders"} {
		if got := setupStepKey(i + 1); got != key {
			t.Fatalf("step %d: %s", i+1, got)
		}
	}
	branch := "11111111-1111-4111-8111-111111111111"
	for _, tc := range []struct {
		rate  string
		valid bool
	}{{"100.00", true}, {"100.01", false}, {"1.001", false}, {"NaN", false}} {
		input := SetupOrdersInput{BranchID: branch, VATRate: tc.rate, ServiceChargeRate: "0"}
		if (input.Validate() == nil) != tc.valid {
			t.Errorf("rate %s", tc.rate)
		}
	}
	for _, tc := range []struct {
		price string
		valid bool
	}{{"1000.00", true}, {"0", false}, {"1.001", false}} {
		input := SetupMenuInput{BranchID: branch, Categories: []SetupCategoryInput{{Name: "Food"}}, Items: []SetupMenuItemInput{{Name: "Rice", Category: "Food", Price: tc.price}}}
		if (input.Validate() == nil) != tc.valid {
			t.Errorf("price %s", tc.price)
		}
	}
	if (SetupPaymentsInput{BranchID: branch, Cash: true, PromptPay: true}).Validate() == nil {
		t.Error("unconfigured PromptPay accepted")
	}
}

func TestSetupReadinessUsesLiveDataSeparatelyFromProgress(t *testing.T) {
	steps := map[int]bool{1: true, 2: true, 3: true, 4: true, 5: true, 6: true}
	state := SetupState{}
	applySetupReadiness(&state, steps, []bool{true, true, true, false, true, true})
	if state.Ready || state.CurrentStep != "menu" || state.Steps[3].Ready || !state.Steps[0].Ready {
		t.Fatalf("inactive menu accepted: %+v", state)
	}
	applySetupReadiness(&state, steps, []bool{true, false, true, true, true, true})
	if state.Ready || state.CurrentStep != "services" {
		t.Fatalf("disabled services accepted: %+v", state)
	}
	delete(steps, 6)
	applySetupReadiness(&state, steps, []bool{true, true, true, true, true, true})
	if !state.Ready || state.CurrentStep != "orders" || state.Steps[5].Complete {
		t.Fatalf("live readiness should be independent of progress: %+v", state)
	}
	steps[6] = true
	applySetupReadiness(&state, steps, []bool{true, true, true, true, true, true})
	if !state.Ready || state.CurrentStep != "review" {
		t.Fatalf("ready state rejected: %+v", state)
	}
}

func TestSetupPaymentsKeepMethodsDistinct(t *testing.T) {
	branch := "11111111-1111-4111-8111-111111111111"
	if err := (SetupPaymentsInput{BranchID: branch, BankTransfer: true}).Validate(); err != nil {
		t.Fatal(err)
	}
	if err := (SetupPaymentsInput{BranchID: branch, PromptPay: true}).Validate(); !errors.Is(err, ErrInput) {
		t.Fatalf("PromptPay: %v", err)
	}
	if err := (SetupPaymentsInput{BranchID: branch}).Validate(); !errors.Is(err, ErrInput) {
		t.Fatalf("no payment: %v", err)
	}
}

func TestSetupProfileInputValidation(t *testing.T) {
	valid := SetupProfileInput{
		BranchID:     "11111111-1111-4111-8111-111111111111",
		Name:         "ร้านกาแฟ",
		Code:         "REST_01",
		BusinessType: "RESTAURANT",
		ContactEmail: "owner@example.test",
		ServiceModes: ServiceModes{DineIn: true, Takeaway: true},
	}
	if err := valid.Validate(); err != nil {
		t.Fatalf("valid profile rejected: %v", err)
	}

	invalid := valid
	invalid.BranchID = "foreign-branch"
	if err := invalid.Validate(); !errors.Is(err, ErrInput) {
		t.Fatalf("invalid branch: got %v, want ErrInput", err)
	}
}

func TestSetupTablesRejectsDuplicateCodesAndInvalidBranch(t *testing.T) {
	input := SetupTablesInput{
		BranchID: "11111111-1111-4111-8111-111111111111",
		Zones:    []SetupZoneInput{{Code: "MAIN", Name: "Main"}},
		Tables: []SetupTableInput{
			{Code: "A1", Name: "Table 1", Seats: 2, ZoneCode: "MAIN"},
			{Code: "A1", Name: "Table 1 duplicate", Seats: 2, ZoneCode: "MAIN"},
		},
	}
	if err := input.Validate(); !errors.Is(err, ErrInput) {
		t.Fatalf("duplicate table code: got %v, want ErrInput", err)
	}
}

func TestSetupMutationRequiresIdempotencyKey(t *testing.T) {
	if err := validateSetupIdempotencyKey(""); !errors.Is(err, ErrInput) {
		t.Fatalf("empty key: got %v, want ErrInput", err)
	}
	if err := validateSetupIdempotencyKey("not-a-uuid"); !errors.Is(err, ErrInput) {
		t.Fatalf("malformed key: got %v, want ErrInput", err)
	}
	if err := validateSetupIdempotencyKey("11111111-1111-4111-8111-111111111111"); err != nil {
		t.Fatalf("valid key rejected: %v", err)
	}
}

func TestSetupPaymentsNeverAcceptCardActivation(t *testing.T) {
	input := SetupPaymentsInput{BranchID: "11111111-1111-4111-8111-111111111111", Cash: true, Card: true}
	if err := input.Validate(); !errors.Is(err, ErrInput) {
		t.Fatalf("card activation: got %v, want ErrInput", err)
	}
}

func TestSetupServiceDoesNotFabricateSuccessWithoutSchema(t *testing.T) {
	service := &Service{}
	_, err := service.Setup(nil, "user", "organization", "branch")
	if !errors.Is(err, ErrSetupUnavailable) {
		t.Fatalf("got %v, want ErrSetupUnavailable", err)
	}
}

func TestSetupMenuDefaultUnitIsTenantScopedAndIdempotent(t *testing.T) {
	if setupDefaultUnitCode != "EA" || setupDefaultUnitName != "ชิ้น" {
		t.Fatalf("unexpected default unit: %q/%q", setupDefaultUnitCode, setupDefaultUnitName)
	}
	if !strings.Contains(setupDefaultUnitInsertSQL, "organization_id") {
		t.Fatal("default unit insert lost tenant scope")
	}
	if !strings.Contains(setupDefaultUnitInsertSQL, "ON CONFLICT (organization_id,code) DO NOTHING") {
		t.Fatal("default unit insert is not idempotent")
	}
}

func TestSetupReadinessRequiresOperationalPrerequisites(t *testing.T) {
	steps := map[int]bool{1: true, 2: true, 3: true, 4: true, 5: true, 6: true}
	state := SetupState{}
	applySetupReadiness(&state, steps, []bool{true, true, true, true, true, true, false, false, false, false, false})
	if state.Ready {
		t.Fatal("missing operational prerequisites accepted")
	}
	for _, key := range []string{"pos_source", "storefront", "storefront_menu", "auto_confirm", "charges"} {
		found := false
		for _, item := range state.Readiness.Incomplete {
			if item.Key == key && item.Reason != "" {
				found = true
			}
		}
		if !found {
			t.Errorf("missing actionable readiness item %q", key)
		}
	}
}

func TestSetupReadinessRequiresStorefrontOnlyForQROrdering(t *testing.T) {
	steps := map[int]bool{1: true, 2: true, 3: true, 4: true, 5: true, 6: true}
	for _, tc := range []struct {
		name                       string
		qr, pos, shop, menu, ready bool
	}{
		{"staff only", false, true, false, false, true},
		{"staff without POS", false, false, false, false, false},
		{"QR without storefront", true, true, false, true, false},
		{"QR without saleable menu", true, true, true, false, false},
		{"QR with storefront and menu", true, true, true, true, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			state := SetupState{Orders: map[string]any{"qr_ordering": tc.qr}}
			applySetupReadiness(&state, steps, []bool{true, true, true, true, true, true, tc.pos, tc.shop, tc.menu, true, true})
			if state.Ready != tc.ready {
				t.Fatalf("ready=%v, incomplete=%+v", state.Ready, state.Readiness.Incomplete)
			}
		})
	}
}

func TestSetupQRGenerationRequiresTables(t *testing.T) {
	input := SetupTablesInput{BranchID: "11111111-1111-4111-8111-111111111111", GenerateQR: true}
	if err := input.Validate(); !errors.Is(err, ErrInput) {
		t.Fatalf("generation without tables: got %v, want ErrInput", err)
	}
}

func TestSetupReadStateOmitsBearerTokens(t *testing.T) {
	encoded, err := json.Marshal(SetupState{OrganizationID: "org", BranchID: "branch"})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(encoded), "qr_token") || strings.Contains(string(encoded), "issued_table_qr_tokens") {
		t.Fatalf("setup read state leaked QR bearer: %s", encoded)
	}
}

func TestSetupMenuDTOPreservesCatalogIdentity(t *testing.T) {
	input := SetupMenuInput{
		BranchID:   "11111111-1111-4111-8111-111111111111",
		Categories: []SetupCategoryInput{{ID: "22222222-2222-4222-8222-222222222222", Name: "Food"}},
		Items:      []SetupMenuItemInput{{ProductID: "33333333-3333-4333-8333-333333333333", VariantID: "44444444-4444-4444-8444-444444444444", CategoryID: "22222222-2222-4222-8222-222222222222", SKU: "LEGACY-1", Category: "Food", Name: "Rice", Price: "10.00"}},
	}
	encoded, err := json.Marshal(input)
	if err != nil {
		t.Fatal(err)
	}
	var decoded SetupMenuInput
	if err = json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded.Categories[0].ID == "" || decoded.Items[0].ProductID == "" || decoded.Items[0].VariantID == "" || decoded.Items[0].CategoryID == "" || decoded.Items[0].SKU == "" {
		t.Fatalf("catalog identity was not preserved: %+v", decoded)
	}
}

func TestSetupMenuUnitUsesCanonicalCountEA(t *testing.T) {
	if !strings.Contains(setupMenuUnitLookupSQL, "code=$2") || !strings.Contains(setupMenuUnitLookupSQL, "unit_type='COUNT'") || strings.Contains(setupMenuUnitLookupSQL, "ORDER BY") {
		t.Fatalf("unit lookup is not canonical and tenant scoped: %s", setupMenuUnitLookupSQL)
	}
}

func TestSetupProfileReadinessRequiresRestaurantProfile(t *testing.T) {
	valid := map[string]any{
		"organization": map[string]any{"name": "Cafe", "code": "CAFE", "business_type": "RESTAURANT"},
		"branch":       map[string]any{"name": "Main", "code": "MAIN"},
	}
	if !setupProfileReady(valid) {
		t.Fatal("complete restaurant profile rejected")
	}
	for name, profile := range map[string]any{
		"wrong business":            map[string]any{"organization": map[string]any{"name": "Cafe", "code": "CAFE", "business_type": "RETAIL"}, "branch": map[string]any{"name": "Main", "code": "MAIN"}},
		"missing organization name": map[string]any{"organization": map[string]any{"name": "", "code": "CAFE", "business_type": "RESTAURANT"}, "branch": map[string]any{"name": "Main", "code": "MAIN"}},
		"missing branch code":       map[string]any{"organization": map[string]any{"name": "Cafe", "code": "CAFE", "business_type": "RESTAURANT"}, "branch": map[string]any{"name": "Main", "code": ""}},
	} {
		t.Run(name, func(t *testing.T) {
			if setupProfileReady(profile) {
				t.Fatal("incomplete profile reported ready")
			}
		})
	}
}

func TestSetupCompletionRequiresOneProgressRow(t *testing.T) {
	if err := completeSetupProgressResult(0); !errors.Is(err, ErrConflict) {
		t.Fatalf("zero rows: got %v", err)
	}
	if err := completeSetupProgressResult(1); err != nil {
		t.Fatalf("one row: %v", err)
	}
	if err := completeSetupProgressResult(2); !errors.Is(err, ErrConflict) {
		t.Fatalf("multiple rows: got %v", err)
	}
}
