package identity

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"smartpos/api/internal/platform/database"
)

func TestMFAGateIsolatedDatabase(t *testing.T) {
	dsn := os.Getenv("SMARTPOS_MFA_TEST_DSN")
	if dsn == "" {
		t.Skip("requires explicitly provisioned task-owned MFA database")
	}
	config, err := pgxpool.ParseConfig(dsn)
	if err != nil || config.ConnConfig.Host != "127.0.0.1" || config.ConnConfig.Port != 15514 || config.ConnConfig.Database != "smartpos_single_store_acceptance" {
		t.Fatal("refusing unconfirmed isolated MFA gate target")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	pool, err := database.Open(ctx, dsn)
	if err != nil {
		t.Fatal("isolated database unavailable")
	}
	defer pool.Close()
	var marker, role, isolation string
	var privileged bool
	if err = pool.QueryRow(ctx, `SELECT marker,current_user,(SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname=current_user),current_setting('transaction_isolation') FROM single_store_acceptance_marker`).Scan(&marker, &role, &privileged, &isolation); err != nil || marker != "ephemeral-single-store" || role != "smartpos_runtime" || privileged || isolation != "read committed" {
		t.Fatal("isolated runtime role/target/isolation not confirmed")
	}
	hash, err := HashPassword("Synthetic-gate-password-2026")
	if err != nil {
		t.Fatal(err)
	}
	var user string
	if err = pool.QueryRow(ctx, `INSERT INTO users(email,email_normalized,password_hash,display_name,email_verified_at) VALUES('mfa-gate@example.test','mfa-gate@example.test',$1,'Synthetic gate user',clock_timestamp()) RETURNING id`, hash).Scan(&user); err != nil {
		t.Fatal(err)
	}
	token, tokenHash, err := RandomToken()
	if err != nil {
		t.Fatal(err)
	}
	_, csrfHash := CSRFForToken(token)
	var sessionID string
	if err = pool.QueryRow(ctx, `INSERT INTO auth_sessions(user_id,token_hash,csrf_hash,expires_at) VALUES($1,$2,$3,clock_timestamp()+interval '1 hour') RETURNING id`, user, tokenHash[:], csrfHash[:]).Scan(&sessionID); err != nil {
		t.Fatal(err)
	}
	crypto, err := NewMFAService(pool, "synthetic-gate-key", bytes.Repeat([]byte{0x42}, 32))
	if err != nil {
		t.Fatal(err)
	}
	enrollment, err := crypto.beginEnrollment(ctx, token)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = crypto.confirmEnrollment(ctx, token, mfaTestCode(enrollment.Secret, time.Now().Unix()/30)); err != nil {
		t.Fatal(err)
	}
	current, err := (&Service{Pool: pool}).Current(ctx, token)
	if err != nil || current.ID != sessionID {
		t.Fatal("Current must bind the internal identity to the actual server session")
	}
	encoded, err := json.Marshal(current)
	if err != nil || bytes.Contains(encoded, []byte(sessionID)) {
		t.Fatal("internal session identity must not be serialized")
	}
	ctx = withSession(ctx, current)
	tx, err := pool.Begin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback(ctx)
	access, err := RequireMFA(ctx, tx, user)
	if err != nil || access == nil || access.Recheck(ctx) != nil {
		t.Fatalf("valid live MFA session must authorize its transaction: %v", err)
	}
	if err = tx.Rollback(ctx); err != nil {
		t.Fatal(err)
	}
	if access.Recheck(ctx) == nil {
		t.Fatal("authorization must not survive its transaction")
	}
	var otherUser, otherSession string
	if err = pool.QueryRow(ctx, `INSERT INTO users(email,email_normalized,password_hash,display_name,email_verified_at) VALUES('mfa-gate-foreign@example.test','mfa-gate-foreign@example.test',$1,'Synthetic foreign user',clock_timestamp()) RETURNING id`, hash).Scan(&otherUser); err != nil {
		t.Fatal(err)
	}
	if err = pool.QueryRow(ctx, `INSERT INTO auth_sessions(user_id,token_hash,csrf_hash,expires_at) VALUES($1,decode(repeat('91',32),'hex'),decode(repeat('92',32),'hex'),clock_timestamp()+interval '1 hour') RETURNING id`, otherUser).Scan(&otherSession); err != nil {
		t.Fatal(err)
	}
	snapshot := func() string {
		t.Helper()
		var digest string
		if err := pool.QueryRow(ctx, `SELECT md5(concat(
		 (SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM auth_sessions s),
		 (SELECT jsonb_agg(to_jsonb(f) ORDER BY id) FROM auth_mfa_factors f),
		 (SELECT jsonb_agg(to_jsonb(c) ORDER BY user_id,factor_id,code_hash) FROM auth_mfa_recovery_codes c),
		 (SELECT jsonb_agg(to_jsonb(a) ORDER BY id) FROM auth_audit_events a),
		 (SELECT jsonb_agg(to_jsonb(u) ORDER BY id) FROM users u)))`).Scan(&digest); err != nil {
			t.Fatal(err)
		}
		return digest
	}
	baseline := snapshot()
	for _, test := range []struct {
		name string
		sql  string
		want error
	}{
		{"disabled user", `UPDATE users SET status='DISABLED' WHERE id=$1`, ErrInvalidToken},
		{"unverified user", `UPDATE users SET email_verified_at=NULL WHERE id=$1`, ErrInvalidToken},
		{"future verification", `UPDATE users SET email_verified_at=clock_timestamp()+interval '1 minute' WHERE id=$1`, ErrInvalidToken},
		{"revoked session", `UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE user_id=$1`, ErrInvalidToken},
		{"expired session", `UPDATE auth_sessions SET expires_at=clock_timestamp()-interval '1 microsecond' WHERE user_id=$1`, ErrInvalidToken},
		{"future session", `UPDATE auth_sessions SET created_at=clock_timestamp()+interval '1 minute',mfa_verified_at=clock_timestamp()+interval '2 minutes' WHERE user_id=$1`, ErrInvalidToken},
		{"no assurance", `UPDATE auth_sessions SET mfa_factor_id=NULL,mfa_verified_at=NULL WHERE user_id=$1`, ErrMFARequired},
		{"future proof", `UPDATE auth_sessions SET mfa_verified_at=clock_timestamp()+interval '1 minute' WHERE user_id=$1`, ErrMFARequired},
		{"preactivation proof", `UPDATE auth_sessions s SET mfa_verified_at=f.activated_at-interval '1 microsecond' FROM auth_mfa_factors f WHERE s.user_id=$1 AND f.id=s.mfa_factor_id`, ErrMFARequired},
		{"pending factor", `UPDATE auth_mfa_factors SET activated_at=NULL WHERE user_id=$1`, ErrMFARequired},
		{"revoked factor", `UPDATE auth_mfa_factors SET revoked_at=clock_timestamp() WHERE user_id=$1`, ErrMFARequired},
		{"future activation", `UPDATE auth_mfa_factors SET activated_at=clock_timestamp()+interval '1 minute' WHERE user_id=$1`, ErrMFARequired},
	} {
		t.Run(test.name, func(t *testing.T) {
			tx, err := pool.Begin(ctx)
			if err != nil {
				t.Fatal(err)
			}
			defer tx.Rollback(ctx)
			if _, err = tx.Exec(ctx, `SELECT set_config('app.user_id',$1,true),set_config('app.organization_id','',true)`, user); err != nil {
				t.Fatal(err)
			}
			if _, err = tx.Exec(ctx, test.sql, user); err != nil {
				t.Fatal(err)
			}
			access, err := RequireMFA(ctx, tx, user)
			if !errors.Is(err, test.want) || access != nil {
				t.Fatalf("ineligible session accepted or wrong denial: %v", err)
			}
			if err = tx.Rollback(ctx); err != nil {
				t.Fatal(err)
			}
			if snapshot() != baseline {
				t.Fatal("denial rollback changed identity, assurance, recovery or audit history")
			}
		})
	}
	for _, test := range []struct {
		name    string
		session Session
		actor   string
	}{
		{"missing session context", Session{}, user},
		{"missing internal session identity", Session{User: current.User}, user},
		{"different actor", current, otherUser},
		{"foreign session", Session{ID: otherSession, User: current.User}, user},
		{"foreign account", Session{ID: sessionID, User: Profile{ID: otherUser}}, otherUser},
	} {
		t.Run(test.name, func(t *testing.T) {
			tx, err := pool.Begin(ctx)
			if err != nil {
				t.Fatal(err)
			}
			defer tx.Rollback(ctx)
			access, err := RequireMFA(withSession(ctx, test.session), tx, test.actor)
			if !errors.Is(err, ErrInvalidToken) || access != nil {
				t.Fatalf("incorrect actor/session binding accepted: %v", err)
			}
		})
	}
	t.Run("active factor outlives enrollment expiry", func(t *testing.T) {
		tx, err := pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(ctx)
		if _, err = tx.Exec(ctx, `UPDATE auth_mfa_factors SET revoked_at=clock_timestamp() WHERE user_id=$1`, user); err != nil {
			t.Fatal(err)
		}
		var factor string
		if err = tx.QueryRow(ctx, `SELECT gen_random_uuid()::text`).Scan(&factor); err != nil {
			t.Fatal(err)
		}
		box, err := newMFASecretCipher(bytes.Repeat([]byte{0x42}, 32))
		if err != nil {
			t.Fatal(err)
		}
		encrypted, err := box.seal(user, factor, enrollment.Secret)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = tx.Exec(ctx, `INSERT INTO auth_mfa_factors(id,user_id,secret_key_id,secret_ciphertext,created_at,expires_at,activated_at,last_step) VALUES($1,$2,'synthetic-gate-key',$3,clock_timestamp()-interval '10 minutes',clock_timestamp()-interval '5 minutes',clock_timestamp()-interval '6 minutes',0)`, factor, user, encrypted); err != nil {
			t.Fatal(err)
		}
		if _, err = tx.Exec(ctx, `UPDATE auth_sessions SET mfa_factor_id=$2,mfa_verified_at=clock_timestamp() WHERE id=$1`, sessionID, factor); err != nil {
			t.Fatal(err)
		}
		if access, err := RequireMFA(ctx, tx, user); err != nil || access == nil {
			t.Fatalf("enrollment expiry incorrectly revoked activated factor: %v", err)
		}
	})
	t.Run("assurance rechecks after a later transaction wait", func(t *testing.T) {
		tx, err := pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(ctx)
		var cutoff time.Time
		if err = tx.QueryRow(ctx, `UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '1 second' WHERE id=$1 RETURNING expires_at`, sessionID).Scan(&cutoff); err != nil {
			t.Fatal(err)
		}
		access, err := RequireMFA(ctx, tx, user)
		if err != nil {
			t.Fatal(err)
		}
		// A separate transaction holds the business/advisory lock after assurance.
		blocker, err := pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer blocker.Rollback(ctx)
		var blockerPID int32
		if err = blocker.QueryRow(ctx, `SELECT pg_backend_pid() FROM pg_advisory_xact_lock(430021)`).Scan(&blockerPID); err != nil {
			t.Fatal(err)
		}
		result := make(chan error, 1)
		go func() {
			if _, err := tx.Exec(ctx, `SELECT pg_advisory_xact_lock(430021)`); err != nil {
				result <- err
				return
			}
			result <- access.Recheck(ctx)
		}()
		waitMFAGateBlocked(t, ctx, pool, blockerPID, cutoff)
		if err = blocker.Rollback(ctx); err != nil {
			t.Fatal(err)
		}
		if err = <-result; !errors.Is(err, ErrInvalidToken) {
			t.Fatalf("expired assurance survived later business lock: %v", err)
		}
		// The caller rolls back any work already performed before final rechecking.
		if _, err = tx.Exec(ctx, `INSERT INTO auth_audit_events(user_id,event_type) VALUES($1,'MFA_CHALLENGE')`, user); err != nil {
			t.Fatal(err)
		}
		if err = tx.Rollback(ctx); err != nil || snapshot() != baseline {
			t.Fatal("denial failed to roll back protected effects")
		}
	})
	for _, boundary := range []string{"expiry", "logout", "factor-expiry"} {
		t.Run("session lock rechecks "+boundary, func(t *testing.T) {
			fixture := newMFAGateAccount(t, ctx, pool, hash, "lock-"+boundary)
			authenticated := withSession(ctx, fixture.session)
			var cutoff time.Time
			if boundary == "expiry" || boundary == "factor-expiry" {
				if err = pool.QueryRow(ctx, `UPDATE auth_sessions SET expires_at=clock_timestamp()+interval '1 second' WHERE id=$1 RETURNING expires_at`, fixture.session.ID).Scan(&cutoff); err != nil {
					t.Fatal(err)
				}
			}
			blocker, err := pool.Begin(ctx)
			if err != nil {
				t.Fatal(err)
			}
			defer blocker.Rollback(ctx)
			var blockerPID int32
			lockSQL, lockID := `SELECT pg_backend_pid() FROM auth_sessions WHERE id=$1 FOR UPDATE`, fixture.session.ID
			if boundary == "factor-expiry" {
				lockSQL, lockID = `SELECT pg_backend_pid() FROM auth_mfa_factors WHERE user_id=$1 AND revoked_at IS NULL FOR UPDATE`, fixture.userID
			}
			if err = blocker.QueryRow(ctx, lockSQL, lockID).Scan(&blockerPID); err != nil {
				t.Fatal(err)
			}
			if boundary == "logout" {
				if _, err = blocker.Exec(ctx, `UPDATE auth_sessions SET revoked_at=clock_timestamp() WHERE id=$1`, fixture.session.ID); err != nil {
					t.Fatal(err)
				}
			}
			result := make(chan error, 1)
			go func() {
				tx, err := pool.Begin(authenticated)
				if err != nil {
					result <- err
					return
				}
				defer tx.Rollback(authenticated)
				_, err = RequireMFA(authenticated, tx, fixture.userID)
				result <- err
			}()
			waitMFAGateBlocked(t, ctx, pool, blockerPID, cutoff)
			if boundary == "logout" {
				// Match Logout's session-first update and user-FK audit path.
				if _, err = blocker.Exec(ctx, `INSERT INTO auth_audit_events(user_id,event_type) VALUES($1,'LOGOUT')`, fixture.userID); err != nil {
					t.Fatal(err)
				}
			}
			if err = blocker.Commit(ctx); err != nil {
				t.Fatal(err)
			}
			if err = <-result; !errors.Is(err, ErrInvalidToken) {
				t.Fatalf("session eligibility survived initial lock wait: %v", err)
			}
		})
	}
	for _, operation := range []string{"logout", "factor-revocation", "password-reset"} {
		t.Run("gate serializes "+operation, func(t *testing.T) {
			fixture := newMFAGateAccount(t, ctx, pool, hash, "gate-first-"+operation)
			authenticated := withSession(ctx, fixture.session)
			reset, resetHash, err := RandomToken()
			if err != nil {
				t.Fatal(err)
			}
			if operation == "password-reset" {
				if _, err = pool.Exec(ctx, `INSERT INTO password_reset_tokens(user_id,token_hash,expires_at) VALUES($1,$2,clock_timestamp()+interval '15 minutes')`, fixture.userID, resetHash[:]); err != nil {
					t.Fatal(err)
				}
			}
			tx, err := pool.Begin(authenticated)
			if err != nil {
				t.Fatal(err)
			}
			defer tx.Rollback(authenticated)
			access, err := RequireMFA(authenticated, tx, fixture.userID)
			if err != nil {
				t.Fatal(err)
			}
			var gatePID int32
			if err = tx.QueryRow(ctx, `SELECT pg_backend_pid()`).Scan(&gatePID); err != nil {
				t.Fatal(err)
			}
			result := make(chan error, 1)
			go func() {
				service := &Service{Pool: pool}
				switch operation {
				case "logout":
					result <- service.Logout(ctx, fixture.token, fixture.userID)
				case "password-reset":
					result <- service.Reset(ctx, reset, "Synthetic-gate-new-password-2026")
				default:
					change, err := pool.Begin(ctx)
					if err != nil {
						result <- err
						return
					}
					defer change.Rollback(ctx)
					if _, err = change.Exec(ctx, `SELECT id FROM users WHERE id=$1 FOR NO KEY UPDATE`, fixture.userID); err == nil {
						_, err = change.Exec(ctx, `UPDATE auth_mfa_factors SET revoked_at=clock_timestamp() WHERE user_id=$1 AND revoked_at IS NULL`, fixture.userID)
					}
					if err == nil {
						err = change.Commit(ctx)
					}
					result <- err
				}
			}()
			waitMFAGateBlocked(t, ctx, pool, gatePID, time.Time{})
			if err = access.Recheck(authenticated); err != nil {
				t.Fatal("waiting revocation changed the protected transaction")
			}
			if err = tx.Commit(authenticated); err != nil {
				t.Fatal(err)
			}
			if err = <-result; err != nil {
				t.Fatalf("security writer must finish without deadlock: %v", err)
			}
			after, err := pool.Begin(authenticated)
			if err != nil {
				t.Fatal(err)
			}
			defer after.Rollback(authenticated)
			_, err = RequireMFA(authenticated, after, fixture.userID)
			want := ErrInvalidToken
			if operation == "factor-revocation" {
				want = ErrMFARequired
			}
			if !errors.Is(err, want) {
				t.Fatalf("stale assurance survived committed security change: %v", err)
			}
		})
	}
	for _, action := range []string{"GRANT", "REVOKE"} {
		t.Run("gate serializes Admin "+action, func(t *testing.T) {
			adminConfig, err := pgx.ParseConfig(os.Getenv("SMARTPOS_ADMIN_TEST_DSN"))
			if err != nil || adminConfig.Host != "127.0.0.1" || adminConfig.Port != 15514 || adminConfig.Database != "smartpos_single_store_acceptance" {
				t.Fatal("explicit isolated authority fixture connection required")
			}
			admin, err := pgx.ConnectConfig(ctx, adminConfig)
			if err != nil {
				t.Fatal("isolated authority fixture unavailable")
			}
			defer admin.Close(ctx)
			var adminMarker string
			if err = admin.QueryRow(ctx, `SELECT marker FROM single_store_acceptance_marker`).Scan(&adminMarker); err != nil || adminMarker != "ephemeral-single-store" {
				t.Fatal("isolated authority target marker missing")
			}
			fixture := newMFAGateAccount(t, ctx, pool, hash, "admin-"+action)
			var operationID string
			if err = pool.QueryRow(ctx, `SELECT gen_random_uuid()::text`).Scan(&operationID); err != nil {
				t.Fatal(err)
			}
			input := PlatformAdminRequest{OperationID: operationID, UserID: fixture.userID, Action: action, Operator: "synthetic-gate-operator", Reason: "Isolated gate concurrency acceptance"}
			if action == "REVOKE" {
				grant := input
				grant.Action = "GRANT"
				if _, err = ProvisionPlatformAdmin(ctx, admin, grant); err != nil {
					t.Fatal(err)
				}
				if err = pool.QueryRow(ctx, `SELECT gen_random_uuid()::text`).Scan(&input.OperationID); err != nil {
					t.Fatal(err)
				}
				// A new primary login and real proof follow the grant's revocation.
				_, token, _, err := (&Service{Pool: pool, SessionTTL: time.Hour}).Login(ctx, "mfa-gate-admin-REVOKE@example.test", "Synthetic-gate-password-2026")
				if err != nil {
					t.Fatal(err)
				}
				crypto, err := NewMFAService(pool, "synthetic-gate-key", bytes.Repeat([]byte{0x42}, 32))
				if err != nil {
					t.Fatal(err)
				}
				if err = crypto.challenge(ctx, token, mfaTestCode(fixture.secret, time.Now().Unix()/30+1)); err != nil {
					t.Fatal(err)
				}
				fixture.session, err = (&Service{Pool: pool}).Current(ctx, token)
				if err != nil {
					t.Fatal(err)
				}
			}
			authenticated := withSession(ctx, fixture.session)
			tx, err := pool.Begin(authenticated)
			if err != nil {
				t.Fatal(err)
			}
			defer tx.Rollback(authenticated)
			access, err := RequireMFA(authenticated, tx, fixture.userID)
			if err != nil {
				t.Fatal(err)
			}
			var gatePID int32
			if err = tx.QueryRow(ctx, `SELECT pg_backend_pid()`).Scan(&gatePID); err != nil {
				t.Fatal(err)
			}
			result := make(chan error, 1)
			go func() {
				_, err := ProvisionPlatformAdmin(ctx, admin, input)
				result <- err
			}()
			waitMFAGateBlocked(t, ctx, pool, gatePID, time.Time{})
			if err = access.Recheck(authenticated); err != nil {
				t.Fatal(err)
			}
			if err = tx.Commit(authenticated); err != nil {
				t.Fatal(err)
			}
			if err = <-result; err != nil {
				t.Fatalf("Admin transition must finish without deadlock: %v", err)
			}
			after, err := pool.Begin(authenticated)
			if err != nil {
				t.Fatal(err)
			}
			defer after.Rollback(authenticated)
			if _, err = RequireMFA(authenticated, after, fixture.userID); !errors.Is(err, ErrInvalidToken) {
				t.Fatal("old session survived Admin transition")
			}
		})
	}
}

type mfaGateAccount struct {
	userID, token string
	session       Session
	secret        []byte
}

func newMFAGateAccount(t *testing.T, ctx context.Context, pool *pgxpool.Pool, hash, name string) mfaGateAccount {
	t.Helper()
	fixture := mfaGateAccount{}
	email := "mfa-gate-" + strings.ToLower(name) + "@example.test"
	if err := pool.QueryRow(ctx, `INSERT INTO users(email,email_normalized,password_hash,display_name,email_verified_at) VALUES($1,$1,$2,'Synthetic gate account',clock_timestamp()) RETURNING id`, email, hash).Scan(&fixture.userID); err != nil {
		t.Fatal(err)
	}
	token, tokenHash, err := RandomToken()
	if err != nil {
		t.Fatal(err)
	}
	fixture.token = token
	_, csrfHash := CSRFForToken(token)
	if _, err = pool.Exec(ctx, `INSERT INTO auth_sessions(user_id,token_hash,csrf_hash,expires_at) VALUES($1,$2,$3,clock_timestamp()+interval '1 hour')`, fixture.userID, tokenHash[:], csrfHash[:]); err != nil {
		t.Fatal(err)
	}
	crypto, err := NewMFAService(pool, "synthetic-gate-key", bytes.Repeat([]byte{0x42}, 32))
	if err != nil {
		t.Fatal(err)
	}
	enrollment, err := crypto.beginEnrollment(ctx, token)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = crypto.confirmEnrollment(ctx, token, mfaTestCode(enrollment.Secret, time.Now().Unix()/30)); err != nil {
		t.Fatal(err)
	}
	fixture.secret = enrollment.Secret
	fixture.session, err = (&Service{Pool: pool}).Current(ctx, token)
	if err != nil || fixture.session.ID == "" {
		t.Fatal("synthetic authenticated gate session unavailable")
	}
	return fixture
}

func waitMFAGateBlocked(t *testing.T, ctx context.Context, pool *pgxpool.Pool, blocker int32, cutoff time.Time) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		var blocked, crossed bool
		if err := pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid))),clock_timestamp()>=$2`, blocker, cutoff).Scan(&blocked, &crossed); err != nil {
			t.Fatal(err)
		}
		if blocked && crossed {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("expected lock/time rendezvous not reached")
}
