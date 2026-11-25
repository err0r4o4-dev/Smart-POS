package inventory

import (
	"context"

	"smartpos/api/internal/modules/organization"
)

func privateReadCheck(ctx context.Context, authorization *organization.Authorization, problem error) error {
	if err := ctx.Err(); err != nil {
		return err
	}
	if problem != nil && authorization.Tx.Conn().PgConn().TxStatus() == 'E' {
		return problem
	}
	if err := authorization.Recheck(ctx); err != nil {
		return err
	}
	if err := ctx.Err(); err != nil {
		return err
	}
	return problem
}

func finishPrivateRead[T any](ctx context.Context, authorization *organization.Authorization, result *T, problem *error) {
	*problem = privateReadCheck(ctx, authorization, *problem)
	if *problem != nil {
		var zero T
		*result = zero
	}
}
