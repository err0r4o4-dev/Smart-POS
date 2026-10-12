package storefront

import (
	"context"
	"errors"
	"regexp"
	"slices"
	"time"

	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/platform/stripe"
)

var reconciliationSessionPattern = regexp.MustCompile(`^cs_test_[A-Za-z0-9]{1,220}$`)

type PaymentReconciliationInput struct {
	OrderID   string
	SessionID string
}

type PaymentReview struct {
	Attempt           PaymentAttempt
	Status            string
	StockHoldReleased bool
	ReconciliationID  string
}

func (service *Service) FlagCustomerPaymentFulfillment(ctx context.Context, user, org, order, key, reason string) (PaymentReview, error) {
	if !uuidPattern.MatchString(key) || !slices.Contains([]string{"PRICE_CHANGED", "QUALITY_BLOCKED", "STOCK_UNAVAILABLE", "SOURCE_UNAVAILABLE", "OTHER_FULFILLMENT_BLOCKED"}, reason) {
		return PaymentReview{}, ErrInput
	}
	tx, attempt, err := service.staffPaymentTx(ctx, user, org, order)
	if err != nil {
		return PaymentReview{}, err
	}
	defer tx.Rollback(ctx)
	hash := reconciliationFingerprint(order, "", "FULFILLMENT_REVIEW", reason)
	previous, err := replayReconciliation(ctx, tx, user, key, hash, attempt)
	if err != nil {
		return PaymentReview{}, err
	}
	if previous != nil {
		return *previous, nil
	}
	current, err := readPaymentReview(ctx, tx, attempt, "")
	if err != nil {
		return PaymentReview{}, err
	}
	if attempt.State != "PAID" || current.Status == "SETTLED" {
		return PaymentReview{}, ErrConflict
	}
	id, err := appendReconciliation(ctx, tx, user, key, hash, "FULFILLMENT_REVIEW", reason, nil, attempt)
	if err != nil {
		return PaymentReview{}, err
	}
	result, err := readPaymentReview(ctx, tx, attempt, id)
	if err != nil {
		return PaymentReview{}, err
	}
	return result, paymentError(tx.Commit(ctx))
}

func (service *Service) ReconcileCustomerPayment(ctx context.Context, user, org, key string, input PaymentReconciliationInput) (PaymentReview, error) {
	if !uuidPattern.MatchString(key) || !reconciliationSessionPattern.MatchString(input.SessionID) {
		return PaymentReview{}, ErrInput
	}
	hash := reconciliationFingerprint(input.OrderID, input.SessionID, "VERIFY_SESSION", "PROVIDER_LOOKUP")
	attempt, previous, identity, err := service.prepareStaffVerification(ctx, user, org, key, input, hash)
	if err != nil {
		return PaymentReview{}, err
	}
	if previous != nil {
		return *previous, nil
	}
	network, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	session, err := service.CustomerPayments.RetrieveCustomerCheckout(network, attempt.Charge(), input.SessionID)
	if err != nil {
		return PaymentReview{}, paymentError(err)
	}
	if err = session.Validate(attempt.Charge(), input.SessionID); err != nil {
		return PaymentReview{}, paymentError(err)
	}
	tx, attempt, err := service.staffPaymentTx(ctx, user, org, input.OrderID)
	if err != nil {
		return PaymentReview{}, err
	}
	defer tx.Rollback(ctx)
	if previous, err = replayReconciliation(ctx, tx, user, key, hash, attempt); err != nil {
		return PaymentReview{}, err
	} else if previous != nil {
		return *previous, nil
	}
	currentIdentity, err := service.staffDispatchIdentity(ctx, tx, attempt)
	if err != nil {
		return PaymentReview{}, err
	}
	if currentIdentity != identity {
		return PaymentReview{}, ErrConflict
	}
	if attempt.SessionID == nil {
		outcome := "PROCESSING"
		if session.Status == "open" {
			outcome = "OPEN"
		}
		attempt, err = observePayment(ctx, tx, attempt, session, outcome)
		if err != nil {
			return PaymentReview{}, err
		}
	}
	var observation string
	attempt, observation, err = storeCustomerObservation(ctx, tx, attempt, session, "RETRIEVE")
	if err != nil {
		return PaymentReview{}, err
	}
	reconciliation, err := appendReconciliation(ctx, tx, user, key, hash, "VERIFY_SESSION", "PROVIDER_LOOKUP", &observation, attempt)
	if err != nil {
		return PaymentReview{}, err
	}
	result, err := readPaymentReview(ctx, tx, attempt, reconciliation)
	if err != nil {
		return PaymentReview{}, err
	}
	return result, paymentError(tx.Commit(ctx))
}

func (service *Service) CustomerPaymentReview(ctx context.Context, user, org, order string) (PaymentReview, error) {
	tx, attempt, err := service.staffPaymentTx(ctx, user, org, order)
	if err != nil {
		return PaymentReview{}, err
	}
	defer tx.Rollback(ctx)
	return readPaymentReview(ctx, tx, attempt, "")
}

