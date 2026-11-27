package storefront

import "time"

// B03 timing values approved on 2026-11-26 for the native PromptPay flow.
// They are pure rules for the future provider adapter (T3.3, blocked on B02)
// and do not change the retained Stripe test checkout or its windows.
const (
	paymentQRLifetime       = 15 * time.Minute
	reconcileFastInterval   = time.Minute
	reconcileFastWindow     = 30 * time.Minute
	reconcileSlowInterval   = 15 * time.Minute
	latePaymentReviewWindow = 24 * time.Hour
)

// PaymentQRExpiresAt returns when a payment QR stops admitting payment.
// Expiry never releases a hold by itself: the provider must be queried first,
// and an unknown result stays CHECKING with the hold kept.
func PaymentQRExpiresAt(created time.Time) time.Time {
	return created.Add(paymentQRLifetime)
}

// NextReconciliationQuery schedules the next provider status query: every
// minute for the first 30 minutes after the attempt was created, then every
// 15 minutes. A minutely step never crosses the 30-minute boundary.
func NextReconciliationQuery(created, last time.Time) time.Time {
	if last.Before(created) {
		last = created
	}
	boundary := created.Add(reconcileFastWindow)
	if last.Before(boundary) {
		next := last.Add(reconcileFastInterval)
		if next.After(boundary) {
			return boundary
		}
		return next
	}
	return last.Add(reconcileSlowInterval)
}

// PaymentConfirmedLate reports whether a verified payment arrived more than
// 24 hours after the QR expired. Such payments go to the manual refund review
// queue; they never reopen kitchen work or restore a released hold.
func PaymentConfirmedLate(expires, confirmed time.Time) bool {
	return confirmed.Sub(expires) > latePaymentReviewWindow
}
