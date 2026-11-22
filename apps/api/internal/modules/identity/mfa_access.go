package identity

import (
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

var ErrMFARequired = errors.New("MFA authentication required")

type MFAAccess struct {
	tx        pgx.Tx
	userID    string
	sessionID string
	factorID  string
}

// RequireMFA acquires security locks before any business locks. The caller owns
// the transaction and must recheck after later waits and before committing work.
// MFA authenticates the actor; organization permissions remain a separate check.
func RequireMFA(ctx context.Context, tx pgx.Tx, userID string) (*MFAAccess, error) {
	session := SessionFromContext(ctx)
	if tx == nil || session.ID == "" || userID == "" || session.User.ID != userID {
		return nil, ErrInvalidToken
	}
	var locked string
	if err := tx.QueryRow(ctx, `SELECT id FROM users WHERE id=$1 FOR NO KEY UPDATE`, userID).Scan(&locked); err != nil {
		return nil, mfaAccessError(err)
	}
	access := &MFAAccess{tx: tx, userID: userID, sessionID: session.ID}
	if err := tx.QueryRow(ctx, `SELECT coalesce(mfa_factor_id::text,'') FROM auth_sessions WHERE id=$1 AND user_id=$2 FOR SHARE`, session.ID, userID).Scan(&access.factorID); err != nil {
		return nil, mfaAccessError(err)
	}
	if access.factorID == "" {
		return nil, ErrMFARequired
	}
	if err := tx.QueryRow(ctx, `SELECT id FROM auth_mfa_factors WHERE id=$1 AND user_id=$2 FOR SHARE`, access.factorID, userID).Scan(&locked); err != nil {
		return nil, mfaAccessError(err)
	}
	if err := access.Recheck(ctx); err != nil {
		return nil, err
	}
	return access, nil
}

// Recheck uses the original transaction and a new database clock after locks.
// Eligibility is guaranteed at this check, not at a future physical commit time.
func (access *MFAAccess) Recheck(ctx context.Context) error {
	if access == nil || access.tx == nil {
		return ErrInvalidToken
	}
	session := SessionFromContext(ctx)
	if session.ID != access.sessionID || session.User.ID != access.userID {
		return ErrInvalidToken
	}
	var account, live, assured bool
	err := access.tx.QueryRow(ctx, `WITH decision AS MATERIALIZED (SELECT clock_timestamp() AS now)
	 SELECT u.status='ACTIVE' AND u.email_verified_at IS NOT NULL AND u.email_verified_at<=d.now,
	 s.revoked_at IS NULL AND s.created_at<=d.now AND s.expires_at>d.now,
	 f.activated_at IS NOT NULL AND f.activated_at<=d.now AND f.revoked_at IS NULL
	 AND s.mfa_factor_id=f.id AND s.mfa_verified_at IS NOT NULL
	 AND s.mfa_verified_at>=s.created_at AND s.mfa_verified_at>=f.activated_at AND s.mfa_verified_at<=d.now
	 FROM auth_sessions s JOIN users u ON u.id=s.user_id
	 JOIN auth_mfa_factors f ON f.user_id=u.id AND f.id=$3 CROSS JOIN decision d
	 WHERE s.id=$1 AND s.user_id=$2`, access.sessionID, access.userID, access.factorID).Scan(&account, &live, &assured)
	if err != nil {
		return mfaAccessError(err)
	}
	if !account || !live {
		return ErrInvalidToken
	}
	if !assured {
		return ErrMFARequired
	}
	return nil
}

func mfaAccessError(err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrInvalidToken
	}
	return err
}
