package customers

import (
	"context"

	"smartpos/api/internal/modules/organization"
)

func (service *Service) beginMFA(ctx context.Context, user, org, permission string, filters Filter) (*organization.Authorization, error) {
	authorization, err := service.Organization.AuthorizeMFA(ctx, user, org, permission)
	if err != nil {
		return nil, err
	}
	tx, actor := authorization.Tx, authorization.Actor
	fail := func(err error) (*organization.Authorization, error) {
		_, failure := privateReadResult(ctx, authorization, struct{}{}, err)
		tx.Rollback(ctx)
		return nil, failure
	}
	if actor.Role != "OWNER" && len(actor.BranchIDs) == 0 || filters.BranchID != "" && actor.Role != "OWNER" && !has(actor.BranchIDs, filters.BranchID) {
		return fail(organization.ErrDenied)
	}
	if filters.BranchID != "" {
		var exists bool
		err = tx.QueryRow(ctx, "SELECT EXISTS(SELECT 1 FROM branches WHERE organization_id=$1 AND id=$2)", org, filters.BranchID).Scan(&exists)
		if err != nil {
			return fail(err)
		}
		if !exists {
			return fail(ErrNotFound)
		}
		if err = authorization.Recheck(ctx); err != nil {
			return fail(err)
		}
	}
	return authorization, nil
}

func privateReadResult[Result any](ctx context.Context, authorization *organization.Authorization, result Result, err error) (Result, error) {
	var zero Result
	if failure := ctx.Err(); failure != nil {
		return zero, failure
	}
	// An aborted transaction cannot revalidate assurance; never expose its payload.
	if err != nil && authorization.Tx.Conn().PgConn().TxStatus() == 'E' {
		return zero, dbError(err)
	}
	if failure := authorization.Recheck(ctx); failure != nil {
		return zero, failure
	}
	if err != nil {
		return zero, dbError(err)
	}
	return result, nil
}
