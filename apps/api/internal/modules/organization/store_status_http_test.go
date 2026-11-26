package organization

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"smartpos/api/internal/modules/identity"
)

func TestStoreStatusRequiresAuthentication(t *testing.T) {
	router := chi.NewRouter()
	Handler{Service: &Service{}, Authentication: identity.Handler{Service: &identity.Service{}}}.Routes(router)
	mounted := false
	if err := chi.Walk(router, func(method, path string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		mounted = mounted || method == http.MethodGet && path == "/organizations/store-status"
		return nil
	}); err != nil || !mounted {
		t.Fatalf("explicit store status route missing: %v", err)
	}
	response := httptest.NewRecorder()
	router.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/organizations/store-status", nil))
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("store status without a session: got %d, want 401", response.Code)
	}
}
