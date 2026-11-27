package storefront

import (
	"testing"
	"time"
)

func TestPaymentQRExpiresAt(t *testing.T) {
	created := time.Date(2026, 11, 26, 6, 0, 0, 0, time.UTC)
	if got, want := PaymentQRExpiresAt(created), created.Add(15*time.Minute); !got.Equal(want) {
		t.Fatalf("PaymentQRExpiresAt = %v; want %v", got, want)
	}
}

func TestNextReconciliationQuery(t *testing.T) {
	created := time.Date(2026, 11, 26, 6, 0, 0, 0, time.UTC)
	for _, tc := range []struct {
		name string
		last time.Time
		want time.Time
	}{
		{"first-minute-after-creation", created, created.Add(time.Minute)},
		{"still-minutely-inside-30-minutes", created.Add(28 * time.Minute), created.Add(29 * time.Minute)},
		{"last-minutely-query-lands-at-30-minutes", created.Add(29 * time.Minute), created.Add(30 * time.Minute)},
		{"switches-to-15-minutes-at-30-minutes", created.Add(30 * time.Minute), created.Add(45 * time.Minute)},
		{"minutely-step-never-crosses-the-boundary", created.Add(29*time.Minute + 30*time.Second), created.Add(30 * time.Minute)},
		{"after-boundary-every-15-minutes", created.Add(2 * time.Hour), created.Add(2*time.Hour + 15*time.Minute)},
		{"clock-before-creation-starts-minutely", created.Add(-time.Minute), created.Add(time.Minute)},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := NextReconciliationQuery(created, tc.last); !got.Equal(tc.want) {
				t.Fatalf("NextReconciliationQuery(+%v) = +%v; want +%v", tc.last.Sub(created), got.Sub(created), tc.want.Sub(created))
			}
		})
	}
}

func TestPaymentConfirmedLate(t *testing.T) {
	expires := time.Date(2026, 11, 26, 6, 15, 0, 0, time.UTC)
	for _, tc := range []struct {
		name      string
		confirmed time.Time
		want      bool
	}{
		{"within-window", expires.Add(-time.Minute), false},
		{"after-expiry-but-under-24-hours", expires.Add(23 * time.Hour), false},
		{"exactly-24-hours-is-not-late", expires.Add(24 * time.Hour), false},
		{"more-than-24-hours-is-late", expires.Add(24*time.Hour + time.Second), true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			if got := PaymentConfirmedLate(expires, tc.confirmed); got != tc.want {
				t.Fatalf("PaymentConfirmedLate(+%v) = %v; want %v", tc.confirmed.Sub(expires), got, tc.want)
			}
		})
	}
}
