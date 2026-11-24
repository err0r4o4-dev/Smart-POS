package restaurant

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"math"
	"strings"

	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/menurevision"
	"smartpos/api/internal/modules/organization"
)

type MenuModifierRevision struct {
	Revision  int64
	VariantID string
	Groups    []MenuModifierGroup
}

// SaveMenuModifierGroups is an internal command; public activation requires all menu writers to share the revision.
func (service *Service) SaveMenuModifierGroups(ctx context.Context, user, org, variant, key string, expected int64, changes []MenuModifierGroup) (MenuModifierRevision, error) {
	key = strings.TrimSpace(key)
	variant = strings.ToLower(variant)
	if validateSetupIdempotencyKey(key) != nil || expected < 0 {
		return MenuModifierRevision{}, ErrInput
	}
	auth, err := service.beginOrganizationSetup(ctx, user, org)
	if err != nil {
		return MenuModifierRevision{}, err
	}
	tx := auth.Tx // Owner MFA authorization holds the organization row until transaction end.
	defer tx.Rollback(ctx)
	groups, err := readMenuModifierGroups(ctx, tx, org, variant)
	if problem := auth.Recheck(ctx); problem != nil {
		return MenuModifierRevision{}, problem
	}
	if err != nil {
		return MenuModifierRevision{}, err
	}
	before := projectMenuModifierGroups(groups)
	candidate, err := applyMenuModifierEdits(before, changes)
	if err != nil {
		return MenuModifierRevision{}, err
	}
	payload, err := json.Marshal(struct {
		Variant  string
		Expected int64
		Changes  []MenuModifierGroup
	}{variant, expected, changes})
	if err != nil {
		return MenuModifierRevision{}, err
	}
	fingerprint := sha256.Sum256(payload)
	var previousFingerprint, previous []byte
	err = tx.QueryRow(ctx, `SELECT fingerprint,after_state FROM restaurant_menu_revisions WHERE organization_id=$1 AND actor_id=$2 AND idempotency_key=$3`, org, user, key).Scan(&previousFingerprint, &previous)
	if problem := auth.Recheck(ctx); problem != nil {
		return MenuModifierRevision{}, problem
	}
	if err == nil {
		if !bytes.Equal(previousFingerprint, fingerprint[:]) {
			return MenuModifierRevision{}, ErrConflict
		}
		var result MenuModifierRevision
		if err = json.Unmarshal(previous, &result); err != nil {
			return MenuModifierRevision{}, err
		}
		if err = auth.Recheck(ctx); err != nil {
			return MenuModifierRevision{}, err
		}
		return result, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return MenuModifierRevision{}, dbError(err)
	}
	revision, err := menurevision.Current(ctx, tx, org)
	if err != nil {
		return MenuModifierRevision{}, dbError(err)
	}
	if err = auth.Recheck(ctx); err != nil {
		return MenuModifierRevision{}, err
	}
	if revision != expected || revision == math.MaxInt64 {
		return MenuModifierRevision{}, ErrConflict
	}
	if err = persistModifierEdits(ctx, auth, org, variant, before, candidate); err != nil {
		return MenuModifierRevision{}, err
	}
	groups, err = readMenuModifierGroups(ctx, tx, org, variant)
	if err != nil {
		return MenuModifierRevision{}, err
	}
	result := MenuModifierRevision{Revision: revision + 1, VariantID: variant, Groups: projectMenuModifierGroups(groups)}
	beforeJSON, err := json.Marshal(MenuModifierRevision{Revision: revision, VariantID: variant, Groups: before})
	if err != nil {
		return MenuModifierRevision{}, err
	}
	afterJSON, err := json.Marshal(result)
	if err != nil {
		return MenuModifierRevision{}, err
	}
	if err = auth.Recheck(ctx); err != nil {
		return MenuModifierRevision{}, err
	}
	if _, err = tx.Exec(ctx, `INSERT INTO restaurant_menu_revisions(organization_id,revision,actor_id,before_state,after_state,idempotency_key,fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7)`, org, result.Revision, user, beforeJSON, afterJSON, key, fingerprint[:]); err != nil {
		return MenuModifierRevision{}, dbError(err)
	}
	if err = auth.Recheck(ctx); err != nil {
		return MenuModifierRevision{}, err
	}
	if err = organization.RecordAudit(ctx, tx, org, user, "restaurant.menu.modifiers_saved", variant); err != nil {
		return MenuModifierRevision{}, dbError(err)
	}
	if err = auth.Recheck(ctx); err != nil {
		return MenuModifierRevision{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return MenuModifierRevision{}, dbError(err)
	}
	return result, nil
}

func persistModifierEdits(ctx context.Context, auth *organization.Authorization, org, variant string, before, after []MenuModifierGroup) error {
	tx := auth.Tx
	for i, group := range after {
		var old MenuModifierGroup
		if i < len(before) {
			old = before[i]
		}
		if err := auth.Recheck(ctx); err != nil {
			return err
		}
		groupID := group.ID
		if groupID == "" {
			if err := tx.QueryRow(ctx, `INSERT INTO restaurant_menu_modifier_groups(organization_id,variant_id,label,min_choices,max_choices) VALUES($1,$2,$3,$4,$5) RETURNING id::text`, org, variant, group.Label, group.MinChoices, group.MaxChoices).Scan(&groupID); err != nil {
				return dbError(err)
			}
		} else if group.Label != old.Label || group.MinChoices != old.MinChoices || group.MaxChoices != old.MaxChoices {
			count, err := tx.Exec(ctx, `UPDATE restaurant_menu_modifier_groups SET label=$4,min_choices=$5,max_choices=$6 WHERE organization_id=$1 AND variant_id=$2 AND id=$3`, org, variant, groupID, group.Label, group.MinChoices, group.MaxChoices)
			if err != nil {
				return dbError(err)
			}
			if count.RowsAffected() != 1 {
				return ErrConflict
			}
		}
		for j, option := range group.Options {
			if j < len(old.Options) && option == old.Options[j] {
				continue
			}
			if err := auth.Recheck(ctx); err != nil {
				return err
			}
			if option.ID == "" {
				if _, err := tx.Exec(ctx, `INSERT INTO restaurant_menu_modifier_options(organization_id,variant_id,group_id,label,extra_price,saleable) VALUES($1,$2,$3,$4,$5,$6)`, org, variant, groupID, option.Label, option.ExtraPrice, option.Saleable); err != nil {
					return dbError(err)
				}
			} else {
				count, err := tx.Exec(ctx, `UPDATE restaurant_menu_modifier_options SET label=$5,extra_price=$6,saleable=$7 WHERE organization_id=$1 AND variant_id=$2 AND group_id=$3 AND id=$4`, org, variant, groupID, option.ID, option.Label, option.ExtraPrice, option.Saleable)
				if err != nil {
					return dbError(err)
				}
				if count.RowsAffected() != 1 {
					return ErrConflict
				}
			}
		}
	}
	return auth.Recheck(ctx)
}
