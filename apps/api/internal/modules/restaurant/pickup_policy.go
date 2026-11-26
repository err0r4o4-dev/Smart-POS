package restaurant

import "time"

// B15 values approved on 2026-11-26.
const (
	pickupSecondReminderAfter = 10 * time.Minute
	pickupReminderLimit       = 2
	noShowAfterReady          = 30 * time.Minute
	etaDelayNotifyThreshold   = 10 * time.Minute
)

// PickupReminderDue reports whether the next pickup reminder should be sent.
// The first is due when the order becomes Ready, the second 10 minutes later;
// no further reminders are sent. sent counts reminders actually delivered.
func PickupReminderDue(readyAt time.Time, sent int, now time.Time) bool {
	if now.Before(readyAt) {
		return false
	}
	switch sent {
	case 0:
		return true
	case 1:
		return !now.Before(readyAt.Add(pickupSecondReminderAfter))
	default:
		return false
	}
}

// NoShowEligible reports whether an Owner may record a No-Show: the order has
// been Ready for at least 30 minutes and both reminders were sent. It only
// permits the Owner's explicit action. It never refunds, completes or cancels
// the order by itself.
func NoShowEligible(readyAt time.Time, sent int, now time.Time) bool {
	return sent >= pickupReminderLimit && !now.Before(readyAt.Add(noShowAfterReady))
}

// ETADelayNotifiable reports whether the current ETA is more than 10 minutes
// later than the ETA last communicated to the customer.
func ETADelayNotifiable(promised, current time.Time) bool {
	return current.Sub(promised) > etaDelayNotifyThreshold
}
