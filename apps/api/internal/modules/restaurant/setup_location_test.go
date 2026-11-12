package restaurant

import (
	"encoding/json"
	"math"
	"testing"
)

func TestSetupLocationRejectsMissingCoordinates(t *testing.T) {
	for _, body := range []string{
		`{"address":"Store","details":"","confirmed":true}`,
		`{"latitude":13,"longitude":null,"address":"Store","confirmed":true}`,
	} {
		var location SetupLocationInput
		if json.Unmarshal([]byte(body), &location) == nil {
			t.Fatal("missing coordinates accepted")
		}
	}
}

func TestSetupLocationJSONRoundTrip(t *testing.T) {
	var location SetupLocationInput
	if err := json.Unmarshal([]byte(`{"latitude":0,"longitude":0,"address":"Store entrance","details":"Floor 2","confirmed":true}`), &location); err != nil {
		t.Fatal(err)
	}
	if location.Address != "Store entrance" || location.Details != "Floor 2" || !location.Confirmed {
		t.Fatalf("location fields did not round trip: %#v", location)
	}
	body, err := json.Marshal(location)
	if err != nil {
		t.Fatal(err)
	}
	var decoded SetupLocationInput
	if err := json.Unmarshal(body, &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded != location {
		t.Fatal("location changed after serialization")
	}
}

func TestSetupProfileLocationMatchesAddress(t *testing.T) {
	input := SetupProfileInput{BranchID: "11111111-1111-4111-8111-111111111111", Name: "Store", BusinessType: "RESTAURANT", Address: "New address", Location: &SetupLocationInput{Latitude: 13, Longitude: 100, Address: "Old address", Confirmed: true}}
	if input.Validate() == nil {
		t.Fatal("accepted a confirmed location for another address")
	}
	input.Location.Address = input.Address
	if err := input.Validate(); err != nil {
		t.Fatalf("matching location rejected: %v", err)
	}
}

func TestSetupLocationValidation(t *testing.T) {
	for _, testcase := range []struct {
		name                string
		latitude, longitude float64
		address             string
		confirmed, valid    bool
	}{
		{"valid", 13.75, 100.5, "Store entrance", true, true},
		{"zero", 0, 0, "Store entrance", true, true},
		{"north", 91, 100, "Store entrance", true, false},
		{"east", 13, 181, "Store entrance", true, false},
		{"nonfinite", math.NaN(), 100, "Store entrance", true, false},
		{"unconfirmed", 13, 100, "Store entrance", false, false},
		{"missing address", 13, 100, "  ", true, false},
	} {
		t.Run(testcase.name, func(t *testing.T) {
			location := SetupLocationInput{Latitude: testcase.latitude, Longitude: testcase.longitude, Address: testcase.address, Confirmed: testcase.confirmed}
			if (location.Validate() == nil) != testcase.valid {
				t.Fatalf("unexpected validity for %s", testcase.name)
			}
		})
	}
}
