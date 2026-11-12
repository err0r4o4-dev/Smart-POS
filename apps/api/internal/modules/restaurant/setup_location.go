package restaurant

import (
	"encoding/json"
	"math"
	"strings"
	"unicode/utf8"
)

func (input *SetupLocationInput) UnmarshalJSON(data []byte) error {
	type locationValue SetupLocationInput
	var decoded struct {
		locationValue
		Latitude  *float64 `json:"latitude"`
		Longitude *float64 `json:"longitude"`
	}
	if err := json.Unmarshal(data, &decoded); err != nil {
		return err
	}
	if decoded.Latitude == nil || decoded.Longitude == nil {
		return ErrInput
	}
	*input = SetupLocationInput(decoded.locationValue)
	input.Latitude, input.Longitude = *decoded.Latitude, *decoded.Longitude
	return input.Validate()
}

type SetupLocationInput struct {
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
	Address   string  `json:"address"`
	Details   string  `json:"details"`
	Confirmed bool    `json:"confirmed"`
}

func (input SetupLocationInput) Validate() error {
	if !input.Confirmed || math.IsNaN(input.Latitude) || math.IsInf(input.Latitude, 0) || math.IsNaN(input.Longitude) || math.IsInf(input.Longitude, 0) || input.Latitude < -90 || input.Latitude > 90 || input.Longitude < -180 || input.Longitude > 180 || strings.TrimSpace(input.Address) == "" || utf8.RuneCountInString(input.Address) > 1000 || utf8.RuneCountInString(input.Details) > 1000 || strings.ContainsRune(input.Address, 0) || strings.ContainsRune(input.Details, 0) {
		return ErrInput
	}
	return nil
}
