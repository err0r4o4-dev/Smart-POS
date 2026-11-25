package restaurant

import (
	"errors"
	"testing"
	"time"
)

func TestOrderingScheduleUsesRestaurantLocalTime(t *testing.T) {
	schedule, err := newOrderingSchedule("Asia/Bangkok", []orderingWindow{
		{7, "22:00", "24:00"},
		{1, "00:00", "02:00"},
		{1, "11:00", "14:00"},
		{1, "14:00", "20:00"},
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		instant string
		open    bool
	}{
		{"2026-11-22T14:59:59Z", false},
		{"2026-11-22T15:00:00Z", true},
		{"2026-11-22T17:00:00Z", true},
		{"2026-11-22T19:00:00Z", false},
		{"2026-11-23T03:59:59Z", false},
		{"2026-11-23T04:00:00Z", true},
		{"2026-11-23T07:00:00Z", true},
		{"2026-11-23T13:00:00Z", false},
		{"2026-11-24T04:00:00Z", false},
	} {
		t.Run(tc.instant, func(t *testing.T) {
			at, err := time.Parse(time.RFC3339, tc.instant)
			if err != nil {
				t.Fatal(err)
			}
			at = at.In(time.FixedZone("caller", -5*60*60))
			if got := schedule.openAt(at); got != tc.open {
				t.Errorf("openAt = %t, want %t", got, tc.open)
			}
		})
	}
}

func TestOrderingScheduleRejectsInvalidConfiguration(t *testing.T) {
	for _, tc := range []struct {
		name, timezone string
		windows        []orderingWindow
	}{
		{"empty zone", "", nil},
		{"host-local zone", "Local", nil},
		{"unknown zone", "Fake/Zone", nil},
		{"day zero", "UTC", []orderingWindow{{0, "11:00", "14:00"}}},
		{"day eight", "UTC", []orderingWindow{{8, "11:00", "14:00"}}},
		{"noncanonical time", "UTC", []orderingWindow{{1, "9:00", "14:00"}}},
		{"invalid minute", "UTC", []orderingWindow{{1, "09:60", "14:00"}}},
		{"midnight as start", "UTC", []orderingWindow{{1, "24:00", "24:00"}}},
		{"same boundary", "UTC", []orderingWindow{{1, "11:00", "11:00"}}},
		{"unsplit overnight", "UTC", []orderingWindow{{1, "22:00", "02:00"}}},
		{"unsorted overlap", "UTC", []orderingWindow{{1, "12:00", "13:00"}, {1, "11:00", "14:00"}}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if _, err := newOrderingSchedule(tc.timezone, tc.windows); !errors.Is(err, ErrInput) {
				t.Fatalf("error = %v, want ErrInput", err)
			}
		})
	}
}

