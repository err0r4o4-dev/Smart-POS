package stripe

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const CustomerPurpose = "online_order_test_payment"

var shopSlugPattern = regexp.MustCompile(`^[a-z][a-z0-9-]{2,49}$`)
var webhookKeyPattern = regexp.MustCompile(`^whsec_[A-Za-z0-9_]{16,240}$`)

type CustomerClient struct {
	client        *Client
	webhookSecret string
	enabled       bool
}

func NewCustomerClient(client *Client, webhookSecret string, enabled bool) (*CustomerClient, error) {
	if webhookSecret != "" && !webhookKeyPattern.MatchString(webhookSecret) {
		return nil, errors.New("invalid Stripe webhook signing secret")
	}
	if enabled && (!client.Configured() || webhookSecret == "") {
		return nil, errors.New("customer Checkout requires test key and webhook signing secret")
	}
	return &CustomerClient{client: client, webhookSecret: webhookSecret, enabled: enabled}, nil
}

func (client *CustomerClient) Enabled() bool {
	return client != nil && client.enabled && client.client.Configured() && client.webhookSecret != ""
}

type CustomerCharge struct {
	OrganizationID string
	OrderID        string
	Slug           string
	AmountMinor    int64
	ExpiresAt      time.Time
}

func (charge CustomerCharge) Validate() error {
	if !uuidPattern.MatchString(charge.OrganizationID) || !uuidPattern.MatchString(charge.OrderID) || !shopSlugPattern.MatchString(charge.Slug) || strings.HasSuffix(charge.Slug, "-") || strings.Contains(charge.Slug, "--") || charge.AmountMinor < 1000 || charge.AmountMinor > 99999999 || charge.ExpiresAt.IsZero() || charge.ExpiresAt.Unix() <= 0 {
		return ErrInput
	}
	return nil
}

type CustomerSession struct {
	ID            string            `json:"id"`
	Object        string            `json:"object"`
	LiveMode      *bool             `json:"livemode"`
	Mode          string            `json:"mode"`
	URL           string            `json:"url"`
	Status        string            `json:"status"`
	PaymentStatus string            `json:"payment_status"`
	AmountMinor   int64             `json:"amount_total"`
	Currency      string            `json:"currency"`
	PaymentIntent string            `json:"payment_intent"`
	ExpiresAt     int64             `json:"expires_at"`
	Metadata      map[string]string `json:"metadata"`
}

func (session CustomerSession) Validate(charge CustomerCharge, expected string) error {
	if err := charge.Validate(); err != nil {
		return err
	}
	if session.Metadata["smartpos_purpose"] != CustomerPurpose || session.Metadata["organization_id"] != charge.OrganizationID || session.Metadata["order_id"] != charge.OrderID {
		return ErrNotFound
	}
	if session.Object != "checkout.session" || session.LiveMode == nil || *session.LiveMode || session.Mode != "payment" || !sessionPattern.MatchString(session.ID) || (expected != "" && expected != session.ID) || session.AmountMinor != charge.AmountMinor || session.Currency != "thb" || session.ExpiresAt != charge.ExpiresAt.Unix() {
		return ErrConflict
	}
	if session.Status != "open" && session.Status != "complete" && session.Status != "expired" {
		return ErrConflict
	}
	if session.PaymentStatus != "paid" && session.PaymentStatus != "unpaid" {
		return ErrConflict
	}
	if session.PaymentIntent != "" && !intentPattern.MatchString(session.PaymentIntent) {
		return ErrConflict
	}
	if session.PaymentStatus == "paid" && (session.Status != "complete" || !intentPattern.MatchString(session.PaymentIntent)) {
		return ErrConflict
	}
	if session.URL != "" || session.Status == "open" {
		parsed, err := url.Parse(session.URL)
		if err != nil || parsed.Scheme != "https" || parsed.Host != "checkout.stripe.com" || parsed.User != nil || parsed.Path != "/c/pay/"+session.ID {
			return ErrConflict
		}
	}
	return nil
}

func (client *CustomerClient) CustomerRequestFingerprint(charge CustomerCharge) (string, error) {
	if client == nil || !client.client.Configured() {
		return "", ErrUnavailable
	}
	if err := charge.Validate(); err != nil {
		return "", err
	}
	mac := hmac.New(sha256.New, []byte(client.client.secret))
	mac.Write([]byte("POST https://api.stripe.com/v1/checkout/sessions\n" + stripeAPIVersion + "\n" + customerCheckoutKey(charge) + "\n" + client.customerCheckoutForm(charge).Encode()))
	return hex.EncodeToString(mac.Sum(nil)), nil
}

func (client *CustomerClient) customerCheckoutForm(charge CustomerCharge) url.Values {
	returnPath := client.client.origin + "/shop/" + charge.Slug + "/track/" + charge.OrderID
	form := url.Values{
		"mode": {"payment"}, "success_url": {returnPath + "?payment_return=1"}, "cancel_url": {returnPath + "?payment_return=1"},
		"payment_method_types[0]": {"card"}, "expires_at": {strconv.FormatInt(charge.ExpiresAt.Unix(), 10)},
		"line_items[0][price_data][currency]": {"thb"}, "line_items[0][price_data][unit_amount]": {strconv.FormatInt(charge.AmountMinor, 10)},
		"line_items[0][price_data][product_data][name]": {"SmartPOS test order " + charge.OrderID}, "line_items[0][quantity]": {"1"},
	}
	for name, value := range map[string]string{"smartpos_purpose": CustomerPurpose, "organization_id": charge.OrganizationID, "order_id": charge.OrderID} {
		form.Set("metadata["+name+"]", value)
		form.Set("payment_intent_data[metadata]["+name+"]", value)
	}
	return form
}

func customerCheckoutKey(charge CustomerCharge) string {
	return "customer-" + (Scope{OrganizationID: charge.OrganizationID, UserID: charge.OrderID}).key("customer-checkout", charge.OrderID)
}

func (client *CustomerClient) CreateCustomerCheckout(ctx context.Context, charge CustomerCharge) (CustomerSession, error) {
	if !client.Enabled() {
		return CustomerSession{}, ErrUnavailable
	}
	if err := charge.Validate(); err != nil {
		return CustomerSession{}, err
	}
	form := client.customerCheckoutForm(charge)
	var session CustomerSession
	if err := client.client.request(ctx, http.MethodPost, "/checkout/sessions", customerCheckoutKey(charge), form, &session); err != nil {
		return CustomerSession{}, err
	}
	if err := session.Validate(charge, ""); err != nil {
		return CustomerSession{}, err
	}
	return session, nil
}

func (client *CustomerClient) RetrieveCustomerCheckout(ctx context.Context, charge CustomerCharge, id string) (CustomerSession, error) {
	if client == nil || !sessionPattern.MatchString(id) || charge.Validate() != nil {
		return CustomerSession{}, ErrInput
	}
	var session CustomerSession
	if err := client.client.request(ctx, http.MethodGet, "/checkout/sessions/"+id, "", nil, &session); err != nil {
		return CustomerSession{}, err
	}
	if err := session.Validate(charge, id); err != nil {
		return CustomerSession{}, err
	}
	return session, nil
}