func (service *Service) staffPaymentTx(ctx context.Context, user, org, order string) (pgx.Tx, PaymentAttempt, error) {
	if service.Organization == nil || service.Organization.Pool == nil {
		return nil, PaymentAttempt{}, stripe.ErrUnavailable
	}
	if !uuidPattern.MatchString(order) {
		return nil, PaymentAttempt{}, ErrNotFound
	}
	tx, actor, err := service.authorized(ctx, user, org, "storefront.manage")
	if err != nil {
		return nil, PaymentAttempt{}, err
	}
	fail := func(problem error) (pgx.Tx, PaymentAttempt, error) {
		tx.Rollback(ctx)
		return nil, PaymentAttempt{}, paymentError(problem)
	}
	if !slices.Contains(actor.Permissions, "online_orders.manage") {
		return fail(organization.ErrDenied)
	}
	var branch string
	if err = tx.QueryRow(ctx, "SELECT branch_id::text FROM online_orders WHERE organization_id=$1 AND id=$2 FOR UPDATE", org, order).Scan(&branch); err != nil {
		return fail(err)
	}
	if !branchAllowed(actor, branch) {
		return fail(organization.ErrDenied)
	}
	attempt, err := readPayment(ctx, tx, org, order)
	if err != nil {
		return fail(err)
	}
	return tx, attempt, nil
}

func (service *Service) prepareStaffVerification(ctx context.Context, user, org, key string, input PaymentReconciliationInput, hash string) (PaymentAttempt, *PaymentReview, string, error) {
	tx, attempt, err := service.staffPaymentTx(ctx, user, org, input.OrderID)
	if err != nil {
		return PaymentAttempt{}, nil, "", err
	}
	defer tx.Rollback(ctx)
	previous, err := replayReconciliation(ctx, tx, user, key, hash, attempt)
	if err != nil || previous != nil {
		return attempt, previous, "", err
	}
	if attempt.SessionID != nil && *attempt.SessionID != input.SessionID {
		return PaymentAttempt{}, nil, "", ErrConflict
	}
	identity, err := service.staffDispatchIdentity(ctx, tx, attempt)
	return attempt, nil, identity, err
}

func (service *Service) staffDispatchIdentity(ctx context.Context, tx pgx.Tx, attempt PaymentAttempt) (string, error) {
	if service.CustomerPayments == nil {
		return "", stripe.ErrUnavailable
	}
	identity, err := service.CustomerPayments.CustomerRequestFingerprint(attempt.Charge())
	if err != nil {
		return "", paymentError(err)
	}
	var dispatched string
	err = tx.QueryRow(ctx, "SELECT request_fingerprint FROM online_payment_dispatches WHERE organization_id=$1 AND order_id=$2", attempt.OrganizationID, attempt.OrderID).Scan(&dispatched)
	if errors.Is(err, pgx.ErrNoRows) {
		return identity, nil
	}
	if err != nil {
		return "", paymentError(err)
	}
	if identity != dispatched {
		return "", ErrConflict
	}
	return identity, nil
}

func reconciliationFingerprint(order, session, action, reason string) string {
	return digest(struct{ Order, Session, Action, Reason string }{order, session, action, reason})
}

func replayReconciliation(ctx context.Context, tx pgx.Tx, user, key, hash string, attempt PaymentAttempt) (*PaymentReview, error) {
	var id, previous string
	err := tx.QueryRow(ctx, "SELECT id::text,request_fingerprint FROM online_payment_reconciliations WHERE organization_id=$1 AND actor_id=$2 AND idempotency_key=$3", attempt.OrganizationID, user, key).Scan(&id, &previous)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, paymentError(err)
	}
	if previous != hash {
		return nil, ErrConflict
	}
	result, err := readPaymentReview(ctx, tx, attempt, id)
	return &result, err
}

func appendReconciliation(ctx context.Context, tx pgx.Tx, user, key, hash, action, reason string, observation *string, attempt PaymentAttempt) (string, error) {
	var id string
	err := tx.QueryRow(ctx, `INSERT INTO online_payment_reconciliations(organization_id,order_id,actor_id,idempotency_key,request_fingerprint,action,reason_code,session_id,observation_id,payment_state) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id::text`, attempt.OrganizationID, attempt.OrderID, user, key, hash, action, reason, attempt.SessionID, observation, attempt.State).Scan(&id)
	if err != nil {
		return "", paymentError(err)
	}
	if err = organization.RecordAudit(ctx, tx, attempt.OrganizationID, user, "online_payment.reconciled", id); err != nil {
		return "", paymentError(err)
	}
	return id, nil
}

func readPaymentReview(ctx context.Context, tx pgx.Tx, attempt PaymentAttempt, reconciliation string) (PaymentReview, error) {
	result := PaymentReview{Attempt: attempt, ReconciliationID: reconciliation}
	var status string
	var flagged bool
	err := tx.QueryRow(ctx, `SELECT doc.status,attempt.stock_hold_released,EXISTS(SELECT 1 FROM online_payment_reconciliations review WHERE review.organization_id=doc.organization_id AND review.order_id=doc.id AND review.action='FULFILLMENT_REVIEW') FROM online_orders doc JOIN online_payment_attempts attempt ON attempt.organization_id=doc.organization_id AND attempt.order_id=doc.id WHERE doc.organization_id=$1 AND doc.id=$2`, attempt.OrganizationID, attempt.OrderID).Scan(&status, &result.StockHoldReleased, &flagged)
	if err != nil {
		return PaymentReview{}, paymentError(err)
	}
	switch {
	case status == "COMPLETED":
		result.Status = "SETTLED"
	case attempt.State == "PAID" && (result.StockHoldReleased || slices.Contains([]string{"CANCELLED", "REJECTED", "EXPIRED"}, status) || flagged):
		result.Status = "REFUND_REVIEW_REQUIRED"
	case attempt.State == "PAID":
		result.Status = "PAID_HELD"
	case attempt.State == "EXPIRED":
		result.Status = "PROVIDER_EXPIRED"
	case attempt.SessionID == nil:
		result.Status = "SESSION_REQUIRED"
	default:
		result.Status = "PAYMENT_PENDING"
	}
	return result, nil
}
