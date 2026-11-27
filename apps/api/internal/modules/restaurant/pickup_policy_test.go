package restaurant

import (
	"testing"
	"time"
)

func TestPickupReminderDue(t *testing.T) {
	ready := time.Date(2026, 11, 26, 5, 0, 0, 0, time.UTC)
	for _, tc := range []struct {
		name string
		sent int
		now  time.Time
		want bool
	}{
		{"first-reminder-at-ready", 0, ready, true},
		{"second-reminder-not-before-10-minutes", 1, ready.Add(10*time.Minute - time.Second), false},
		{"second-reminder-at-10-minutes", 1, ready.Add(10 * time.Minute), true},
		{"no-third-reminder", 2, ready.Add(time.Hour), false},
		{"negative-count-is-not-due", -1, ready.Add(time.Hour), false},
		{"clock-before-ready-is-not-due", 0, ready.Add(-time.Second), false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := PickupReminderDue(ready, tc.sent, tc.now); got != tc.want {
				t.Fatalf("PickupReminderDue(sent=%d, now=%v) = %v; want %v", tc.sent, tc.now.Sub(ready), got, tc.want)
			}
		})
	}
}

func TestNoShowEligible(t *testing.T) {
	ready := time.Date(2026, 11, 26, 5, 0, 0, 0, time.UTC)
	for _, tc := range []struct {
		name string
		sent int
		now  time.Time
		want bool
	}{
		{"eligible-at-30-minutes-after-two-reminders", 2, ready.Add(30 * time.Minute), true},
		{"not-before-30-minutes", 2, ready.Add(30*time.Minute - time.Second), false},
		{"not-with-one-reminder", 1, ready.Add(2 * time.Hour), false},
		{"not-with-no-reminder", 0, ready.Add(2 * time.Hour), false},
		{"clock-before-ready", 2, ready.Add(-time.Minute), false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := NoShowEligible(ready, tc.sent, tc.now); got != tc.want {
				t.Fatalf("NoShowEligible(sent=%d, now=%v) = %v; want %v", tc.sent, tc.now.Sub(ready), got, tc.want)
			}
		})
	}
}

func TestETADelayNotifiable(t *testing.T) {
	promised := time.Date(2026, 11, 26, 5, 0, 0, 0, time.UTC)
	for _, tc := range []struct {
		name    string
		current time.Time
		want    bool
	}{
		{"exactly-10-minutes-is-not-notified", promised.Add(10 * time.Minute), false},
		{"over-10-minutes-is-notified", promised.Add(10*time.Minute + time.Second), true},
		{"earlier-eta-is-not-a-delay", promised.Add(-30 * time.Minute), false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := ETADelayNotifiable(promised, tc.current); got != tc.want {
				t.Fatalf("ETADelayNotifiable(+%v) = %v; want %v", tc.current.Sub(promised), got, tc.want)
			}
		})
	}
}
