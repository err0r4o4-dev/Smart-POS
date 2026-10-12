package storefront

import (
	"encoding/json"
	"errors"
	"net/http/httptest"
	"testing"
)

func TestCatalogQueryFilters(test *testing.T) {
	valid := []string{"", "search=coffee&page=2", "category_id=22222222-2222-4222-8222-222222222222&min_price=0&max_price=99.99&availability=available&sort=price_asc", "category_id=uncategorized&availability=unavailable&sort=price_desc", "min_price=9999999999999999.99"}
	for _, query := range valid {
		test.Run("valid "+query, func(test *testing.T) {
			result, err := catalogQuery(httptest.NewRequest("GET", "/?"+query, nil))
			if err != nil || result.Page < 1 {
				test.Fatalf("valid query rejected: %v", err)
			}
		})
	}
	for _, query := range []string{"category_id=wrong", "category_id=22222222-2222-4222-8222-222222222222&category_id=uncategorized", "min_price=-1", "min_price=1e2", "min_price=1.001", "max_price=10000000000000000", "min_price=20&max_price=10", "availability=hidden", "sort=unit_price;DROP+TABLE+products", "page=0", "search=%00"} {
		test.Run("invalid "+query, func(test *testing.T) {
			_, err := catalogQuery(httptest.NewRequest("GET", "/?"+query, nil))
			if !errors.Is(err, ErrInput) {
				test.Fatalf("invalid query accepted: %v", err)
			}
		})
	}
}

func TestCatalogImageURL(test *testing.T) {
	for _, value := range []string{"/assets/product.png", "https://images.example.test/coffee.png"} {
		if catalogImageURL(value) != value {
			test.Fatalf("safe image rejected: %q", value)
		}
	}
	for _, value := range []string{"", "//external.example.test/a", "javascript:alert(1)", "data:image/png;base64,abc", "http://images.example.test/a", "https://user:secret@example.test/a", "/\\external.test/a", "https://images.example.test/a#token", "https://images.example.test/a\n"} {
		if catalogImageURL(value) != "" {
			test.Fatal("unsafe image accepted")
		}
	}
}

func TestCatalogPageJSON(test *testing.T) {
	value := CatalogPage{Page: Page[CatalogProduct]{Items: []CatalogProduct{{Product: Product{VariantID: "22222222-2222-4222-8222-222222222222", UnitPrice: "19.99", Available: "2.000"}, CategoryID: "uncategorized", CategoryName: "ไม่มีหมวดหมู่"}}, Page: 1, PageSize: 24, Total: 1}, Categories: []CatalogCategory{{ID: "uncategorized", Name: "ไม่มีหมวดหมู่", Count: 1}}}
	encoded, err := json.Marshal(value)
	if err != nil {
		test.Fatal(err)
	}
	var result map[string]any
	if err = json.Unmarshal(encoded, &result); err != nil {
		test.Fatal(err)
	}
	product := result["items"].([]any)[0].(map[string]any)
	if product["unit_price"] != "19.99" || product["available"] != "2.000" || product["category_id"] != "uncategorized" || result["categories"].([]any)[0].(map[string]any)["count"] != float64(1) {
		test.Fatalf("incorrect public catalog shape: %s", encoded)
	}
	if _, exists := product["image_url"]; exists {
		test.Fatal("absent image must not fabricate a URL")
	}
}
