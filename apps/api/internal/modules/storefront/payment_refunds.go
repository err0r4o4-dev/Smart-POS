package storefront

import (
	"context"
	"errors"
	"regexp"
	"slices"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"smartpos/api/internal/modules/organization"
	"smartpos/api/internal/platform/stripe"
)

var customerRefundIDPattern = regexp.MustCompile(`^re_[A-Za-z0-9]{1,220}$`)

type CustomerRefundGateway interface {
	CustomerRefundFingerprint(stripe.CustomerRefundCharge) (string, error)
	CreateCustomerRefund(context.Context, stripe.CustomerRefundCharge) (stripe.CustomerRefund, error)
	RetrieveCustomerRefund(context.Context, stripe.CustomerRefundCharge, string) (stripe.CustomerRefund, error)
}

type RefundIntent struct {
	ID                 string
	OrderID            string
	AmountMinor        int64
	State              string
	ProviderID         *string
	RequestFingerprint string
	PaymentIntent      string
	CreatedAt          time.Time
}

func (intent RefundIntent) charge(org string) stripe.CustomerRefundCharge {
	return stripe.CustomerRefundCharge{OrganizationID: org, OrderID: intent.OrderID, RefundID: intent.ID, PaymentIntent: intent.PaymentIntent, AmountMinor: intent.AmountMinor}
}

func readRefundIntent(ctx context.Context, tx pgx.Tx, org, order string) (RefundIntent, error) {
	var intent RefundIntent
	err := tx.QueryRow(ctx, "SELECT id::text,order_id::text,amount_minor,state,provider_id,request_fingerprint,payment_intent,created_at FROM online_refund_intents WHERE organization_id=$1 AND order_id=$2 FOR UPDATE", org, order).Scan(&intent.ID, &intent.OrderID, &intent.AmountMinor, &intent.State, &intent.ProviderID, &intent.RequestFingerprint, &intent.PaymentIntent, &intent.CreatedAt)
	return intent, err
}

func (service *Service) prepareCustomerCancellation(ctx context.Context, user, org, order, key string, gateway CustomerRefundGateway) (RefundIntent, error) {
	tx, attempt, err := service.staffPaymentTx(ctx, user, org, order)
	if err != nil {
		return RefundIntent{}, err
	}
	defer tx.Rollback(ctx)
	intent, err := readRefundIntent(ctx, tx, org, order)
	if err == nil {
		if intent.ID != key {
			return RefundIntent{}, ErrConflict
		}
		return intent, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return RefundIntent{}, paymentError(err)
	}
	if attempt.State != "PAID" || attempt.PaymentIntent == nil {
		return RefundIntent{}, ErrConflict
	}
	var status string
	var cart *string
	if err = tx.QueryRow(ctx, "SELECT status,cart_id::text FROM online_orders WHERE organization_id=$1 AND id=$2", org, order).Scan(&status, &cart); err != nil {
		return RefundIntent{}, paymentError(err)
	}
	if !slices.Contains([]string{"PENDING", "PREPARING", "READY"}, status) || cart != nil {
		return RefundIntent{}, ErrConflict
	}
	if !service.CustomerPayments.Enabled() {
		return RefundIntent{}, stripe.ErrUnavailable
	}
	intent = RefundIntent{ID: key, OrderID: order, AmountMinor: attempt.AmountMinor, PaymentIntent: *attempt.PaymentIntent}
	identity, err := gateway.CustomerRefundFingerprint(intent.charge(org))
	if err != nil {
		return RefundIntent{}, paymentError(err)
	}
	if _, err = tx.Exec(ctx, "INSERT INTO online_refund_intents(id,organization_id,order_id,actor_id,purpose,amount_minor,payment_intent,request_fingerprint) VALUES($1,$2,$3,$4,'CANCEL_BEFORE_SHIPMENT',$5,$6,$7)", key, org, order, user, intent.AmountMinor, intent.PaymentIntent, identity); err != nil {
		return RefundIntent{}, paymentError(err)
	}
	if err = organization.RecordAudit(ctx, tx, org, user, "online_refund.requested", key); err != nil {
		return RefundIntent{}, paymentError(err)
	}
	intent, err = readRefundIntent(ctx, tx, org, order)
	if err != nil {
		return RefundIntent{}, paymentError(err)
	}
	return intent, paymentError(tx.Commit(ctx))
}

func (service *Service) CancelPaidCustomerOrder(ctx context.Context, user, org, order, key string) (RefundIntent, error) {
	return service.processCustomerRefund(ctx, user, org, order, key, "")
}

func (service *Service) ReconcileCustomerRefund(ctx context.Context, user, org, order, key, providerID string) (RefundIntent, error) {
	if !customerRefundIDPattern.MatchString(providerID) {
		return RefundIntent{}, ErrInput
	}
	return service.processCustomerRefund(ctx, user, org, order, key, providerID)
}

