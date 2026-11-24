package identity

import (
	"crypto/sha256"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestMFARoutes(t *testing.T) {
	router := chi.NewRouter()
	(Handler{}).Routes(router)
	seen := map[string]bool{}
	if err := chi.Walk(router, func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		seen[method+" "+route] = true
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	for _, route := range []string{"GET /auth/mfa", "POST /auth/mfa/enrollment", "POST /auth/mfa/enrollment/confirm", "POST /auth/mfa/challenge"} {
		if !seen[route] {
			t.Errorf("missing MFA route %s", route)
		}
	}
}

func TestMFAUnavailableAndValidation(t *testing.T) {
	handler := Handler{Origins: []string{"https://example.test"}}
	for _, item := range []struct {
		name, body, contentType string
		run                     func(http.ResponseWriter, *http.Request)
		status                  int
	}{
		{"unconfigured status", "", "", handler.mfaStatus, 503},
		{"unconfigured enrollment", "{}", "application/json", handler.mfaBegin, 503},
		{"unconfigured confirmation", `{"code":"012345"}`, "application/json", handler.mfaConfirm, 503},
		{"unconfigured challenge", `{"code":"012345"}`, "application/json", handler.mfaChallenge, 503},
		{"null enrollment", "null", "application/json", handler.mfaBegin, 400},
		{"foreign fields", `{"user_id":"forged"}`, "application/json", handler.mfaBegin, 400},
		{"non-JSON", "{}", "text/plain", handler.mfaBegin, 415},
		{"malformed confirmation", `{"code":"12x456"}`, "application/json", handler.mfaConfirm, 400},
	} {
		t.Run(item.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/auth/mfa", strings.NewReader(item.body))
			request.Header.Set("Origin", "https://example.test")
			request.Header.Set("Content-Type", item.contentType)
			request.Header.Set("X-CSRF-Token", "synthetic-csrf")
			request = request.WithContext(withSession(request.Context(), Session{CSRFHash: sha256.Sum256([]byte("synthetic-csrf"))}))
			response := httptest.NewRecorder()
			item.run(response, request)
			if response.Code != item.status || response.Header().Get("Cache-Control") != "no-store" {
				t.Fatalf("status=%d want=%d; no-store=%v", response.Code, item.status, response.Header().Get("Cache-Control") == "no-store")
			}
		})
	}
}

func TestMFARecoveryRequiresAuthentication(t *testing.T) {
	router := chi.NewRouter()
	(Handler{}).Routes(router)
	for _, path := range []string{"/auth/mfa/recovery", "/auth/mfa/recovery/confirm"} {
		response := httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequest(http.MethodPost, path, strings.NewReader("{}")))
		if response.Code != http.StatusUnauthorized || response.Header().Get("Cache-Control") != "no-store" {
			t.Errorf("%s: got %d, expected uncached 401", path, response.Code)
		}
	}
}
