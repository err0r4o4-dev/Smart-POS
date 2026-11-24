package identity

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// Recovery requires actual primary proof; a recently issued session alone is
// insufficient. The caller holds the verified account and session locks.
func recoveryWindow(ctx context.Context, tx pgx.Tx, s mfaSession) (now, deadline time.Time, err error) {
	err = tx.QueryRow(ctx, `SELECT n, LEAST(expires_at, primary_verified_at+interval '5 minutes')
		FROM auth_sessions CROSS JOIN (SELECT clock_timestamp() n) t
		WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL AND created_at<=n
		AND primary_verified_at<=n AND primary_verified_at>n-interval '5 minutes' AND expires_at>n`,
		s.id, s.userID).Scan(&now, &deadline)
	if errors.Is(err, pgx.ErrNoRows) {
		err = ErrInvalidToken
	}
	return
}

func (service *MFAService) beginRecovery(ctx context.Context, token, code string) (mfaEnrollment, error) {
	var result mfaEnrollment
	err := service.transaction(ctx, token, "MFA_RECOVERY_START", false, func(tx pgx.Tx, s mfaSession) error {
		if _, _, err := recoveryWindow(ctx, tx, s); err != nil {
			return err
		}
		var factorID string
		err := tx.QueryRow(ctx, `SELECT id FROM auth_mfa_factors WHERE user_id=$1
			AND activated_at IS NOT NULL AND revoked_at IS NULL FOR UPDATE`, s.userID).Scan(&factorID)
		if errors.Is(err, pgx.ErrNoRows) || (err == nil && len(code) != 26) {
			return ErrInvalidToken
		}
		if err != nil {
			return err
		}
		hash := mfaRecoveryHash(s.userID, factorID, code)
		var unused bool
		if err := tx.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM auth_mfa_recovery_codes
			WHERE user_id=$1 AND factor_id=$2 AND code_hash=$3 AND used_at IS NULL)`,
			s.userID, factorID, hash[:]).Scan(&unused); err != nil {
			return err
		}
		if !unused {
			return ErrInvalidToken
		}
		if _, err := tx.Exec(ctx, `DELETE FROM auth_mfa_pending_recoveries WHERE user_id=$1`, s.userID); err != nil {
			return err
		}
		if err := tx.QueryRow(ctx, `SELECT gen_random_uuid()::text`).Scan(&result.FactorID); err != nil {
			return err
		}
		result.Secret, err = newTOTPSecret()
		if err != nil {
			return err
		}
		encrypted, err := service.box.seal(s.userID, result.FactorID, result.Secret)
		if err != nil {
			return err
		}
		now, deadline, err := recoveryWindow(ctx, tx, s)
		if err != nil {
			return err
		}
		result.ExpiresAt = deadline
		if _, err := tx.Exec(ctx, `INSERT INTO auth_mfa_pending_recoveries
			(user_id,session_id,old_factor_id,replacement_id,recovery_hash,secret_key_id,secret_ciphertext,created_at,expires_at)
			VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
			s.userID, s.id, factorID, result.FactorID, hash[:], service.keyID, encrypted, now, deadline); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO auth_audit_events(user_id,event_type) VALUES($1,'MFA_RECOVERY_STARTED')`, s.userID); err != nil {
			return err
		}
		_, _, err = recoveryWindow(ctx, tx, s)
		return err
	})
	if err != nil {
		clear(result.Secret)
		return mfaEnrollment{}, err
	}
	return result, nil
}

func (service *MFAService) confirmRecovery(ctx context.Context, token, replacementID, code string) ([]string, error) {
	var codes []string
	err := service.transaction(ctx, token, "MFA_RECOVERY_CONFIRM", false, func(tx pgx.Tx, s mfaSession) error {
		if _, _, err := recoveryWindow(ctx, tx, s); err != nil {
			return err
		}
		// Lock all sessions before the factor. Login holds the user lock, so
		// no new session can appear between these locks and revocation.
		if _, err := tx.Exec(ctx, `SELECT id FROM auth_sessions
			WHERE user_id=$1 AND revoked_at IS NULL ORDER BY id FOR UPDATE`, s.userID); err != nil {
			return err
		}
		var factorID, keyID, oldFactorID string
		var encrypted, hash []byte
		var created, expires time.Time
		err := tx.QueryRow(ctx, `SELECT p.old_factor_id,p.secret_key_id,p.secret_ciphertext,p.recovery_hash,p.created_at,p.expires_at
			FROM auth_mfa_pending_recoveries p
			WHERE p.user_id=$1 AND p.session_id=$2 AND p.replacement_id::text=$3`,
			s.userID, s.id, replacementID).Scan(&oldFactorID, &keyID, &encrypted, &hash, &created, &expires)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrInvalidToken
		}
		if err != nil {
			return err
		}
		err = tx.QueryRow(ctx, `SELECT id FROM auth_mfa_factors WHERE user_id=$1 AND id=$2
			AND activated_at IS NOT NULL AND revoked_at IS NULL FOR UPDATE`, s.userID, oldFactorID).Scan(&factorID)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrInvalidToken
		}
		if err != nil {
			return err
		}
		if keyID != service.keyID {
			return errMFAUnavailable
		}
		secret, err := service.box.open(s.userID, replacementID, encrypted)
		if err != nil {
			return errMFAUnavailable
		}
		defer clear(secret)
		now, _, err := recoveryWindow(ctx, tx, s)
		if err != nil {
			return err
		}
		if now.Before(created) || !now.Before(expires) {
			return ErrInvalidToken
		}
		step, err := verifyTOTP(secret, code, now, -1)
		if err != nil {
			return err
		}
		tag, err := tx.Exec(ctx, `UPDATE auth_mfa_recovery_codes SET used_at=$4
			WHERE user_id=$1 AND factor_id=$2 AND code_hash=$3 AND used_at IS NULL`, s.userID, factorID, hash, now)
		if err != nil {
			return err
		}
		if tag.RowsAffected() != 1 {
			return ErrInvalidToken
		}
		if _, err := tx.Exec(ctx, `UPDATE auth_mfa_factors SET revoked_at=$2 WHERE id=$1`, factorID, now); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `INSERT INTO auth_mfa_factors
			(id,user_id,secret_key_id,secret_ciphertext,created_at,expires_at,activated_at,last_step)
			VALUES($1,$2,$3,$4,$5,$6,$7,$8)`, replacementID, s.userID, keyID, encrypted, created, expires, now, step); err != nil {
			return err
		}
		for range 10 {
			newCode, verifier, err := newMFARecoveryCode(s.userID, replacementID)
			if err != nil {
				return err
			}
			if _, err := tx.Exec(ctx, `INSERT INTO auth_mfa_recovery_codes(user_id,factor_id,code_hash)
				VALUES($1,$2,$3)`, s.userID, replacementID, verifier[:]); err != nil {
				return err
			}
			codes = append(codes, newCode)
		}
		if _, err := tx.Exec(ctx, `DELETE FROM auth_mfa_pending_recoveries WHERE user_id=$1`, s.userID); err != nil {
			return err
		}
		// Use the same database timestamp to enforce expiry and revoke the
		// initiating session together with every other live session.
		tag, err = tx.Exec(ctx, `UPDATE auth_sessions SET revoked_at=t.n
			FROM (SELECT clock_timestamp() n) t WHERE user_id=$1 AND revoked_at IS NULL
			AND t.n<$3 AND EXISTS(SELECT 1 FROM auth_sessions s WHERE s.user_id=$1 AND s.id=$2
				AND s.revoked_at IS NULL AND s.expires_at>t.n AND s.primary_verified_at<=t.n
				AND s.primary_verified_at>t.n-interval '5 minutes')`, s.userID, s.id, expires)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return ErrInvalidToken
		}
		if _, err := tx.Exec(ctx, `INSERT INTO auth_audit_events(user_id,event_type) VALUES($1,'MFA_RECOVERY_COMPLETED')`, s.userID); err != nil {
			return err
		}
		// Audit writes can also wait. Roll the entire replacement back if its
		// proof window has closed by the final database check.
		var valid bool
		err = tx.QueryRow(ctx, `SELECT n<$2 AND n<expires_at AND n<primary_verified_at+interval '5 minutes'
			AND n>=revoked_at FROM auth_sessions CROSS JOIN (SELECT clock_timestamp() n) t WHERE id=$1`,
			s.id, expires).Scan(&valid)
		if err == nil && !valid {
			return ErrInvalidToken
		}
		return err
	})
	if err != nil {
		return nil, err
	}
	return codes, nil
}
