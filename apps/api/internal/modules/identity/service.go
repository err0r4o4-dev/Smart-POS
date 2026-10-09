package identity

import (
	"context"
	"crypto/sha256"
	"errors"
	"log/slog"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Profile struct {
	ID          string `json:"id"`
	Email       string `json:"email"`
	DisplayName string `json:"display_name"`
	Status      string `json:"status"`
	Onboarding  string `json:"onboarding"`
}

type Session struct {
	User      Profile
	CSRFHash  [32]byte
	CSRFToken string
}

type Mailer interface {
	SendReset(context.Context, string, string) error
}

type Service struct {
	Pool          *pgxpool.Pool
	Mailer        Mailer
	Logger        *slog.Logger
	SessionTTL    time.Duration
	DummyHash     string
	resetRequests chan string
}

func NewService(ctx context.Context, pool *pgxpool.Pool, mailer Mailer, logger *slog.Logger, ttl time.Duration) (*Service, error) {
	dummy, err := HashPassword("not-a-real-password")
	if err != nil {
		return nil, err
	}
	service := &Service{Pool: pool, Mailer: mailer, Logger: logger, SessionTTL: ttl, DummyHash: dummy, resetRequests: make(chan string, 64)}
	go service.processResetRequests(ctx)
	return service, nil
}

func (service *Service) Register(ctx context.Context, email, password, displayName string) (Profile, error) {
	normalized, err := NormalizeEmail(email)
	if err != nil || ValidatePassword(password) != nil || ValidateDisplayName(displayName) != nil {
		return Profile{}, ErrInvalidInput
	}
	hash, err := HashPassword(password)
	if err != nil {
		return Profile{}, err
	}
	tx, err := service.Pool.Begin(ctx)
	if err != nil {
		return Profile{}, err
	}
	defer tx.Rollback(ctx)
	profile := Profile{Email: normalized, DisplayName: displayName, Status: "ACTIVE", Onboarding: "PENDING_ORGANIZATION"}
	err = tx.QueryRow(ctx, "INSERT INTO users (email, email_normalized, password_hash, display_name) VALUES ($1,$2,$3,$4) RETURNING id", normalized, normalized, hash, displayName).Scan(&profile.ID)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return Profile{}, ErrEmailUnavailable
	}
	if err != nil {
		return Profile{}, err
	}
	if _, err = tx.Exec(ctx, "INSERT INTO auth_audit_events (user_id,event_type) VALUES ($1,'REGISTER')", profile.ID); err != nil {
		return Profile{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return Profile{}, err
	}
	return profile, nil
}

func (service *Service) Login(ctx context.Context, email, password string) (Profile, string, string, error) {
	normalized, err := NormalizeEmail(email)
	if err != nil || password == "" || len(password) > 128 {
		return Profile{}, "", "", ErrInvalidCredentials
	}
	profile := Profile{Onboarding: "PENDING_ORGANIZATION"}
	var hash string
	err = service.Pool.QueryRow(ctx, "SELECT id,email,display_name,status,password_hash FROM users WHERE email_normalized=$1", normalized).Scan(&profile.ID, &profile.Email, &profile.DisplayName, &profile.Status, &hash)
	if errors.Is(err, pgx.ErrNoRows) {
		hash = service.DummyHash
	} else if err != nil {
		return Profile{}, "", "", err
	}
	valid := VerifyPassword(hash, password)
	if !valid || profile.Status != "ACTIVE" {
		var userID any
		if profile.ID != "" {
			userID = profile.ID
		}
		_, auditErr := service.Pool.Exec(ctx, "INSERT INTO auth_audit_events (user_id,event_type) VALUES ($1,'LOGIN_FAILURE')", userID)
		if auditErr != nil {
			return Profile{}, "", "", auditErr
		}
		return Profile{}, "", "", ErrInvalidCredentials
	}
	token, tokenHash, err := RandomToken()
	if err != nil {
		return Profile{}, "", "", err
	}
	csrf, csrfHash := CSRFForToken(token)
	tx, err := service.Pool.Begin(ctx)
	if err != nil {
		return Profile{}, "", "", err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "INSERT INTO auth_sessions (user_id,token_hash,csrf_hash,expires_at) VALUES ($1,$2,$3,now()+$4::interval)", profile.ID, tokenHash[:], csrfHash[:], service.SessionTTL); err != nil {
		return Profile{}, "", "", err
	}
	if _, err = tx.Exec(ctx, "INSERT INTO auth_audit_events (user_id,event_type) VALUES ($1,'LOGIN_SUCCESS')", profile.ID); err != nil {
		return Profile{}, "", "", err
	}
	if err = tx.Commit(ctx); err != nil {
		return Profile{}, "", "", err
	}
	return profile, token, csrf, nil
}

func (service *Service) Current(ctx context.Context, token string) (Session, error) {
	tokenHash, err := TokenHash(token)
	if err != nil {
		return Session{}, ErrInvalidToken
	}
	var session Session
	session.User.Onboarding = "PENDING_ORGANIZATION"
	var csrfHash []byte
	err = service.Pool.QueryRow(ctx, `SELECT u.id,u.email,u.display_name,u.status,s.csrf_hash FROM auth_sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now() AND u.status='ACTIVE'`, tokenHash[:]).Scan(&session.User.ID, &session.User.Email, &session.User.DisplayName, &session.User.Status, &csrfHash)
	if errors.Is(err, pgx.ErrNoRows) {
		return Session{}, ErrInvalidToken
	}
	if err != nil {
		return Session{}, err
	}
	copy(session.CSRFHash[:], csrfHash)
	session.CSRFToken, _ = CSRFForToken(token)
	_, err = service.Pool.Exec(ctx, "UPDATE auth_sessions SET last_used_at=now() WHERE token_hash=$1", tokenHash[:])
	if err != nil {
		return Session{}, err
	}
	return session, nil
}

func (service *Service) Logout(ctx context.Context, token string, userID string) error {
	hash, err := TokenHash(token)
	if err != nil {
		return err
	}
	tx, err := service.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	result, err := tx.Exec(ctx, "UPDATE auth_sessions SET revoked_at=now() WHERE token_hash=$1 AND user_id=$2 AND revoked_at IS NULL RETURNING id", hash[:], userID)
	if err != nil {
		return err
	}
	if result.RowsAffected() != 1 {
		return ErrInvalidToken
	}
	if _, err = tx.Exec(ctx, "INSERT INTO auth_audit_events (user_id,event_type) VALUES ($1,'LOGOUT')", userID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (service *Service) RequestReset(ctx context.Context, email string) error {
	normalized, err := NormalizeEmail(email)
	if err != nil {
		return ErrInvalidInput
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	select {
	case service.resetRequests <- normalized:
	default:
		service.Logger.Error("password reset delivery queue full")
	}
	return nil
}

func (service *Service) processResetRequests(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case email := <-service.resetRequests:
			deliveryCtx, cancel := context.WithTimeout(ctx, 12*time.Second)
			if err := service.issueReset(deliveryCtx, email); err != nil {
				service.Logger.Error("password reset processing failed")
			}
			cancel()
		}
	}
}

func (service *Service) issueReset(ctx context.Context, normalized string) error {
	var userID string
	err := service.Pool.QueryRow(ctx, "SELECT id FROM users WHERE email_normalized=$1 AND status='ACTIVE'", normalized).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	token, hash, err := RandomToken()
	if err != nil {
		return err
	}
	tx, err := service.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err = tx.Exec(ctx, "UPDATE password_reset_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL", userID); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "INSERT INTO password_reset_tokens (user_id,token_hash,expires_at) VALUES ($1,$2,now()+interval '15 minutes')", userID, hash[:]); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "INSERT INTO auth_audit_events (user_id,event_type) VALUES ($1,'RESET_REQUEST')", userID); err != nil {
		return err
	}
	if err = tx.Commit(ctx); err != nil {
		return err
	}
	if err := service.Mailer.SendReset(ctx, normalized, token); err != nil {
		return err
	}
	return nil
}

