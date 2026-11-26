package identity

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/platform/database"
)

var ErrPlatformAdminDenied = errors.New("platform authority operation denied")
var ErrPlatformAdminConflict = errors.New("platform authority operation conflicts")

type PlatformAdminRequest struct {
	OperationID string
	UserID      string
	Action      string
	Operator    string
	Reason      string
}

type PlatformAdminResult struct {
	Active   bool
	Changed  bool
	Replayed bool
}

var platformAuthorityUUID = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

func (input PlatformAdminRequest) Validate() error {
	for _, id := range []string{input.OperationID, input.UserID} {
		if !platformAuthorityUUID.MatchString(id) || id == "00000000-0000-0000-0000-000000000000" {
			return ErrInvalidInput
		}
	}
	if input.Action != "GRANT" && input.Action != "REVOKE" {
		return ErrInvalidInput
	}
	for _, field := range []struct {
		value   string
		maximum int
	}{{input.Operator, 100}, {input.Reason, 500}} {
		if !utf8.ValidString(field.value) || strings.TrimSpace(field.value) != field.value || utf8.RuneCountInString(field.value) < 1 || utf8.RuneCountInString(field.value) > field.maximum {
			return ErrInvalidInput
		}
		for _, r := range field.value {
			if unicode.IsControl(r) {
				return ErrInvalidInput
			}
		}
	}
	return nil
}

