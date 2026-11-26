package identity

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var errMFAConflict = errors.New("MFA already enabled")
var errMFARateLimited = errors.New("MFA attempts exceeded")
var errMFAUnavailable = errors.New("MFA unavailable")

type MFAService struct {
	pool  *pgxpool.Pool
	keyID string
	box   *mfaSecretCipher
}

type mfaEnrollment struct {
	FactorID  string
	Secret    []byte
	ExpiresAt time.Time
}

type mfaSession struct {
	userID string
	id     string
	now    time.Time
}

func NewMFAService(pool *pgxpool.Pool, keyID string, key []byte) (*MFAService, error) {
	if pool == nil || len(keyID) < 1 || len(keyID) > 100 || keyID != strings.TrimSpace(keyID) {
		return nil, ErrInvalidInput
	}
	box, err := newMFASecretCipher(key)
	if err != nil {
		return nil, err
	}
	return &MFAService{pool: pool, keyID: keyID, box: box}, nil
}

// All factor and session changes lock the user first. Primary login and reset
// also update/lock that user, so revocation and elevation cannot cross commits.
func (service *MFAService) transaction(ctx context.Context, token, scope string, fresh bool, run func(pgx.Tx, mfaSession) error) error {
	hash, err := TokenHash(token)
	if err != nil {
		return ErrInvalidToken
	}
	var userID string
	err = service.pool.QueryRow(ctx, `SELECT user_id FROM auth_sessions WHERE token_hash=$1 AND revoked_at IS NULL AND expires_at>clock_timestamp()`, hash[:]).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrInvalidToken
	}
	if err != nil {
		return err
	}
	// Persist attempt limits even when the proof transaction rolls back.
	allowed, err := (&Service{Pool: service.pool}).Allow(ctx, scope, userID, 5, 10*time.Minute)
	if err != nil {
		return err
	}
	if !allowed {
		return errMFARateLimited
	}
	tx, err := service.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var locked string
	// NO KEY UPDATE still serializes security-state writes while allowing the
	// user FK check in Logout's audit after Logout has locked the session.
	err = tx.QueryRow(ctx, `SELECT id FROM users WHERE id=$1 AND status='ACTIVE' AND email_verified_at IS NOT NULL FOR NO KEY UPDATE`, userID).Scan(&locked)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrInvalidToken
	}
	if err != nil {
		return err
	}
	session := mfaSession{userID: userID}
	err = tx.QueryRow(ctx, `SELECT id FROM auth_sessions WHERE token_hash=$1 AND user_id=$2 FOR UPDATE`, hash[:], userID).Scan(&session.id)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrInvalidToken
	}
	if err != nil {
		return err
	}
	// Lock acquisition can outlive primary freshness, session expiry or an OTP
	// window. Read the clock and recheck eligibility only after holding the lock.
	err = tx.QueryRow(ctx, `SELECT clock_timestamp() FROM auth_sessions WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>clock_timestamp() AND created_at<=clock_timestamp() AND (NOT $3::boolean OR created_at>clock_timestamp()-interval '5 minutes')`, session.id, userID, fresh).Scan(&session.now)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrInvalidToken
	}
	if err != nil {
		return err
	}
	if err = run(tx, session); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (service *MFAService) beginEnrollment(ctx context.Context, token string) (mfaEnrollment, error) {
	var result mfaEnrollment
	err := service.transaction(ctx, token, "MFA_ENROLL", true, func(tx pgx.Tx, session mfaSession) error {
		var active bool
		err := tx.QueryRow(ctx, `SELECT activated_at IS NOT NULL FROM auth_mfa_factors WHERE user_id=$1 AND revoked_at IS NULL FOR UPDATE`, session.userID).Scan(&active)
		if err != nil && !errors.Is(err, pgx.ErrNoRows) {
			return err
		}
		// A factor lock wait can outlive the primary login or session.
		err = tx.QueryRow(ctx, `SELECT clock_timestamp() FROM auth_sessions WHERE id=$1 AND user_id=$2 AND revoked_at IS NULL AND expires_at>clock_timestamp() AND created_at<=clock_timestamp() AND created_at>clock_timestamp()-interval '5 minutes'`, session.id, session.userID).Scan(&session.now)
		if errors.Is(err, pgx.ErrNoRows) {
			return ErrInvalidToken
		}
		if err != nil {
			return err
		}
		if active {
			return errMFAConflict
		}
		if _, err = tx.Exec(ctx, `UPDATE auth_mfa_factors SET revoked_at=clock_timestamp() WHERE user_id=$1 AND revoked_at IS NULL`, session.userID); err != nil {
			return err
		}
		if err = tx.QueryRow(ctx, `SELECT gen_random_uuid()::text`).Scan(&result.FactorID); err != nil {
			return err
		}
		result.Secret, err = newTOTPSecret()
		if err != nil {
			return err
		}
		encrypted, err := service.box.seal(session.userID, result.FactorID, result.Secret)
		if err != nil {
			return err
		}
		err = tx.QueryRow(ctx, `INSERT INTO auth_mfa_factors(id,user_id,secret_key_id,secret_ciphertext,expires_at,enrollment_session_id) VALUES($1,$2,$3,$4,clock_timestamp()+interval '5 minutes',$5) RETURNING expires_at`, result.FactorID, session.userID, service.keyID, encrypted, session.id).Scan(&result.ExpiresAt)
		if err != nil {
			return err
		}
		_, err = tx.Exec(ctx, `INSERT INTO auth_audit_events(user_id,event_type) VALUES($1,'MFA_ENROLLMENT_STARTED')`, session.userID)
		return err
	})
	if err != nil {
		return mfaEnrollment{}, err
	}
	return result, nil
}

