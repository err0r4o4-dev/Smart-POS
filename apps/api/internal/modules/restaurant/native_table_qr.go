package restaurant

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"regexp"

	"github.com/jackc/pgx/v5"
)

var nativeTableQRPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)

type NativeTableQRContext struct {
	TableID string `json:"-"`
	Code    string `json:"code"`
	Name    string `json:"name"`
	// qrHash is the stored digest that matched; sessions snapshot it.
	qrHash string
}

// ResolveNativeTableQR identifies a table in a restaurant-scoped transaction.
// The caller controls public visibility; this result grants no session access.
func ResolveNativeTableQR(ctx context.Context, tx pgx.Tx, org, token string) (NativeTableQRContext, error) {
	if !nativeTableQRPattern.MatchString(token) {
		return NativeTableQRContext{}, ErrNotFound
	}
	digest := sha256.Sum256([]byte(token))
	var table NativeTableQRContext
	err := tx.QueryRow(ctx, `SELECT t.id::text,t.code,t.name,t.qr_token_hash
		FROM restaurant_dining_tables t
		JOIN restaurant_profiles p ON p.organization_id=t.organization_id
		WHERE t.organization_id=$1 AND t.status='ACTIVE' AND p.table_qr_enabled AND t.qr_token_hash=$2`,
		org, hex.EncodeToString(digest[:])).Scan(&table.TableID, &table.Code, &table.Name, &table.qrHash)
	if err != nil {
		return NativeTableQRContext{}, dbError(err)
	}
	return table, nil
}
