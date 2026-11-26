package identity

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestEmailVerificationRoutesAreRegistered(t *testing.T) {
	router := chi.NewRouter()
	(Handler{}).Routes(router)
	seen := map[string]bool{}
	if err := chi.Walk(router, func(method, route string, _ http.Handler, _ ...func(http.Handler) http.Handler) error {
		seen[method+" "+route] = true
		return nil
	}); err != nil {
		t.Fatal(err)
	}
	for _, route := range []string{"POST /auth/email/verify", "POST /auth/email/resend"} {
		if !seen[route] {
			t.Fatalf("missing route %s", route)
		}
	}
}

func TestMalformedEmailVerificationTokenIsRejectedBeforeDatabase(t *testing.T) {
	handler := Handler{Origins: []string{"https://example.test"}}
	body, _ := json.Marshal(map[string]string{"token": "bad"})
	request := httptest.NewRequest(http.MethodPost, "/auth/email/verify", bytes.NewReader(body))
	request.Header.Set("Origin", "https://example.test")
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.verifyEmail(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestEmailResendRejectsInvalidEmailBeforeDatabase(t *testing.T) {
	handler := Handler{Origins: []string{"https://example.test"}}
	body, _ := json.Marshal(map[string]string{"email": "invalid"})
	request := httptest.NewRequest(http.MethodPost, "/auth/email/resend", bytes.NewReader(body))
	request.Header.Set("Origin", "https://example.test")
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	handler.resendEmail(response, request)
	if response.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestClientIPTrustBoundary(t *testing.T) {
	handler := Handler{TrustedProxyIP: netip.MustParseAddr("172.30.42.2")}
	cases := []struct {
		name, remote, forwarded, realIP, expected string
	}{
		{"trusted proxy IPv4", "172.30.42.2:1234", "198.51.100.10", "203.0.113.5", "198.51.100.10"},
		{"trusted proxy IPv6 client", "172.30.42.2:1234", "2001:db8::10", "", "2001:db8::10"},
		{"trusted proxy mapped client", "172.30.42.2:1234", "::ffff:198.51.100.10", "", "198.51.100.10"},
		{"untrusted peer", "172.30.42.3:1234", "198.51.100.10", "198.51.100.10", "172.30.42.3"},
		{"direct localhost", "127.0.0.1:1234", "198.51.100.10", "198.51.100.10", "127.0.0.1"},
		{"direct IPv6", "[::1]:1234", "2001:db8::10", "", "::1"},
		{"multiple forwarded addresses", "172.30.42.2:1234", "198.51.100.10, 203.0.113.5", "", "172.30.42.2"},
		{"malformed forwarded address", "172.30.42.2:1234", "not-an-ip", "", "172.30.42.2"},
		{"missing forwarded address", "172.30.42.2:1234", "", "198.51.100.10", "172.30.42.2"},
		{"unspecified forwarded address", "172.30.42.2:1234", "0.0.0.0", "", "172.30.42.2"},
	}
	for _, item := range cases {
		t.Run(item.name, func(t *testing.T) {
			request := httptest.NewRequest("POST", "/api/v1/auth/login", nil)
			request.RemoteAddr = item.remote
			if item.forwarded != "" {
				request.Header.Set("X-Forwarded-For", item.forwarded)
			}
			if item.realIP != "" {
				request.Header.Set("X-Real-IP", item.realIP)
			}
			if actual := handler.clientIP(request); actual != item.expected {
				t.Fatalf("client IP = %q, want %q", actual, item.expected)
			}
		})
	}
	first := httptest.NewRequest("POST", "/api/v1/auth/login", nil)
	first.RemoteAddr = "172.30.42.2:1234"
	first.Header.Set("X-Forwarded-For", "198.51.100.10")
	repeat := first.Clone(first.Context())
	second := first.Clone(first.Context())
	second.Header.Set("X-Forwarded-For", "198.51.100.11")
	if handler.clientIP(first) != handler.clientIP(repeat) || handler.clientIP(first) == handler.clientIP(second) {
		t.Fatal("rate-limit identities are not stable and independent")
	}
}

func TestTrustedIPv6Proxy(t *testing.T) {
	handler := Handler{TrustedProxyIP: netip.MustParseAddr("2001:db8::2")}
	request := httptest.NewRequest("POST", "/api/v1/auth/login", nil)
	request.RemoteAddr = "[2001:db8::2]:1234"
	request.Header.Set("X-Forwarded-For", "198.51.100.10")
	if handler.clientIP(request) != "198.51.100.10" {
		t.Fatal("trusted IPv6 proxy was not recognized")
	}
}

func TestSessionCookiePolicy(t *testing.T) {
	for _, production := range []bool{false, true} {
		handler := Handler{Production: production}
		response := httptest.NewRecorder()
		handler.writeCookie(response, "test-only-session", 3600)
		cookie := response.Result().Cookies()[0]
		if cookie.Name != handler.cookieName() || !cookie.HttpOnly || cookie.Secure != production || cookie.SameSite != http.SameSiteLaxMode || cookie.Domain != "" || cookie.Path != "/" || cookie.MaxAge != 3600 {
			t.Fatal("session cookie policy is invalid")
		}
	}
}

func TestClientIPRejectsDuplicateForwardedHeaders(t *testing.T) {
	handler := Handler{TrustedProxyIP: netip.MustParseAddr("172.30.42.2")}
	request := httptest.NewRequest("POST", "/api/v1/auth/login", nil)
	request.RemoteAddr = "172.30.42.2:1234"
	request.Header.Add("X-Forwarded-For", "198.51.100.10")
	request.Header.Add("X-Forwarded-For", "203.0.113.5")
	if actual := handler.clientIP(request); actual != "172.30.42.2" {
		t.Fatalf("accepted ambiguous forwarded headers: %q", actual)
	}
}
