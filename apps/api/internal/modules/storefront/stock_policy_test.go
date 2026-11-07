package storefront

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestMenuOnlyProductAvailabilityContract(t *testing.T) {
	var product Product
	if err := json.Unmarshal([]byte(`{"stock_policy":"MENU_ONLY","available":null}`), &product); err != nil {
		t.Fatal(err)
	}
	encoded, err := json.Marshal(product)
	if err != nil {
		t.Fatal(err)
	}
	var result map[string]any
	if err = json.Unmarshal(encoded, &result); err != nil {
		t.Fatal(err)
	}
	if result["stock_policy"] != "MENU_ONLY" || result["available"] != nil {
		t.Fatalf("menu-only product contract: %s", encoded)
	}
}

func TestOrderInputRejectsClientStockPolicy(t *testing.T) {
	called := false
	handler := writeEndpoint(201, func(_ context.Context, _, _ string, _ *http.Request, _ OrderInput) (any, error) {
		called = true
		return nil, nil
	})
	request := httptest.NewRequest("POST", "/", strings.NewReader(`{"stock_policy":"TRACKED"}`))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusBadRequest || called {
		t.Fatalf("client policy accepted: %d called=%v", response.Code, called)
	}
}
