package stripe

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/url"
	"strconv"
)

const CustomerRefundPurpose = "online_order_test_refund"

type CustomerRefundCharge struct {
	OrganizationID string
	OrderID        string
	RefundID       string
	PaymentIntent  string
	AmountMinor    int64
}

type CustomerRefund struct {
	ID            string            `json:"id"`
	Object        string            `json:"object"`
	Status        string            `json:"status"`
	AmountMinor   int64             `json:"amount"`
	Currency      string            `json:"currency"`
	PaymentIntent string            `json:"payment_intent"`
	Metadata      map[string]string `json:"metadata"`
}

func (charge CustomerRefundCharge) Validate() error {
	if !uuidPattern.MatchString(charge.OrganizationID) || !uuidPattern.MatchString(charge.OrderID) || !uuidPattern.MatchString(charge.RefundID) || !intentPattern.MatchString(charge.PaymentIntent) || charge.AmountMinor < 1 || charge.AmountMinor > 99999999 {
		return ErrInput
	}
	return nil
}

func (refund CustomerRefund) Validate(charge CustomerRefundCharge, expected string) error {
	if err := charge.Validate(); err != nil {
		return err
	}
	if refund.Metadata["smartpos_purpose"] != CustomerRefundPurpose || refund.Metadata["organization_id"] != charge.OrganizationID || refund.Metadata["order_id"] != charge.OrderID || refund.Metadata["refund_id"] != charge.RefundID {
		return ErrNotFound
	}
	if refund.Object != "refund" || !refundPattern.MatchString(refund.ID) || expected != "" && refund.ID != expected || refund.PaymentIntent != charge.PaymentIntent || refund.AmountMinor != charge.AmountMinor || refund.Currency != "thb" {
		return ErrConflict
	}
	switch refund.Status {
	case "pending", "requires_action", "succeeded", "failed", "canceled":
		return nil
	default:
		return ErrConflict
	}
}

func customerRefundKey(charge CustomerRefundCharge) string {
	return "customer-" + (Scope{OrganizationID: charge.OrganizationID, UserID: charge.OrderID}).key("customer-refund", charge.RefundID)
}

func customerRefundForm(charge CustomerRefundCharge) url.Values {
	return url.Values{
		"payment_intent": {charge.PaymentIntent}, "amount": {strconv.FormatInt(charge.AmountMinor, 10)},
		"metadata[smartpos_purpose]": {CustomerRefundPurpose}, "metadata[organization_id]": {charge.OrganizationID},
		"metadata[order_id]": {charge.OrderID}, "metadata[refund_id]": {charge.RefundID},
	}
}

func (client *CustomerClient) CustomerRefundFingerprint(charge CustomerRefundCharge) (string, error) {
	if client == nil || !client.client.Configured() {
		return "", ErrUnavailable
	}
	if err := charge.Validate(); err != nil {
		return "", err
	}
	mac := hmac.New(sha256.New, []byte(client.client.secret))
	mac.Write([]byte("POST https://api.stripe.com/v1/refunds\n" + stripeAPIVersion + "\n" + customerRefundKey(charge) + "\n" + customerRefundForm(charge).Encode()))
	return hex.EncodeToString(mac.Sum(nil)), nil
}

func (client *CustomerClient) CreateCustomerRefund(ctx context.Context, charge CustomerRefundCharge) (CustomerRefund, error) {
	if !client.Enabled() {
		return CustomerRefund{}, ErrUnavailable
	}
	if err := charge.Validate(); err != nil {
		return CustomerRefund{}, err
	}
	var refund CustomerRefund
	if err := client.client.request(ctx, http.MethodPost, "/refunds", customerRefundKey(charge), customerRefundForm(charge), &refund); err != nil {
		return CustomerRefund{}, err
	}
	return refund, refund.Validate(charge, "")
}

func (client *CustomerClient) RetrieveCustomerRefund(ctx context.Context, charge CustomerRefundCharge, id string) (CustomerRefund, error) {
	if client == nil || !client.client.Configured() {
		return CustomerRefund{}, ErrUnavailable
	}
	if charge.Validate() != nil || !refundPattern.MatchString(id) {
		return CustomerRefund{}, ErrInput
	}
	var refund CustomerRefund
	if err := client.client.request(ctx, http.MethodGet, "/refunds/"+id, "", nil, &refund); err != nil {
		return CustomerRefund{}, err
	}
	return refund, refund.Validate(charge, id)
}
