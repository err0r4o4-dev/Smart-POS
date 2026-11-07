package restaurant

import (
	"net/http"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestRetiredRestaurantRoutesAreNotRegistered(t *testing.T) {
	router := chi.NewRouter()
	Handler{}.TenantRoutes(router)
	retired := map[string]bool{
		"GET /restaurant/recipes":            true,
		"POST /restaurant/recipes":           true,
		"PUT /restaurant/recipes/{recipeId}": true,
		"GET /restaurant/forecast":           true,
		"POST /restaurant/quick-stock":       true,
	}
	if err := chi.Walk(router, func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		if retired[method+" "+route] {
			t.Errorf("retired route remains registered: %s %s", method, route)
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
}
