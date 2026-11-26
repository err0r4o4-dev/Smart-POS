package transport

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"regexp"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/modules/storefront"
	"smartpos/api/internal/platform/httpx"
)

type readinessStub struct {
	err        error
	panicValue bool
}

func TestStoreAssistantRouteRequiresOptInAndAllowedOrigin(t *testing.T) {
	logger := slog.New(slog.NewTextHandler(&bytes.Buffer{}, nil))
	const localOrigin = "http://localhost:8088"
	const otherOrigin = "https://other.example.test"
	auth := identity.Handler{
		Service:        &identity.Service{},
		Origins:        []string{localOrigin},
		TrustedProxyIP: netip.MustParseAddr("172.30.42.2"),
	}
	enabled := Options{StoreAssistant: storefront.NewAssistantClient("http://ai:8001", "unused-in-test")}
	for _, tc := range []struct {
		name    string
		options Options
		peer    string
		origin  string
		status  int
		code    string
	}{
		{"disabled", Options{}, "127.0.0.1:1234", localOrigin, http.StatusNotFound, "NOT_FOUND"},
		{"untrusted peer", enabled, "192.0.2.2:1234", localOrigin, http.StatusForbidden, "FORBIDDEN"},
		{"loopback checks origin", enabled, "127.0.0.1:1234", otherOrigin, http.StatusForbidden, "INVALID_ORIGIN"},
		{"compose proxy checks origin", enabled, "172.30.42.2:1234", otherOrigin, http.StatusForbidden, "INVALID_ORIGIN"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			router := RouterWithOptions(readinessStub{}, logger, tc.options, auth)
			req := httptest.NewRequest(http.MethodPost, "/api/v1/storefronts/bistro/assistant", strings.NewReader(`{"questions":["Any soup?"]}`))
			req.RemoteAddr = tc.peer
			req.Header.Set("Origin", tc.origin)
			req.Header.Set("X-Forwarded-For", "127.0.0.1")
			response := httptest.NewRecorder()
			router.ServeHTTP(response, req)
			if response.Code != tc.status || !strings.Contains(response.Body.String(), `"code":"`+tc.code+`"`) {
				t.Errorf("assistant HTTP response = %d %s, want %d %s", response.Code, response.Body, tc.status, tc.code)
			}
		})
	}
}

