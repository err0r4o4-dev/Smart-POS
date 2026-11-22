package restaurant

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestPickupOnlyServiceModes(t *testing.T) {
	var modes ServiceModes
	if err := json.Unmarshal([]byte(`{"dine_in":false,"takeaway":false,"delivery":false,"pickup":true}`), &modes); err != nil {
		t.Fatal(err)
	}
	if !modes.any() {
		t.Fatal("Pickup alone must be a configured service mode")
	}
}

func TestServiceModesRejectInvalidPickupJSON(t *testing.T) {
	for _, value := range []string{"null", `"true"`, "1", "{}"} {
		t.Run(value, func(t *testing.T) {
			var modes ServiceModes
			if err := json.Unmarshal([]byte(`{"pickup":`+value+`}`), &modes); err == nil {
				t.Fatal("Pickup must be a Boolean when supplied")
			}
		})
	}
	var modes ServiceModes
	decoder := json.NewDecoder(strings.NewReader(`{"pickup":true,"unexpected":true}`))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&modes); err == nil {
		t.Fatal("service modes must reject unknown fields")
	}
}

func TestServiceModesPreserveLegacyCommandJSON(t *testing.T) {
	input := SetupServicesInput{ServiceModes: ServiceModes{DineIn: true}}
	encoded, err := json.Marshal(input)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"branch_id":"","service_modes":{"dine_in":true,"takeaway":false,"delivery":false}}`
	if string(encoded) != want {
		t.Fatalf("legacy fingerprint input changed: %s", encoded)
	}
	for _, value := range []bool{false, true} {
		input.ServiceModes.Pickup = &value
		encoded, err = json.Marshal(input)
		if err != nil {
			t.Fatal(err)
		}
		if string(encoded) == want || !strings.Contains(string(encoded), `"pickup":`) {
			t.Fatalf("explicit Pickup disappeared from fingerprint input: %s", encoded)
		}
	}
}
