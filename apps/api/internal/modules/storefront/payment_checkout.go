package storefront

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/platform/stripe"
)

type CustomerCheckout struct {
	Attempt PaymentAttempt
	URL     string
}

func (service *Service) CreateCustomerCheckout(ctx context.Context, slug string, input TrackingInput) (CustomerCheckout, error) {
	if service.CustomerPayments == nil || !service.CustomerPayments.Enabled() {
		return CustomerCheckout{}, stripe.ErrUnavailable
	}
	if _, err := service.BeginCustomerPayment(ctx, slug, input); err != nil {
		return CustomerCheckout{}, err
	}
	attempt, err := service.prepareCustomerDispatch(ctx, slug, input)
	if err != nil {
		return CustomerCheckout{}, err
	}
	if attempt.SessionID != nil {
		return service.RecoverCustomerCheckout(ctx, slug, input)
	}
	network, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	session, err := service.CustomerPayments.CreateCustomerCheckout(network, attempt.Charge())
	if err != nil {
		return CustomerCheckout{}, paymentError(err)
	}
	return service.recordCustomerObservation(ctx, slug, input, session, "CREATE_RESPONSE")
}

func (service *Service) RecoverCustomerCheckout(ctx context.Context, slug string, input TrackingInput) (CustomerCheckout, error) {
	if service.CustomerPayments == nil {
		return CustomerCheckout{}, stripe.ErrUnavailable
	}
	attempt, err := service.CustomerPayment(ctx, slug, input)
	if err != nil {
		return CustomerCheckout{}, err
	}
	if attempt.SessionID == nil {
		return CustomerCheckout{}, ErrConflict
	}
	if err = service.checkCustomerDispatchIdentity(ctx, slug, input, attempt.Charge()); err != nil {
		return CustomerCheckout{}, err
	}
	network, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	session, err := service.CustomerPayments.RetrieveCustomerCheckout(network, attempt.Charge(), *attempt.SessionID)
	if err != nil {
		return CustomerCheckout{}, paymentError(err)
	}
	return service.recordCustomerObservation(ctx, slug, input, session, "RETRIEVE")
}

func (service *Service) prepareCustomerDispatch(ctx context.Context, slug string, input TrackingInput) (PaymentAttempt, error) {
	tx, org, err := service.trackingPaymentTx(ctx, slug, input)
	if err != nil {
		return PaymentAttempt{}, err
	}
	defer tx.Rollback(ctx)
	attempt, err := readPayment(ctx, tx, org, input.OrderID)
	if err != nil {
		return PaymentAttempt{}, err
	}
	if attempt.SessionID != nil {
		return attempt, paymentError(tx.Commit(ctx))
	}
	fingerprint, err := service.CustomerPayments.CustomerRequestFingerprint(attempt.Charge())
	if err != nil {
		return PaymentAttempt{}, paymentError(err)
	}
	var previous string
	var withinRetention bool
	err = tx.QueryRow(ctx, `SELECT request_fingerprint,created_at<=statement_timestamp() AND created_at>statement_timestamp()-interval '23 hours'
 FROM online_payment_dispatches WHERE organization_id=$1 AND order_id=$2`, org, input.OrderID).Scan(&previous, &withinRetention)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return PaymentAttempt{}, paymentError(err)
	}
	missing := errors.Is(err, pgx.ErrNoRows)
	if !missing && (previous != fingerprint || !withinRetention) {
		return PaymentAttempt{}, ErrConflict
	}
	var eligible bool
	err = tx.QueryRow(ctx, `SELECT attempt.state='REQUESTED' AND NOT attempt.stock_hold_released
 AND attempt.expires_at>statement_timestamp()+interval '31 minutes' AND attempt.expires_at<=statement_timestamp()+interval '24 hours'
 AND doc.status IN ('PENDING','PREPARING','READY') AND doc.cart_id IS NULL AND shop.published AND shop.accepting_orders AND shop.slug=attempt.slug
 FROM online_payment_attempts attempt JOIN online_orders doc ON doc.organization_id=attempt.organization_id AND doc.id=attempt.order_id
 JOIN storefronts shop ON shop.organization_id=attempt.organization_id WHERE attempt.organization_id=$1 AND attempt.order_id=$2`, org, input.OrderID).Scan(&eligible)
	if err != nil {
		return PaymentAttempt{}, paymentError(err)
	}
	if !eligible {
		return PaymentAttempt{}, ErrConflict
	}
	if missing {
		if _, err = tx.Exec(ctx, "INSERT INTO online_payment_dispatches(organization_id,order_id,request_fingerprint) VALUES($1,$2,$3)", org, input.OrderID, fingerprint); err != nil {
			return PaymentAttempt{}, paymentError(err)
		}
	}
	return attempt, paymentError(tx.Commit(ctx))
}

