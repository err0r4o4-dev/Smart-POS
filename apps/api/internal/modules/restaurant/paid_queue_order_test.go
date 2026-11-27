package restaurant

import (
	"reflect"
	"testing"
	"time"
)

func TestOrderPaidQueue(t *testing.T) {
	base := time.Date(2026, 11, 26, 4, 0, 0, 0, time.UTC)
	at := func(minutes int) time.Time { return base.Add(time.Duration(minutes) * time.Minute) }
	ids := func(items []PaidQueueEntry) []string {
		result := make([]string, len(items))
		for index, item := range items {
			result[index] = item.OrderID
		}
		return result
	}
	for _, tc := range []struct {
		name  string
		input []PaidQueueEntry
		want  []string
	}{
		{"orders-by-verified-paid-time", []PaidQueueEntry{
			{OrderID: "b", PaidAt: at(2), ConfirmedAt: at(2)},
			{OrderID: "a", PaidAt: at(1), ConfirmedAt: at(1)},
		}, []string{"a", "b"}},
		{"equal-paid-time-uses-confirmation-time", []PaidQueueEntry{
			{OrderID: "a", PaidAt: at(1), ConfirmedAt: at(3)},
			{OrderID: "b", PaidAt: at(1), ConfirmedAt: at(2)},
		}, []string{"b", "a"}},
		{"equal-paid-and-confirmation-uses-order-id", []PaidQueueEntry{
			{OrderID: "c", PaidAt: at(1), ConfirmedAt: at(1)},
			{OrderID: "a", PaidAt: at(1), ConfirmedAt: at(1)},
		}, []string{"a", "c"}},
		{"late-earlier-payment-goes-ahead-of-unstarted-only", []PaidQueueEntry{
			{OrderID: "started", PaidAt: at(5), ConfirmedAt: at(5), Started: true},
			{OrderID: "waiting", PaidAt: at(6), ConfirmedAt: at(6)},
			{OrderID: "late", PaidAt: at(1), ConfirmedAt: at(9)},
		}, []string{"started", "late", "waiting"}},
		{"started-work-keeps-its-existing-order", []PaidQueueEntry{
			{OrderID: "second-started", PaidAt: at(2), ConfirmedAt: at(2), Started: true},
			{OrderID: "first-started", PaidAt: at(1), ConfirmedAt: at(1), Started: true},
			{OrderID: "waiting", PaidAt: at(0), ConfirmedAt: at(9)},
		}, []string{"second-started", "first-started", "waiting"}},
		{"empty", nil, []string{}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			input := append([]PaidQueueEntry(nil), tc.input...)
			got := ids(OrderPaidQueue(input))
			if !reflect.DeepEqual(got, tc.want) {
				t.Fatalf("order = %v; want %v", got, tc.want)
			}
			if !reflect.DeepEqual(input, tc.input) {
				t.Fatalf("input slice was modified: %v", input)
			}
		})
	}
}

func TestQueueWaitEstimate(t *testing.T) {
	for _, tc := range []struct {
		name    string
		ahead   int
		average time.Duration
		want    time.Duration
		ok      bool
	}{
		{"orders-ahead-times-average", 3, 4 * time.Minute, 12 * time.Minute, true},
		{"first-in-queue", 0, 4 * time.Minute, 0, true},
		{"no-history-is-unknown", 3, 0, 0, false},
		{"negative-average-is-unknown", 3, -time.Minute, 0, false},
		{"negative-ahead-is-unknown", -1, time.Minute, 0, false},
		{"overflow-is-unknown", 1 << 40, time.Hour, 0, false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := QueueWaitEstimate(tc.ahead, tc.average)
			if got != tc.want || ok != tc.ok {
				t.Fatalf("QueueWaitEstimate(%d, %v) = %v, %v; want %v, %v", tc.ahead, tc.average, got, ok, tc.want, tc.ok)
			}
		})
	}
}
