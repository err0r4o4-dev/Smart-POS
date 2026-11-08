package identity

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

const googleFlowTTL = 10 * time.Minute

type GoogleAuth struct {
	service  *Service
	provider googleProvider
}
type googleFlow struct {
	verifier  string
	nonceHash []byte
	returnTo  string
}

func (google *GoogleAuth) start(ctx context.Context, returnTo string) (string, string, error) {
	if returnTo != "/workspace" && returnTo != "/setup" {
		return "", "", ErrInvalidInput
	}
	_, err := google.service.Pool.Exec(ctx, `DELETE FROM auth_google_flows WHERE flow_hash IN (SELECT flow_hash FROM auth_google_flows WHERE expires_at<=now() ORDER BY expires_at LIMIT 100)`)
	if err != nil {
		return "", "", err
	}
	flow, flowHash, err := RandomToken()
	if err != nil {
		return "", "", err
	}
	state, stateHash, err := RandomToken()
	if err != nil {
		return "", "", err
	}
	nonce, nonceHash, err := RandomToken()
	if err != nil {
		return "", "", err
	}
	verifier, _, err := RandomToken()
	if err != nil {
		return "", "", err
	}
	_, err = google.service.Pool.Exec(ctx, `INSERT INTO auth_google_flows(flow_hash,state_hash,nonce_hash,pkce_verifier,return_to,expires_at) VALUES($1,$2,$3,$4,$5,now()+$6::interval)`, flowHash[:], stateHash[:], nonceHash[:], verifier, returnTo, googleFlowTTL)
	if err != nil {
		return "", "", err
	}
	return flow, google.provider.authorizationURL(state, nonce, verifier), nil
}

func (google *GoogleAuth) consume(ctx context.Context, cookie, state string) (googleFlow, error) {
	flowHash, err := TokenHash(cookie)
	if err != nil {
		return googleFlow{}, ErrInvalidToken
	}
	stateHash, err := TokenHash(state)
	if err != nil {
		return googleFlow{}, ErrInvalidToken
	}
	var flow googleFlow
	err = google.service.Pool.QueryRow(ctx, `UPDATE auth_google_flows SET consumed_at=now() WHERE flow_hash=$1 AND state_hash=$2 AND consumed_at IS NULL AND expires_at>now() RETURNING pkce_verifier,nonce_hash,return_to`, flowHash[:], stateHash[:]).Scan(&flow.verifier, &flow.nonceHash, &flow.returnTo)
	if errors.Is(err, pgx.ErrNoRows) {
		return googleFlow{}, ErrInvalidToken
	}
	return flow, err
}

func (google *GoogleAuth) complete(ctx context.Context, cookie string, identity googleIdentity) (string, bool, error) {
	flowHash, err := TokenHash(cookie)
	if err != nil {
		return "", false, err
	}
	tx, err := google.service.Pool.Begin(ctx)
	if err != nil {
		return "", false, err
	}
	defer tx.Rollback(ctx)
	var valid bool
	err = tx.QueryRow(ctx, `SELECT true FROM auth_google_flows WHERE flow_hash=$1 AND consumed_at IS NOT NULL AND pending_subject IS NULL AND linked_at IS NULL AND expires_at>now() FOR UPDATE`, flowHash[:]).Scan(&valid)
	if err != nil {
		return "", false, err
	}
	var profile Profile
	profile.Onboarding = "PENDING_ORGANIZATION"
	err = tx.QueryRow(ctx, `SELECT u.id,u.email,u.display_name,u.status,u.email_verified_at IS NOT NULL FROM auth_external_identities i JOIN users u ON u.id=i.user_id WHERE i.provider='google' AND i.subject=$1 FOR UPDATE OF u`, identity.subject).Scan(&profile.ID, &profile.Email, &profile.DisplayName, &profile.Status, &profile.EmailVerified)
	if errors.Is(err, pgx.ErrNoRows) {
		var existing string
		err = tx.QueryRow(ctx, `SELECT id FROM users WHERE email_normalized=$1`, identity.email).Scan(&existing)
		if errors.Is(err, pgx.ErrNoRows) {
			password, _, tokenErr := RandomToken()
			if tokenErr != nil {
				return "", false, tokenErr
			}
			hash, hashErr := HashPassword(password)
			if hashErr != nil {
				return "", false, hashErr
			}
			name := strings.SplitN(identity.email, "@", 2)[0]
			if ValidateDisplayName(name) != nil {
				name = "Google user"
			}
			err = tx.QueryRow(ctx, `INSERT INTO users(email,email_normalized,password_hash,display_name,email_verified_at) VALUES($1,$1,$2,$3,now()) ON CONFLICT(email_normalized) DO NOTHING RETURNING id,email,display_name,status,email_verified_at IS NOT NULL`, identity.email, hash, name).Scan(&profile.ID, &profile.Email, &profile.DisplayName, &profile.Status, &profile.EmailVerified)
			if err == nil {
				if _, err = tx.Exec(ctx, `INSERT INTO auth_external_identities(provider,subject,user_id) VALUES('google',$1,$2)`, identity.subject, profile.ID); err != nil {
					return "", false, err
				}
				if _, err = tx.Exec(ctx, `INSERT INTO auth_audit_events(user_id,event_type) VALUES($1,'REGISTER')`, profile.ID); err != nil {
					return "", false, err
				}
			} else if !errors.Is(err, pgx.ErrNoRows) {
				return "", false, err
			}
		} else if err != nil {
			return "", false, err
		}
		if profile.ID == "" {
			_, err = tx.Exec(ctx, `UPDATE auth_google_flows SET pending_subject=$2,pending_email=$3 WHERE flow_hash=$1`, flowHash[:], identity.subject, identity.email)
			if err != nil {
				return "", false, err
			}
			if err = tx.Commit(ctx); err != nil {
				return "", false, err
			}
			return "", true, nil
		}
	} else if err != nil {
		return "", false, err
	}
	if profile.Status != "ACTIVE" {
		return "", false, ErrInvalidCredentials
	}
	token, _, err := google.sessionInTx(ctx, tx, profile.ID)
	if err != nil {
		return "", false, err
	}
	if _, err = tx.Exec(ctx, `UPDATE auth_google_flows SET linked_at=now() WHERE flow_hash=$1`, flowHash[:]); err != nil {
		return "", false, err
	}
	if err = tx.Commit(ctx); err != nil {
		return "", false, err
	}
	return token, false, nil
}