func (service *MFAService) consumeProof(ctx context.Context, tx pgx.Tx, session mfaSession, code string, enrollment bool) (string, error) {
	var factorID, keyID string
	var encrypted []byte
	var lastStep int64
	err := tx.QueryRow(ctx, `SELECT id,secret_key_id,secret_ciphertext,last_step FROM auth_mfa_factors WHERE user_id=$1 AND revoked_at IS NULL AND (( $2::boolean AND activated_at IS NULL AND enrollment_session_id=$3 AND expires_at>clock_timestamp()) OR (NOT $2::boolean AND activated_at IS NOT NULL)) FOR UPDATE`, session.userID, enrollment, session.id).Scan(&factorID, &keyID, &encrypted, &lastStep)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrInvalidToken
	}
	if err != nil {
		return "", err
	}
	// Recheck time-sensitive eligibility after the factor lock as well. The
	// session and factor are held until proof consumption and audit commit.
	err = tx.QueryRow(ctx, `SELECT clock_timestamp() FROM auth_sessions s JOIN auth_mfa_factors f ON f.user_id=s.user_id WHERE s.id=$1 AND s.user_id=$2 AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND s.created_at<=clock_timestamp() AND f.id=$3 AND f.revoked_at IS NULL AND (NOT $4::boolean OR (s.created_at>clock_timestamp()-interval '5 minutes' AND f.expires_at>clock_timestamp() AND f.enrollment_session_id=s.id))`, session.id, session.userID, factorID, enrollment).Scan(&session.now)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrInvalidToken
	}
	if err != nil {
		return "", err
	}
	if keyID != service.keyID {
		return "", errMFAUnavailable
	}
	secret, err := service.box.open(session.userID, factorID, encrypted)
	if err != nil {
		return "", errMFAUnavailable
	}
	defer clear(secret)
	step, err := verifyTOTP(secret, code, session.now, lastStep)
	if err != nil {
		return "", err
	}
	if _, err = tx.Exec(ctx, `UPDATE auth_mfa_factors SET last_step=$2,activated_at=CASE WHEN $3::boolean THEN clock_timestamp() ELSE activated_at END WHERE id=$1`, factorID, step, enrollment); err != nil {
		return "", err
	}
	if _, err = tx.Exec(ctx, `UPDATE auth_sessions SET mfa_factor_id=$2,mfa_verified_at=clock_timestamp() WHERE id=$1`, session.id, factorID); err != nil {
		return "", err
	}
	return factorID, nil
}

func (service *MFAService) confirmEnrollment(ctx context.Context, token, code string) ([]string, error) {
	var codes []string
	err := service.transaction(ctx, token, "MFA_VERIFY", true, func(tx pgx.Tx, session mfaSession) error {
		factorID, err := service.consumeProof(ctx, tx, session, code, true)
		if err != nil {
			return err
		}
		for i := 0; i < 10; i++ {
			code, hash, err := newMFARecoveryCode(session.userID, factorID)
			if err != nil {
				return err
			}
			if _, err = tx.Exec(ctx, `INSERT INTO auth_mfa_recovery_codes(user_id,factor_id,code_hash) VALUES($1,$2,$3)`, session.userID, factorID, hash[:]); err != nil {
				return err
			}
			codes = append(codes, code)
		}
		_, err = tx.Exec(ctx, `INSERT INTO auth_audit_events(user_id,event_type) VALUES($1,'MFA_ENABLED')`, session.userID)
		return err
	})
	if err != nil {
		return nil, err
	}
	return codes, nil
}

func (service *MFAService) challenge(ctx context.Context, token, code string) error {
	return service.transaction(ctx, token, "MFA_VERIFY", false, func(tx pgx.Tx, session mfaSession) error {
		if _, err := service.consumeProof(ctx, tx, session, code, false); err != nil {
			return err
		}
		_, err := tx.Exec(ctx, `INSERT INTO auth_audit_events(user_id,event_type) VALUES($1,'MFA_CHALLENGE')`, session.userID)
		return err
	})
}

type mfaStatus struct {
	Enabled         bool `json:"enabled"`
	SessionVerified bool `json:"session_verified"`
}

func (service *MFAService) status(ctx context.Context, token string) (mfaStatus, error) {
	hash, err := TokenHash(token)
	if err != nil {
		return mfaStatus{}, ErrInvalidToken
	}
	var result mfaStatus
	var keyID string
	err = service.pool.QueryRow(ctx, `SELECT f.id IS NOT NULL,COALESCE(s.mfa_factor_id=f.id AND s.mfa_verified_at>=f.activated_at AND s.mfa_verified_at<=clock_timestamp(),false),COALESCE(f.secret_key_id,'') FROM auth_sessions s JOIN users u ON u.id=s.user_id LEFT JOIN auth_mfa_factors f ON f.user_id=u.id AND f.activated_at IS NOT NULL AND f.revoked_at IS NULL WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp() AND s.created_at<=clock_timestamp() AND u.status='ACTIVE' AND u.email_verified_at IS NOT NULL`, hash[:]).Scan(&result.Enabled, &result.SessionVerified, &keyID)
	if errors.Is(err, pgx.ErrNoRows) {
		return mfaStatus{}, ErrInvalidToken
	}
	if err != nil {
		return mfaStatus{}, err
	}
	if result.Enabled && keyID != service.keyID {
		return mfaStatus{}, errMFAUnavailable
	}
	return result, nil
}
