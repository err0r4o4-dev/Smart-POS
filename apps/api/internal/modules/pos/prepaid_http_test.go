package pos

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"smartpos/api/internal/modules/identity"
)

type prepaidHTTPFixture struct {
	user, org, order string
	input            OnlineOrderInput
	called           bool
}

func (fixture *prepaidHTTPFixture) SettlePrepaidOnlineOrder(_ context.Context, user, org, order string, input OnlineOrderInput) (Checkout, error) {
	fixture.user, fixture.org, fixture.order, fixture.input, fixture.called = user, org, order, input, true
	return Checkout{ID: "checkout", Status: "COMPLETED", Method: "ONLINE_STRIPE"}, nil
}

func TestSettlePrepaidDispatchAndRevision(test *testing.T) {
	fixture := &prepaidHTTPFixture{}
	router := chi.NewRouter()
	router.Post("/organizations/{id}/online-orders/{orderId}/settle-prepaid", settlePrepaidEndpoint(fixture))
	for _, body := range []string{`{}`, `{"revision":0}`, `{"revision":-1}`} {
		fixture.called = false
		request := httptest.NewRequest(http.MethodPost, "/organizations/org/online-orders/order/settle-prepaid", strings.NewReader(body))
		request.Header.Set("Content-Type", "application/json")
		writer := httptest.NewRecorder()
		router.ServeHTTP(writer, request)
		if writer.Code != 400 || fixture.called {
			test.Fatalf("invalid revision: %d called %v", writer.Code, fixture.called)
		}
	}
	request := httptest.NewRequest(http.MethodPost, "/organizations/org/online-orders/order/settle-prepaid", strings.NewReader(`{"revision":7}`))
	request.Header.Set("Content-Type", "application/json")
	writer := httptest.NewRecorder()
	router.ServeHTTP(writer, request)
	var envelope struct {
		Data Checkout `json:"data"`
	}
	if err := json.Unmarshal(writer.Body.Bytes(), &envelope); err != nil {
		test.Fatal(err)
	}
	if writer.Code != 200 || !fixture.called || fixture.org != "org" || fixture.order != "order" || fixture.input.Revision != 7 || envelope.Data.ID != "checkout" || envelope.Data.Method != "ONLINE_STRIPE" {
		test.Fatalf("status=%d fixture=%+v response=%+v", writer.Code, fixture, envelope)
	}
}

func TestSettlePrepaidRejectsMissingOrigin(test *testing.T) {
	fixture := &prepaidHTTPFixture{}
	router := chi.NewRouter()
	router.With((identity.Handler{Origins: []string{"http://localhost:8088"}}).RequireWrite).Post("/online-orders/{orderId}/settle-prepaid", settlePrepaidEndpoint(fixture))
	request := httptest.NewRequest(http.MethodPost, "/online-orders/order/settle-prepaid", strings.NewReader(`{"revision":1}`))
	request.Header.Set("Content-Type", "application/json")
	writer := httptest.NewRecorder()
	router.ServeHTTP(writer, request)
	if writer.Code != 403 || fixture.called {
		test.Fatalf("missing origin: %d called %v", writer.Code, fixture.called)
	}
}

func TestSettlePrepaidRouteRejectsInvalidJSON(test *testing.T) {
	router := chi.NewRouter()
	Handler{Service: &Service{}}.TenantRoutes(router)
	for name, body := range map[string]string{"malformed": `{`, "unknown field": `{"revision":1,"amount":1}`, "multiple": `{} {}`, "oversized": `{"revision":1,"x":"` + strings.Repeat("a", 65536) + `"}`} {
		test.Run(name, func(test *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/online-orders/11111111-1111-4111-8111-111111111111/settle-prepaid", strings.NewReader(body))
			request.Header.Set("Content-Type", "application/json")
			writer := httptest.NewRecorder()
			router.ServeHTTP(writer, request)
			if writer.Code != http.StatusBadRequest {
				test.Fatalf("status %d, expected 400", writer.Code)
			}
		})
	}
}
