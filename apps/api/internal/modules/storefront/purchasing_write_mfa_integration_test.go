package storefront_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/modules/purchasing"
	"smartpos/api/internal/testsupport"
)

type purchasingWriteActor struct {
	name, token, csrf, code string
	status                  int
	noStore                 bool
}

func verifyPurchasingWriteDenials(t *testing.T, auth identity.Handler, organizations *organization.Service, org string, cases ...purchasingWriteActor) {
	t.Helper()
	const id = "f2b30000-0000-4000-8000-000000000001"
	const key = "f2b30000-0000-4000-8000-000000000002"
	const post, patch = http.MethodPost, http.MethodPatch
	router := chi.NewRouter()
	purchasingHandler := purchasing.Handler{Service: &purchasing.Service{Organization: organizations}}
	organization.Handler{Service: organizations, Authentication: auth}.Routes(router, purchasingHandler.TenantRoutes)

	type operation struct{ method, path string }
	operations := []operation{
		{post, "/suppliers"},
		{patch, "/suppliers/" + id},
		{post, "/suppliers/" + id + "/products"},
		{patch, "/suppliers/" + id + "/products/" + id},
		{post, "/purchasing/suggestions/create-draft"},
		{post, "/shelves"},
		{patch, "/shelves/" + id},
		{post, "/shelves/" + id + "/slots"},
		{post, "/shelves/" + id + "/assignments"},
		{patch, "/shelves/" + id + "/assignments/" + id},
		{post, "/shelves/replenishments"},
	}
	for _, action := range []string{"assign", "start", "complete", "cancel"} {
		operations = append(operations, operation{post, "/shelves/replenishments/" + id + "/" + action})
	}
	for _, group := range []struct {
		resource string
		actions  []string
	}{
		{"orders", []string{"submit", "approve", "reject", "issue", "cancel", "close"}},
		{"receipts", []string{"submit", "approve", "reject", "correct", "cancel", "post"}},
		{"returns", []string{"submit", "approve", "reject", "cancel", "dispatch"}},
	} {
		path := "/purchasing/" + group.resource
		operations = append(operations, operation{post, path}, operation{patch, path + "/" + id})
		for _, action := range group.actions {
			operations = append(operations, operation{post, path + "/" + id + "/" + action})
		}
	}
	for _, op := range operations {
		for _, actor := range cases {
			t.Run(actor.name+"/"+op.method+" "+op.path, func(t *testing.T) {
				request := httptest.NewRequest(op.method, "/organizations/"+org+op.path, strings.NewReader("{}"))
				request.Header.Set("Origin", testsupport.MFAOrigin)
				request.Header.Set("X-CSRF-Token", actor.csrf)
				request.Header.Set("Idempotency-Key", key)
				request.Header.Set("Content-Type", "application/json")
				request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: actor.token})
				response := httptest.NewRecorder()
				router.ServeHTTP(response, request)

				var body struct {
					Error struct{ Code string }
					Data  json.RawMessage
				}
				err := json.Unmarshal(response.Body.Bytes(), &body)
				if response.Code != actor.status || err != nil || body.Error.Code != actor.code || len(body.Data) != 0 || (actor.noStore && response.Header().Get("Cache-Control") != "no-store") {
					t.Fatalf("wanted private denial %d %s: status=%d code=%q data=%t no-store=%t decodeErr=%v",
						actor.status, actor.code, response.Code, body.Error.Code, len(body.Data) != 0, response.Header().Get("Cache-Control") == "no-store", err)
				}
			})
		}
	}
}
