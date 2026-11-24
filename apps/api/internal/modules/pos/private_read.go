package pos

import (
	"context"

	"smartpos/api/internal/modules/organization"
)

func privateReadResult[Result any](ctx context.Context, authorization *organization.Authorization, result Result, err error) (Result, error) {
	var zero Result
	if failure := ctx.Err(); failure != nil {
		return zero, failure
	}
	// An aborted transaction cannot revalidate assurance or expose partial results.
	if err != nil && authorization.Tx.Conn().PgConn().TxStatus() == 'E' {
		return zero, dbError(err)
	}
	if failure := authorization.Recheck(ctx); failure != nil {
		return zero, failure
	}
	if failure := ctx.Err(); failure != nil {
		return zero, failure
	}
	if err != nil {
		return zero, dbError(err)
	}
	return result, nil
}
