package storefront

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestNearbyRejectsInvalidCoordinates(t *testing.T) {
	handler := nearbyEndpoint(&Service{})
	for _, body := range []string{
		`{}`,
		`{"latitude":0}`,
		`{"latitude":null,"longitude":0}`,
		`{"latitude":-91,"longitude":0}`,
		`{"latitude":0,"longitude":181}`,
		`{"latitude":0,"longitude":0,"organization_id":"untrusted"}`,
		`{"latitude":0,"longitude":0} {}`,
	} {
		t.Run(body, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/storefronts/discovery/nearby", strings.NewReader(body))
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusBadRequest || !strings.Contains(response.Body.String(), "INVALID_INPUT") {
				t.Fatalf("invalid coordinates returned %d: %s", response.Code, response.Body.String())
			}
		})
	}
}
