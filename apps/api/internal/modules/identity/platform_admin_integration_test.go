package identity

import (
	"context"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

func TestPlatformAdminIsolatedDatabase(t *testing.T) {
	dsn := os.Getenv("SMARTPOS_ADMIN_TEST_DSN")
	if dsn == "" {
		t.Skip("requires explicitly provisioned task-owned authority database")
	}
	config, err := pgx.ParseConfig(dsn)
	if err != nil || config.Host != "127.0.0.1" || config.Port != 15514 || config.Database != "smartpos_single_store_acceptance" {
		t.Fatal("refusing unconfirmed isolated authority target")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	conn, err := pgx.ConnectConfig(ctx, config)
	if err != nil {
		t.Fatal("isolated authority database unavailable")
	}
	defer conn.Close(ctx)
	var marker string
	if err = conn.QueryRow(ctx, `SELECT marker FROM single_store_acceptance_marker`).Scan(&marker); err != nil || marker != "ephemeral-single-store" {
		t.Fatal("isolated target marker missing")
	}
	var userID, factorID, sessionID string
	err = conn.QueryRow(ctx, `INSERT INTO users(email,email_normalized,password_hash,display_name,email_verified_at) VALUES('platform-admin@example.test','platform-admin@example.test','$argon2id$synthetic','Synthetic administrator',clock_timestamp()) RETURNING id`).Scan(&userID)
	if err != nil {
		t.Fatal(err)
	}
	box, err := newMFASecretCipher(make([]byte, 32))
	if err != nil {
		t.Fatal(err)
	}
	if err = conn.QueryRow(ctx, `SELECT gen_random_uuid()::text`).Scan(&factorID); err != nil {
		t.Fatal(err)
	}
	encrypted, err := box.seal(userID, factorID, []byte("12345678901234567890"))
	if err != nil {
		t.Fatal(err)
	}
	_, err = conn.Exec(ctx, `INSERT INTO auth_mfa_factors(id,user_id,secret_key_id,secret_ciphertext,expires_at,activated_at,last_step) VALUES($1,$2,'synthetic-admin-key',$3,clock_timestamp()+interval '5 minutes',clock_timestamp(),0)`, factorID, userID, encrypted)
	if err != nil {
		t.Fatal(err)
	}
	if err = conn.QueryRow(ctx, `INSERT INTO auth_sessions(user_id,token_hash,csrf_hash,expires_at) VALUES($1,decode(repeat('71',32),'hex'),decode(repeat('72',32),'hex'),clock_timestamp()+interval '1 hour') RETURNING id`, userID).Scan(&sessionID); err != nil {
		t.Fatal(err)
	}
	request := PlatformAdminRequest{OperationID: "43000000-0000-4000-8000-000000000001", UserID: userID, Action: "GRANT", Operator: "synthetic-operator", Reason: "Verified synthetic identity for isolated acceptance"}
	result, err := ProvisionPlatformAdmin(ctx, conn, request)
	if err != nil || !result.Active || !result.Changed || result.Replayed {
		t.Fatalf("eligible grant must commit authority: result=%+v err=%v", result, err)
	}
	var active, revoked bool
	var audits int
	if err = conn.QueryRow(ctx, `SELECT status='ACTIVE' FROM platform_admins WHERE user_id=$1`, userID).Scan(&active); err != nil || !active {
		t.Fatal("durable authority missing")
	}
	if err = conn.QueryRow(ctx, `SELECT revoked_at IS NOT NULL FROM auth_sessions WHERE id=$1`, sessionID).Scan(&revoked); err != nil || !revoked {
		t.Fatal("grant must revoke pre-existing sessions")
	}
	if err = conn.QueryRow(ctx, `SELECT count(*) FROM platform_admin_audit_events WHERE target_user_id=$1 AND database_principal=current_user AND session_principal=session_user AND operator_label=$2`, userID, request.Operator).Scan(&audits); err != nil || audits != 1 {
		t.Fatal("database-derived and asserted attribution missing")
	}
	result, err = ProvisionPlatformAdmin(ctx, conn, request)
	if err != nil || !result.Replayed || !result.Active || !result.Changed {
		t.Fatal("matching retry must return original outcome")
	}
	conflicting := request
	conflicting.Reason = "Different asserted reason"
	if _, err = ProvisionPlatformAdmin(ctx, conn, conflicting); !errors.Is(err, ErrPlatformAdminConflict) {
		t.Fatal("conflicting operation reuse accepted")
	}
	revoke := request
	revoke.OperationID = "43000000-0000-4000-8000-000000000002"
	revoke.Action = "REVOKE"
	if _, err = conn.Exec(ctx, `UPDATE users SET status='DISABLED',email_verified_at=NULL WHERE id=$1`, userID); err != nil {
		t.Fatal(err)
	}
	result, err = ProvisionPlatformAdmin(ctx, conn, revoke)
	if err != nil || result.Active || !result.Changed {
		t.Fatal("disabled unverified user must remain revocable")
	}
	result, err = ProvisionPlatformAdmin(ctx, conn, request)
	if err != nil || !result.Replayed || !result.Active {
		t.Fatal("old grant retry must return original audit")
	}
	if err = conn.QueryRow(ctx, `SELECT status='ACTIVE' FROM platform_admins WHERE user_id=$1`, userID).Scan(&active); err != nil || active {
		t.Fatal("old grant retry resurrected authority")
	}
	if err = conn.QueryRow(ctx, `SELECT count(*) FROM platform_admin_audit_events WHERE target_user_id=$1`, userID).Scan(&audits); err != nil || audits != 2 {
		t.Fatal("retries must preserve audit history")
	}

	t.Run("runtime cannot provision or mutate authority history", func(t *testing.T) {
		runtimeConfig := config.Copy()
		runtimeConfig.User = "smartpos_runtime"
		runtime, err := pgx.ConnectConfig(ctx, runtimeConfig)
		if err != nil {
			t.Fatal("isolated runtime connection unavailable")
		}
		defer runtime.Close(ctx)
		for _, statement := range []string{
			`INSERT INTO platform_admins(user_id,status,created_at,granted_at,updated_at) VALUES('43000000-0000-4000-8000-000000000099','ACTIVE',now(),now(),now())`,
			`UPDATE platform_admins SET status='ACTIVE'`,
			`DELETE FROM platform_admins`,
			`TRUNCATE platform_admins`,
			`INSERT INTO platform_admin_audit_events(operation_id) VALUES(gen_random_uuid())`,
			`SELECT * FROM platform_admin_audit_events`,
			`UPDATE platform_admin_audit_events SET reason='changed'`,
			`DELETE FROM platform_admin_audit_events`,
		} {
			_, err := runtime.Exec(ctx, statement)
			var pgError *pgconn.PgError
			if !errors.As(err, &pgError) || pgError.Code != "42501" {
				t.Fatal("runtime authority mutation was not denied by privileges")
			}
		}
		if _, err = ProvisionPlatformAdmin(ctx, runtime, request); !errors.Is(err, ErrPlatformAdminDenied) {
			t.Fatal("runtime provisioning entry point accepted")
		}
	})

	t.Run("audit history cannot be rewritten", func(t *testing.T) {
		for _, statement := range []string{`UPDATE platform_admin_audit_events SET reason='changed'`, `DELETE FROM platform_admin_audit_events`, `TRUNCATE platform_admin_audit_events`} {
			_, err := conn.Exec(ctx, statement)
			var pgError *pgconn.PgError
			if !errors.As(err, &pgError) || pgError.Code != "23514" {
				t.Fatal("audit immutability was not enforced")
			}
		}
	})

	t.Run("revoked state requires revocation time", func(t *testing.T) {
		_, err := conn.Exec(ctx, `UPDATE platform_admins SET revoked_at=NULL WHERE user_id=$1`, userID)
		var pgError *pgconn.PgError
		if !errors.As(err, &pgError) || pgError.Code != "23514" {
			t.Fatal("revoked authority without timestamp accepted")
		}
	})

	t.Run("grant eligibility fails closed", func(t *testing.T) {
		for i, state := range []string{"disabled", "unverified", "no-factor", "pending-factor", "revoked-factor", "missing"} {
			id := "43000000-0000-4000-8000-000000000099"
			if state != "missing" {
				email := "platform-denied-" + state + "@example.test"
				if err := conn.QueryRow(ctx, `INSERT INTO users(email,email_normalized,password_hash,display_name,email_verified_at) VALUES($1,$1,'$argon2id$synthetic','Synthetic denied user',clock_timestamp()) RETURNING id`, email).Scan(&id); err != nil {
					t.Fatal(err)
				}
				if state == "disabled" {
					_, err = conn.Exec(ctx, `UPDATE users SET status='DISABLED' WHERE id=$1`, id)
				}
				if state == "unverified" {
					_, err = conn.Exec(ctx, `UPDATE users SET email_verified_at=NULL WHERE id=$1`, id)
				}
				if err != nil {
					t.Fatal(err)
				}
				if state != "no-factor" {
					_, err = conn.Exec(ctx, `INSERT INTO auth_mfa_factors(user_id,secret_key_id,secret_ciphertext,expires_at,activated_at,revoked_at,last_step) VALUES($1,'synthetic-key',decode(repeat('71',49),'hex'),clock_timestamp()+interval '5 minutes',CASE WHEN $2='pending-factor' THEN NULL ELSE clock_timestamp() END,CASE WHEN $2='revoked-factor' THEN clock_timestamp() ELSE NULL END,0)`, id, state)
					if err != nil {
						t.Fatal(err)
					}
				}
			}
			denied := request
			denied.UserID = id
			denied.OperationID = fmt.Sprintf("43000000-0000-4000-8000-%012d", 100+i)
			if _, err := ProvisionPlatformAdmin(ctx, conn, denied); !errors.Is(err, ErrPlatformAdminDenied) {
				t.Fatalf("grant accepted %s account", state)
			}
			var effects int
			if err := conn.QueryRow(ctx, `SELECT (SELECT count(*) FROM platform_admins WHERE user_id=$1)+(SELECT count(*) FROM platform_admin_audit_events WHERE operation_id=$2)`, id, denied.OperationID).Scan(&effects); err != nil || effects != 0 {
				t.Fatal("denied grant left authority/audit effects")
			}
		}
	})
	if _, err = conn.Exec(ctx, `UPDATE users SET status='ACTIVE',email_verified_at=clock_timestamp() WHERE id=$1`, userID); err != nil {
		t.Fatal(err)
	}

	t.Run("distinct no-op preserves grant and session", func(t *testing.T) {
		grant := request
		grant.OperationID = "43000000-0000-4000-8000-000000000201"
		if _, err := ProvisionPlatformAdmin(ctx, conn, grant); err != nil {
			t.Fatal(err)
		}
		var before, after string
		if err := conn.QueryRow(ctx, `SELECT to_jsonb(p)::text FROM platform_admins p WHERE user_id=$1`, userID).Scan(&before); err != nil {
			t.Fatal(err)
		}
		var id string
		if err := conn.QueryRow(ctx, `INSERT INTO auth_sessions(user_id,token_hash,csrf_hash,expires_at) VALUES($1,decode(repeat('75',32),'hex'),decode(repeat('76',32),'hex'),clock_timestamp()+interval '1 hour') RETURNING id`, userID).Scan(&id); err != nil {
			t.Fatal(err)
		}
		grant.OperationID = "43000000-0000-4000-8000-000000000202"
		result, err := ProvisionPlatformAdmin(ctx, conn, grant)
		if err != nil || !result.Active || result.Changed || result.Replayed {
			t.Fatal("already-active grant must be an audited no-op")
		}
		var live bool
		if err = conn.QueryRow(ctx, `SELECT revoked_at IS NULL FROM auth_sessions WHERE id=$1`, id).Scan(&live); err != nil || !live {
			t.Fatal("no-op revoked a live session")
		}
		if err = conn.QueryRow(ctx, `SELECT to_jsonb(p)::text FROM platform_admins p WHERE user_id=$1`, userID).Scan(&after); err != nil || before != after {
			t.Fatal("no-op rewrote grant history")
		}
		var recorded bool
		if err = conn.QueryRow(ctx, `SELECT NOT changed AND was_active AND is_active FROM platform_admin_audit_events WHERE operation_id=$1`, grant.OperationID).Scan(&recorded); err != nil || !recorded {
			t.Fatal("no-op audit missing")
		}
	})

	t.Run("authority and sessions roll back with audit failure", func(t *testing.T) {
		_, err := conn.Exec(ctx, `CREATE FUNCTION authority_test_audit_failure() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.operator_label='rollback-probe' THEN RAISE EXCEPTION 'synthetic audit failure' USING ERRCODE='23514'; END IF; RETURN NEW; END $$; CREATE TRIGGER authority_test_audit_failure BEFORE INSERT ON platform_admin_audit_events FOR EACH ROW EXECUTE FUNCTION authority_test_audit_failure()`)
		if err != nil {
			t.Fatal(err)
		}
		defer conn.Exec(ctx, `DROP TRIGGER authority_test_audit_failure ON platform_admin_audit_events; DROP FUNCTION authority_test_audit_failure()`)
		const snapshot = `SELECT jsonb_build_object('authority',(SELECT to_jsonb(p) FROM platform_admins p WHERE user_id=$1),'sessions',(SELECT jsonb_agg(to_jsonb(s) ORDER BY id) FROM auth_sessions s WHERE user_id=$1),'audit',(SELECT jsonb_agg(to_jsonb(a) ORDER BY operation_id) FROM platform_admin_audit_events a WHERE target_user_id=$1))::text`
		for i, action := range []string{"REVOKE", "GRANT"} {
			if action == "GRANT" {
				revoke := request
				revoke.Action = "REVOKE"
				revoke.OperationID = "43000000-0000-4000-8000-000000000203"
				if _, err := ProvisionPlatformAdmin(ctx, conn, revoke); err != nil {
					t.Fatal(err)
				}
				if _, err = conn.Exec(ctx, `INSERT INTO auth_sessions(user_id,token_hash,csrf_hash,expires_at) VALUES($1,decode(repeat('77',32),'hex'),decode(repeat('78',32),'hex'),clock_timestamp()+interval '1 hour')`, userID); err != nil {
					t.Fatal(err)
				}
			}
			failed := request
			failed.Action = action
			failed.Operator = "rollback-probe"
			failed.OperationID = fmt.Sprintf("43000000-0000-4000-8000-%012d", 210+i)
			var before, after string
			if err := conn.QueryRow(ctx, snapshot, userID).Scan(&before); err != nil {
				t.Fatal(err)
			}
			if _, err := ProvisionPlatformAdmin(ctx, conn, failed); err == nil {
				t.Fatal("injected audit failure unexpectedly committed")
			}
			if err := conn.QueryRow(ctx, snapshot, userID).Scan(&after); err != nil || before != after {
				t.Fatal("audit failure left authority/session/audit changes")
			}
		}
	})

	t.Run("concurrent matching grant has one effect", func(t *testing.T) {
		other, err := pgx.ConnectConfig(ctx, config.Copy())
		if err != nil {
			t.Fatal("isolated concurrent connection unavailable")
		}
		defer other.Close(ctx)
		grant := request
		grant.OperationID = "43000000-0000-4000-8000-000000000220"
		type outcome struct {
			result PlatformAdminResult
			err    error
		}
		results := make(chan outcome, 2)
		for _, connection := range []*pgx.Conn{conn, other} {
			go func(c *pgx.Conn) { r, e := ProvisionPlatformAdmin(ctx, c, grant); results <- outcome{r, e} }(connection)
		}
		replays := 0
		for i := 0; i < 2; i++ {
			r := <-results
			if r.err != nil || !r.result.Active || !r.result.Changed {
				t.Fatal("concurrent operation failed")
			}
			if r.result.Replayed {
				replays++
			}
		}
		if replays != 1 {
			t.Fatal("concurrent matching operations did not replay one audit")
		}
		var count int
		if err := conn.QueryRow(ctx, `SELECT count(*) FROM platform_admin_audit_events WHERE operation_id=$1`, grant.OperationID).Scan(&count); err != nil || count != 1 {
			t.Fatal("duplicate concurrent audit effects")
		}
	})

	t.Run("inherited runtime write privilege closes provisioning", func(t *testing.T) {
		if _, err := conn.Exec(ctx, `CREATE ROLE platform_admin_test_inherited NOLOGIN; GRANT INSERT ON platform_admins TO platform_admin_test_inherited; GRANT platform_admin_test_inherited TO smartpos_runtime`); err != nil {
			t.Fatal(err)
		}
		defer conn.Exec(ctx, `REVOKE platform_admin_test_inherited FROM smartpos_runtime; REVOKE INSERT ON platform_admins FROM platform_admin_test_inherited; DROP ROLE platform_admin_test_inherited`)
		grant := request
		grant.OperationID = "43000000-0000-4000-8000-000000000230"
		if _, err := ProvisionPlatformAdmin(ctx, conn, grant); !errors.Is(err, ErrPlatformAdminDenied) {
			t.Fatal("inherited runtime mutation capability was ignored")
		}
	})

	t.Run("set-role runtime write privilege closes provisioning", func(t *testing.T) {
		if _, err := conn.Exec(ctx, `CREATE ROLE platform_admin_test_settable NOLOGIN; GRANT INSERT ON platform_admins TO platform_admin_test_settable; GRANT platform_admin_test_settable TO smartpos_runtime WITH INHERIT FALSE, SET TRUE`); err != nil {
			t.Fatal(err)
		}
		defer conn.Exec(ctx, `REVOKE platform_admin_test_settable FROM smartpos_runtime; REVOKE INSERT ON platform_admins FROM platform_admin_test_settable; DROP ROLE platform_admin_test_settable`)
		var inherited, settable bool
		if err := conn.QueryRow(ctx, `SELECT has_any_column_privilege('smartpos_runtime','platform_admins','INSERT'),pg_has_role('smartpos_runtime','platform_admin_test_settable','SET')`).Scan(&inherited, &settable); err != nil || inherited || !settable {
			t.Fatal("set-role fixture did not establish a distinct escalation path")
		}
		grant := request
		grant.OperationID = "43000000-0000-4000-8000-000000000231"
		if _, err := ProvisionPlatformAdmin(ctx, conn, grant); !errors.Is(err, ErrPlatformAdminDenied) {
			t.Fatal("set-role runtime mutation capability was ignored")
		}
	})

	for _, throughManager := range []bool{false, true} {
		name := "admin-option runtime write privilege closes provisioning"
		if throughManager {
			name = "settable manager admin-option closes provisioning"
		}
		t.Run(name, func(t *testing.T) {
			if _, err := conn.Exec(ctx, `CREATE ROLE platform_admin_test_managed NOLOGIN; CREATE ROLE platform_admin_test_manager NOLOGIN; GRANT INSERT ON platform_admins TO platform_admin_test_managed`); err != nil {
				t.Fatal(err)
			}
			defer conn.Exec(ctx, `REVOKE platform_admin_test_manager FROM smartpos_runtime CASCADE; REVOKE platform_admin_test_managed FROM smartpos_runtime,platform_admin_test_manager CASCADE; REVOKE INSERT ON platform_admins FROM platform_admin_test_managed; DROP ROLE platform_admin_test_managed,platform_admin_test_manager`)
			membership := `GRANT platform_admin_test_managed TO smartpos_runtime WITH INHERIT FALSE, SET FALSE, ADMIN TRUE`
			if throughManager {
				membership = `GRANT platform_admin_test_manager TO smartpos_runtime WITH INHERIT FALSE, SET TRUE; GRANT platform_admin_test_managed TO platform_admin_test_manager WITH INHERIT FALSE, SET FALSE, ADMIN TRUE`
			}
			if _, err := conn.Exec(ctx, membership); err != nil {
				t.Fatal(err)
			}
			runtimeConfig := config.Copy()
			runtimeConfig.User = "smartpos_runtime"
			runtime, err := pgx.ConnectConfig(ctx, runtimeConfig)
			if err != nil {
				t.Fatal("isolated runtime connection unavailable")
			}
			defer runtime.Close(ctx)
			var inherited, settable bool
			if err = runtime.QueryRow(ctx, `SELECT has_any_column_privilege('smartpos_runtime','platform_admins','INSERT'),pg_has_role('smartpos_runtime','platform_admin_test_managed','SET')`).Scan(&inherited, &settable); err != nil || inherited || settable {
				t.Fatal("admin-option fixture already has mutation or SET capability")
			}
			proof, err := runtime.Begin(ctx)
			if err != nil {
				t.Fatal(err)
			}
			defer proof.Rollback(ctx)
			if throughManager {
				if _, err = proof.Exec(ctx, `SET LOCAL ROLE platform_admin_test_manager`); err != nil {
					t.Fatal("runtime could not assume manager role")
				}
			}
			if _, err = proof.Exec(ctx, `GRANT platform_admin_test_managed TO smartpos_runtime WITH SET TRUE; SET LOCAL ROLE platform_admin_test_managed`); err != nil {
				t.Fatal("ADMIN option did not reproduce role escalation")
			}
			if err = proof.QueryRow(ctx, `SELECT has_table_privilege(current_user,'platform_admins','INSERT')`).Scan(&inherited); err != nil || !inherited {
				t.Fatal("escalated role lacks authority mutation privilege")
			}
			if err = proof.Rollback(ctx); err != nil {
				t.Fatal(err)
			}
			if _, err = ProvisionPlatformAdmin(ctx, conn, request); !errors.Is(err, ErrPlatformAdminDenied) {
				t.Fatal("ADMIN-option escalation capability was ignored")
			}
		})
	}

	t.Run("grant waits for concurrent MFA revocation", func(t *testing.T) {
		observer, err := pgx.ConnectConfig(ctx, config.Copy())
		if err != nil {
			t.Fatal("isolated lock observer unavailable")
		}
		defer observer.Close(ctx)
		other, err := pgx.ConnectConfig(ctx, config.Copy())
		if err != nil {
			t.Fatal("isolated concurrent connection unavailable")
		}
		defer other.Close(ctx)
		blocker, err := conn.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer blocker.Rollback(ctx)
		var blockerPID int32
		if err = blocker.QueryRow(ctx, `SELECT pg_backend_pid() FROM users WHERE id=$1 FOR NO KEY UPDATE`, userID).Scan(&blockerPID); err != nil {
			t.Fatal(err)
		}
		if _, err = blocker.Exec(ctx, `UPDATE auth_mfa_factors SET revoked_at=clock_timestamp() WHERE id=$1`, factorID); err != nil {
			t.Fatal(err)
		}
		grant := request
		grant.OperationID = "43000000-0000-4000-8000-000000000240"
		result := make(chan error, 1)
		go func() { _, err := ProvisionPlatformAdmin(ctx, other, grant); result <- err }()
		blocked := false
		deadline := time.Now().Add(3 * time.Second)
		for time.Now().Before(deadline) {
			if err = observer.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE $1=ANY(pg_blocking_pids(pid)) AND query LIKE 'SELECT status=%FROM public.users%FOR NO KEY UPDATE%')`, blockerPID).Scan(&blocked); err != nil || blocked {
				break
			}
			time.Sleep(10 * time.Millisecond)
		}
		if err != nil || !blocked {
			t.Fatal("grant did not serialize with MFA writer")
		}
		if err = blocker.Commit(ctx); err != nil {
			t.Fatal(err)
		}
		if err = <-result; !errors.Is(err, ErrPlatformAdminDenied) {
			t.Fatal("grant used MFA state from before concurrent revocation")
		}
		var effects int
		if err = conn.QueryRow(ctx, `SELECT count(*) FROM platform_admin_audit_events WHERE operation_id=$1`, grant.OperationID).Scan(&effects); err != nil || effects != 0 {
			t.Fatal("denied concurrent grant left audit effects")
		}
	})
}
