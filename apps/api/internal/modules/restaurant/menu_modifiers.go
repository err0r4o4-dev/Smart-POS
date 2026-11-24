package restaurant

import (
	"context"
	"math"
	"sort"

	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/pricing"
)

type MenuModifierChoice struct {
	GroupID   string
	OptionIDs []string
}

type PricedMenuModifier struct {
	GroupID, GroupLabel   string
	OptionID, OptionLabel string
	ExtraPrice            string
}

type MenuModifierPricing struct {
	ExtraMinor int64
	Options    []PricedMenuModifier
}

// PriceMenuModifierSelection loads choices within the caller's scoped menu transaction.
// Use the same snapshot or organization lock as the item price and eligibility read.
func PriceMenuModifierSelection(ctx context.Context, tx pgx.Tx, org, variant string, choices []MenuModifierChoice) (MenuModifierPricing, error) {
	groups, err := readMenuModifierGroups(ctx, tx, org, variant)
	if err != nil {
		return MenuModifierPricing{}, err
	}
	return priceMenuModifierSelection(groups, choices)
}

func priceMenuModifierSelection(groups []menuModifierGroup, choices []MenuModifierChoice) (MenuModifierPricing, error) {
	selections := make([]menuModifierSelection, len(choices))
	for i, choice := range choices {
		selections[i] = menuModifierSelection{groupID: choice.GroupID, optionIDs: choice.OptionIDs}
	}
	if err := validateMenuModifierSelection(groups, selections); err != nil {
		return MenuModifierPricing{}, err
	}
	selected := make(map[string]map[string]struct{}, len(choices))
	for _, choice := range choices {
		options := make(map[string]struct{}, len(choice.OptionIDs))
		for _, id := range choice.OptionIDs {
			options[id] = struct{}{}
		}
		selected[choice.GroupID] = options
	}
	result := MenuModifierPricing{Options: []PricedMenuModifier{}}
	for _, group := range groups {
		for _, option := range group.options {
			if _, ok := selected[group.id][option.id]; !ok {
				continue
			}
			extra, err := pricing.Decimal(option.extraPrice, 2)
			if err != nil || extra > math.MaxInt64-result.ExtraMinor {
				return MenuModifierPricing{}, ErrConflict
			}
			result.ExtraMinor += extra
			result.Options = append(result.Options, PricedMenuModifier{
				GroupID: group.id, GroupLabel: group.label, OptionID: option.id, OptionLabel: option.label,
				ExtraPrice: pricing.Money(extra),
			})
		}
	}
	sort.Slice(result.Options, func(i, j int) bool {
		a, b := result.Options[i], result.Options[j]
		if a.GroupID != b.GroupID {
			return a.GroupID < b.GroupID
		}
		return a.OptionID < b.OptionID
	})
	return result, nil
}

type menuModifierOption struct {
	id         string
	label      string
	extraPrice string
	saleable   bool
}

type menuModifierGroup struct {
	id         string
	label      string
	minChoices int
	maxChoices int
	options    []menuModifierOption
}

type menuModifierSelection struct {
	groupID   string
	optionIDs []string
}

// The caller must load groups from the current restaurant and the addressed item.
func validateMenuModifierSelection(groups []menuModifierGroup, selections []menuModifierSelection) error {
	byGroup := make(map[string][]string, len(selections))
	for _, selection := range selections {
		if _, exists := byGroup[selection.groupID]; exists {
			return ErrInput
		}
		byGroup[selection.groupID] = selection.optionIDs
	}
	for _, group := range groups {
		if group.minChoices < 0 || group.maxChoices < group.minChoices {
			return ErrConflict
		}
		saleable := make(map[string]struct{}, len(group.options))
		for _, option := range group.options {
			if option.saleable {
				saleable[option.id] = struct{}{}
			}
		}
		if len(saleable) < group.minChoices {
			return ErrConflict
		}
		selected := byGroup[group.id]
		seen := make(map[string]struct{}, len(selected))
		for _, id := range selected {
			if _, exists := seen[id]; exists {
				return ErrInput
			}
			if _, exists := saleable[id]; !exists {
				return ErrConflict
			}
			seen[id] = struct{}{}
		}
		delete(byGroup, group.id)
		if len(selected) < group.minChoices || len(selected) > group.maxChoices {
			return ErrInput
		}
	}
	if len(byGroup) != 0 {
		return ErrConflict
	}
	return nil
}
