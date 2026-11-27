package storefront

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

func TestPublicStorefrontMetadataInput(t *testing.T) {
	for _, tc := range []struct {
		label, metadata string
		valid           bool
	}{
		{"existing client", ``, true},
		{"all new categories", `,"category_codes":["southern-thai","northern-thai","seafood","breakfast","asian"]`, true},
		{"unknown category", `,"category_codes":["unknown"]`, false},
		{"valid hours", `,"opening_hours":{"opens":"10:00","closes":"20:30","closed_weekday":1,"timezone":"Asia/Bangkok"}`, true},
		{"reversed hours", `,"opening_hours":{"opens":"20:30","closes":"10:00","closed_weekday":1,"timezone":"Asia/Bangkok"}`, false},
		{"invalid weekday", `,"opening_hours":{"opens":"10:00","closes":"20:30","closed_weekday":7,"timezone":"Asia/Bangkok"}`, false},
		{"invalid timezone", `,"opening_hours":{"opens":"10:00","closes":"20:30","closed_weekday":1,"timezone":"UTC"}`, false},
		{"missing weekday", `,"opening_hours":{"opens":"10:00","closes":"20:30","timezone":"Asia/Bangkok"}`, false},
		{"invalid clock", `,"opening_hours":{"opens":"10:60","closes":"20:30","closed_weekday":1,"timezone":"Asia/Bangkok"}`, false},
	} {
		t.Run(tc.label, func(t *testing.T) {
			var input SettingsInput
			decoder := json.NewDecoder(strings.NewReader(`{"name":"Test restaurant"` + tc.metadata + `}`))
			decoder.DisallowUnknownFields()
			err := decoder.Decode(&input)
			if err == nil {
				err = input.validate()
			}
			if tc.valid && err != nil {
				t.Fatalf("valid metadata rejected: %v", err)
			}
			if !tc.valid && !errors.Is(err, ErrInput) {
				t.Fatalf("invalid metadata result = %v, want ErrInput", err)
			}
		})
	}
}
