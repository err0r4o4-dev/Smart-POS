package restaurant

import (
	"context"
	"fmt"
	"reflect"
	"time"

	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/organization"
)

type AvailabilityWindow struct {
	Weekday int    `json:"weekday"`
	Start   string `json:"start"`
	End     string `json:"end"`
}

type AvailabilitySettings struct {
	Timezone       string               `json:"timezone"`
	WeeklyWindows  []AvailabilityWindow `json:"weekly_windows"`
	GlobalPause    bool                 `json:"global_pause"`
	DineInPaused   bool                 `json:"dine_in_paused"`
	TakeawayPaused bool                 `json:"takeaway_paused"`
	PickupPaused   bool                 `json:"pickup_paused"`
	DeliveryPaused bool                 `json:"delivery_paused"`
	Revision       int64                `json:"revision"`
}

type availabilitySnapshot struct {
	Availability AvailabilitySettings `json:"ordering_availability"`
}

func (settings AvailabilitySettings) schedule() (orderingSchedule, error) {
	if len(settings.Timezone) > 255 || settings.Revision < 0 || len(settings.WeeklyWindows) > 7*24*60 {
		return orderingSchedule{}, ErrInput
	}
	windows := make([]orderingWindow, 0, len(settings.WeeklyWindows))
	for _, w := range settings.WeeklyWindows {
		windows = append(windows, orderingWindow{weekday: w.Weekday, start: w.Start, end: w.End})
	}
	return newOrderingSchedule(settings.Timezone, windows)
}

func (settings AvailabilitySettings) evaluateAdmission(at time.Time, mode orderingMode, canSell bool, enabled orderingModes) (admissionDenial, error) {
	schedule, err := settings.schedule()
	if err != nil {
		return admissionUnavailable, err
	}
	paused := orderingModes{
		dineIn:   settings.DineInPaused,
		takeaway: settings.TakeawayPaused,
		pickup:   settings.PickupPaused,
		delivery: settings.DeliveryPaused,
	}
	return schedule.admission(at, mode, canSell, enabled, settings.GlobalPause, paused), nil
}

func readAvailabilitySettings(ctx context.Context, tx pgx.Tx, org string) (AvailabilitySettings, error) {
	var settings AvailabilitySettings
	err := tx.QueryRow(ctx, `SELECT COALESCE(a.timezone,p.timezone),COALESCE(a.weekly_windows,'[]'::jsonb),
        COALESCE(a.global_pause,false),COALESCE(a.dine_in_paused,false),COALESCE(a.takeaway_paused,false),
        COALESCE(a.pickup_paused,false),COALESCE(a.delivery_paused,false),COALESCE(a.revision,0)
        FROM restaurant_profiles p LEFT JOIN restaurant_availability a ON a.organization_id=p.organization_id
        WHERE p.organization_id=$1`, org).Scan(
		&settings.Timezone, &settings.WeeklyWindows, &settings.GlobalPause, &settings.DineInPaused,
		&settings.TakeawayPaused, &settings.PickupPaused, &settings.DeliveryPaused, &settings.Revision,
	)
	if err != nil {
		return AvailabilitySettings{}, dbError(err)
	}
	if _, err = settings.schedule(); err != nil {
		return AvailabilitySettings{}, fmt.Errorf("stored restaurant availability is invalid")
	}
	return settings, nil
}

// CheckLockedOrderAdmission evaluates a new order using stored mode flags and
// hours. The caller must use a transaction scoped and locked to org, establish
// selling eligibility for that restaurant, and sample at after taking the lock.
func CheckLockedOrderAdmission(ctx context.Context, tx pgx.Tx, org, mode string, canSell bool, at time.Time) (string, error) {
	if !canSell {
		return string(admissionUnavailable), nil
	}
	var enabled orderingModes
	if err := tx.QueryRow(ctx, `SELECT dine_in,takeaway,pickup,delivery FROM restaurant_profiles
		WHERE organization_id=$1`, org).Scan(&enabled.dineIn, &enabled.takeaway, &enabled.pickup, &enabled.delivery); err != nil {
		return string(admissionUnavailable), dbError(err)
	}
	settings, err := readAvailabilitySettings(ctx, tx, org)
	if err != nil {
		return string(admissionUnavailable), err
	}
	denial, err := settings.evaluateAdmission(at, orderingMode(mode), canSell, enabled)
	return string(denial), err
}