func (google *GoogleAuth) sessionInTx(ctx context.Context, tx pgx.Tx, userID string) (string, string, error) {
	token, tokenHash, err := RandomToken()
	if err != nil {
		return "", "", err
	}
	csrf, csrfHash := CSRFForToken(token)
	if _, err = tx.Exec(ctx, `INSERT INTO auth_sessions(user_id,token_hash,csrf_hash,expires_at) VALUES($1,$2,$3,now()+$4::interval)`, userID, tokenHash[:], csrfHash[:], google.service.SessionTTL); err != nil {
		return "", "", err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO auth_audit_events(user_id,event_type) VALUES($1,'LOGIN_SUCCESS')`, userID); err != nil {
		return "", "", err
	}
	return token, csrf, nil
}

func (google *GoogleAuth) link(ctx context.Context, cookie, email, password string) (Profile, string, string, error) {
	normalized, err := NormalizeEmail(email)
	if err != nil || password == "" || len(password) > 128 {
		return Profile{}, "", "", ErrInvalidCredentials
	}
	flowHash, err := TokenHash(cookie)
	if err != nil {
		return Profile{}, "", "", ErrInvalidToken
	}
	tx, err := google.service.Pool.Begin(ctx)
	if err != nil {
		return Profile{}, "", "", err
	}
	defer tx.Rollback(ctx)
	var subject, pendingEmail string
	err = tx.QueryRow(ctx, `SELECT pending_subject,pending_email FROM auth_google_flows WHERE flow_hash=$1 AND consumed_at IS NOT NULL AND pending_subject IS NOT NULL AND linked_at IS NULL AND expires_at>now() FOR UPDATE`, flowHash[:]).Scan(&subject, &pendingEmail)
	if errors.Is(err, pgx.ErrNoRows) {
		return Profile{}, "", "", ErrInvalidToken
	}
	if err != nil {
		return Profile{}, "", "", err
	}
	profile := Profile{Onboarding: "PENDING_ORGANIZATION"}
	var hash string
	err = tx.QueryRow(ctx, `SELECT id,email,display_name,status,password_hash,email_verified_at IS NOT NULL FROM users WHERE email_normalized=$1 FOR UPDATE`, normalized).Scan(&profile.ID, &profile.Email, &profile.DisplayName, &profile.Status, &hash, &profile.EmailVerified)
	if errors.Is(err, pgx.ErrNoRows) {
		hash = google.service.DummyHash
	} else if err != nil {
		return Profile{}, "", "", err
	}
	valid := VerifyPassword(hash, password)
	if !valid || profile.Status != "ACTIVE" || normalized != pendingEmail {
		var userID any
		if profile.ID != "" {
			userID = profile.ID
		}
		if _, err = tx.Exec(ctx, `INSERT INTO auth_audit_events(user_id,event_type) VALUES($1,'LOGIN_FAILURE')`, userID); err != nil {
			return Profile{}, "", "", err
		}
		if err = tx.Commit(ctx); err != nil {
			return Profile{}, "", "", err
		}
		return Profile{}, "", "", ErrInvalidCredentials
	}
	if _, err = tx.Exec(ctx, `INSERT INTO auth_external_identities(provider,subject,user_id) VALUES('google',$1,$2)`, subject, profile.ID); err != nil {
		return Profile{}, "", "", err
	}
	token, csrf, err := google.sessionInTx(ctx, tx, profile.ID)
	if err != nil {
		return Profile{}, "", "", err
	}
	if _, err = tx.Exec(ctx, `UPDATE auth_google_flows SET linked_at=now() WHERE flow_hash=$1`, flowHash[:]); err != nil {
		return Profile{}, "", "", err
	}
	if err = tx.Commit(ctx); err != nil {
		return Profile{}, "", "", err
	}
	return profile, token, csrf, nil
}
