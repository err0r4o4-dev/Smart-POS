package menurevision

import (
	"bytes"
	"context"
	"errors"

	"github.com/jackc/pgx/v5"
)

var ErrExhausted = errors.New("menu revision exhausted")

// Current reads the revision in the caller's tenant scope. Pair it with menu
// data under the organization lock or a common transaction snapshot.
func Current(ctx context.Context, tx pgx.Tx, org string) (int64, error) {
	var revision int64
	err := tx.QueryRow(ctx, `SELECT COALESCE(max(revision),0) FROM restaurant_menu_revisions WHERE organization_id=$1`, org).Scan(&revision)
	return revision, err
}

// AppendChange runs inside the authorized write transaction with the organization row locked.
func AppendChange(ctx context.Context, tx pgx.Tx, org, actor string, before, after []byte) error {
	if bytes.Equal(before, after) {
		return nil
	}
	result, err := tx.Exec(ctx, `WITH current_revision AS (
	  SELECT COALESCE(max(revision),0) AS value FROM restaurant_menu_revisions WHERE organization_id=$1
	) INSERT INTO restaurant_menu_revisions(organization_id,revision,actor_id,before_state,after_state)
	  SELECT $1,value+1,$2,$3,$4 FROM current_revision WHERE value < 9223372036854775807`, org, actor, before, after)
	if err != nil {
		return err
	}
	if result.RowsAffected() != 1 {
		return ErrExhausted
	}
	return nil
}
