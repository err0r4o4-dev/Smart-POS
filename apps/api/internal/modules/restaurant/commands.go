package restaurant

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"

	"github.com/jackc/pgx/v5"
)

func claimCommand(ctx context.Context, tx pgx.Tx, org, user, operation, key string, input any) (string, []byte, error) {
	if !uuidPattern.MatchString(key) {
		return "", nil, ErrInput
	}
	encoded, err := json.Marshal(input)
	if err != nil {
		return "", nil, ErrInput
	}
	hash := sha256.Sum256(encoded)
	fingerprint := hex.EncodeToString(hash[:])
	var id, previousFingerprint string
	var previous []byte
	err = tx.QueryRow(ctx, "SELECT id::text,fingerprint,result FROM inventory_operations WHERE organization_id=$1 AND actor_id=$2 AND operation=$3 AND idempotency_key=$4", org, user, operation, key).Scan(&id, &previousFingerprint, &previous)
	if err == nil {
		if previousFingerprint != fingerprint || previous == nil {
			return "", nil, ErrConflict
		}
		return id, previous, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", nil, dbError(err)
	}
	err = tx.QueryRow(ctx, "INSERT INTO inventory_operations(organization_id,actor_id,operation,idempotency_key,fingerprint) VALUES($1,$2,$3,$4,$5) RETURNING id::text", org, user, operation, key, fingerprint).Scan(&id)
	return id, nil, dbError(err)
}

func saveCommand(ctx context.Context, tx pgx.Tx, org, id string, result any) error {
	if id == "" {
		return nil
	}
	encoded, err := json.Marshal(result)
	if err != nil {
		return err
	}
	command, err := tx.Exec(ctx, "UPDATE inventory_operations SET result=$3 WHERE organization_id=$1 AND id=$2 AND result IS NULL", org, id, encoded)
	if err != nil {
		return dbError(err)
	}
	if command.RowsAffected() != 1 {
		return ErrConflict
	}
	return nil
}
