// Package testsupport provides fixtures used only by integration tests.
package testsupport

import (
	"context"
	"crypto/hmac"
	"crypto/sha1"
	"encoding/base32"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"smartpos/api/internal/modules/identity"
)

const MFAOrigin = "https://mfa-fixture.example.test"

type MFASession struct {
	Context context.Context
	Token   string
	CSRF    string
}

// Authenticate exercises the real middleware; it cannot manufacture assurance.
func Authenticate(t testing.TB, ctx context.Context, auth identity.Handler, token string) context.Context {
	t.Helper()
	var authenticated context.Context
	request := httptest.NewRequest(http.MethodGet, "/", nil).WithContext(ctx)
	request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: token})
	response := httptest.NewRecorder()
	auth.RequireAuth(http.HandlerFunc(func(_ http.ResponseWriter, request *http.Request) {
		authenticated = request.Context()
	})).ServeHTTP(response, request)
	if authenticated == nil || response.Code != http.StatusOK {
		t.Fatal("synthetic session middleware authentication failed")
	}
	return authenticated
}

// EnrollMFA uses actual password login and HTTP enrollment/confirmation.
func EnrollMFA(t testing.TB, ctx context.Context, auth identity.Handler, email, password string) MFASession {
	t.Helper()
	_, token, csrf, err := auth.Service.Login(ctx, email, password)
	if err != nil {
		t.Fatal("synthetic primary login failed")
	}
	router := chi.NewRouter()
	auth.Routes(router)
	call := func(path, body string) []byte {
		t.Helper()
		request := httptest.NewRequest(http.MethodPost, "/auth/mfa"+path, strings.NewReader(body)).WithContext(ctx)
		request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: token})
		request.Header.Set("Origin", MFAOrigin)
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("X-CSRF-Token", csrf)
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			t.Fatalf("synthetic MFA fixture failed: path=%s status=%d", path, response.Code)
		}
		return response.Body.Bytes()
	}
	var result struct {
		Data struct{ Secret string } `json:"data"`
	}
	if err = json.Unmarshal(call("/enrollment", "{}"), &result); err != nil {
		t.Fatal("invalid synthetic enrollment response")
	}
	secret, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(result.Data.Secret)
	if err != nil || len(secret) == 0 {
		t.Fatal("invalid synthetic enrollment secret")
	}
	defer clear(secret)
	var counter [8]byte
	binary.BigEndian.PutUint64(counter[:], uint64(time.Now().Unix()/30))
	mac := hmac.New(sha1.New, secret)
	_, _ = mac.Write(counter[:])
	digest := mac.Sum(nil)
	offset := digest[len(digest)-1] & 15
	code := fmt.Sprintf("%06d", (binary.BigEndian.Uint32(digest[offset:offset+4])&0x7fffffff)%1000000)
	call("/enrollment/confirm", `{"code":"`+code+`"}`)
	return MFASession{Context: Authenticate(t, ctx, auth, token), Token: token, CSRF: csrf}
}
