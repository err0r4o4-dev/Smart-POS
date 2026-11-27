package storefront

import "testing"

func TestStorefrontFoodCategories(t *testing.T) {
	for _, tc := range []struct {
		name  string
		codes []string
		valid bool
	}{
		{"omitted", nil, true},
		{"clear", []string{}, true},
		{"multiple", []string{"noodles", "drinks"}, true},
		{"unknown", []string{"RESTAURANT"}, false},
		{"duplicate", []string{"noodles", "noodles"}, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			input := SettingsInput{Name: "Sample shop", CategoryCodes: tc.codes}
			if err := input.validate(); (err == nil) != tc.valid {
				t.Fatalf("validate returned %v; valid=%v", err, tc.valid)
			}
		})
	}
}
