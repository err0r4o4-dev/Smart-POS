package identity

import (
	"bytes"
	"context"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"encoding/base32"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/oauth2"
	"smartpos/api/internal/platform/database"
)

func syntheticGoogleCallback(t *testing.T, ctx context.Context, identity *Service, key *rsa.PrivateKey, subject, email string, proof time.Time) string {
	t.Helper()
	const clientID = "synthetic-client"
	const issuer = "https://accounts.google.com"
	const tokenURL = "https://provider.invalid/token"
	var signed, challenge string
	exchanges := 0
	client := &http.Client{Transport: googleRoundTrip(func(request *http.Request) (*http.Response, error) {
		exchanges++
		if err := request.ParseForm(); err != nil || request.URL.String() != tokenURL ||
			request.Form.Get("code") != "synthetic-code" || oauth2.S256ChallengeFromVerifier(request.Form.Get("code_verifier")) != challenge {
			t.Fatalf("unexpected synthetic OAuth exchange: %v", err)
		}
		body, err := json.Marshal(map[string]string{"access_token": "synthetic-access", "token_type": "Bearer", "id_token": signed})
		if err != nil {
			t.Fatal(err)
		}
		return &http.Response{StatusCode: http.StatusOK, Header: http.Header{"Content-Type": {"application/json"}}, Body: io.NopCloser(bytes.NewReader(body)), Request: request}, nil
	})}
	provider := &oidcGoogleProvider{
		oauth:    oauth2.Config{ClientID: clientID, Endpoint: oauth2.Endpoint{AuthURL: "https://provider.invalid/auth", TokenURL: tokenURL, AuthStyle: oauth2.AuthStyleInParams}},
		verifier: oidc.NewVerifier(issuer, &oidc.StaticKeySet{PublicKeys: []crypto.PublicKey{&key.PublicKey}}, &oidc.Config{ClientID: clientID, SupportedSigningAlgs: []string{oidc.RS256}}),
		client:   client,
	}
	handler := Handler{Service: identity, Google: &GoogleAuth{service: identity, provider: provider}}
	router := chi.NewRouter()
	handler.Routes(router)
	start := httptest.NewRecorder()
	router.ServeHTTP(start, httptest.NewRequest(http.MethodGet, "/auth/google/start?returnTo=/workspace", nil).WithContext(ctx))
	location, err := url.Parse(start.Header().Get("Location"))
	cookies := start.Result().Cookies()
	if err != nil || start.Code != http.StatusFound || location.Host != "provider.invalid" ||
		len(cookies) != 1 || cookies[0].Name != handler.googleCookieName() || cookies[0].Value == "" {
		t.Fatalf("Google start did not issue an authorization redirect and flow cookie: status %d", start.Code)
	}
	query := location.Query()
	state, nonce := query.Get("state"), query.Get("nonce")
	challenge = query.Get("code_challenge")
	if state == "" || nonce == "" || challenge == "" {
		t.Fatal("Google start did not issue state, nonce and PKCE")
	}
	now := time.Now()
	claims := map[string]any{"iss": issuer, "aud": clientID, "sub": subject, "email": email, "email_verified": true, "nonce": nonce, "iat": now.Unix(), "exp": now.Add(time.Hour).Unix()}
	if !proof.IsZero() {
		claims["auth_time"] = proof.Unix()
	}
	payload, err := json.Marshal(claims)
	if err != nil {
		t.Fatal(err)
	}
	encode := base64.RawURLEncoding.EncodeToString
	unsigned := encode([]byte(`{"alg":"RS256"}`)) + "." + encode(payload)
	digest := sha256.Sum256([]byte(unsigned))
	signature, err := rsa.SignPKCS1v15(rand.Reader, key, crypto.SHA256, digest[:])
	if err != nil {
		t.Fatal(err)
	}
	signed = unsigned + "." + encode(signature)
	response := httptest.NewRecorder()
	callback := httptest.NewRequest(http.MethodGet, "/auth/google/callback?"+url.Values{"state": {state}, "code": {"synthetic-code"}}.Encode(), nil).WithContext(ctx)
	callback.AddCookie(cookies[0])
	router.ServeHTTP(response, callback)
	if response.Code != http.StatusFound || response.Header().Get("Location") != "/workspace" || exchanges != 1 {
		t.Fatalf("Google callback did not complete: status %d, exchanges %d", response.Code, exchanges)
	}
	for _, cookie := range response.Result().Cookies() {
		if cookie.Name == handler.cookieName() && cookie.Value != "" {
			return cookie.Value
		}
	}
	t.Fatal("Google callback did not issue a session cookie")
	return ""
}

