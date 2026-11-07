package pos

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestMenuOnlyItemAvailabilityContract(t *testing.T) {
	var item CartItem
	if err := json.Unmarshal([]byte(`{"stock_policy":"MENU_ONLY","available":null}`), &item); err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(item)
	if err != nil {
		t.Fatal(err)
	}
	var result map[string]any
	if err = json.Unmarshal(encoded, &result); err != nil {
		t.Fatal(err)
	}
	if result["stock_policy"] != "MENU_ONLY" || result["available"] != nil {
		t.Fatalf("menu-only item contract: %s", encoded)
	}
}

func TestHistoricalCheckoutItemAvailabilityStillDecodes(t *testing.T) {
	var item CartItem
	if err := json.Unmarshal([]byte(`{"available":"1.250","quantity":"1.000"}`), &item); err != nil {
		t.Fatal(err)
	}
	if item.Available == nil || *item.Available != "1.250" || item.StockPolicy != "" {
		t.Fatalf("legacy checkout item: %+v", item)
	}
}

func TestCartInputRejectsClientStockPolicy(t *testing.T) {
	called := false
	handler := writeEndpoint(200, func(_ context.Context, _, _ string, _ *http.Request, _ CartInput) (any, error) {
		called = true
		return nil, nil
	})
	request := httptest.NewRequest("POST", "/", strings.NewReader(`{"terminal_id":"x","stock_policy":"TRACKED"}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest || called {
		t.Fatalf("client policy accepted: %d called=%v", response.Code, called)
	}
}
