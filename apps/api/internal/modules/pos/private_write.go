package pos

import (
	"context"

	"smartpos/api/internal/modules/organization"
)

func writeCheck(ctx context.Context, authorization *organization.Authorization, problem error) error {
	_, err := privateReadResult(ctx, authorization, struct{}{}, problem)
	return err
}

func finishAuthorized(ctx context.Context, authorization *organization.Authorization, org, user, event, id string) error {
	if err := writeCheck(ctx, authorization, nil); err != nil {
		return err
	}
	if err := writeCheck(ctx, authorization, organization.RecordAudit(ctx, authorization.Tx, org, user, event, id)); err != nil {
		return err
	}
	return dbError(authorization.Tx.Commit(ctx))
}
