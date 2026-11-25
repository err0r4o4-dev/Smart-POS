package restaurant

import (
	"errors"
	"testing"
)

func TestMenuModifierEditsPreserveOmittedChoicesAndExactPrices(t *testing.T) {
	current := modifierEditFixture()
	patch := []MenuModifierGroup{{ID: "protein", Label: " Protein ", MinChoices: 1, MaxChoices: 1,
		Options: []MenuModifierOption{{ID: "tofu", Label: "Tofu", ExtraPrice: "12.3"}}}}
	updated, err := applyMenuModifierEdits(current, patch)
	if err != nil {
		t.Fatal(err)
	}
	if len(updated) != 2 || updated[0].Label != "Protein" || len(updated[0].Options) != 2 || updated[1].Label != "Extras" {
		t.Fatalf("patch lost omitted data: %+v", updated)
	}
	if updated[0].Options[0].ExtraPrice != "12.30" || updated[0].Options[0].Saleable || updated[0].Options[1] != current[0].Options[1] {
		t.Fatalf("unexpected choices: %+v", updated[0].Options)
	}
	if current[0].Options[0].ExtraPrice != "10.00" || !current[0].Options[0].Saleable || patch[0].Options[0].ExtraPrice != "12.3" {
		t.Fatal("patch mutated its inputs")
	}
}

func TestMenuModifierEditsRejectInvalidPatchWithoutPartialResult(t *testing.T) {
	for _, tc := range []struct {
		name  string
		patch []MenuModifierGroup
		want  error
	}{
		{"unknown group before field errors", []MenuModifierGroup{{ID: "other-item"}}, ErrNotFound},
		{"wrong group before price errors", []MenuModifierGroup{{ID: "protein", Options: []MenuModifierOption{{ID: "egg", ExtraPrice: "12.345"}}}}, ErrNotFound},
		{"duplicate group", []MenuModifierGroup{{ID: "protein"}, {ID: "protein"}}, ErrInput},
		{"duplicate option", []MenuModifierGroup{{ID: "protein", Options: []MenuModifierOption{{ID: "tofu"}, {ID: "tofu"}}}}, ErrInput},
		{"excess precision", []MenuModifierGroup{{ID: "protein", Label: "Protein", MaxChoices: 1, Options: []MenuModifierOption{{ID: "tofu", Label: "Tofu", ExtraPrice: "12.345"}}}}, ErrInput},
		{"minimum exceeds configured choices", []MenuModifierGroup{{ID: "protein", Label: "Protein", MinChoices: 3, MaxChoices: 3}}, ErrInput},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if result, err := applyMenuModifierEdits(modifierEditFixture(), tc.patch); result != nil || !errors.Is(err, tc.want) {
				t.Fatalf("result=%v error=%v, want %v", result, err, tc.want)
			}
		})
	}
}

func TestMenuModifierEditsRetainSeparateNewChoices(t *testing.T) {
	patch := []MenuModifierGroup{{Label: "Sauce", MaxChoices: 1, Options: []MenuModifierOption{
		{Label: "Mild", ExtraPrice: "0", Saleable: true},
		{Label: "Hot", ExtraPrice: "2.5", Saleable: true},
	}}}
	result, err := applyMenuModifierEdits(modifierEditFixture(), patch)
	if err != nil || len(result) != 3 || len(result[2].Options) != 2 {
		t.Fatalf("distinct creations were not preserved: %+v, %v", result, err)
	}
	group := result[2]
	if group.ID != "" || group.Options[0].ID != "" || group.Options[1].ID != "" || group.Options[0].ExtraPrice != "0.00" || group.Options[1].ExtraPrice != "2.50" {
		t.Fatalf("unexpected new group: %+v", group)
	}
}

func modifierEditFixture() []MenuModifierGroup {
	return []MenuModifierGroup{
		{ID: "protein", Label: "Protein", MinChoices: 1, MaxChoices: 1, Options: []MenuModifierOption{
			{ID: "tofu", Label: "Tofu", ExtraPrice: "10.00", Saleable: true},
			{ID: "chicken", Label: "Chicken", ExtraPrice: "0.00", Saleable: true},
		}},
		{ID: "extras", Label: "Extras", MaxChoices: 1, Options: []MenuModifierOption{{ID: "egg", Label: "Egg", ExtraPrice: "5.00", Saleable: true}}},
	}
}
