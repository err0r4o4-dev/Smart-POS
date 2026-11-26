package identity

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestGuestWritesRejectForeignAndMissingOriginBeforeDatabase(t *testing.T) {
	handler := Handler{Origins: []string{"http://localhost:8088"}}
	for _, origin := range []string{"", "null", "https://foreign.invalid"} {
		called := false
		next := http.HandlerFunc(func(http.ResponseWriter, *http.Request) { called = true })
		request := httptest.NewRequest("POST", "/api/v1/storefronts/test/orders", nil)
		request.Header.Set("Origin", origin)
		writer := httptest.NewRecorder()
		handler.RequirePublicWrite("storefront.order", 20, time.Hour)(next).ServeHTTP(writer, request)
		if writer.Code != 403 || called {
			t.Fatalf("origin rejected too late: %q %d", origin, writer.Code)
		}
	}
}