func TestTenantRouterDoesNotExposeRetiredAuthorityRoutes(t *testing.T) {
	router := Router(readinessStub{}, slog.New(slog.NewTextHandler(&bytes.Buffer{}, nil)), identity.Handler{Service: &identity.Service{}})
	routes, ok := router.(chi.Routes)
	if !ok {
		t.Fatal("expected to inspect the composed API routes")
	}
	const tenant = "/api/v1/organizations/{id}"
	retired := map[string]bool{
		"/api/v1/invitations/accept":           true,
		tenant + "/roles":                      true,
		tenant + "/members":                    true,
		tenant + "/members/{memberId}":         true,
		tenant + "/invitations":                true,
		tenant + "/invitations/{invitationId}": true,
		tenant + "/restaurant/quick-stock":     true,
	}
	var tenantMounted bool
	if err := chi.Walk(routes, func(method, path string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		if path == tenant+"/context" && method == http.MethodGet {
			tenantMounted = true
		}
		if retired[path] {
			t.Errorf("retired API is registered: %s %s", method, path)
		}
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if !tenantMounted {
		t.Fatal("test did not inspect the mounted tenant routes")
	}
}

func TestSandboxRoutesRequireAuthentication(t *testing.T) {
	router := RouterWithSandbox(readinessStub{}, slog.New(slog.NewTextHandler(&bytes.Buffer{}, nil)), nil, identity.Handler{Service: &identity.Service{}})
	for _, route := range []struct{ method, suffix string }{
		{"GET", ""}, {"POST", "/checkouts"}, {"GET", "/checkouts/cs_test_synthetic"}, {"POST", "/checkouts/cs_test_synthetic/refund"},
	} {
		response := httptest.NewRecorder()
		router.ServeHTTP(response, httptest.NewRequest(route.method, "/api/v1/organizations/11111111-1111-4111-8111-111111111111/storefront/payment-sandbox"+route.suffix, nil))
		if response.Code != 401 {
			t.Fatalf("%s %s: %d", route.method, route.suffix, response.Code)
		}
	}
}

func TestOrganizationRoutesRejectAnonymousRequests(t *testing.T) {
	const root = "/api/v1/organizations"
	const fixtureID = "11111111-1111-4111-8111-111111111111"
	router := Router(readinessStub{}, slog.New(slog.NewTextHandler(&bytes.Buffer{}, nil)), identity.Handler{Service: &identity.Service{}})
	routes, ok := router.(chi.Routes)
	if !ok {
		t.Fatal("expected to inspect the composed API routes")
	}
	parameter := regexp.MustCompile(`\{[^{}]+\}`)
	count := 0
	if err := chi.Walk(routes, func(method, path string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		if path != root && !strings.HasPrefix(path, root+"/") {
			return nil
		}
		count++
		t.Run(method+" "+path, func(t *testing.T) {
			target := parameter.ReplaceAllString(path, fixtureID)
			request := httptest.NewRequest(method, target, nil)
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			if response.Code != http.StatusUnauthorized {
				t.Fatalf("expected authentication denial, got HTTP %d", response.Code)
			}
			var body struct {
				Data  json.RawMessage
				Error struct{ Code string }
			}
			if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil || body.Error.Code != "UNAUTHENTICATED" {
				t.Fatalf("expected UNAUTHENTICATED, got %q (decode: %v)", body.Error.Code, err)
			}
			if len(body.Data) != 0 {
				t.Fatal("anonymous denial must omit data")
			}
		})
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	if count == 0 {
		t.Fatal("test did not inspect any organization routes")
	}
	t.Logf("checked %d mounted organization method/path pairs", count)
}

func (stub readinessStub) Ready(ctx context.Context) error {
	if stub.panicValue {
		panic("secret must never escape")
	}
	if _, ok := ctx.Deadline(); !ok {
		return errors.New("deadline missing")
	}
	return stub.err
}

func TestRoutes(t *testing.T) {
	cases := []struct {
		name, method, path string
		checker            readinessStub
		status             int
		code               string
	}{
		{"live", "GET", "/health/live", readinessStub{err: errors.New("offline")}, 200, ""},
		{"ready", "GET", "/health/ready", readinessStub{}, 200, ""},
		{"offline", "GET", "/health/ready", readinessStub{err: errors.New("secret database URL")}, 503, "DEPENDENCY_UNAVAILABLE"},
		{"system", "GET", "/api/v1/system", readinessStub{}, 200, ""},
		{"unknown", "GET", "/api/v1/products", readinessStub{}, 404, "NOT_FOUND"},
		{"method", "POST", "/health/live", readinessStub{}, 405, "METHOD_NOT_ALLOWED"},
		{"panic", "GET", "/health/ready", readinessStub{panicValue: true}, 500, "INTERNAL_ERROR"},
	}
	for _, item := range cases {
		t.Run(item.name, func(t *testing.T) {
			var output bytes.Buffer
			logger := slog.New(slog.NewJSONHandler(&output, nil))
			request := httptest.NewRequest(item.method, item.path, nil)
			request.Header.Set("X-Request-ID", "untrusted")
			writer := httptest.NewRecorder()
			Router(item.checker, logger).ServeHTTP(writer, request)
			if writer.Code != item.status {
				t.Fatalf("status=%d body=%s", writer.Code, writer.Body.String())
			}
			id := writer.Header().Get("X-Request-ID")
			if len(id) != 32 || id == "untrusted" {
				t.Fatal("invalid generated request ID")
			}
			if writer.Header().Get("X-Content-Type-Options") != "nosniff" {
				t.Fatal("missing security header")
			}
			accessCount := 0
			for _, line := range strings.Split(strings.TrimSpace(output.String()), "\n") {
				var entry map[string]any
				if err := json.Unmarshal([]byte(line), &entry); err != nil {
					t.Fatal(err)
				}
				if entry["msg"] == "http_request" {
					accessCount++
					if entry["status"] != float64(item.status) || entry["request_id"] != id || entry["path"] != item.path {
						t.Fatalf("incorrect access log: %v", entry)
					}
				}
			}
			if accessCount != 1 {
				t.Fatalf("access logs=%d", accessCount)
			}
			if item.code != "" {
				var result struct {
					Error httpx.ErrorBody `json:"error"`
				}
				if err := json.Unmarshal(writer.Body.Bytes(), &result); err != nil {
					t.Fatal(err)
				}
				if result.Error.Code != item.code || result.Error.RequestID != id {
					t.Fatalf("bad envelope: %+v", result)
				}
			}
		})
	}
}
