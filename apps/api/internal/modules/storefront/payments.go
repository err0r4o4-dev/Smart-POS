package storefront

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/platform/stripe"
)

type PaymentAttempt struct {
	OrganizationID string
	OrderID        string
	Slug           string
	AmountMinor    int64
	Currency       string
	ExpiresAt      time.Time
	State          string
	SessionID      *string
	PaymentIntent  *string
	Revision       int64
}

func (attempt PaymentAttempt) Charge() stripe.CustomerCharge {
	return stripe.CustomerCharge{OrganizationID: attempt.OrganizationID, OrderID: attempt.OrderID, Slug: attempt.Slug, AmountMinor: attempt.AmountMinor, ExpiresAt: attempt.ExpiresAt}
}

type PaymentAcceptance struct {
	Attempt   PaymentAttempt
	Duplicate bool
}

const paymentColumns = `organization_id::text,order_id::text,slug,amount_minor,currency,expires_at,state,session_id,payment_intent,revision`

func nextPaymentState(current, observed string) (string, error) {
	ranks := map[string]int{"REQUESTED": 0, "OPEN": 1, "PROCESSING": 2, "EXPIRED": 3, "PAID": 4}
	previous, validCurrent := ranks[current]
	next, validObserved := ranks[observed]
	if !validCurrent || !validObserved {
		return "", ErrInput
	}
	if next > previous {
		return observed, nil
	}
	return current, nil
}

func paymentError(err error) error {
	switch {
	case errors.Is(err, stripe.ErrInput):
		return ErrInput
	case errors.Is(err, stripe.ErrNotFound):
		return ErrNotFound
	case errors.Is(err, stripe.ErrConflict):
		return ErrConflict
	default:
		return dbError(err)
	}
}

func scanPayment(row pgx.Row) (PaymentAttempt, error) {
	var attempt PaymentAttempt
	err := row.Scan(&attempt.OrganizationID, &attempt.OrderID, &attempt.Slug, &attempt.AmountMinor, &attempt.Currency, &attempt.ExpiresAt, &attempt.State, &attempt.SessionID, &attempt.PaymentIntent, &attempt.Revision)
	return attempt, paymentError(err)
}

func readPayment(ctx context.Context, tx pgx.Tx, org, order string) (PaymentAttempt, error) {
	return scanPayment(tx.QueryRow(ctx, "SELECT "+paymentColumns+" FROM online_payment_attempts WHERE organization_id=$1 AND order_id=$2 FOR UPDATE", org, order))
}

func (service *Service) paymentTx(ctx context.Context, org string) (pgx.Tx, error) {
	if service.Organization == nil || service.Organization.Pool == nil {
		return nil, stripe.ErrUnavailable
	}
	if !uuidPattern.MatchString(org) || !service.resolvedOrganizationAllowed(&org) {
		return nil, ErrNotFound
	}
	tx, err := service.Organization.Pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	fail := func(problem error) (pgx.Tx, error) {
		tx.Rollback(ctx)
		return nil, paymentError(problem)
	}
	if _, err = tx.Exec(ctx, "SELECT set_config('app.organization_id',$1,true),set_config('app.user_id','',true)", org); err != nil {
		return fail(err)
	}
	var id string
	if err = tx.QueryRow(ctx, "SELECT id::text FROM organizations WHERE id=$1 FOR UPDATE", org).Scan(&id); err != nil {
		return fail(err)
	}
	return tx, nil
}

func (service *Service) trackingPaymentTx(ctx context.Context, slug string, input TrackingInput) (pgx.Tx, string, error) {
	if !slugPattern.MatchString(slug) || !uuidPattern.MatchString(input.OrderID) || !tokenPattern.MatchString(input.AccessToken) {
		return nil, "", ErrNotFound
	}
	if service.Organization == nil || service.Organization.Pool == nil {
		return nil, "", stripe.ErrUnavailable
	}
	tx, err := service.Organization.Pool.Begin(ctx)
	if err != nil {
		return nil, "", err
	}
	var org *string
	err = tx.QueryRow(ctx, "SELECT storefront_tracking_resolve($1,$2,$3)::text", slug, input.OrderID, accessHash(input.AccessToken)).Scan(&org)
	if err != nil || !service.resolvedOrganizationAllowed(org) {
		tx.Rollback(ctx)
		if err != nil {
			return nil, "", paymentError(err)
		}
		return nil, "", ErrNotFound
	}
	if _, err = tx.Exec(ctx, "SELECT set_config('app.organization_id',$1,true),set_config('app.user_id','',true)", *org); err != nil {
		tx.Rollback(ctx)
		return nil, "", err
	}
	var id string
	if err = tx.QueryRow(ctx, "SELECT id::text FROM organizations WHERE id=$1 AND status='ACTIVE' FOR UPDATE", *org).Scan(&id); err != nil {
		tx.Rollback(ctx)
		return nil, "", paymentError(err)
	}
	return tx, *org, nil
}