func (service *Service) Reset(ctx context.Context, token, password string) error {
	if ValidatePassword(password) != nil {
		return ErrInvalidInput
	}
	hash, err := TokenHash(token)
	if err != nil {
		return ErrInvalidToken
	}
	passwordHash, err := HashPassword(password)
	if err != nil {
		return err
	}
	tx, err := service.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var userID string
	err = tx.QueryRow(ctx, "UPDATE password_reset_tokens SET used_at=now() WHERE token_hash=$1 AND used_at IS NULL AND expires_at>now() RETURNING user_id", hash[:]).Scan(&userID)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrInvalidToken
	}
	if err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "UPDATE users SET password_hash=$1,updated_at=now() WHERE id=$2", passwordHash, userID); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "UPDATE password_reset_tokens SET used_at=now() WHERE user_id=$1 AND used_at IS NULL", userID); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "UPDATE auth_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL", userID); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, "INSERT INTO auth_audit_events (user_id,event_type) VALUES ($1,'RESET_COMPLETE'),($1,'SESSION_REVOKED')", userID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func (service *Service) Allow(ctx context.Context, scope, key string, limit int, window time.Duration) (bool, error) {
	hash := sha256.Sum256([]byte(scope + ":" + key))
	var attempts int
	err := service.Pool.QueryRow(ctx, `INSERT INTO auth_rate_limits (scope,key_hash,attempts,window_end) VALUES ($1,$2,1,now()+$3::interval) ON CONFLICT (scope,key_hash) DO UPDATE SET attempts=CASE WHEN auth_rate_limits.window_end<now() THEN 1 ELSE auth_rate_limits.attempts+1 END, window_end=CASE WHEN auth_rate_limits.window_end<now() THEN now()+$3::interval ELSE auth_rate_limits.window_end END RETURNING attempts`, scope, hash[:], window).Scan(&attempts)
	return attempts <= limit, err
}