func TestTOTPRecoveryIsolatedDatabase(t *testing.T) {
	dsn := os.Getenv("SMARTPOS_MFA_TEST_DSN")
	if dsn == "" {
		t.Skip("requires explicitly provisioned task-owned MFA database")
	}
	config, err := pgxpool.ParseConfig(dsn)
	if err != nil || config.ConnConfig.Host != "127.0.0.1" || config.ConnConfig.Port != 15514 || config.ConnConfig.Database != "smartpos_single_store_acceptance" {
		t.Fatal("refusing unconfirmed isolated MFA target")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	pool, err := database.Open(ctx, dsn)
	if err != nil {
		t.Fatal("isolated database unavailable")
	}
	defer pool.Close()
	var marker string
	if err := pool.QueryRow(ctx, "SELECT marker FROM single_store_acceptance_marker").Scan(&marker); err != nil || marker != "ephemeral-single-store" {
		t.Fatal("isolated target marker missing")
	}
	var count int
	if err := pool.QueryRow(ctx, "SELECT count(*) FROM users").Scan(&count); err != nil || count != 0 {
		t.Fatal("isolated MFA fixtures require a fresh database")
	}
	const fixturePassword = "Synthetic-recovery-fixture-2026"
	passwordHash, err := HashPassword(fixturePassword)
	if err != nil {
		t.Fatal(err)
	}
	newUser := func(email string) string {
		t.Helper()
		var user string
		if err := pool.QueryRow(ctx, `INSERT INTO users(email,email_normalized,password_hash,display_name,email_verified_at)
			VALUES($1,$1,$2,'Synthetic recovery user',clock_timestamp()) RETURNING id`, email, passwordHash).Scan(&user); err != nil {
			t.Fatal(err)
		}
		return user
	}
	service, err := NewMFAService(pool, "synthetic-key-v1", bytes.Repeat([]byte{0x42}, 32))
	if err != nil {
		t.Fatal(err)
	}
	t.Run("Google callback preserves provider proof time for recent MFA", func(t *testing.T) {
		identity := &Service{Pool: pool, SessionTTL: time.Hour}
		key, err := rsa.GenerateKey(rand.Reader, 2048)
		if err != nil {
			t.Fatal(err)
		}
		for _, check := range []struct {
			name  string
			at    time.Time
			after error
		}{
			{"recent", time.Now().UTC().Add(-time.Minute).Truncate(time.Second), nil},
			{"older", time.Now().UTC().Add(-10 * time.Minute).Truncate(time.Second), ErrRecentAuthenticationRequired},
			{"absent", time.Time{}, ErrRecentAuthenticationRequired},
		} {
			t.Run(check.name, func(t *testing.T) {
				email := "recovery-google-" + check.name + "@example.test"
				subject := "synthetic-recovery-google-" + check.name
				user := newUser(email)
				if _, err := pool.Exec(ctx, `INSERT INTO auth_external_identities(provider,subject,user_id) VALUES('google',$1,$2)`, subject, user); err != nil {
					t.Fatal(err)
				}
				_, passwordToken, _, err := identity.Login(ctx, email, fixturePassword)
				if err != nil {
					t.Fatalf("sign in to enroll test factor: %v", err)
				}
				factor, err := service.beginEnrollment(ctx, passwordToken)
				if err != nil {
					t.Fatalf("begin enrollment: %v", err)
				}
				defer clear(factor.Secret)
				step := time.Now().Unix() / 30
				if _, err := service.confirmEnrollment(ctx, passwordToken, mfaTestCode(factor.Secret, step)); err != nil {
					t.Fatalf("confirm enrollment: %v", err)
				}
				token := syntheticGoogleCallback(t, ctx, identity, key, subject, email, check.at)
				tokenHash, err := TokenHash(token)
				if err != nil {
					t.Fatal("session token has invalid format")
				}
				var proof *time.Time
				var owner string
				if err := pool.QueryRow(ctx, `SELECT user_id,primary_verified_at FROM auth_sessions WHERE token_hash=$1`, tokenHash[:]).Scan(&owner, &proof); err != nil {
					t.Fatal(err)
				}
				if owner != user || (check.at.IsZero() && proof != nil) || (!check.at.IsZero() && (proof == nil || !proof.Equal(check.at))) {
					t.Fatal("issued session does not preserve the account and provider proof time")
				}
				assertRecent := func(want error) {
					t.Helper()
					current, err := identity.Current(ctx, token)
					if err != nil {
						t.Fatalf("load Google session: %v", err)
					}
					tx, err := pool.Begin(ctx)
					if err != nil {
						t.Fatal(err)
					}
					defer tx.Rollback(ctx)
					access, err := RequireRecentMFA(withSession(ctx, current), tx, user)
					if !errors.Is(err, want) || (access != nil) != (want == nil) {
						t.Fatalf("recent MFA check: %v, want %v", err, want)
					}
				}
				assertRecent(ErrMFARequired)
				if err := service.challenge(ctx, token, mfaTestCode(factor.Secret, step+1)); err != nil {
					t.Fatalf("challenge Google session: %v", err)
				}
				assertRecent(check.after)
			})
		}
	})
	session := func(user string, fresh bool) string {
		t.Helper()
		token, hash, err := RandomToken()
		if err != nil {
			t.Fatal(err)
		}
		_, csrfHash := CSRFForToken(token)
		if _, err := pool.Exec(ctx, `INSERT INTO auth_sessions(user_id,token_hash,csrf_hash,created_at,expires_at,primary_verified_at)
			SELECT $1,$2,$3,n,n+interval '1 hour',CASE WHEN $4 THEN n ELSE n-interval '6 minutes' END
			FROM (SELECT clock_timestamp() n) t`, user, hash[:], csrfHash[:], fresh); err != nil {
			t.Fatal(err)
		}
		return token
	}
	user := newUser("recovery-owner@example.test")
	foreign := newUser("recovery-other@example.test")
	oldSession := session(user, true)
	old, err := service.beginEnrollment(ctx, oldSession)
	if err != nil {
		t.Fatal(err)
	}
	oldCodes, err := service.confirmEnrollment(ctx, oldSession, mfaTestCode(old.Secret, time.Now().Unix()/30))
	if err != nil || len(oldCodes) != 10 {
		t.Fatalf("activate original factor: %v", err)
	}
	recoverySession := session(user, true)
	otherSession := session(user, true)
	foreignSession := session(foreign, true)
	stale := session(user, false)
	if got, err := service.beginRecovery(ctx, stale, oldCodes[0]); !errors.Is(err, ErrInvalidToken) || got.FactorID != "" {
		t.Fatal("stale primary proof was accepted")
	}
	if got, err := service.beginRecovery(ctx, foreignSession, oldCodes[0]); !errors.Is(err, ErrInvalidToken) || got.FactorID != "" {
		t.Fatal("foreign account was accepted")
	}
	first, err := service.beginRecovery(ctx, otherSession, oldCodes[0])
	if err != nil || first.FactorID == "" {
		t.Fatalf("stage abandoned recovery: %v", err)
	}
	next, err := service.beginRecovery(ctx, recoverySession, oldCodes[0])
	if err != nil || next.FactorID == "" || next.FactorID == first.FactorID {
		t.Fatalf("stage replacement after abandonment: %v", err)
	}
	status, err := service.status(ctx, oldSession)
	if err != nil || !status.Enabled || !status.SessionVerified {
		t.Fatalf("staging changed original assurance: %v", err)
	}
	if status, err := service.status(ctx, recoverySession); err != nil || status.SessionVerified {
		t.Fatal("staging elevated the recovery session")
	}
	step := time.Now().Unix() / 30
	code := mfaTestCode(next.Secret, step)
	if got, err := service.confirmRecovery(ctx, otherSession, next.FactorID, code); !errors.Is(err, ErrInvalidToken) || got != nil {
		t.Fatal("another session was allowed to confirm")
	}
	if got, err := service.confirmRecovery(ctx, recoverySession, next.FactorID, "invalid"); !errors.Is(err, ErrInvalidToken) || got != nil {
		t.Fatal("invalid TOTP was allowed to confirm")
	}
	if _, err := pool.Exec(ctx, `UPDATE users SET display_name='Synthetic rollback recovery' WHERE id=$1`, user); err != nil {
		t.Fatal(err)
	}
	var rejected *pgconn.PgError
	if got, err := service.confirmRecovery(ctx, recoverySession, next.FactorID, code); !errors.As(err, &rejected) || rejected.Message != "Synthetic recovery audit rejection" || got != nil {
		t.Fatalf("expected audit failure without code disclosure: %v", err)
	}
	if status, err := service.status(ctx, oldSession); err != nil || !status.SessionVerified {
		t.Fatal("failed recovery invalidated original assurance")
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM auth_mfa_recovery_codes
		WHERE user_id=$1 AND factor_id=$2 AND used_at IS NULL`, user, old.FactorID).Scan(&count); err != nil || count != 10 {
		t.Fatal("failed recovery consumed a recovery code")
	}
	if _, err := pool.Exec(ctx, `UPDATE users SET display_name='Synthetic recovery user' WHERE id=$1`, user); err != nil {
		t.Fatal(err)
	}
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for i := 0; i < 2; i++ {
		wg.Go(func() {
			codes, err := service.confirmRecovery(ctx, recoverySession, next.FactorID, code)
			if (err == nil && len(codes) != 10) || (err != nil && codes != nil) {
				t.Error("unexpected recovery-code disclosure")
			}
			results <- err
		})
	}
	wg.Wait()
	close(results)
	accepted := 0
	for err := range results {
		if err == nil {
			accepted++
		} else if !errors.Is(err, ErrInvalidToken) {
			t.Fatalf("unexpected concurrent recovery result: %v", err)
		}
	}
	if accepted != 1 {
		t.Fatalf("successful confirmations = %d, want 1", accepted)
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL`, user).Scan(&count); err != nil || count != 0 {
		t.Fatal("prior sessions still live")
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM auth_mfa_recovery_codes WHERE user_id=$1 AND factor_id=$2 AND used_at IS NOT NULL`, user, old.FactorID).Scan(&count); err != nil || count != 1 {
		t.Fatal("original code was not consumed exactly once")
	}
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM auth_mfa_factors WHERE user_id=$1 AND id=$2 AND revoked_at IS NULL AND activated_at IS NOT NULL`, user, next.FactorID).Scan(&count); err != nil || count != 1 {
		t.Fatal("replacement factor was not activated")
	}
	if _, err := service.status(ctx, foreignSession); err != nil {
		t.Fatal("foreign session was revoked")
	}
	if got, err := service.confirmRecovery(ctx, recoverySession, next.FactorID, code); !errors.Is(err, ErrInvalidToken) || got != nil {
		t.Fatal("replay confirmed or redisclosed codes")
	}

	t.Run("HTTP recovery and replay", func(t *testing.T) {
		const email = "recovery-http@example.test"
		user := newUser(email)
		token := session(user, true)
		old, err := service.beginEnrollment(ctx, token)
		if err != nil {
			t.Fatal(err)
		}
		codes, err := service.confirmEnrollment(ctx, token, mfaTestCode(old.Secret, time.Now().Unix()/30))
		if err != nil || len(codes) != 10 {
			t.Fatal("failed to enroll HTTP fixture")
		}
		router := chi.NewRouter()
		handler := Handler{Service: &Service{Pool: pool, SessionTTL: time.Hour}, MFA: service, Origins: []string{"https://example.test"}}
		handler.Routes(router)
		csrf, _ := CSRFForToken(token)
		post := func(path, body, origin, proof string, want int) *httptest.ResponseRecorder {
			t.Helper()
			request := httptest.NewRequest(http.MethodPost, "/auth/mfa"+path, strings.NewReader(body))
			request.AddCookie(&http.Cookie{Name: handler.cookieName(), Value: token})
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set("Origin", origin)
			request.Header.Set("X-CSRF-Token", proof)
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			if response.Code != want || response.Header().Get("Cache-Control") != "no-store" {
				t.Fatalf("unexpected recovery HTTP status %d, want %d; no-store=%v", response.Code, want, response.Header().Get("Cache-Control") == "no-store")
			}
			return response
		}
		const origin = "https://example.test"
		body := `{"recovery_code":"` + codes[0] + `"}`
		post("/recovery", body, "https://other.example.test", csrf, 403)
		post("/recovery", body, origin, "", 403)
		post("/recovery", `{"recovery_code":"invalid"}`, origin, csrf, 400)
		response := post("/recovery", body, origin, csrf, 200)
		var staged struct {
			Data struct {
				FactorID  string    `json:"factor_id"`
				Secret    string    `json:"secret"`
				ExpiresAt time.Time `json:"expires_at"`
			}
		}
		if err := json.Unmarshal(response.Body.Bytes(), &staged); err != nil || staged.Data.FactorID == "" || !staged.Data.ExpiresAt.After(time.Now()) {
			t.Fatal("invalid pending recovery response")
		}
		secret, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(staged.Data.Secret)
		if err != nil || len(secret) != 20 {
			t.Fatal("invalid replacement secret")
		}
		defer clear(secret)
		step := time.Now().Unix() / 30
		body = `{"factor_id":"` + staged.Data.FactorID + `","code":"` + mfaTestCode(secret, step) + `"}`
		post("/recovery/confirm", body, origin, "", 403)
		response = post("/recovery/confirm", body, origin, csrf, 200)
		var confirmed struct {
			Data struct {
				RecoveryCodes []string `json:"recovery_codes"`
			}
		}
		if err := json.Unmarshal(response.Body.Bytes(), &confirmed); err != nil || len(confirmed.Data.RecoveryCodes) != 10 {
			t.Fatal("invalid confirmation response")
		}
		replay := post("/recovery/confirm", body, origin, csrf, 401)
		if strings.Contains(replay.Body.String(), "recovery_codes") {
			t.Fatal("confirmation replay disclosed codes")
		}

		profile, nextToken, nextCSRF, err := handler.Service.Login(ctx, email, fixturePassword)
		if err != nil || profile.ID != user || nextToken == token {
			t.Fatalf("password sign-in after recovery: %v", err)
		}
		token, csrf = nextToken, nextCSRF
		recent := func(want error) {
			t.Helper()
			current, err := handler.Service.Current(ctx, token)
			if err != nil {
				t.Fatalf("load new session: %v", err)
			}
			tx, err := pool.Begin(ctx)
			if err != nil {
				t.Fatal(err)
			}
			defer tx.Rollback(ctx)
			access, err := RequireRecentMFA(withSession(ctx, current), tx, user)
			if !errors.Is(err, want) || (access == nil) != (want != nil) {
				t.Fatalf("recent MFA check: %v, want %v", err, want)
			}
		}
		recent(ErrMFARequired)
		post("/challenge", `{"code":"`+mfaTestCode(secret, step)+`"}`, origin, csrf, 400)
		post("/challenge", `{"code":"`+mfaTestCode(secret, step+1)+`"}`, origin, csrf, 200)
		recent(nil)
	})
}
