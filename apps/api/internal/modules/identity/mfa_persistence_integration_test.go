package identity

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha1"
	"crypto/sha256"
	"encoding/base32"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"smartpos/api/internal/platform/database"
	"smartpos/api/internal/platform/httpx"
)

func TestMFAIsolatedDatabase(t *testing.T) {
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
	var count int
	if err = pool.QueryRow(ctx, "SELECT marker FROM single_store_acceptance_marker").Scan(&marker); err != nil || marker != "ephemeral-single-store" {
		t.Fatal("isolated target marker missing")
	}
	if err = pool.QueryRow(ctx, "SELECT count(*) FROM users").Scan(&count); err != nil || count != 0 {
		t.Fatal("isolated MFA fixtures require fresh empty database")
	}
	password := "Synthetic-MFA-password-2026"
	hash, err := HashPassword(password)
	if err != nil {
		t.Fatal(err)
	}
	newAccount := func(name string) (string, string) {
		t.Helper()
		var user string
		email := name + "@example.test"
		if err := pool.QueryRow(ctx, `INSERT INTO users(email,email_normalized,password_hash,display_name,email_verified_at) VALUES($1,$1,$2,'Synthetic MFA user',clock_timestamp()) RETURNING id`, email, hash).Scan(&user); err != nil {
			t.Fatal(err)
		}
		token, tokenHash, err := RandomToken()
		if err != nil {
			t.Fatal(err)
		}
		_, csrfHash := CSRFForToken(token)
		if _, err = pool.Exec(ctx, `INSERT INTO auth_sessions(user_id,token_hash,csrf_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')`, user, tokenHash[:], csrfHash[:]); err != nil {
			t.Fatal(err)
		}
		return user, token
	}
	service, err := NewMFAService(pool, "synthetic-key-v1", bytes.Repeat([]byte{0x42}, 32))
	if err != nil {
		t.Fatal(err)
	}
	user, token := newAccount("mfa-owner")
	enrollment, err := service.beginEnrollment(ctx, token)
	if err != nil || enrollment.FactorID == "" || len(enrollment.Secret) != 20 {
		t.Fatalf("begin enrollment: %v", err)
	}
	var encrypted []byte
	if err = pool.QueryRow(ctx, `SELECT secret_ciphertext FROM auth_mfa_factors WHERE user_id=$1 AND id=$2`, user, enrollment.FactorID).Scan(&encrypted); err != nil || bytes.Contains(encrypted, enrollment.Secret) {
		t.Fatal("secret not stored as ciphertext")
	}
	if _, err = service.confirmEnrollment(ctx, token, "invalid"); !errors.Is(err, ErrInvalidToken) {
		t.Fatal("invalid confirmation accepted")
	}
	code := mfaTestCode(enrollment.Secret, time.Now().Unix()/30)
	codes, err := service.confirmEnrollment(ctx, token, code)
	if err != nil || len(codes) != 10 {
		t.Fatalf("activate factor: %v", err)
	}
	var activated, assured bool
	if err = pool.QueryRow(ctx, `SELECT activated_at IS NOT NULL FROM auth_mfa_factors WHERE id=$1`, enrollment.FactorID).Scan(&activated); err != nil || !activated {
		t.Fatal("factor activation missing")
	}
	if err = pool.QueryRow(ctx, `SELECT mfa_factor_id=$2 AND mfa_verified_at IS NOT NULL FROM auth_sessions WHERE user_id=$1`, user, enrollment.FactorID).Scan(&assured); err != nil || !assured {
		t.Fatal("confirmation assurance missing")
	}
	for _, code := range codes {
		var found bool
		verifier := mfaRecoveryHash(user, enrollment.FactorID, code)
		if err = pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM auth_mfa_recovery_codes WHERE user_id=$1 AND factor_id=$2 AND code_hash=$3 AND used_at IS NULL)`, user, enrollment.FactorID, verifier[:]).Scan(&found); err != nil || !found {
			t.Fatal("hashed recovery verifier missing")
		}
	}
	if _, err = service.beginEnrollment(ctx, token); !errors.Is(err, errMFAConflict) {
		t.Fatal("active factor overwritten")
	}
	if _, err = service.confirmEnrollment(ctx, token, code); !errors.Is(err, ErrInvalidToken) {
		t.Fatal("activation replay accepted")
	}
	if err = service.challenge(ctx, token, code); !errors.Is(err, ErrInvalidToken) {
		t.Fatal("activation step reused for challenge")
	}

	// Move only the synthetic factor's replay floor so real concurrent transactions
	// can race one currently valid code without a sleep or production clock seam.
	if _, err = pool.Exec(ctx, `UPDATE auth_mfa_factors SET last_step=$2 WHERE id=$1`, enrollment.FactorID, time.Now().Unix()/30-1); err != nil {
		t.Fatal(err)
	}
	limitKey := sha256.Sum256([]byte("MFA_VERIFY:" + user))
	if _, err = pool.Exec(ctx, `UPDATE auth_rate_limits SET attempts=1 WHERE scope='MFA_VERIFY' AND key_hash=$1`, limitKey[:]); err != nil {
		t.Fatal(err)
	}
	code = mfaTestCode(enrollment.Secret, time.Now().Unix()/30)
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); results <- service.challenge(ctx, token, code) }()
	}
	wg.Wait()
	close(results)
	accepted, rejected := 0, 0
	for err := range results {
		if err == nil {
			accepted++
		} else if errors.Is(err, ErrInvalidToken) {
			rejected++
		} else {
			t.Fatalf("unexpected concurrent challenge error: %v", err)
		}
	}
	if accepted != 1 || rejected != 1 {
		t.Fatalf("concurrent proof consumption accepted=%d rejected=%d", accepted, rejected)
	}
	var challengeAudits int
	if err = pool.QueryRow(ctx, `SELECT count(*) FROM auth_audit_events WHERE user_id=$1 AND event_type='MFA_CHALLENGE'`, user).Scan(&challengeAudits); err != nil || challengeAudits != 1 {
		t.Fatal("concurrent challenge must commit one audit")
	}
	t.Run("logout and MFA lock compatibility", func(t *testing.T) {
		// Hold the same session update as Logout before its audit FK check.
		logout, err := pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer logout.Rollback(ctx)
		var blocker int32
		if err = logout.QueryRow(ctx, `SELECT pg_backend_pid()`).Scan(&blocker); err != nil {
			t.Fatal(err)
		}
		if _, err = logout.Exec(ctx, `UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE user_id=$1`, user); err != nil {
			t.Fatal(err)
		}
		result := make(chan error, 1)
		go func() { result <- service.challenge(ctx, token, code) }()
		blocked := false
		deadline := time.Now().Add(5 * time.Second)
		for time.Now().Before(deadline) {
			if err = pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) AND query LIKE 'SELECT id%FROM auth_sessions%FOR UPDATE%')`, blocker).Scan(&blocked); err != nil || blocked {
				break
			}
		}
		if err != nil || !blocked {
			t.Fatal("MFA session-lock rendezvous not reached")
		}
		_, auditErr := logout.Exec(ctx, `INSERT INTO auth_audit_events(user_id,event_type) VALUES($1,'LOGOUT')`, user)
		if auditErr != nil {
			_ = logout.Rollback(ctx)
		} else {
			auditErr = logout.Commit(ctx)
		}
		challengeErr := <-result
		if auditErr != nil || !errors.Is(challengeErr, ErrInvalidToken) {
			t.Fatalf("logout/MFA must serialize without deadlock: logout=%v challenge=%v", auditErr, challengeErr)
		}
	})

	for _, boundary := range []string{"primary-freshness", "session-expiry", "proof-clock"} {
		t.Run("session lock rechecks "+boundary, func(t *testing.T) {
			id, lockedToken := newAccount("mfa-lock-" + boundary)
			var cutoff time.Time
			switch boundary {
			case "primary-freshness":
				err = pool.QueryRow(ctx, `UPDATE auth_sessions SET created_at=clock_timestamp()-interval '298 seconds' WHERE user_id=$1 RETURNING created_at+interval '5 minutes'`, id).Scan(&cutoff)
			case "session-expiry":
				err = pool.QueryRow(ctx, `UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '2 seconds' WHERE user_id=$1 RETURNING expires_at`, id).Scan(&cutoff)
			case "proof-clock":
				err = pool.QueryRow(ctx, `SELECT clock_timestamp()+interval '2 seconds'`).Scan(&cutoff)
			}
			if err != nil {
				t.Fatal(err)
			}
			blockerTx, err := pool.Begin(ctx)
			if err != nil {
				t.Fatal(err)
			}
			defer blockerTx.Rollback(ctx)
			var blocker int32
			if err = blockerTx.QueryRow(ctx, `SELECT pg_backend_pid() FROM auth_sessions WHERE user_id=$1 FOR UPDATE`, id).Scan(&blocker); err != nil {
				t.Fatal(err)
			}
			result := make(chan error, 1)
			go func() {
				if boundary == "proof-clock" {
					result <- service.transaction(ctx, lockedToken, "MFA_VERIFY", false, func(_ pgx.Tx, session mfaSession) error {
						if session.now.Before(cutoff) {
							return errors.New("proof clock predates session lock acquisition")
						}
						return nil
					})
					return
				}
				pending, err := service.beginEnrollment(ctx, lockedToken)
				if len(pending.Secret) != 0 {
					result <- errors.New("expired authentication disclosed enrollment secret")
					return
				}
				result <- err
			}()
			blocked, crossed := false, false
			deadline := time.Now().Add(6 * time.Second)
			for time.Now().Before(deadline) {
				if err = pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) AND query LIKE 'SELECT id%FROM auth_sessions%FOR UPDATE%'),clock_timestamp()>=$2`, blocker, cutoff).Scan(&blocked, &crossed); err != nil || (blocked && crossed) {
					break
				}
				time.Sleep(10 * time.Millisecond)
			}
			if err != nil || !blocked || !crossed {
				t.Fatal("session lock must be observed across the database time boundary")
			}
			if err = blockerTx.Rollback(ctx); err != nil {
				t.Fatal(err)
			}
			operationErr := <-result
			if boundary == "proof-clock" {
				if operationErr != nil {
					t.Fatal(operationErr)
				}
			} else if !errors.Is(operationErr, ErrInvalidToken) {
				t.Fatalf("stale authentication accepted after waiting for lock: %v", operationErr)
			}
			var effects int
			if err = pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM auth_mfa_factors WHERE user_id=$1)+(SELECT count(*) FROM auth_audit_events WHERE user_id=$1)`, id).Scan(&effects); err != nil || effects != 0 {
				t.Fatal("lock-boundary test left factor or audit effects")
			}
		})
	}

	t.Run("revoked session cannot disclose enrollment", func(t *testing.T) {
		id, revokedToken := newAccount("mfa-revoked")
		if _, err := pool.Exec(ctx, `UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE user_id=$1`, id); err != nil {
			t.Fatal(err)
		}
		if result, err := service.beginEnrollment(ctx, revokedToken); !errors.Is(err, ErrInvalidToken) || len(result.Secret) != 0 {
			t.Fatal("revoked session accepted")
		}
	})
	for _, boundary := range []string{"primary-freshness", "session-expiry"} {
		t.Run("enrollment factor lock rechecks "+boundary, func(t *testing.T) {
			id, lockedToken := newAccount("mfa-factor-lock-" + boundary)
			pending, err := service.beginEnrollment(ctx, lockedToken)
			if err != nil {
				t.Fatal(err)
			}
			var cutoff time.Time
			if boundary == "primary-freshness" {
				err = pool.QueryRow(ctx, `UPDATE auth_sessions SET created_at=clock_timestamp()-interval '298 seconds' WHERE user_id=$1 RETURNING created_at+interval '5 minutes'`, id).Scan(&cutoff)
			} else {
				err = pool.QueryRow(ctx, `UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '2 seconds' WHERE user_id=$1 RETURNING expires_at`, id).Scan(&cutoff)
			}
			if err != nil {
				t.Fatal(err)
			}
			const snapshot = `SELECT (SELECT jsonb_agg(to_jsonb(f) ORDER BY id)::text FROM auth_mfa_factors f WHERE user_id=$1)||(SELECT jsonb_agg(to_jsonb(a) ORDER BY id)::text FROM auth_audit_events a WHERE user_id=$1)`
			var before string
			if err = pool.QueryRow(ctx, snapshot, id).Scan(&before); err != nil {
				t.Fatal(err)
			}
			blockerTx, err := pool.Begin(ctx)
			if err != nil {
				t.Fatal(err)
			}
			defer blockerTx.Rollback(ctx)
			var blocker int32
			if err = blockerTx.QueryRow(ctx, `SELECT pg_backend_pid() FROM auth_mfa_factors WHERE id=$1 FOR UPDATE`, pending.FactorID).Scan(&blocker); err != nil {
				t.Fatal(err)
			}
			result := make(chan error, 1)
			go func() {
				pending, err := service.beginEnrollment(ctx, lockedToken)
				if len(pending.Secret) != 0 {
					result <- errors.New("expired authentication disclosed replacement enrollment secret")
					return
				}
				result <- err
			}()
			blocked, crossed := false, false
			deadline := time.Now().Add(6 * time.Second)
			for time.Now().Before(deadline) {
				if err = pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) AND query LIKE 'SELECT activated_at IS NOT NULL FROM auth_mfa_factors%FOR UPDATE%'),clock_timestamp()>=$2`, blocker, cutoff).Scan(&blocked, &crossed); err != nil || (blocked && crossed) {
					break
				}
				time.Sleep(10 * time.Millisecond)
			}
			if err != nil || !blocked || !crossed {
				t.Fatal("factor lock must be observed across the database time boundary")
			}
			if err = blockerTx.Rollback(ctx); err != nil {
				t.Fatal(err)
			}
			if err = <-result; !errors.Is(err, ErrInvalidToken) {
				t.Fatalf("stale authentication accepted after factor lock: %v", err)
			}
			var after string
			if err = pool.QueryRow(ctx, snapshot, id).Scan(&after); err != nil || before != after {
				t.Fatal("denied enrollment rotated factor or changed audit")
			}
		})
	}
	for _, state := range []string{"unverified", "disabled", "stale-primary", "expired-session"} {
		t.Run(state, func(t *testing.T) {
			id, token := newAccount("mfa-" + state)
			var err error
			switch state {
			case "unverified":
				_, err = pool.Exec(ctx, `UPDATE users SET email_verified_at=NULL WHERE id=$1`, id)
			case "disabled":
				_, err = pool.Exec(ctx, `UPDATE users SET status='DISABLED' WHERE id=$1`, id)
			case "stale-primary":
				_, err = pool.Exec(ctx, `UPDATE auth_sessions SET created_at=now()-interval '6 minutes' WHERE user_id=$1`, id)
			case "expired-session":
				_, err = pool.Exec(ctx, `UPDATE auth_sessions SET created_at=now()-interval '2 hours',expires_at=now()-interval '1 hour' WHERE user_id=$1`, id)
			}
			if err != nil {
				t.Fatal(err)
			}
			if result, err := service.beginEnrollment(ctx, token); !errors.Is(err, ErrInvalidToken) || len(result.Secret) != 0 {
				t.Fatal("ineligible identity or stale primary accepted")
			}
			var effects int
			if err = pool.QueryRow(ctx, `SELECT count(*) FROM auth_mfa_factors WHERE user_id=$1`, id).Scan(&effects); err != nil || effects != 0 {
				t.Fatal("denied enrollment left factor effects")
			}
		})
	}
	t.Run("revoked pending factor", func(t *testing.T) {
		id, token := newAccount("mfa-expired-factor")
		pending, err := service.beginEnrollment(ctx, token)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = pool.Exec(ctx, `UPDATE auth_mfa_factors SET revoked_at=clock_timestamp() WHERE user_id=$1`, id); err != nil {
			t.Fatal(err)
		}
		if codes, err := service.confirmEnrollment(ctx, token, mfaTestCode(pending.Secret, time.Now().Unix()/30)); !errors.Is(err, ErrInvalidToken) || len(codes) != 0 {
			t.Fatal("revoked pending enrollment activated")
		}
	})
	t.Run("pending factor belongs to initiating session", func(t *testing.T) {
		id, initialToken := newAccount("mfa-session-bound")
		pending, err := service.beginEnrollment(ctx, initialToken)
		if err != nil {
			t.Fatal(err)
		}
		secondToken, secondHash, err := RandomToken()
		if err != nil {
			t.Fatal(err)
		}
		_, secondCSRF := CSRFForToken(secondToken)
		if _, err = pool.Exec(ctx, `INSERT INTO auth_sessions(user_id,token_hash,csrf_hash,expires_at) VALUES($1,$2,$3,clock_timestamp()+interval '1 hour')`, id, secondHash[:], secondCSRF[:]); err != nil {
			t.Fatal(err)
		}
		proof := mfaTestCode(pending.Secret, time.Now().Unix()/30)
		if codes, err := service.confirmEnrollment(ctx, secondToken, proof); !errors.Is(err, ErrInvalidToken) || len(codes) != 0 {
			t.Fatal("another primary session activated pending enrollment")
		}
		var untouched bool
		if err = pool.QueryRow(ctx, `SELECT activated_at IS NULL AND last_step=-1 AND NOT EXISTS(SELECT 1 FROM auth_mfa_recovery_codes WHERE user_id=$1) FROM auth_mfa_factors WHERE id=$2`, id, pending.FactorID).Scan(&untouched); err != nil || !untouched {
			t.Fatal("cross-session confirmation changed pending factor")
		}
		if codes, err := service.confirmEnrollment(ctx, initialToken, proof); err != nil || len(codes) != 10 {
			t.Fatalf("initiating session cannot confirm: %v", err)
		}
	})
	t.Run("retained unbound factors do not infer enrollment authority", func(t *testing.T) {
		for _, active := range []bool{false, true} {
			id, legacyToken := newAccount(fmt.Sprintf("mfa-unbound-%v", active))
			var factorID string
			if err := pool.QueryRow(ctx, `SELECT gen_random_uuid()::text`).Scan(&factorID); err != nil {
				t.Fatal(err)
			}
			secret := []byte("12345678901234567890")
			ciphertext, err := service.box.seal(id, factorID, secret)
			if err != nil {
				t.Fatal(err)
			}
			if _, err = pool.Exec(ctx, `INSERT INTO auth_mfa_factors(id,user_id,secret_key_id,secret_ciphertext,expires_at,activated_at,last_step) VALUES($1,$2,$3,$4,clock_timestamp()+interval '5 minutes',CASE WHEN $5::boolean THEN clock_timestamp() ELSE NULL END,CASE WHEN $5::boolean THEN floor(extract(epoch FROM clock_timestamp())/30)::bigint-1 ELSE -1 END)`, factorID, id, service.keyID, ciphertext, active); err != nil {
				t.Fatal(err)
			}
			state, err := service.status(ctx, legacyToken)
			if err != nil || state.Enabled != active || state.SessionVerified {
				t.Fatal("retained factor inferred session assurance")
			}
			proof := mfaTestCode(secret, time.Now().Unix()/30)
			if active {
				if err := service.challenge(ctx, legacyToken, proof); err != nil {
					t.Fatal("retained active factor cannot challenge")
				}
			} else {
				if codes, err := service.confirmEnrollment(ctx, legacyToken, proof); !errors.Is(err, ErrInvalidToken) || len(codes) != 0 {
					t.Fatal("unbound retained enrollment activated")
				}
				if pending, err := service.beginEnrollment(ctx, legacyToken); err != nil || pending.FactorID == factorID {
					t.Fatal("unbound pending factor cannot safely restart")
				}
			}
		}
	})
	t.Run("foreign session has no access to another factor", func(t *testing.T) {
		_, foreignToken := newAccount("mfa-foreign")
		if err := service.challenge(ctx, foreignToken, mfaTestCode(enrollment.Secret, time.Now().Unix()/30)); !errors.Is(err, ErrInvalidToken) {
			t.Fatal("another user factor accepted")
		}
	})
	t.Run("failed attempts remain limited", func(t *testing.T) {
		_, limitedToken := newAccount("mfa-limited")
		for i := 0; i < 5; i++ {
			if err := service.challenge(ctx, limitedToken, "invalid"); !errors.Is(err, ErrInvalidToken) {
				t.Fatal("unexpected attempt result")
			}
		}
		if err := service.challenge(ctx, limitedToken, "invalid"); !errors.Is(err, errMFARateLimited) {
			t.Fatal("rolled-back attempts bypassed limiter")
		}
	})
	t.Run("HTTP enrollment and challenge boundary", func(t *testing.T) {
		id, httpToken := newAccount("mfa-http")
		csrf, _ := CSRFForToken(httpToken)
		var logs bytes.Buffer
		router := chi.NewRouter()
		router.Use(httpx.AccessLog(slog.New(slog.NewJSONHandler(&logs, nil))))
		(Handler{Service: &Service{Pool: pool}, MFA: service, Origins: []string{"https://example.test"}}).Routes(router)
		call := func(method, path, body, token, origin, proof string) *httptest.ResponseRecorder {
			t.Helper()
			request := httptest.NewRequest(method, "/auth/mfa"+path, strings.NewReader(body))
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set("Origin", origin)
			request.Header.Set("X-CSRF-Token", proof)
			if token != "" {
				request.AddCookie(&http.Cookie{Name: "smartpos_session", Value: token})
			}
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			if response.Header().Get("Cache-Control") != "no-store" {
				t.Fatal("MFA response may be cached")
			}
			return response
		}
		if response := call("GET", "", "", "", "", ""); response.Code != 401 {
			t.Fatal("MFA allowed anonymous access")
		}
		for _, denied := range []struct{ origin, csrf string }{{"https://foreign.test", csrf}, {"https://example.test", "wrong"}} {
			if response := call("POST", "/enrollment", "{}", httpToken, denied.origin, denied.csrf); response.Code != 403 {
				t.Fatal("MFA accepted wrong Origin or CSRF")
			}
		}
		if response := call("POST", "/enrollment", `{"user_id":"forged"}`, httpToken, "https://example.test", csrf); response.Code != 400 {
			t.Fatal("MFA accepted client authority fields")
		}
		status := func(enabled, verified bool) {
			t.Helper()
			response := call("GET", "", "", httpToken, "", "")
			var result struct {
				Data mfaStatus `json:"data"`
			}
			if response.Code != 200 || json.Unmarshal(response.Body.Bytes(), &result) != nil || result.Data.Enabled != enabled || result.Data.SessionVerified != verified {
				t.Fatal("MFA HTTP status mismatch")
			}
		}
		status(false, false)
		response := call("POST", "/enrollment", "{}", httpToken, "https://example.test", csrf)
		var pending struct {
			Data struct {
				Secret    string    `json:"secret"`
				FactorID  string    `json:"factor_id"`
				ExpiresAt time.Time `json:"expires_at"`
			} `json:"data"`
		}
		if response.Code != 200 || json.Unmarshal(response.Body.Bytes(), &pending) != nil || pending.Data.FactorID == "" || !pending.Data.ExpiresAt.After(time.Now()) {
			t.Fatal("MFA HTTP enrollment contract mismatch")
		}
		secret, err := base32.StdEncoding.WithPadding(base32.NoPadding).DecodeString(pending.Data.Secret)
		if err != nil || len(secret) != 20 {
			t.Fatal("MFA HTTP secret is not supported Base32")
		}
		defer clear(secret)
		status(false, false)
		for _, body := range []string{`{}`, `{"code":123456}`, `{"code":null}`, `{"code":"12345"}`, `{"code":"123456","user_id":"forged"}`, `{"code":"123456"} {}`, strings.Repeat("x", 4097)} {
			if response := call("POST", "/enrollment/confirm", body, httpToken, "https://example.test", csrf); response.Code != 400 {
				t.Fatal("MFA accepted malformed proof body")
			}
		}
		proof, _ := json.Marshal(map[string]string{"code": mfaTestCode(secret, time.Now().Unix()/30)})
		response = call("POST", "/enrollment/confirm", string(proof), httpToken, "https://example.test", csrf)
		var confirmed struct {
			Data struct {
				Codes []string `json:"recovery_codes"`
			} `json:"data"`
		}
		if response.Code != 200 || json.Unmarshal(response.Body.Bytes(), &confirmed) != nil || len(confirmed.Data.Codes) != 10 {
			t.Fatal("MFA HTTP confirmation contract mismatch")
		}
		status(true, true)
		if response := call("POST", "/enrollment/confirm", string(proof), httpToken, "https://example.test", csrf); response.Code != 400 || strings.Contains(response.Body.String(), "recovery_codes") {
			t.Fatal("MFA confirmation replay redisclosed recovery codes")
		}
		if response := call("POST", "/challenge", string(proof), httpToken, "https://example.test", csrf); response.Code != 400 {
			t.Fatal("MFA HTTP reused activation proof")
		}
		if response := call("POST", "/enrollment", "{}", httpToken, "https://example.test", csrf); response.Code != 409 {
			t.Fatal("MFA HTTP replaced active factor")
		}
		if _, err = pool.Exec(ctx, `UPDATE auth_sessions SET mfa_factor_id=NULL,mfa_verified_at=NULL WHERE user_id=$1`, id); err != nil {
			t.Fatal(err)
		}
		status(true, false)
		proof, _ = json.Marshal(map[string]string{"code": mfaTestCode(secret, time.Now().Unix()/30+1)})
		if response := call("POST", "/challenge", string(proof), httpToken, "https://example.test", csrf); response.Code != 200 {
			t.Fatal("MFA HTTP challenge failed")
		}
		status(true, true)
		if _, err = pool.Exec(ctx, `UPDATE auth_mfa_factors SET revoked_at=clock_timestamp() WHERE user_id=$1`, id); err != nil {
			t.Fatal(err)
		}
		status(false, false)
		for _, sensitive := range append(confirmed.Data.Codes, pending.Data.Secret, httpToken, csrf) {
			if strings.Contains(logs.String(), sensitive) {
				t.Fatal("MFA transport logged a secret")
			}
		}
	})
	t.Run("password reset preserves factor and recovery state", func(t *testing.T) {
		reset, resetHash, err := RandomToken()
		if err != nil {
			t.Fatal(err)
		}
		if _, err = pool.Exec(ctx, `INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES($1,$2,now()+interval '15 minutes')`, user, resetHash[:]); err != nil {
			t.Fatal(err)
		}
		if err = (&Service{Pool: pool}).Reset(ctx, reset, "Synthetic-new-MFA-password-2026"); err != nil {
			t.Fatal(err)
		}
		var factors, verifiers, activeSessions int
		if err = pool.QueryRow(ctx, `SELECT (SELECT count(*) FROM auth_mfa_factors WHERE user_id=$1 AND activated_at IS NOT NULL AND revoked_at IS NULL),(SELECT count(*) FROM auth_mfa_recovery_codes WHERE user_id=$1 AND used_at IS NULL),(SELECT count(*) FROM auth_sessions WHERE user_id=$1 AND revoked_at IS NULL)`, user).Scan(&factors, &verifiers, &activeSessions); err != nil || factors != 1 || verifiers != 10 || activeSessions != 0 {
			t.Fatal("password reset weakened MFA or failed session revocation")
		}
		if err = service.challenge(ctx, token, code); !errors.Is(err, ErrInvalidToken) {
			t.Fatal("reset-revoked session elevated")
		}
	})
}

func TestMFAFailureFixturesIsolatedDatabase(t *testing.T) {
	dsn := os.Getenv("SMARTPOS_MFA_TEST_DSN")
	if dsn == "" || os.Getenv("SMARTPOS_MFA_FAILURE_FIXTURES") != "1" {
		t.Skip("requires explicit task-owned MFA failure fixtures")
	}
	config, err := pgxpool.ParseConfig(dsn)
	if err != nil || config.ConnConfig.Host != "127.0.0.1" || config.ConnConfig.Port != 15514 || config.ConnConfig.Database != "smartpos_single_store_acceptance" {
		t.Fatal("refusing unconfirmed isolated MFA target")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pool, err := database.Open(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	var marker string
	if err = pool.QueryRow(ctx, "SELECT marker FROM single_store_acceptance_marker").Scan(&marker); err != nil || marker != "ephemeral-single-store" {
		t.Fatal("isolated target marker missing")
	}
	service, err := NewMFAService(pool, "synthetic-key-v1", bytes.Repeat([]byte{0x42}, 32))
	if err != nil {
		t.Fatal(err)
	}
	// Synthetic public token bytes; matching fixture sessions are inserted only
	// by the labelled disposable runner, never from a real environment.
	const fixtureToken = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
	for _, scenario := range []string{"expired", "unknown-key", "tampered", "confirm-audit", "challenge-audit", "begin-audit"} {
		t.Run(scenario, func(t *testing.T) {
			var token string
			if scenario == "expired" {
				token = fixtureToken
			} else {
				// The runner uses deterministic, unique 32-byte synthetic tokens.
				token = os.Getenv("SMARTPOS_MFA_FIXTURE_" + strings.ToUpper(strings.ReplaceAll(scenario, "-", "_")))
			}
			if token == "" {
				t.Fatal("required synthetic fixture token missing")
			}
			var userID string
			if err := pool.QueryRow(ctx, `SELECT id FROM users WHERE email_normalized=$1`, "mfa-fixture-"+scenario+"@example.test").Scan(&userID); err != nil {
				t.Fatal(err)
			}
			var before string
			const snapshot = `SELECT COALESCE((SELECT jsonb_agg(to_jsonb(f) ORDER BY id)::text FROM auth_mfa_factors f WHERE user_id=$1),'[]') || COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY code_hash)::text FROM auth_mfa_recovery_codes c WHERE user_id=$1),'[]') || COALESCE((SELECT jsonb_agg(jsonb_build_object('factor',mfa_factor_id,'verified',mfa_verified_at) ORDER BY id)::text FROM auth_sessions WHERE user_id=$1),'[]')`
			if err := pool.QueryRow(ctx, snapshot, userID).Scan(&before); err != nil {
				t.Fatal(err)
			}
			code := mfaTestCode([]byte("12345678901234567890"), time.Now().Unix()/30)
			var operationErr error
			switch scenario {
			case "begin-audit":
				result, err := service.beginEnrollment(ctx, token)
				operationErr = err
				if len(result.Secret) != 0 {
					t.Fatal("failed begin exposed enrollment secret")
				}
			case "challenge-audit":
				operationErr = service.challenge(ctx, token, code)
			default:
				codes, err := service.confirmEnrollment(ctx, token, code)
				operationErr = err
				if len(codes) != 0 {
					t.Fatal("failed confirmation exposed recovery codes")
				}
			}
			if operationErr == nil {
				t.Fatal("failure fixture unexpectedly succeeded")
			}
			if scenario == "expired" && !errors.Is(operationErr, ErrInvalidToken) {
				t.Fatal("expired enrollment returned unexpected failure")
			}
			if (scenario == "unknown-key" || scenario == "tampered") && !errors.Is(operationErr, errMFAUnavailable) {
				t.Fatal("invalid encrypted factor did not fail closed")
			}
			if strings.HasSuffix(scenario, "audit") && !strings.Contains(operationErr.Error(), "synthetic MFA audit failure") {
				t.Fatal("audit rollback fixture did not reach its injected failure")
			}
			var after string
			if err := pool.QueryRow(ctx, snapshot, userID).Scan(&after); err != nil || before != after {
				t.Fatal("failed command left factor, recovery or assurance effects")
			}
		})
	}
}

func mfaTestCode(secret []byte, step int64) string {
	var counter [8]byte
	binary.BigEndian.PutUint64(counter[:], uint64(step))
	mac := hmac.New(sha1.New, secret)
	_, _ = mac.Write(counter[:])
	sum := mac.Sum(nil)
	offset := int(sum[len(sum)-1] & 15)
	return fmt.Sprintf("%06d", (binary.BigEndian.Uint32(sum[offset:offset+4])&0x7fffffff)%1000000)
}