// This operator-only entry point must never receive the application's runtime pool.
func ProvisionPlatformAdmin(ctx context.Context, connection *pgx.Conn, input PlatformAdminRequest) (PlatformAdminResult, error) {
	if err := input.Validate(); err != nil || connection == nil {
		return PlatformAdminResult{}, ErrInvalidInput
	}
	encoded, err := json.Marshal(input)
	if err != nil {
		return PlatformAdminResult{}, err
	}
	fingerprint := sha256.Sum256(encoded)
	tx, err := connection.Begin(ctx)
	if err != nil {
		return PlatformAdminResult{}, err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, `SET LOCAL search_path=pg_catalog,public; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='10s'`); err != nil {
		return PlatformAdminResult{}, err
	}
	var version, rows int
	var dirty bool
	err = tx.QueryRow(ctx, `SELECT count(*),coalesce(min(version),0),coalesce(bool_or(dirty),true) FROM public.schema_migrations`).Scan(&rows, &version, &dirty)
	if err != nil {
		return PlatformAdminResult{}, err
	}
	if rows != 1 || version != database.RequiredVersion || dirty {
		return PlatformAdminResult{}, ErrPlatformAdminDenied
	}
	var permitted bool
	// Include dormant memberships: ADMIN OPTION can enable a currently denied SET.
	err = tx.QueryRow(ctx, `SELECT
	    NOT EXISTS (SELECT 1 FROM pg_roles r WHERE pg_has_role('smartpos_runtime',r.oid,'MEMBER') AND (
	        r.rolsuper OR r.rolcreaterole OR
	        has_any_column_privilege(r.oid,'public.platform_admins','INSERT,UPDATE,REFERENCES') OR
	        has_table_privilege(r.oid,'public.platform_admins','DELETE,TRUNCATE,TRIGGER') OR
	        has_any_column_privilege(r.oid,'public.platform_admin_audit_events','SELECT,INSERT,UPDATE,REFERENCES') OR
	        has_table_privilege(r.oid,'public.platform_admin_audit_events','DELETE,TRUNCATE,TRIGGER'))) AND
	    has_table_privilege(current_user,'public.platform_admins','SELECT') AND
	    has_table_privilege(current_user,'public.platform_admins','INSERT') AND
	    has_table_privilege(current_user,'public.platform_admins','UPDATE') AND
	    has_table_privilege(current_user,'public.platform_admin_audit_events','SELECT') AND
	    has_table_privilege(current_user,'public.platform_admin_audit_events','INSERT')`).Scan(&permitted)
	if err != nil {
		return PlatformAdminResult{}, err
	}
	if !permitted {
		return PlatformAdminResult{}, ErrPlatformAdminDenied
	}
	// Serialize operation identity independently of the target to reject reuse
	// across users, while all security-state writes still lock their user first.
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(hashtextextended($1,43001))`, input.OperationID); err != nil {
		return PlatformAdminResult{}, err
	}
	var previous []byte
	var result PlatformAdminResult
	err = tx.QueryRow(ctx, `SELECT request_hash,is_active,changed FROM public.platform_admin_audit_events WHERE operation_id=$1`, input.OperationID).Scan(&previous, &result.Active, &result.Changed)
	if err == nil {
		if subtle.ConstantTimeCompare(previous, fingerprint[:]) != 1 {
			return PlatformAdminResult{}, ErrPlatformAdminConflict
		}
		result.Replayed = true
		return result, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return PlatformAdminResult{}, err
	}
	var eligible bool
	err = tx.QueryRow(ctx, `SELECT status='ACTIVE' AND email_verified_at IS NOT NULL FROM public.users WHERE id=$1 FOR NO KEY UPDATE`, input.UserID).Scan(&eligible)
	if errors.Is(err, pgx.ErrNoRows) {
		return PlatformAdminResult{}, ErrPlatformAdminDenied
	}
	if err != nil {
		return PlatformAdminResult{}, err
	}
	if input.Action == "GRANT" {
		var factor bool
		if err = tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM public.auth_mfa_factors WHERE user_id=$1 AND activated_at IS NOT NULL AND revoked_at IS NULL)`, input.UserID).Scan(&factor); err != nil {
			return PlatformAdminResult{}, err
		}
		if !eligible || !factor {
			return PlatformAdminResult{}, ErrPlatformAdminDenied
		}
	}
	var wasActive bool
	err = tx.QueryRow(ctx, `SELECT status='ACTIVE' FROM public.platform_admins WHERE user_id=$1 FOR UPDATE`, input.UserID).Scan(&wasActive)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return PlatformAdminResult{}, err
	}
	result.Active = input.Action == "GRANT"
	result.Changed = wasActive != result.Active
	if result.Changed {
		var now time.Time
		if err = tx.QueryRow(ctx, `SELECT clock_timestamp()`).Scan(&now); err != nil {
			return PlatformAdminResult{}, err
		}
		if result.Active {
			_, err = tx.Exec(ctx, `INSERT INTO public.platform_admins(user_id,status,created_at,granted_at,updated_at) VALUES($1,'ACTIVE',$2,$2,$2) ON CONFLICT(user_id) DO UPDATE SET status='ACTIVE',granted_at=$2,updated_at=$2,revoked_at=NULL`, input.UserID, now)
		} else {
			_, err = tx.Exec(ctx, `UPDATE public.platform_admins SET status='REVOKED',updated_at=$2,revoked_at=$2 WHERE user_id=$1`, input.UserID, now)
		}
		if err != nil {
			return PlatformAdminResult{}, err
		}
		if _, err = tx.Exec(ctx, `UPDATE public.auth_sessions SET revoked_at=clock_timestamp() WHERE user_id=$1 AND revoked_at IS NULL`, input.UserID); err != nil {
			return PlatformAdminResult{}, err
		}
	}
	_, err = tx.Exec(ctx, `INSERT INTO public.platform_admin_audit_events(operation_id,target_user_id,request_hash,action,was_active,is_active,changed,database_principal,session_principal,operator_label,reason) VALUES($1,$2,$3,$4,$5,$6,$7,current_user,session_user,$8,$9)`, input.OperationID, input.UserID, fingerprint[:], input.Action, wasActive, result.Active, result.Changed, input.Operator, input.Reason)
	if err != nil {
		return PlatformAdminResult{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return PlatformAdminResult{}, err
	}
	return result, nil
}
