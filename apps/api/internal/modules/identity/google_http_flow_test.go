package identity

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
)

type fakeGoogleProvider struct{}

func (provider fakeGoogleProvider) authorizationURL(state, nonce, verifier string) string {
	return "https://accounts.google.test/auth?state=" + url.QueryEscape(state)
}
func (provider fakeGoogleProvider) exchange(context.Context, string, string, []byte) (googleIdentity, error) {
	return googleIdentity{subject: "subject-123", email: "person@example.test"}, nil
}

func TestGooglePendingLinkHTTPFlow(test *testing.T) {
	hash, err := HashPassword("correct-password-123")
	if err != nil {
		test.Fatal(err)
	}
	pool, queries := googleTestPool(test, hash, false, false, true)
	defer pool.Close()
	service := &Service{Pool: pool, SessionTTL: time.Hour, DummyHash: hash}
	handler := Handler{Service: service, Google: &GoogleAuth{service: service, provider: fakeGoogleProvider{}}, Origins: []string{"https://example.test"}, Production: true}
	router := chi.NewRouter()
	handler.Routes(router)
	configResponse := httptest.NewRecorder()
	router.ServeHTTP(configResponse, httptest.NewRequest("GET", "/auth/google/config", nil))
	if configResponse.Code != 200 || !strings.Contains(configResponse.Body.String(), `"enabled":true`) || strings.Contains(configResponse.Body.String(), "subject") {
		test.Fatalf("config: %s", configResponse.Body.String())
	}
	startResponse := httptest.NewRecorder()
	router.ServeHTTP(startResponse, httptest.NewRequest("GET", "/auth/google/start?returnTo=/setup", nil))
	if startResponse.Code != http.StatusFound {
		test.Fatalf("start status %d", startResponse.Code)
	}
	var startQueries []string
	for len(queries) > 0 {
		startQueries = append(startQueries, <-queries)
	}
	if len(startQueries) != 3 || !strings.Contains(startQueries[0], "AUTH_RATE_LIMITS") || !strings.Contains(startQueries[1], "DELETE FROM AUTH_GOOGLE_FLOWS") || !strings.Contains(startQueries[1], "EXPIRES_AT<=NOW()") || !strings.Contains(startQueries[1], "LIMIT 100") || !strings.Contains(startQueries[2], "INSERT INTO AUTH_GOOGLE_FLOWS") {
		test.Fatalf("incorrect flow creation sequence: %v", startQueries)
	}
	startURL, err := url.Parse(startResponse.Header().Get("Location"))
	if err != nil {
		test.Fatal(err)
	}
	cookies := startResponse.Result().Cookies()
	if len(cookies) != 1 {
		test.Fatal("missing flow cookie")
	}
	flowCookie := cookies[0]
	if flowCookie.Name != "__Host-smartpos_google_flow" || !flowCookie.Secure || !flowCookie.HttpOnly || flowCookie.Path != "/" || flowCookie.Domain != "" || flowCookie.SameSite != http.SameSiteLaxMode {
		test.Fatal("incorrect flow cookie attributes")
	}
	callbackRequest := httptest.NewRequest("GET", "/auth/google/callback?code=synthetic&state="+url.QueryEscape(startURL.Query().Get("state")), nil)
	callbackRequest.AddCookie(flowCookie)
	callbackResponse := httptest.NewRecorder()
	router.ServeHTTP(callbackResponse, callbackRequest)
	if callbackResponse.Code != http.StatusFound || callbackResponse.Header().Get("Location") != "/login?google=link_required&returnTo=%2Fsetup" || len(callbackResponse.Result().Cookies()) != 0 {
		test.Fatalf("callback status=%d location=%s", callbackResponse.Code, callbackResponse.Header().Get("Location"))
	}
	for _, attempt := range []struct {
		password string
		status   int
	}{{"wrong-password", 401}, {"correct-password-123", 200}} {
		body, _ := json.Marshal(map[string]string{"email": "person@example.test", "password": attempt.password})
		linkRequest := httptest.NewRequest("POST", "/auth/google/link", strings.NewReader(string(body)))
		linkRequest.AddCookie(flowCookie)
		linkRequest.Header.Set("Origin", "https://example.test")
		linkRequest.Header.Set("Content-Type", "application/json")
		linkResponse := httptest.NewRecorder()
		router.ServeHTTP(linkResponse, linkRequest)
		if linkResponse.Code != attempt.status {
			test.Fatalf("link status=%d body=%s", linkResponse.Code, linkResponse.Body.String())
		}
		if attempt.status == 200 {
			var result struct {
				Data struct {
					User Profile `json:"user"`
					CSRF string  `json:"csrf_token"`
				} `json:"data"`
			}
			if json.Unmarshal(linkResponse.Body.Bytes(), &result) != nil || result.Data.User.Email != "person@example.test" || result.Data.CSRF == "" {
				test.Fatal("link response differs from login")
			}
			var session, cleared bool
			for _, cookie := range linkResponse.Result().Cookies() {
				if cookie.Name == handler.cookieName() && cookie.Value != "" && cookie.HttpOnly && cookie.Secure {
					session = true
				}
				if cookie.Name == handler.googleCookieName() && cookie.MaxAge < 0 {
					cleared = true
				}
			}
			if !session || !cleared {
				test.Fatal("link did not issue session and clear pending cookie")
			}
		}
	}
}

