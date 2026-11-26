package restaurant

import (
	"context"

	"github.com/jackc/pgx/v5"
)

func readMenuModifierGroups(ctx context.Context, tx pgx.Tx, org, variant string) ([]menuModifierGroup, error) {
	if !uuidPattern.MatchString(org) || !uuidPattern.MatchString(variant) {
		return nil, ErrNotFound
	}
	rows, err := tx.Query(ctx, `SELECT g.id::text,g.label,g.min_choices,g.max_choices,
		o.id::text,o.label,o.extra_price::numeric(18,2)::text,o.saleable
	 FROM restaurant_menu_items AS item
	 LEFT JOIN restaurant_menu_modifier_groups AS g USING (organization_id,variant_id)
	 LEFT JOIN restaurant_menu_modifier_options AS o ON (o.organization_id,o.variant_id,o.group_id)=(g.organization_id,g.variant_id,g.id)
	 WHERE item.organization_id=$1 AND item.variant_id=$2 ORDER BY g.id,o.id`, org, variant)
	if err != nil {
		return nil, dbError(err)
	}
	defer rows.Close()
	groups := []menuModifierGroup{}
	found := false
	for rows.Next() {
		found = true
		var groupID, groupLabel, optionID, optionLabel, price *string
		var minChoices, maxChoices *int
		var saleable *bool
		if err = rows.Scan(&groupID, &groupLabel, &minChoices, &maxChoices, &optionID, &optionLabel, &price, &saleable); err != nil {
			return nil, dbError(err)
		}
		if groupID == nil {
			continue
		}
		if len(groups) == 0 || groups[len(groups)-1].id != *groupID {
			groups = append(groups, menuModifierGroup{id: *groupID, label: *groupLabel, minChoices: *minChoices, maxChoices: *maxChoices})
		}
		if optionID != nil {
			group := &groups[len(groups)-1]
			group.options = append(group.options, menuModifierOption{id: *optionID, label: *optionLabel, extraPrice: *price, saleable: *saleable})
		}
	}
	if err = rows.Err(); err != nil {
		return nil, dbError(err)
	}
	if !found {
		return nil, ErrNotFound
	}
	return groups, nil
}
