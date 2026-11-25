package organization

import (
	"context"

	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/identity"
)

// Authorization keeps the transaction, current membership and MFA proof together.
// Callers own rollback/commit and must recheck after waits and before effects,
// commit or private return. It does not automatically intercept SQL operations.
type Authorization struct {
	Tx     pgx.Tx
	Actor  Member
	access *identity.MFAAccess
}

func (authorization *Authorization) Recheck(ctx context.Context) error {
	if authorization == nil || authorization.access == nil {
		return identity.ErrInvalidToken
	}
	return authorization.access.Recheck(ctx)
}

func (service *Service) AuthorizeMFA(ctx context.Context, userID, orgID, permission string) (*Authorization, error) {
	tx, err := service.transaction(ctx, userID, orgID)
	if err != nil {
		return nil, err
	}
	fail := func(err error) (*Authorization, error) {
		tx.Rollback(ctx)
		return nil, err
	}
	access, err := identity.RequireMFA(ctx, tx, userID)
	if err != nil {
		return fail(err)
	}
	actor, err := authorizeTransaction(ctx, tx, userID, orgID, permission)
	if err != nil {
		return fail(err)
	}
	if err = access.Recheck(ctx); err != nil {
		return fail(err)
	}
	return &Authorization{Tx: tx, Actor: actor, access: access}, nil
}
