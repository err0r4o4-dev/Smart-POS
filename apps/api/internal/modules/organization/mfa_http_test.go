package organization

import (
	"encoding/json"
	"net/http/httptest"
	"testing"

	"smartpos/api/internal/modules/identity"
)

func TestMFAAuthorizationErrors(t *testing.T) {
	for _, test := range []struct {
		name   string
		err    error
		status int
		code   string
	}{
		{"missing assurance", identity.ErrMFARequired, 403, "MFA_REQUIRED"},
		{"stale session", identity.ErrInvalidToken, 401, "UNAUTHENTICATED"},
	} {
		t.Run(test.name, func(t *testing.T) {
			response := httptest.NewRecorder()
			respond(response, httptest.NewRequest("GET", "/", nil), 200, map[string]string{"private": "must not escape"}, test.err)
			var body struct {
				Error struct{ Code string } `json:"error"`
				Data  any                   `json:"data"`
			}
			if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil || response.Code != test.status || body.Error.Code != test.code || body.Data != nil {
				t.Fatalf("wrong authentication recovery contract: status=%d code=%s", response.Code, body.Error.Code)
			}
		})
	}
}
