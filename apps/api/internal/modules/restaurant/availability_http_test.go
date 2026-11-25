package restaurant

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestAvailabilityReplacementRequiresAllFields(t *testing.T) {
	valid := `{"timezone":"Asia/Bangkok","weekly_windows":[],"global_pause":false,"dine_in_paused":false,"takeaway_paused":false,"pickup_paused":true,"delivery_paused":false,"revision":0}`
	parse := func(body string) (AvailabilitySettings, error) {
		request := httptest.NewRequest(http.MethodPut, "/restaurant/availability", strings.NewReader(body))
		request.Header.Set("Content-Type", "application/json")
		return decodeAvailabilitySettings(request)
	}
	value, err := parse(valid)
	if err != nil || !value.PickupPaused || value.GlobalPause || value.WeeklyWindows == nil || value.Revision != 0 {
		t.Fatalf("valid replacement: %+v, %v", value, err)
	}
	for _, body := range []string{
		strings.Replace(valid, `,"revision":0`, "", 1),
		strings.Replace(valid, `"global_pause":false`, `"global_pause":null`, 1),
		strings.Replace(valid, `"weekly_windows":[]`, `"weekly_windows":null`, 1),
		strings.Replace(valid, `"revision":0`, `"revision":0,"branch_id":"legacy"`, 1),
		valid + "{}",
	} {
		if _, err := parse(body); !errors.Is(err, ErrInput) {
			t.Errorf("accepted invalid replacement %s: %v", body, err)
		}
	}
}
