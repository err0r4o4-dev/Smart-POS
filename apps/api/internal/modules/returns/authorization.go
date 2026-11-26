package returns

import (
	"context"
	"encoding/json"

	"smartpos/api/internal/modules/inventory"
	"smartpos/api/internal/modules/organization"
)

func checkAuthorization(ctx context.Context, authorization *organization.Authorization, problem error) error {
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

func finishRead[T any](ctx context.Context, authorization *organization.Authorization, value *T, problem *error) {
	*problem = checkAuthorization(ctx, authorization, *problem)
	if *problem != nil {
		var zero T
		*value = zero
	}
}

func finishWrite(ctx context.Context, authorization *organization.Authorization, user, org, op, event, id string, value json.RawMessage) (json.RawMessage, error) {
	tx := authorization.Tx
	if err := checkAuthorization(ctx, authorization, nil); err != nil {
		return nil, err
	}
	if err := checkAuthorization(ctx, authorization, dbError(inventory.CompleteSale(ctx, tx, org, op, value))); err != nil {
		return nil, err
	}
	if err := checkAuthorization(ctx, authorization, organization.RecordAudit(ctx, tx, org, user, event, id)); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, dbError(err)
	}
	return value, nil
}
