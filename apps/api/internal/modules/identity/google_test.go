package identity

import (
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/go-chi/chi/v5"
	"golang.org/x/oauth2"
)

type googleRoundTrip func(*http.Request) (*http.Response, error)

func (roundTrip googleRoundTrip) RoundTrip(request *http.Request) (*http.Response, error) {
	return roundTrip(request)
}

func TestGoogleIDTokenValidation(test *testing.T) {
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		test.Fatal(err)
	}
	other, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		test.Fatal(err)
	}
	nonceHash := sha256.Sum256([]byte("expected-nonce"))
	for _, tc := range []struct {
		name            string
		mutate          func(map[string]any)
		wrongKey, valid bool
	}{
		{"valid", func(map[string]any) {}, false, true},
		{"wrong issuer", func(claimSet map[string]any) { claimSet["iss"] = "https://evil.test" }, false, false},
		{"wrong audience", func(claimSet map[string]any) { claimSet["aud"] = "another-client" }, false, false},
		{"expired", func(claimSet map[string]any) { claimSet["exp"] = time.Now().Add(-time.Hour).Unix() }, false, false},
		{"missing subject", func(claimSet map[string]any) { claimSet["sub"] = "" }, false, false},
		{"unverified email", func(claimSet map[string]any) { claimSet["email_verified"] = false }, false, false},
		{"wrong nonce", func(claimSet map[string]any) { claimSet["nonce"] = "wrong" }, false, false},
		{"wrong signature", func(map[string]any) {}, true, false},
		{"wrong authorized party", func(claimSet map[string]any) { claimSet["azp"] = "another-client" }, false, false},
	} {
		test.Run(tc.name, func(test *testing.T) {
			claims := map[string]any{"iss": "https://accounts.google.com", "aud": "client-id", "sub": "subject-123", "exp": time.Now().Add(time.Hour).Unix(), "iat": time.Now().Unix(), "nonce": "expected-nonce", "email": "User@example.test", "email_verified": true}
			tc.mutate(claims)
			payload, _ := json.Marshal(claims)
			part := base64.RawURLEncoding.EncodeToString
			unsigned := part([]byte(`{"alg":"RS256","typ":"JWT"}`)) + "." + part(payload)
			digest := sha256.Sum256([]byte(unsigned))
			signingKey := key
			if tc.wrongKey {
				signingKey = other
			}
			sig, err := rsa.SignPKCS1v15(rand.Reader, signingKey, crypto.SHA256, digest[:])
			if err != nil {
				test.Fatal(err)
			}
			raw := unsigned + "." + part(sig)
			client := &http.Client{Transport: googleRoundTrip(func(request *http.Request) (*http.Response, error) {
				if err := request.ParseForm(); err != nil || request.Form.Get("code_verifier") != "test-verifier" || request.Form.Get("code") != "test-code" {
					test.Fatalf("bad exchange request: %v", err)
				}
				body, _ := json.Marshal(map[string]any{"access_token": "test-access", "token_type": "Bearer", "id_token": raw})
				return &http.Response{StatusCode: 200, Header: http.Header{"Content-Type": []string{"application/json"}}, Body: io.NopCloser(strings.NewReader(string(body))), Request: request}, nil
			})}
			provider := &oidcGoogleProvider{oauth: oauth2.Config{ClientID: "client-id", ClientSecret: "test-secret", Endpoint: oauth2.Endpoint{TokenURL: "https://provider.invalid/token", AuthStyle: oauth2.AuthStyleInParams}}, verifier: oidc.NewVerifier("https://accounts.google.com", &oidc.StaticKeySet{PublicKeys: []crypto.PublicKey{&key.PublicKey}}, &oidc.Config{ClientID: "client-id", SupportedSigningAlgs: []string{oidc.RS256}}), client: client}
			identity, err := provider.exchange(context.Background(), "test-code", "test-verifier", nonceHash[:])
			if (err == nil) != tc.valid {
				test.Fatalf("valid=%v err=%v", tc.valid, err)
			}
			if tc.valid && (identity.subject != "subject-123" || identity.email != "user@example.test") {
				test.Fatal("incorrect verified identity")
			}
		})
	}
}

func TestGoogleAuthorizationURLContainsPKCEAndNonce(test *testing.T) {
	provider := &oidcGoogleProvider{oauth: oauth2.Config{ClientID: "client-id", RedirectURL: "https://example.test/api/v1/auth/google/callback", Scopes: []string{"openid", "email"}, Endpoint: oauth2.Endpoint{AuthURL: "https://accounts.google.com/o/oauth2/v2/auth"}}}
	got, err := url.Parse(provider.authorizationURL("state-value", "nonce-value", "verifier-value"))
	if err != nil {
		test.Fatal(err)
	}
	query := got.Query()
	if got.Host != "accounts.google.com" || query.Get("state") != "state-value" || query.Get("nonce") != "nonce-value" || query.Get("code_challenge_method") != "S256" || query.Get("code_challenge") != oauth2.S256ChallengeFromVerifier("verifier-value") || query.Get("response_type") != "code" || query.Get("scope") != "openid email" {
		test.Fatal(fmt.Sprintf("unexpected authorization parameters: %v", query))
	}
}

func TestGoogleDisabledAndLinkOrigin(test *testing.T) {
	request := chi.NewRouter()
	(Handler{Origins: []string{"https://example.test"}}).Routes(request)
	for _, tc := range []struct {
		method, path, origin string
		status               int
		body                 string
	}{
		{"GET", "/auth/google/config", "", 200, `"enabled":false`},
		{"GET", "/auth/google/start?returnTo=//evil.test", "", 400, ""},
		{"POST", "/auth/google/link", "https://evil.test", 403, ""},
	} {
		test.Run(tc.path, func(test *testing.T) {
			req := httptest.NewRequest(tc.method, tc.path, nil)
			if tc.origin != "" {
				req.Header.Set("Origin", tc.origin)
			}
			writer := httptest.NewRecorder()
			request.ServeHTTP(writer, req)
			if writer.Code != tc.status || !strings.Contains(writer.Body.String(), tc.body) {
				test.Fatalf("status=%d body=%s", writer.Code, writer.Body.String())
			}
		})
	}
}

func TestGoogleStartRejectsReturnDestinationAtServiceBoundary(test *testing.T) {
	google := &GoogleAuth{}
	_, _, err := google.start(context.Background(), "//evil.test")
	if !errors.Is(err, ErrInvalidInput) {
		test.Fatalf("invalid destination error = %v", err)
	}
}

func TestGoogleConstructorDoesNotContactProvider(test *testing.T) {
	original := http.DefaultTransport
	http.DefaultTransport = googleRoundTrip(func(request *http.Request) (*http.Response, error) {
		test.Fatal("Google constructor made a network request")
		return nil, errors.New("unexpected request")
	})
	test.Cleanup(func() { http.DefaultTransport = original })
	service := &Service{}
	if NewGoogleAuth(service, "", "", "") != nil {
		test.Fatal("empty Google configuration should disable authentication")
	}
	if NewGoogleAuth(service, "client", "synthetic-secret", "https://example.test/api/v1/auth/google/callback") == nil {
		test.Fatal("complete Google configuration should enable authentication")
	}
}