func (service *Service) AvailabilitySettings(ctx context.Context, user, org string) (AvailabilitySettings, error) {
	auth, err := service.beginOrganizationSetup(ctx, user, org)
	if err != nil {
		return AvailabilitySettings{}, err
	}
	defer auth.Tx.Rollback(ctx)
	settings, err := readAvailabilitySettings(ctx, auth.Tx, org)
	if err != nil {
		return AvailabilitySettings{}, err
	}
	if err = auth.Recheck(ctx); err != nil {
		return AvailabilitySettings{}, err
	}
	return settings, nil
}

func (service *Service) SaveAvailabilitySettings(ctx context.Context, user, org string, settings AvailabilitySettings) (AvailabilitySettings, error) {
	if _, err := settings.schedule(); err != nil {
		return AvailabilitySettings{}, err
	}
	if settings.WeeklyWindows == nil {
		settings.WeeklyWindows = []AvailabilityWindow{}
	}
	auth, err := service.beginOrganizationSetup(ctx, user, org)
	if err != nil {
		return AvailabilitySettings{}, err
	}
	tx := auth.Tx
	defer tx.Rollback(ctx)

	// The organization row is already locked by AuthorizeMFA.
	before, err := readAvailabilitySettings(ctx, tx, org)
	if err != nil {
		return AvailabilitySettings{}, err
	}
	after, err := writeAvailabilitySettings(ctx, auth, user, org, settings)
	if err != nil {
		return AvailabilitySettings{}, err
	}
	if !reflect.DeepEqual(before, settings) {
		if err = appendSetupMenuRevision(ctx, tx, org, user, availabilitySnapshot{before}, availabilitySnapshot{after}); err != nil {
			return AvailabilitySettings{}, err
		}
		if err = auth.Recheck(ctx); err != nil {
			return AvailabilitySettings{}, err
		}
	}
	if err = organization.RecordAudit(ctx, tx, org, user, "RESTAURANT_AVAILABILITY_UPDATED", org); err != nil {
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

func writeAvailabilitySettings(ctx context.Context, auth *organization.Authorization, user, org string, settings AvailabilitySettings) (AvailabilitySettings, error) {
	tx := auth.Tx
	var err error
	if err = auth.Recheck(ctx); err != nil {
		return AvailabilitySettings{}, err
	}
	args := []any{org, settings.Timezone, settings.WeeklyWindows, settings.GlobalPause,
		settings.DineInPaused, settings.TakeawayPaused, settings.PickupPaused, settings.DeliveryPaused, user}
	var revision int64
	if settings.Revision == 0 {
		err = tx.QueryRow(ctx, `INSERT INTO restaurant_availability
			(organization_id,timezone,weekly_windows,global_pause,dine_in_paused,takeaway_paused,pickup_paused,delivery_paused,updated_by,revision)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,1) ON CONFLICT (organization_id) DO NOTHING RETURNING revision`, args...).Scan(&revision)
	} else {
		err = tx.QueryRow(ctx, `UPDATE restaurant_availability SET
			timezone=$2,weekly_windows=$3,global_pause=$4,dine_in_paused=$5,takeaway_paused=$6,pickup_paused=$7,
			delivery_paused=$8,updated_by=$9,updated_at=statement_timestamp(),revision=revision+1
			WHERE organization_id=$1 AND revision=$10 RETURNING revision`, append(args, settings.Revision)...).Scan(&revision)
	}
	if err == pgx.ErrNoRows {
		if err = auth.Recheck(ctx); err != nil {
			return AvailabilitySettings{}, err
		}
		return AvailabilitySettings{}, ErrConflict
	}
	if err != nil {
		return AvailabilitySettings{}, dbError(err)
	}
	if err = auth.Recheck(ctx); err != nil {
		return AvailabilitySettings{}, err
	}
	settings.Revision = revision
	return settings, nil
}
