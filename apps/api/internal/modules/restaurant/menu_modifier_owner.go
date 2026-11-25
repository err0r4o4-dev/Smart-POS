package restaurant

import (
	"context"
	"strings"

	"smartpos/api/internal/modules/menurevision"
)

type MenuModifierOption struct {
	ID         string
	Label      string
	ExtraPrice string
	Saleable   bool
}

type MenuModifierGroup struct {
	ID         string
	Label      string
	MinChoices int
	MaxChoices int
	Options    []MenuModifierOption
}

// MenuModifierGroups reads an Owner's editable choices, including disabled options.
func (service *Service) MenuModifierGroups(ctx context.Context, user, org, variant string) ([]MenuModifierGroup, error) {
	menu, err := service.ReadMenuModifierRevision(ctx, user, org, variant)
	return menu.Groups, err
}

// ReadMenuModifierRevision keeps the Owner projection and revision under the same organization lock.
func (service *Service) ReadMenuModifierRevision(ctx context.Context, user, org, variant string) (MenuModifierRevision, error) {
	auth, err := service.beginOrganizationSetup(ctx, user, org)
	if err != nil {
		return MenuModifierRevision{}, err
	}
	defer auth.Tx.Rollback(ctx)
	variant = strings.ToLower(variant)
	groups, readErr := readMenuModifierGroups(ctx, auth.Tx, org, variant)
	if err = ctx.Err(); err != nil {
		return MenuModifierRevision{}, err
	}
	if err = auth.Recheck(ctx); err != nil {
		return MenuModifierRevision{}, err
	}
	if readErr != nil {
		return MenuModifierRevision{}, readErr
	}
	revision, err := menurevision.Current(ctx, auth.Tx, org)
	if err != nil {
		return MenuModifierRevision{}, dbError(err)
	}
	if err = auth.Recheck(ctx); err != nil {
		return MenuModifierRevision{}, err
	}
	return MenuModifierRevision{Revision: revision, VariantID: variant, Groups: projectMenuModifierGroups(groups)}, nil
}

func projectMenuModifierGroups(groups []menuModifierGroup) []MenuModifierGroup {
	result := make([]MenuModifierGroup, 0, len(groups))
	for _, group := range groups {
		options := make([]MenuModifierOption, 0, len(group.options))
		for _, option := range group.options {
			options = append(options, MenuModifierOption{ID: option.id, Label: option.label, ExtraPrice: option.extraPrice, Saleable: option.saleable})
		}
		result = append(result, MenuModifierGroup{ID: group.id, Label: group.label, MinChoices: group.minChoices, MaxChoices: group.maxChoices, Options: options})
	}
	return result
}
