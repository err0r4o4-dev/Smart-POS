package restaurant

import (
	"math"
	"slices"
	"strings"
	"unicode/utf8"

	"smartpos/api/internal/modules/pricing"
)

// applyMenuModifierEdits takes the current groups of one authorized item.
// Empty IDs represent creations; the transaction assigns their durable IDs.
func applyMenuModifierEdits(current, changes []MenuModifierGroup) ([]MenuModifierGroup, error) {
	if len(changes) == 0 {
		return nil, ErrInput
	}
	groupIndex := make(map[string]int, len(current))
	for i, group := range current {
		groupIndex[group.ID] = i
	}
	optionIndexes := make([]map[string]int, len(changes))
	seenGroups := make(map[string]bool, len(changes))
	for i, change := range changes {
		options := map[string]int{}
		if change.ID != "" {
			index, exists := groupIndex[change.ID]
			if !exists {
				return nil, ErrNotFound
			}
			if seenGroups[change.ID] {
				return nil, ErrInput
			}
			seenGroups[change.ID] = true
			for j, option := range current[index].Options {
				options[option.ID] = j
			}
		}
		seenOptions := map[string]bool{}
		for _, option := range change.Options {
			if option.ID == "" {
				continue
			}
			if _, exists := options[option.ID]; !exists {
				return nil, ErrNotFound
			}
			if seenOptions[option.ID] {
				return nil, ErrInput
			}
			seenOptions[option.ID] = true
		}
		optionIndexes[i] = options
	}

	result := slices.Clone(current)
	for i := range result {
		result[i].Options = slices.Clone(current[i].Options)
	}
	for i, change := range changes {
		change.Label = strings.TrimSpace(change.Label)
		if !validModifierLabel(change.Label) || change.MinChoices < 0 || change.MaxChoices < change.MinChoices || change.MaxChoices > math.MaxInt32 {
			return nil, ErrInput
		}
		var options []MenuModifierOption
		if change.ID != "" {
			options = result[groupIndex[change.ID]].Options
		}
		for _, option := range change.Options {
			option.Label = strings.TrimSpace(option.Label)
			amount, err := pricing.Decimal(option.ExtraPrice, 2)
			if !validModifierLabel(option.Label) || err != nil {
				return nil, ErrInput
			}
			option.ExtraPrice = pricing.Money(amount)
			if option.ID == "" {
				options = append(options, option)
			} else {
				options[optionIndexes[i][option.ID]] = option
			}
		}
		if change.MinChoices > len(options) {
			return nil, ErrInput
		}
		change.Options = options
		if change.ID == "" {
			result = append(result, change)
		} else {
			result[groupIndex[change.ID]] = change
		}
	}
	return result, nil
}

func validModifierLabel(label string) bool {
	return label != "" && utf8.ValidString(label) && utf8.RuneCountInString(label) <= 200 && !strings.ContainsRune(label, '\x00')
}
