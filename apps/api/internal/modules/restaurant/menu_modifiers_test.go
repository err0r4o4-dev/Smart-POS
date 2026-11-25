package restaurant

import (
	"errors"
	"reflect"
	"testing"
)

func TestPriceMenuModifierSelection(t *testing.T) {
	groups := []menuModifierGroup{{id: "protein", label: "Protein", minChoices: 1, maxChoices: 2,
		options: []menuModifierOption{
			{id: "egg", label: "Egg", extraPrice: "0.10", saleable: true},
			{id: "tofu", label: "Tofu", extraPrice: "12.35", saleable: true},
			{id: "beef", label: "Beef", extraPrice: "2.00"},
		}}}
	got, err := priceMenuModifierSelection(groups, []MenuModifierChoice{{GroupID: "protein", OptionIDs: []string{"tofu", "egg"}}})
	want := MenuModifierPricing{ExtraMinor: 1245, Options: []PricedMenuModifier{
		{GroupID: "protein", GroupLabel: "Protein", OptionID: "egg", OptionLabel: "Egg", ExtraPrice: "0.10"},
		{GroupID: "protein", GroupLabel: "Protein", OptionID: "tofu", OptionLabel: "Tofu", ExtraPrice: "12.35"},
	}}
	if err != nil || !reflect.DeepEqual(got, want) {
		t.Fatalf("priced selection = %+v, %v; want %+v", got, err, want)
	}
	got, err = priceMenuModifierSelection(groups, []MenuModifierChoice{{GroupID: "protein", OptionIDs: []string{"beef"}}})
	if !errors.Is(err, ErrConflict) || !reflect.DeepEqual(got, MenuModifierPricing{}) {
		t.Fatalf("disabled option = %+v, %v", got, err)
	}
}

func TestMenuModifierSelection(t *testing.T) {
	groups := []menuModifierGroup{
		{id: "protein", minChoices: 1, maxChoices: 1, options: []menuModifierOption{
			{id: "chicken", saleable: true}, {id: "tofu", saleable: true}, {id: "beef"},
		}},
		{id: "toppings", maxChoices: 2, options: []menuModifierOption{
			{id: "egg", saleable: true}, {id: "basil", saleable: true}, {id: "chilli", saleable: true},
		}},
	}
	protein := menuModifierSelection{groupID: "protein", optionIDs: []string{"chicken"}}
	for _, tc := range []struct {
		name       string
		selections []menuModifierSelection
		want       error
	}{
		{"optional group omitted", []menuModifierSelection{protein}, nil},
		{"distinct options at the limit", []menuModifierSelection{protein, {groupID: "toppings", optionIDs: []string{"egg", "basil"}}}, nil},
		{"required group omitted", nil, ErrInput},
		{"required group empty", []menuModifierSelection{{groupID: "protein"}}, ErrInput},
		{"too many options", []menuModifierSelection{protein, {groupID: "toppings", optionIDs: []string{"egg", "basil", "chilli"}}}, ErrInput},
		{"duplicate option", []menuModifierSelection{protein, {groupID: "toppings", optionIDs: []string{"egg", "egg"}}}, ErrInput},
		{"duplicate group", []menuModifierSelection{protein, protein}, ErrInput},
		{"wrong group", []menuModifierSelection{{groupID: "protein", optionIDs: []string{"egg"}}}, ErrConflict},
		{"option unavailable", []menuModifierSelection{{groupID: "protein", optionIDs: []string{"beef"}}}, ErrConflict},
		{"unknown group", []menuModifierSelection{protein, {groupID: "another-item"}}, ErrConflict},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := validateMenuModifierSelection(groups, tc.selections); !errors.Is(got, tc.want) {
				t.Errorf("validate selection = %v, want %v", got, tc.want)
			}
		})
	}
}

func TestMenuModifierSelectionRejectsItemWithNoAvailableRequiredChoice(t *testing.T) {
	groups := []menuModifierGroup{
		{id: "protein", minChoices: 1, maxChoices: 1, options: []menuModifierOption{{id: "beef"}}},
	}
	if err := validateMenuModifierSelection(groups, nil); !errors.Is(err, ErrConflict) {
		t.Fatalf("unavailable required group = %v, want %v", err, ErrConflict)
	}
}
