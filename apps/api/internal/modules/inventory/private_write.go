package inventory

import (
	"context"
	"encoding/json"

	"smartpos/api/internal/modules/organization"
)

func completeAuthorized(ctx context.Context, authorization *organization.Authorization, user, org, operation, event, object string, result json.RawMessage) (json.RawMessage, error) {
	tx := authorization.Tx
	if operation != "" {
		_, err := tx.Exec(ctx, "UPDATE inventory_operations SET result=$3 WHERE organization_id=$1 AND id=$2", org, operation, []byte(result))
		if err = privateReadCheck(ctx, authorization, err); err != nil {
			return nil, err
		}
	}
	if err := privateReadCheck(ctx, authorization, organization.RecordAudit(ctx, tx, org, user, event, object)); err != nil {
		return nil, err
	}
	if err := tx.Commit(ctx); err != nil {
		return nil, databaseError(err)
	}
	return result, nil
}
