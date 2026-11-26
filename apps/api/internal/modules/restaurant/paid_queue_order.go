package restaurant

import (
	"math"
	"sort"
	"time"
)

// PaidQueueEntry is one kitchen-eligible order. PaidAt is the provider-verified
// payment time; ConfirmedAt is when this system received that confirmation.
// Started means the kitchen has begun the order.
type PaidQueueEntry struct {
	OrderID     string
	PaidAt      time.Time
	ConfirmedAt time.Time
	Started     bool
}

// OrderPaidQueue applies the B04 policy approved on 2026-11-26. Started orders
// keep their given relative order and stay ahead. Unstarted orders follow,
// sorted by verified paid time, then confirmation-received time, then order ID.
// A late callback for an earlier payment therefore moves ahead of unstarted
// work only, never ahead of started work. The input slice is not modified.
//
// The caller supplies only orders that already satisfy the kitchen predicate
// (PAID attempt with an unreleased hold, no excluded refund state, no
// FULFILLMENT_REVIEW); this function does not decide eligibility.
func OrderPaidQueue(entries []PaidQueueEntry) []PaidQueueEntry {
	started := make([]PaidQueueEntry, 0, len(entries))
	waiting := make([]PaidQueueEntry, 0, len(entries))
	for _, entry := range entries {
		if entry.Started {
			started = append(started, entry)
		} else {
			waiting = append(waiting, entry)
		}
	}
	sort.SliceStable(waiting, func(left, right int) bool {
		a, b := waiting[left], waiting[right]
		if !a.PaidAt.Equal(b.PaidAt) {
			return a.PaidAt.Before(b.PaidAt)
		}
		if !a.ConfirmedAt.Equal(b.ConfirmedAt) {
			return a.ConfirmedAt.Before(b.ConfirmedAt)
		}
		return a.OrderID < b.OrderID
	})
	return append(started, waiting...)
}

// QueueWaitEstimate returns orders ahead times the restaurant's average
// preparation time (B04). It reports false when there is no usable average
// or the input is invalid, so callers show "unknown" rather than a guess.
// How the average is measured remains an open B04 input.
func QueueWaitEstimate(ahead int, average time.Duration) (time.Duration, bool) {
	if ahead < 0 || average <= 0 {
		return 0, false
	}
	if ahead > 0 && int64(average) > math.MaxInt64/int64(ahead) {
		return 0, false
	}
	return time.Duration(ahead) * average, true
}