func TestGoogleStartRejectsCrossSiteNavigation(test *testing.T) {
	handler := Handler{Google: &GoogleAuth{}, Origins: []string{"https://example.test"}}
	for _, headers := range []map[string]string{{"Sec-Fetch-Site": "cross-site"}, {"Origin": "https://evil.test"}, {"Sec-Fetch-Site": "same-site"}} {
		request := httptest.NewRequest("GET", "/auth/google/start?returnTo=/workspace", nil)
		for name, value := range headers {
			request.Header.Set(name, value)
		}
		response := httptest.NewRecorder()
		handler.googleStart(response, request)
		if response.Code != http.StatusForbidden {
			test.Fatalf("headers=%v status=%d", headers, response.Code)
		}
	}
}

func TestGoogleStartRateLimitPreventsFlowCreation(test *testing.T) {
	pool, queries := googleTestPool(test, "", false, false, false, "11")
	defer pool.Close()
	service := &Service{Pool: pool}
	handler := Handler{Service: service, Google: &GoogleAuth{service: service, provider: fakeGoogleProvider{}}}
	request := httptest.NewRequest("GET", "/auth/google/start?returnTo=/workspace", nil)
	response := httptest.NewRecorder()
	handler.googleStart(response, request)
	if response.Code != http.StatusTooManyRequests || response.Header().Get("Retry-After") != "600" || len(response.Result().Cookies()) != 0 {
		test.Fatalf("status=%d", response.Code)
	}
	query := <-queries
	if !strings.Contains(query, "INSERT INTO AUTH_RATE_LIMITS") || !strings.Contains(query, "'LOGIN'") || len(queries) != 0 {
		test.Fatal("rate-limited start created a flow")
	}
}

func TestGoogleCallbackRejectsMissingProofAndClearsCookie(test *testing.T) {
	handler := Handler{Google: &GoogleAuth{}, Production: true}
	response := httptest.NewRecorder()
	request := httptest.NewRequest("GET", "/auth/google/callback?code=private&state=private", nil)
	handler.googleCallback(response, request)
	if response.Code != http.StatusFound || response.Header().Get("Location") != "/login?google=error" || response.Header().Get("Referrer-Policy") != "no-referrer" {
		test.Fatalf("unexpected callback response: %v", response.Result().Header)
	}
	cookies := response.Result().Cookies()
	if len(cookies) != 1 || cookies[0].MaxAge >= 0 || !cookies[0].HttpOnly || !cookies[0].Secure {
		test.Fatal("failed callback did not clear flow cookie")
	}
}

func TestGoogleCancelledFlowConsumesState(test *testing.T) {
	pool, queries := googleTestPool(test, "", false, false, false)
	defer pool.Close()
	service := &Service{Pool: pool}
	handler := Handler{Google: &GoogleAuth{service: service, provider: fakeGoogleProvider{}}}
	cookie, _, err := RandomToken()
	if err != nil {
		test.Fatal(err)
	}
	state, _, err := RandomToken()
	if err != nil {
		test.Fatal(err)
	}
	request := httptest.NewRequest("GET", "/auth/google/callback?error=access_denied&state="+state, nil)
	request.AddCookie(&http.Cookie{Name: handler.googleCookieName(), Value: cookie})
	response := httptest.NewRecorder()
	handler.googleCallback(response, request)
	if response.Header().Get("Location") != "/login?google=cancelled" {
		test.Fatalf("cancel location %q", response.Header().Get("Location"))
	}
	if !strings.Contains(<-queries, "SET CONSUMED_AT") {
		test.Fatal("cancel did not consume flow")
	}
}

func TestGoogleExpiredLinkClearsPendingCookie(test *testing.T) {
	pool, _ := googleTestPool(test, "", false, true, false)
	defer pool.Close()
	service := &Service{Pool: pool}
	handler := Handler{Service: service, Google: &GoogleAuth{service: service}, Origins: []string{"https://example.test"}, Production: true}
	cookie, _, err := RandomToken()
	if err != nil {
		test.Fatal(err)
	}
	request := httptest.NewRequest("POST", "/auth/google/link", strings.NewReader(`{"email":"person@example.test","password":"incorrect"}`))
	request.Header.Set("Origin", "https://example.test")
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(&http.Cookie{Name: handler.googleCookieName(), Value: cookie})
	response := httptest.NewRecorder()
	handler.googleLink(response, request)
	if response.Code != http.StatusUnauthorized {
		test.Fatalf("status=%d", response.Code)
	}
	cookies := response.Result().Cookies()
	if len(cookies) != 1 || cookies[0].Name != handler.googleCookieName() || cookies[0].MaxAge >= 0 {
		test.Fatal("expired flow cookie was not cleared")
	}
}
