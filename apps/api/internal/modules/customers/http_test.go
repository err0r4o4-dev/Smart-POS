package customers

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGroupInputRejectsServerFields(t *testing.T) {
	for _, field := range []string{`"id":"00000000-0000-4000-8000-000000000001"`, `"status":"ACTIVE"`, `"member_count":99`} {
		request := httptest.NewRequest("POST", "/customers/groups", strings.NewReader(`{"code":"GROUP","name":"Group",`+field+`}`))
		request.Header.Set("Content-Type", "application/json")
		var input GroupInput
		if decode(request, &input) != ErrInput {
			t.Fatalf("accepted server-managed field %s", field)
		}
	}
}