func (service *Service) BeginCustomerPayment(ctx context.Context, slug string, input TrackingInput) (PaymentAttempt, error) {
	if service.CustomerPayments == nil || !service.CustomerPayments.Enabled() {
		return PaymentAttempt{}, stripe.ErrUnavailable
	}
	tx, org, err := service.trackingPaymentTx(ctx, slug, input)
	if err != nil {
		return PaymentAttempt{}, err
	}
	defer tx.Rollback(ctx)
	attempt, err := readPayment(ctx, tx, org, input.OrderID)
	if err == nil {
		if err = tx.Commit(ctx); err != nil {
			return PaymentAttempt{}, paymentError(err)
		}
		return attempt, nil
	}
	if !errors.Is(err, ErrNotFound) {
		return PaymentAttempt{}, err
	}
	attempt, err = scanPayment(tx.QueryRow(ctx, `INSERT INTO online_payment_attempts(organization_id,order_id,slug,amount_minor,expires_at)
 SELECT doc.organization_id,doc.id,shop.slug,(doc.estimated_total*100)::bigint,
 least(date_trunc('second',doc.expires_at),date_trunc('second',now()+interval '1 hour'))
 FROM online_orders doc JOIN storefronts shop ON shop.organization_id=doc.organization_id
 WHERE doc.organization_id=$1 AND doc.id=$2 AND doc.stock_reserved AND doc.cart_id IS NULL
 AND doc.status IN ('PENDING','PREPARING','READY') AND doc.expires_at>now()+interval '31 minutes'
 AND shop.published AND shop.accepting_orders RETURNING `+paymentColumns, org, input.OrderID))
	if err != nil {
		if errors.Is(err, ErrNotFound) {
			return PaymentAttempt{}, ErrConflict
		}
		return PaymentAttempt{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return PaymentAttempt{}, paymentError(err)
	}
	return attempt, nil
}

func (service *Service) CustomerPayment(ctx context.Context, slug string, input TrackingInput) (PaymentAttempt, error) {
	tx, org, err := service.trackingPaymentTx(ctx, slug, input)
	if err != nil {
		return PaymentAttempt{}, err
	}
	defer tx.Rollback(ctx)
	return readPayment(ctx, tx, org, input.OrderID)
}

func observePayment(ctx context.Context, tx pgx.Tx, attempt PaymentAttempt, session stripe.CustomerSession, observed string) (PaymentAttempt, error) {
	expected := ""
	if attempt.SessionID != nil {
		expected = *attempt.SessionID
	}
	if err := session.Validate(attempt.Charge(), expected); err != nil {
		return PaymentAttempt{}, paymentError(err)
	}
	state, err := nextPaymentState(attempt.State, observed)
	if err != nil {
		return PaymentAttempt{}, err
	}
	var intent *string
	if state == "PAID" {
		intent = attempt.PaymentIntent
		if attempt.State == "PAID" {
			if session.PaymentStatus == "paid" && (intent == nil || *intent != session.PaymentIntent) {
				return PaymentAttempt{}, ErrConflict
			}
		} else {
			intent = &session.PaymentIntent
		}
	}
	if attempt.SessionID != nil && state == attempt.State {
		return attempt, nil
	}
	return scanPayment(tx.QueryRow(ctx, `UPDATE online_payment_attempts SET session_id=$3,state=$4,payment_intent=$5,revision=revision+1,updated_at=now()
 WHERE organization_id=$1 AND order_id=$2 RETURNING `+paymentColumns, attempt.OrganizationID, attempt.OrderID, session.ID, state, intent))
}

func (service *Service) BindCustomerPayment(ctx context.Context, org, order string, session stripe.CustomerSession) (PaymentAttempt, error) {
	if !uuidPattern.MatchString(order) {
		return PaymentAttempt{}, ErrNotFound
	}
	tx, err := service.paymentTx(ctx, org)
	if err != nil {
		return PaymentAttempt{}, err
	}
	defer tx.Rollback(ctx)
	attempt, err := readPayment(ctx, tx, org, order)
	if err != nil {
		return PaymentAttempt{}, err
	}
	observed := "PROCESSING"
	if session.Status == "open" {
		observed = "OPEN"
	}
	attempt, err = observePayment(ctx, tx, attempt, session, observed)
	if err != nil {
		return PaymentAttempt{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return PaymentAttempt{}, paymentError(err)
	}
	return attempt, nil
}

func (service *Service) AcceptCustomerWebhook(ctx context.Context, body []byte, signature string, now time.Time) (PaymentAcceptance, error) {
	if service.CustomerPayments == nil {
		return PaymentAcceptance{}, stripe.ErrUnavailable
	}
	event, err := service.CustomerPayments.VerifyCustomerEvent(body, signature, now)
	if err != nil {
		return PaymentAcceptance{}, paymentError(err)
	}
	session := event.Data.Object
	org, order := session.Metadata["organization_id"], session.Metadata["order_id"]
	if session.Metadata["smartpos_purpose"] != stripe.CustomerPurpose || !uuidPattern.MatchString(org) || !uuidPattern.MatchString(order) {
		return PaymentAcceptance{}, ErrNotFound
	}
	outcome := "PROCESSING"
	if event.Type == "checkout.session.expired" {
		if session.Status != "expired" || session.PaymentStatus != "unpaid" {
			return PaymentAcceptance{}, ErrConflict
		}
		outcome = "EXPIRED"
	} else {
		if session.Status != "complete" {
			return PaymentAcceptance{}, ErrConflict
		}
		if session.PaymentStatus == "paid" {
			outcome = "PAID"
		}
	}
	tx, err := service.paymentTx(ctx, org)
	if err != nil {
		return PaymentAcceptance{}, err
	}
	defer tx.Rollback(ctx)
	attempt, err := readPayment(ctx, tx, org, order)
	if err != nil {
		return PaymentAcceptance{}, err
	}
	expected := ""
	if attempt.SessionID != nil {
		expected = *attempt.SessionID
	}
	if err = session.Validate(attempt.Charge(), expected); err != nil {
		return PaymentAcceptance{}, paymentError(err)
	}
	evidence := struct {
		ID, Type, Organization, Order, Session, Outcome, Intent, Currency string
		Amount, Expires, Created                                          int64
	}{event.ID, event.Type, org, order, session.ID, outcome, session.PaymentIntent, session.Currency, session.AmountMinor, session.ExpiresAt, event.Created}
	encoded, err := json.Marshal(evidence)
	if err != nil {
		return PaymentAcceptance{}, ErrInput
	}
	digest := sha256.Sum256(encoded)
	fingerprint := hex.EncodeToString(digest[:])
	var previous string
	err = tx.QueryRow(ctx, "SELECT fingerprint FROM online_payment_inbox WHERE organization_id=$1 AND event_id=$2", org, event.ID).Scan(&previous)
	if err == nil {
		if previous != fingerprint {
			return PaymentAcceptance{}, ErrConflict
		}
		if err = tx.Commit(ctx); err != nil {
			return PaymentAcceptance{}, paymentError(err)
		}
		return PaymentAcceptance{Attempt: attempt, Duplicate: true}, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return PaymentAcceptance{}, paymentError(err)
	}
	var intent *string
	if outcome == "PAID" {
		intent = &session.PaymentIntent
	}
	tag, err := tx.Exec(ctx, `INSERT INTO online_payment_inbox(event_id,organization_id,order_id,event_type,session_id,outcome,payment_intent,amount_minor,currency,expires_at,event_created_at,fingerprint)
 VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(event_id) DO NOTHING`, event.ID, org, order, event.Type, session.ID, outcome, intent, session.AmountMinor, session.Currency, attempt.ExpiresAt, time.Unix(event.Created, 0), fingerprint)
	if err != nil {
		return PaymentAcceptance{}, paymentError(err)
	}
	if tag.RowsAffected() != 1 {
		return PaymentAcceptance{}, ErrConflict
	}
	attempt, err = observePayment(ctx, tx, attempt, session, outcome)
	if err != nil {
		return PaymentAcceptance{}, err
	}
	if err = tx.Commit(ctx); err != nil {
		return PaymentAcceptance{}, paymentError(err)
	}
	return PaymentAcceptance{Attempt: attempt}, nil
}