func (service *Service) checkCustomerDispatchIdentity(ctx context.Context, slug string, input TrackingInput, charge stripe.CustomerCharge) error {
	fingerprint, err := service.CustomerPayments.CustomerRequestFingerprint(charge)
	if err != nil {
		return paymentError(err)
	}
	tx, org, err := service.trackingPaymentTx(ctx, slug, input)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var previous string
	err = tx.QueryRow(ctx, "SELECT request_fingerprint FROM online_payment_dispatches WHERE organization_id=$1 AND order_id=$2", org, input.OrderID).Scan(&previous)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil
	}
	if err != nil {
		return paymentError(err)
	}
	if previous != fingerprint {
		return ErrConflict
	}
	return nil
}

func (service *Service) recordCustomerObservation(ctx context.Context, slug string, input TrackingInput, session stripe.CustomerSession, source string) (CustomerCheckout, error) {
	tx, org, err := service.trackingPaymentTx(ctx, slug, input)
	if err != nil {
		return CustomerCheckout{}, err
	}
	defer tx.Rollback(ctx)
	attempt, err := readPayment(ctx, tx, org, input.OrderID)
	if err != nil {
		return CustomerCheckout{}, err
	}
	expected := ""
	if attempt.SessionID != nil {
		expected = *attempt.SessionID
	}
	if err = session.Validate(attempt.Charge(), expected); err != nil {
		return CustomerCheckout{}, paymentError(err)
	}
	outcome := "PROCESSING"
	if session.Status == "open" {
		outcome = "OPEN"
	} else if source == "RETRIEVE" {
		if session.PaymentStatus == "paid" {
			outcome = "PAID"
		} else if session.Status == "expired" {
			outcome = "EXPIRED"
		}
	}
	var intent *string
	if session.PaymentStatus == "paid" {
		intent = &session.PaymentIntent
	}
	fingerprint := digest(struct {
		Session, Status, PaymentStatus, Outcome, Currency string
		Amount, Expires                                   int64
		Intent                                            *string
	}{session.ID, session.Status, session.PaymentStatus, outcome, session.Currency, session.AmountMinor, session.ExpiresAt, intent})
	_, err = tx.Exec(ctx, `INSERT INTO online_payment_observations(organization_id,order_id,source,session_id,provider_status,provider_payment_status,outcome,payment_intent,amount_minor,currency,expires_at,fingerprint)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(organization_id,order_id,source,fingerprint) DO NOTHING`, org, input.OrderID, source, session.ID, session.Status, session.PaymentStatus, outcome, intent, session.AmountMinor, session.Currency, attempt.ExpiresAt, fingerprint)
	if err != nil {
		return CustomerCheckout{}, paymentError(err)
	}
	attempt, err = observePayment(ctx, tx, attempt, session, outcome)
	if err != nil {
		return CustomerCheckout{}, err
	}
	var redirectable bool
	if err = tx.QueryRow(ctx, "SELECT state='OPEN' AND NOT stock_hold_released AND expires_at>statement_timestamp() FROM online_payment_attempts WHERE organization_id=$1 AND order_id=$2", org, input.OrderID).Scan(&redirectable); err != nil {
		return CustomerCheckout{}, paymentError(err)
	}
	if err = tx.Commit(ctx); err != nil {
		return CustomerCheckout{}, paymentError(err)
	}
	result := CustomerCheckout{Attempt: attempt}
	if redirectable && session.Status == "open" {
		result.URL = session.URL
	}
	return result, nil
}