func (service *Service) processCustomerRefund(ctx context.Context, user, org, order, key, discoveredID string) (RefundIntent, error) {
	if !uuidPattern.MatchString(key) {
		return RefundIntent{}, ErrInput
	}
	gateway, available := service.CustomerPayments.(CustomerRefundGateway)
	if !available {
		return RefundIntent{}, stripe.ErrUnavailable
	}
	var intent RefundIntent
	var err error
	if discoveredID == "" {
		intent, err = service.prepareCustomerCancellation(ctx, user, org, order, key, gateway)
	} else {
		tx, _, problem := service.staffPaymentTx(ctx, user, org, order)
		if problem != nil {
			return RefundIntent{}, problem
		}
		intent, err = readRefundIntent(ctx, tx, org, order)
		tx.Rollback(ctx)
		if err == nil && (intent.ID != key || intent.ProviderID != nil && *intent.ProviderID != discoveredID) {
			return RefundIntent{}, ErrConflict
		}
	}
	if err != nil {
		return RefundIntent{}, paymentError(err)
	}
	if slices.Contains([]string{"SUCCEEDED", "FAILED", "CANCELED"}, intent.State) {
		return intent, nil
	}
	identity, err := gateway.CustomerRefundFingerprint(intent.charge(org))
	if err != nil {
		return RefundIntent{}, paymentError(err)
	}
	if identity != intent.RequestFingerprint {
		return RefundIntent{}, ErrConflict
	}
	network, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	var refund stripe.CustomerRefund
	source := "RETRIEVE"
	if intent.ProviderID == nil && discoveredID == "" {
		if !service.CustomerPayments.Enabled() {
			return RefundIntent{}, stripe.ErrUnavailable
		}
		if time.Since(intent.CreatedAt) >= 23*time.Hour {
			return RefundIntent{}, ErrConflict
		}
		source = "CREATE"
		refund, err = gateway.CreateCustomerRefund(network, intent.charge(org))
	} else {
		providerID := discoveredID
		if intent.ProviderID != nil {
			providerID = *intent.ProviderID
		}
		refund, err = gateway.RetrieveCustomerRefund(network, intent.charge(org), providerID)
	}
	if err != nil {
		return RefundIntent{}, paymentError(err)
	}
	expected := discoveredID
	if intent.ProviderID != nil {
		expected = *intent.ProviderID
	}
	if err = refund.Validate(intent.charge(org), expected); err != nil {
		return RefundIntent{}, paymentError(err)
	}
	tx, _, err := service.staffPaymentTx(ctx, user, org, order)
	if err != nil {
		return RefundIntent{}, err
	}
	defer tx.Rollback(ctx)
	current, err := readRefundIntent(ctx, tx, org, order)
	if err != nil {
		return RefundIntent{}, paymentError(err)
	}
	if current.ID != intent.ID || current.RequestFingerprint != identity {
		return RefundIntent{}, ErrConflict
	}
	currentIdentity, err := gateway.CustomerRefundFingerprint(current.charge(org))
	if err != nil {
		return RefundIntent{}, paymentError(err)
	}
	if currentIdentity != identity {
		return RefundIntent{}, ErrConflict
	}
	expected = discoveredID
	if current.ProviderID != nil {
		expected = *current.ProviderID
	}
	if err = refund.Validate(current.charge(org), expected); err != nil {
		return RefundIntent{}, paymentError(err)
	}
	outcome := strings.ToUpper(refund.Status)
	hash := digest(struct {
		ID, Outcome, Intent, Currency string
		Amount                        int64
	}{refund.ID, outcome, refund.PaymentIntent, refund.Currency, refund.AmountMinor})
	if _, err = tx.Exec(ctx, "INSERT INTO online_refund_observations(organization_id,order_id,refund_id,actor_id,source,provider_id,outcome,payment_intent,amount_minor,currency,fingerprint) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(organization_id,refund_id,source,fingerprint) DO NOTHING", org, order, current.ID, user, source, refund.ID, outcome, refund.PaymentIntent, refund.AmountMinor, refund.Currency, hash); err != nil {
		return RefundIntent{}, paymentError(err)
	}
	if slices.Contains([]string{"SUCCEEDED", "FAILED", "CANCELED"}, current.State) {
		if slices.Contains([]string{"SUCCEEDED", "FAILED", "CANCELED"}, outcome) && outcome != current.State {
			return RefundIntent{}, ErrConflict
		}
	} else if _, err = tx.Exec(ctx, "UPDATE online_refund_intents SET provider_id=$3,state=$4,revision=revision+1,updated_at=now() WHERE organization_id=$1 AND order_id=$2", org, order, refund.ID, outcome); err != nil {
		return RefundIntent{}, paymentError(err)
	}
	current, err = readRefundIntent(ctx, tx, org, order)
	if err != nil {
		return RefundIntent{}, paymentError(err)
	}
	if current.State == "SUCCEEDED" {
		if _, err = tx.Exec(ctx, "UPDATE online_payment_attempts SET revision=revision+1,updated_at=now() WHERE organization_id=$1 AND order_id=$2 AND NOT stock_hold_released", org, order); err != nil {
			return RefundIntent{}, paymentError(err)
		}
		var status string
		if err = tx.QueryRow(ctx, "SELECT status FROM online_orders WHERE organization_id=$1 AND id=$2", org, order).Scan(&status); err != nil {
			return RefundIntent{}, paymentError(err)
		}
		if status != "CANCELLED" {
			if _, err = tx.Exec(ctx, "UPDATE online_orders SET status='CANCELLED',revision=revision+1,updated_at=now() WHERE organization_id=$1 AND id=$2", org, order); err != nil {
				return RefundIntent{}, paymentError(err)
			}
			if _, err = tx.Exec(ctx, "INSERT INTO online_order_events(organization_id,order_id,status,message,actor_id) VALUES($1,$2,'CANCELLED','Full charge refunded before shipment',$3)", org, order, user); err != nil {
				return RefundIntent{}, paymentError(err)
			}
			if err = organization.RecordAudit(ctx, tx, org, user, "online_refund.succeeded", current.ID); err != nil {
				return RefundIntent{}, paymentError(err)
			}
		}
	}
	return current, paymentError(tx.Commit(ctx))
}