func TestOrderingScheduleUsesLocalClockAcrossOffsetChanges(t *testing.T) {
	schedule, err := newOrderingSchedule("America/New_York", []orderingWindow{
		{7, "01:30", "02:30"},
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		instant string
		open    bool
	}{
		{"2026-03-08T06:29:59Z", false},
		{"2026-03-08T06:30:00Z", true},
		{"2026-03-08T06:59:59Z", true},
		{"2026-03-08T07:00:00Z", false},
		{"2026-11-01T05:30:00Z", true},
		{"2026-11-01T06:00:00Z", false},
		{"2026-11-01T06:30:00Z", true},
		{"2026-11-01T07:30:00Z", false},
	} {
		t.Run(tc.instant, func(t *testing.T) {
			at, err := time.Parse(time.RFC3339, tc.instant)
			if err != nil {
				t.Fatal(err)
			}
			if got := schedule.openAt(at); got != tc.open {
				t.Errorf("openAt = %t, want %t", got, tc.open)
			}
		})
	}
}

func TestOrderAvailabilityRequiresEachAdmissionGate(t *testing.T) {
	schedule, err := newOrderingSchedule("UTC", []orderingWindow{{1, "00:00", "24:00"}})
	if err != nil {
		t.Fatal(err)
	}
	monday := time.Date(2026, 11, 23, 12, 0, 0, 0, time.UTC)
	allModes := orderingModes{dineIn: true, takeaway: true, pickup: true, delivery: true}
	for _, mode := range []orderingMode{modeDineIn, modeTakeaway, modePickup, modeDelivery} {
		t.Run(string(mode), func(t *testing.T) {
			if got := schedule.admission(monday, mode, true, allModes, false, orderingModes{}); got != "" {
				t.Errorf("open mode denied: %s", got)
			}
			if got := schedule.admission(monday, mode, false, allModes, false, orderingModes{}); got != admissionUnavailable {
				t.Errorf("unapproved mode denial = %s", got)
			}
			if got := schedule.admission(monday, mode, true, allModes, true, orderingModes{}); got != admissionPaused {
				t.Errorf("global pause denial = %s", got)
			}
			if got := schedule.admission(monday.AddDate(0, 0, 1), mode, true, allModes, false, orderingModes{}); got != admissionOutsideHours {
				t.Errorf("outside hours denial = %s", got)
			}
		})
	}
	pickupPause := orderingModes{pickup: true}
	if got := schedule.admission(monday, modePickup, true, allModes, false, pickupPause); got != admissionPaused {
		t.Errorf("Pickup pause denial = %s", got)
	}
	if got := schedule.admission(monday, modeTakeaway, true, allModes, false, pickupPause); got != "" {
		t.Errorf("Pickup pause affected Takeaway: %s", got)
	}
	if got := schedule.admission(monday, modePickup, true, orderingModes{takeaway: true}, false, orderingModes{}); got != admissionUnavailable {
		t.Errorf("disabled Pickup denial = %s", got)
	}
	if got := schedule.admission(monday, "LEGACY", true, allModes, false, orderingModes{}); got != admissionUnavailable {
		t.Errorf("unknown mode denial = %s", got)
	}
	empty, err := newOrderingSchedule("UTC", nil)
	if err != nil || empty.openAt(monday) {
		t.Fatalf("empty schedule must be valid and closed, err = %v", err)
	}
}

func TestAvailabilitySettingsEvaluateSavedPauseFlags(t *testing.T) {
	at := time.Date(2026, 11, 23, 2, 0, 0, 0, time.UTC)
	enabled := orderingModes{dineIn: true, takeaway: true, pickup: true, delivery: true}
	for _, tc := range []struct {
		mode  orderingMode
		pause func(*AvailabilitySettings)
	}{
		{modeDineIn, func(s *AvailabilitySettings) { s.DineInPaused = true }},
		{modeTakeaway, func(s *AvailabilitySettings) { s.TakeawayPaused = true }},
		{modePickup, func(s *AvailabilitySettings) { s.PickupPaused = true }},
		{modeDelivery, func(s *AvailabilitySettings) { s.DeliveryPaused = true }},
	} {
		t.Run(string(tc.mode), func(t *testing.T) {
			settings := AvailabilitySettings{
				Timezone:      "Asia/Bangkok",
				WeeklyWindows: []AvailabilityWindow{{Weekday: 1, Start: "09:00", End: "10:00"}},
			}
			tc.pause(&settings)
			for _, mode := range []orderingMode{modeDineIn, modeTakeaway, modePickup, modeDelivery} {
				want := admissionDenial("")
				if mode == tc.mode {
					want = admissionPaused
				}
				got, err := settings.evaluateAdmission(at, mode, true, enabled)
				if err != nil || got != want {
					t.Fatalf("mode %s: got %q, %v; want %q", mode, got, err, want)
				}
				got, err = settings.evaluateAdmission(at, mode, false, enabled)
				if err != nil || got != admissionUnavailable {
					t.Fatalf("mode %s before approval: got %q, %v", mode, got, err)
				}
				paused := settings
				paused.GlobalPause = true
				got, err = paused.evaluateAdmission(at, mode, true, enabled)
				if err != nil || got != admissionPaused {
					t.Fatalf("mode %s with global pause: got %q, %v", mode, got, err)
				}
			}
		})
	}
}
