package storefront_test

import (
	"context"
	"errors"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	"smartpos/api/internal/modules/identity"
	"smartpos/api/internal/testsupport"
)

func recentMFAAcceptance(t *testing.T, ctx context.Context, pool *pgxpool.Pool, owner, guest testsupport.MFASession) {
	t.Helper()
	session := identity.SessionFromContext(owner.Context)
	check := func(t *testing.T, request context.Context, recent bool, want error) {
		t.Helper()
		tx, err := pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(ctx)
		require := identity.RequireMFA
		if recent {
			require = identity.RequireRecentMFA
		}
		access, err := require(request, tx, session.User.ID)
		if !errors.Is(err, want) || (access != nil) != (want == nil) {
			t.Fatalf("recent=%t access=%t err=%v, want %v", recent, access != nil, err, want)
		}
	}
	t.Run("password and TOTP in current session", func(t *testing.T) {
		check(t, owner.Context, true, nil)
		check(t, guest.Context, true, identity.ErrInvalidToken)
	})
	t.Run("session without verified primary proof", func(t *testing.T) {
		tx, err := pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(ctx)
		if _, err := tx.Exec(ctx, "UPDATE auth_sessions SET primary_verified_at=NULL WHERE id=$1", session.ID); err != nil {
			t.Fatal(err)
		}
		if access, err := identity.RequireRecentMFA(owner.Context, tx, session.User.ID); !errors.Is(err, identity.ErrRecentAuthenticationRequired) || access != nil {
			t.Fatalf("missing primary proof: access=%t err=%v", access != nil, err)
		}
		if _, err := identity.RequireMFA(owner.Context, tx, session.User.ID); err != nil {
			t.Fatalf("ordinary MFA should remain valid: %v", err)
		}
	})
	t.Run("fresh TOTP does not renew old primary proof", func(t *testing.T) {
		tx, err := pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(ctx)
		if _, err := tx.Exec(ctx, "UPDATE auth_sessions SET primary_verified_at=clock_timestamp()-interval '5 minutes' WHERE id=$1", session.ID); err != nil {
			t.Fatal(err)
		}
		if access, err := identity.RequireRecentMFA(owner.Context, tx, session.User.ID); !errors.Is(err, identity.ErrRecentAuthenticationRequired) || access != nil {
			t.Fatalf("stale primary proof: access=%t err=%v", access != nil, err)
		}
	})
	t.Run("recheck retains freshness requirement", func(t *testing.T) {
		tx, err := pool.Begin(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer tx.Rollback(ctx)
		if _, err := tx.Exec(ctx, "UPDATE auth_sessions SET primary_verified_at=clock_timestamp()-interval '298 seconds' WHERE id=$1", session.ID); err != nil {
			t.Fatal(err)
		}
		access, err := identity.RequireRecentMFA(owner.Context, tx, session.User.ID)
		if err != nil {
			t.Fatal(err)
		}
		if err := access.Recheck(guest.Context); !errors.Is(err, identity.ErrInvalidToken) {
			t.Fatalf("wrong session: %v", err)
		}
		if _, err := tx.Exec(ctx, "SELECT pg_sleep(2)"); err != nil {
			t.Fatal(err)
		}
		if err := access.Recheck(owner.Context); !errors.Is(err, identity.ErrRecentAuthenticationRequired) {
			t.Fatalf("elapsed freshness window: %v", err)
		}
	})
}
