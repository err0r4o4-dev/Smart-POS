package restaurant

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"regexp"
	"time"

	"github.com/jackc/pgx/v5"
)

// TableSessionLifetime is the approved Dine-in session duration from start.
const TableSessionLifetime = 2 * time.Hour

var tableSessionProofPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`)

// TableSession is the customer-visible state of a private Dine-in session.
// Internal table and session identifiers are never serialized.
type TableSession struct {
	Table     NativeTableQRContext `json:"table"`
	ExpiresAt time.Time            `json:"expires_at"`
}

// StartedTableSession carries the private proof, returned only at start.
type StartedTableSession struct {
	TableSession
	Proof string `json:"session_proof"`
}

func newTableSessionProof() (string, string, error) {
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", "", err
	}
	digest := sha256.Sum256(raw)
	return base64.RawURLEncoding.EncodeToString(raw), hex.EncodeToString(digest[:]), nil
}

// tableSessionProofDigest accepts only canonical unpadded base64url encodings
// of exactly 32 bytes. Callers check the format before opening a transaction.
func tableSessionProofDigest(proof string) (string, bool) {
	if !tableSessionProofPattern.MatchString(proof) {
		return "", false
	}
	raw, err := base64.RawURLEncoding.Strict().DecodeString(proof)
	if err != nil || len(raw) != 32 {
		return "", false
	}
	digest := sha256.Sum256(raw)
	return hex.EncodeToString(digest[:]), true
}

// ValidTableSessionProof reports whether proof has the issued format.
func ValidTableSessionProof(proof string) bool {
	_, ok := tableSessionProofDigest(proof)
	return ok
}

// TableSessionProofDigest returns the stored digest for a well-formed proof.
// It lets a scoped caller bind other records to a session without keeping
// the proof itself.
func TableSessionProofDigest(proof string) (string, bool) { return tableSessionProofDigest(proof) }

// ValidNativeTableQR reports whether token has the issued table QR format.
func ValidNativeTableQR(token string) bool { return nativeTableQRPattern.MatchString(token) }

// StartLockedTableSession creates one independent Dine-in session. The caller
// must use a transaction scoped and locked to org (organization row FOR UPDATE)
// and must have established selling eligibility. Admission is evaluated with
// the database clock sampled after the lock; that instant also anchors expiry.
func StartLockedTableSession(ctx context.Context, tx pgx.Tx, org, qrToken string, canSell bool) (StartedTableSession, error) {
	table, err := ResolveNativeTableQR(ctx, tx, org, qrToken)
	if err != nil {
		return StartedTableSession{}, err
	}
	var at time.Time
	if err = tx.QueryRow(ctx, "SELECT clock_timestamp()").Scan(&at); err != nil {
		return StartedTableSession{}, dbError(err)
	}
	denial, err := CheckLockedOrderAdmission(ctx, tx, org, string(modeDineIn), canSell, at)
	if err != nil {
		return StartedTableSession{}, err
	}
	if denial != "" {
		return StartedTableSession{}, ErrClosed
	}
	proof, digest, err := newTableSessionProof()
	if err != nil {
		return StartedTableSession{}, err
	}
	var expires time.Time
	err = tx.QueryRow(ctx, `INSERT INTO restaurant_table_sessions(organization_id,table_id,proof_digest,qr_token_hash,created_at,expires_at)
		VALUES($1,$2,$3,$4,$5,$5::timestamptz+interval '2 hours') RETURNING expires_at`,
		org, table.TableID, digest, table.qrHash, at).Scan(&expires)
	if err != nil {
		return StartedTableSession{}, dbError(err)
	}
	return StartedTableSession{TableSession: TableSession{Table: table, ExpiresAt: expires.UTC()}, Proof: proof}, nil
}

// activeTableSessionPredicate requires an unexpired session whose table is
// still active, whose QR is still the one used at start and whose restaurant
// still has table QR enabled.
const activeTableSessionPredicate = `s.organization_id=$1 AND s.proof_digest=$2 AND s.status='ACTIVE'
	AND s.expires_at > clock_timestamp()
	AND t.organization_id=s.organization_id AND t.id=s.table_id AND t.status='ACTIVE' AND t.qr_token_hash=s.qr_token_hash
	AND p.organization_id=s.organization_id AND p.table_qr_enabled`

// ReadTableSession returns the session selected by proof in a transaction
// scoped to org. Missing, foreign, ended and expired proofs are ErrNotFound.
// This read takes no lock; a later admission must validate again under lock.
func ReadTableSession(ctx context.Context, tx pgx.Tx, org, proof string) (TableSession, error) {
	digest, ok := tableSessionProofDigest(proof)
	if !ok {
		return TableSession{}, ErrNotFound
	}
	var session TableSession
	err := tx.QueryRow(ctx, `SELECT t.code,t.name,s.expires_at
		FROM restaurant_table_sessions s, restaurant_dining_tables t, restaurant_profiles p
		WHERE `+activeTableSessionPredicate, org, digest).Scan(&session.Table.Code, &session.Table.Name, &session.ExpiresAt)
	if err != nil {
		return TableSession{}, dbError(err)
	}
	session.ExpiresAt = session.ExpiresAt.UTC()
	return session, nil
}

// EndTableSession ends only the session selected by proof. It does not take
// the organization lock, so unauthenticated end requests cannot queue behind
// or delay Owner setup. Committed orders, payments and queue entries are not
// touched. Missing, foreign, ended and expired proofs are ErrNotFound.
func EndTableSession(ctx context.Context, tx pgx.Tx, org, proof string) error {
	digest, ok := tableSessionProofDigest(proof)
	if !ok {
		return ErrNotFound
	}
	result, err := tx.Exec(ctx, `UPDATE restaurant_table_sessions s SET status='ENDED',end_reason='CUSTOMER',ended_at=clock_timestamp()
		FROM restaurant_dining_tables t, restaurant_profiles p
		WHERE `+activeTableSessionPredicate, org, digest)
	if err != nil {
		return dbError(err)
	}
	if result.RowsAffected() != 1 {
		return ErrNotFound
	}
	return nil
}

// endChangedTableSessions runs inside the Owner table setup transaction,
// which holds the organization lock. It ends unexpired sessions of tables
// that were closed or whose QR was rotated, or all of them when QR is disabled.
func endChangedTableSessions(ctx context.Context, tx pgx.Tx, org string, qrEnabled bool, rotated []string) error {
	_, err := tx.Exec(ctx, `UPDATE restaurant_table_sessions s SET status='ENDED',ended_at=clock_timestamp(),
		end_reason=CASE WHEN NOT $2 THEN 'QR_DISABLED' WHEN t.status<>'ACTIVE' THEN 'TABLE_CLOSED' ELSE 'QR_ROTATED' END
		FROM restaurant_dining_tables t
		WHERE s.organization_id=$1 AND s.status='ACTIVE' AND s.expires_at > clock_timestamp()
		AND t.organization_id=s.organization_id AND t.id=s.table_id
		AND (NOT $2 OR t.status<>'ACTIVE' OR t.id=ANY($3::uuid[]) OR t.qr_token_hash<>s.qr_token_hash)`,
		org, qrEnabled, rotated)
	return dbError(err)
}
