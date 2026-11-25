package restaurant

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"strings"

	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/menurevision"
	"smartpos/api/internal/modules/organization"
)

type availabilityRestoreSnapshot struct {
	availabilitySnapshot
	RestoredFrom int64 `json:"restored_from_revision"`
}

// RestoreAvailabilitySettings restores only an ordering availability snapshot.
// It has no public route and does not change catalog eligibility or paid orders.
func (service *Service) RestoreAvailabilitySettings(ctx context.Context, user, org, key string, source, expected int64) (AvailabilitySettings, error) {
	key = strings.TrimSpace(key)
	if validateSetupIdempotencyKey(key) != nil || source <= 0 || expected <= 0 {
		return AvailabilitySettings{}, ErrInput
	}
	auth, err := service.beginOrganizationSetup(ctx, user, org)
	if err != nil {
		return AvailabilitySettings{}, err
	}
	tx := auth.Tx
	defer tx.Rollback(ctx)

	fingerprint := sha256.Sum256(fmt.Appendf(nil, "restaurant.availability.restore:%d:%d", source, expected))
	var previousFingerprint, previous []byte
	err = tx.QueryRow(ctx, `SELECT fingerprint,after_state FROM restaurant_menu_revisions
		WHERE organization_id=$1 AND actor_id=$2 AND idempotency_key=$3`, org, user, key).Scan(&previousFingerprint, &previous)
	if problem := auth.Recheck(ctx); problem != nil {
		return AvailabilitySettings{}, problem
	}
	if err == nil {
		if !bytes.Equal(previousFingerprint, fingerprint[:]) {
			return AvailabilitySettings{}, ErrConflict
		}
		return decodeAvailabilitySnapshot(previous)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return AvailabilitySettings{}, dbError(err)
	}
	var snapshot []byte
	err = tx.QueryRow(ctx, `SELECT after_state FROM restaurant_menu_revisions
		WHERE organization_id=$1 AND revision=$2 AND jsonb_typeof(after_state->'ordering_availability')='object'`, org, source).Scan(&snapshot)
	if problem := auth.Recheck(ctx); problem != nil {
		return AvailabilitySettings{}, problem
	}
	if err != nil {
		return AvailabilitySettings{}, dbError(err)
	}
	settings, err := decodeAvailabilitySnapshot(snapshot)
	if err != nil {
		return AvailabilitySettings{}, err
	}
	current, err := menurevision.Current(ctx, tx, org)
	if problem := auth.Recheck(ctx); problem != nil {
		return AvailabilitySettings{}, problem
	}
	if err != nil {
		return AvailabilitySettings{}, dbError(err)
	}
	if current != expected || current == math.MaxInt64 {
		return AvailabilitySettings{}, ErrConflict
	}
	before, err := readAvailabilitySettings(ctx, tx, org)
	if err != nil {
		return AvailabilitySettings{}, err
	}
	settings.Revision = before.Revision
	after, err := writeAvailabilitySettings(ctx, auth, user, org, settings)
	if err != nil {
		return AvailabilitySettings{}, err
	}
	beforeJSON, err := json.Marshal(availabilitySnapshot{before})
	if err != nil {
		return AvailabilitySettings{}, err
	}
	afterJSON, err := json.Marshal(availabilityRestoreSnapshot{availabilitySnapshot{after}, source})
	if err != nil {
		return AvailabilitySettings{}, err
	}
	if err = auth.Recheck(ctx); err != nil {
		return AvailabilitySettings{}, err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO restaurant_menu_revisions
		(organization_id,revision,actor_id,before_state,after_state,idempotency_key,fingerprint)
		VALUES($1,$2,$3,$4,$5,$6,$7)`, org, current+1, user, beforeJSON, afterJSON, key, fingerprint[:]); err != nil {
		return AvailabilitySettings{}, dbError(err)
	}
	if err = auth.Recheck(ctx); err != nil {
		return AvailabilitySettings{}, err
	}
	if err = organization.RecordAudit(ctx, tx, org, user, "RESTAURANT_AVAILABILITY_RESTORED", org); err != nil {
		return AvailabilitySettings{}, dbError(err)
	}
	if err = auth.Recheck(ctx); err != nil {
		return AvailabilitySettings{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return AvailabilitySettings{}, dbError(err)
	}
	return after, nil
}

func decodeAvailabilitySnapshot(data []byte) (AvailabilitySettings, error) {
	var snapshot availabilitySnapshot
	if err := json.Unmarshal(data, &snapshot); err != nil {
		return AvailabilitySettings{}, err
	}
	settings := snapshot.Availability
	if _, err := settings.schedule(); err != nil || settings.Revision <= 0 || settings.WeeklyWindows == nil {
		return AvailabilitySettings{}, errors.New("stored availability snapshot is invalid")
	}
	return settings, nil
}
