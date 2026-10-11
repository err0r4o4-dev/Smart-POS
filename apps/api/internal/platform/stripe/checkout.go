package stripe

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
)

const sandboxAmount = 2000
const sandboxPurpose = "sandbox_connection_check"

var uuidPattern = regexp.MustCompile(`^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$`)
var sessionPattern = regexp.MustCompile(`^cs_test_[A-Za-z0-9]{1,220}$`)
var intentPattern = regexp.MustCompile(`^pi_[A-Za-z0-9]{1,220}$`)
var refundPattern = regexp.MustCompile(`^re_[A-Za-z0-9]{1,220}$`)

type Scope struct{ OrganizationID, UserID string }

func (scope Scope) valid() bool {
	return uuidPattern.MatchString(scope.OrganizationID) && uuidPattern.MatchString(scope.UserID)
}
func (scope Scope) metadata() map[string]string {
	return map[string]string{"smartpos_purpose": sandboxPurpose, "organization_id": scope.OrganizationID, "actor_id": scope.UserID}
}
func (scope Scope) owns(metadata map[string]string) bool {
	return metadata["smartpos_purpose"] == sandboxPurpose && metadata["organization_id"] == scope.OrganizationID && metadata["actor_id"] == scope.UserID
}
func (scope Scope) key(action, identity string) string {
	sum := sha256.Sum256([]byte(scope.OrganizationID + ":" + scope.UserID + ":" + action + ":" + identity))
	return "smartpos-sandbox-v1-" + hex.EncodeToString(sum[:])
}

type Checkout struct {
	ID            string  `json:"id"`
	URL           string  `json:"url"`
	Status        string  `json:"status"`
	PaymentStatus string  `json:"payment_status"`
	AmountMinor   int64   `json:"amount_minor"`
	Currency      string  `json:"currency"`
	Refund        *Refund `json:"refund"`
}
type Refund struct {
	ID          string `json:"id"`
	Status      string `json:"status"`
	AmountMinor int64  `json:"amount_minor"`
	Currency    string `json:"currency"`
}
type checkoutObject struct {
	ID            string            `json:"id"`
	Object        string            `json:"object"`
	LiveMode      *bool             `json:"livemode"`
	Mode          string            `json:"mode"`
	URL           string            `json:"url"`
	Status        string            `json:"status"`
	PaymentStatus string            `json:"payment_status"`
	Amount        int64             `json:"amount_total"`
	Currency      string            `json:"currency"`
	PaymentIntent string            `json:"payment_intent"`
	Metadata      map[string]string `json:"metadata"`
}
type refundObject struct {
	ID            string            `json:"id"`
	Object        string            `json:"object"`
	Status        string            `json:"status"`
	Amount        int64             `json:"amount"`
	Currency      string            `json:"currency"`
	PaymentIntent string            `json:"payment_intent"`
	Metadata      map[string]string `json:"metadata"`
}

func (client *Client) request(ctx context.Context, method, path, key string, form url.Values, result any) error {
	if !client.Configured() {
		return ErrUnavailable
	}
	request, err := http.NewRequestWithContext(ctx, method, "https://api.stripe.com/v1"+path, strings.NewReader(form.Encode()))
	if err != nil {
		return ErrUnavailable
	}
	request.SetBasicAuth(client.secret, "")
	request.Header.Set("Stripe-Version", "2024-06-20")
	request.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	if key != "" {
		request.Header.Set("Idempotency-Key", key)
	}
	response, err := client.http.Do(request)
	if err != nil {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		return ErrUnavailable
	}
	defer response.Body.Close()
	if response.StatusCode == http.StatusNotFound {
		return ErrNotFound
	}
	if response.StatusCode == http.StatusConflict {
		return ErrConflict
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return ErrUnavailable
	}
	decoder := json.NewDecoder(io.LimitReader(response.Body, (1<<20)+1))
	if decoder.Decode(result) != nil || decoder.Decode(new(any)) != io.EOF {
		return ErrUnavailable
	}
	return nil
}
func (value checkoutObject) validate(scope Scope, expected string) error {
	if !scope.owns(value.Metadata) {
		return ErrNotFound
	}
	if value.Object != "checkout.session" || value.LiveMode == nil || *value.LiveMode || value.Mode != "payment" ||
		!sessionPattern.MatchString(value.ID) || (expected != "" && value.ID != expected) || value.Amount != sandboxAmount || value.Currency != "thb" {
		return ErrUnavailable
	}
	if value.Status != "open" && value.Status != "complete" && value.Status != "expired" {
		return ErrUnavailable
	}
	if value.PaymentStatus != "paid" && value.PaymentStatus != "unpaid" {
		return ErrUnavailable
	}
	if value.PaymentStatus == "paid" && (value.Status != "complete" || !intentPattern.MatchString(value.PaymentIntent)) {
		return ErrUnavailable
	}
	if value.Status == "open" || value.URL != "" {
		parsed, err := url.Parse(value.URL)
		if err != nil || parsed.Scheme != "https" || parsed.Host != "checkout.stripe.com" || parsed.User != nil || parsed.Path != "/c/pay/"+value.ID {
			return ErrUnavailable
		}
	}
	return nil
}
func (value checkoutObject) checkout() Checkout {
	return Checkout{ID: value.ID, URL: value.URL, Status: value.Status, PaymentStatus: value.PaymentStatus, AmountMinor: value.Amount, Currency: value.Currency}
}
func (client *Client) CreateCheckout(ctx context.Context, scope Scope, key string) (Checkout, error) {
	if !client.Configured() {
		return Checkout{}, ErrUnavailable
	}
	if !scope.valid() || !uuidPattern.MatchString(key) {
		return Checkout{}, ErrInput
	}
	returnPath := client.origin + "/manage/settings/storefront/payments"
	form := url.Values{
		"mode": {"payment"}, "success_url": {returnPath + "?session_id={CHECKOUT_SESSION_ID}"}, "cancel_url": {returnPath + "?cancelled=1"},
		"payment_method_types[0]": {"card"}, "payment_method_types[1]": {"promptpay"},
		"line_items[0][price_data][currency]": {"thb"}, "line_items[0][price_data][unit_amount]": {"2000"},
		"line_items[0][price_data][product_data][name]": {"SmartPOS sandbox connection test - not a customer order"}, "line_items[0][quantity]": {"1"},
	}
	for name, value := range scope.metadata() {
		form.Set("metadata["+name+"]", value)
		form.Set("payment_intent_data[metadata]["+name+"]", value)
	}
	var object checkoutObject
	if err := client.request(ctx, http.MethodPost, "/checkout/sessions", scope.key("checkout", key), form, &object); err != nil {
		return Checkout{}, err
	}
	if err := object.validate(scope, ""); err != nil {
		return Checkout{}, err
	}
	return object.checkout(), nil
}
func (client *Client) readCheckout(ctx context.Context, scope Scope, id string) (checkoutObject, error) {
	if !scope.valid() || !sessionPattern.MatchString(id) {
		return checkoutObject{}, ErrInput
	}
	var object checkoutObject
	if err := client.request(ctx, http.MethodGet, "/checkout/sessions/"+id, "", nil, &object); err != nil {
		return object, err
	}
	return object, object.validate(scope, id)
}
func (value refundObject) refund(scope Scope, intent string) (*Refund, error) {
	if !scope.owns(value.Metadata) || value.PaymentIntent != intent {
		return nil, ErrConflict
	}
	if value.Object != "refund" || !refundPattern.MatchString(value.ID) || value.Amount != sandboxAmount || value.Currency != "thb" {
		return nil, ErrUnavailable
	}
	switch value.Status {
	case "pending", "requires_action", "succeeded", "failed", "canceled":
	default:
		return nil, ErrUnavailable
	}
	return &Refund{ID: value.ID, Status: value.Status, AmountMinor: value.Amount, Currency: value.Currency}, nil
}
func (client *Client) findRefund(ctx context.Context, scope Scope, intent string) (*Refund, error) {
	query := url.Values{"payment_intent": {intent}, "limit": {"10"}}
	var list struct {
		Object  string         `json:"object"`
		Data    []refundObject `json:"data"`
		HasMore bool           `json:"has_more"`
	}
	if err := client.request(ctx, http.MethodGet, "/refunds?"+query.Encode(), "", nil, &list); err != nil {
		return nil, err
	}
	if list.Object != "list" || list.HasMore || len(list.Data) > 1 {
		return nil, ErrConflict
	}
	if len(list.Data) == 0 {
		return nil, nil
	}
	return list.Data[0].refund(scope, intent)
}
func (client *Client) RetrieveCheckout(ctx context.Context, scope Scope, id string) (Checkout, error) {
	object, err := client.readCheckout(ctx, scope, id)
	if err != nil {
		return Checkout{}, err
	}
	checkout := object.checkout()
	if object.PaymentStatus == "paid" {
		checkout.Refund, err = client.findRefund(ctx, scope, object.PaymentIntent)
	}
	return checkout, err
}
func (client *Client) RefundCheckout(ctx context.Context, scope Scope, id string) (Refund, error) {
	object, err := client.readCheckout(ctx, scope, id)
	if err != nil {
		return Refund{}, err
	}
	if object.PaymentStatus != "paid" {
		return Refund{}, ErrConflict
	}
	previous, err := client.findRefund(ctx, scope, object.PaymentIntent)
	if err != nil {
		return Refund{}, err
	}
	if previous != nil {
		return *previous, nil
	}
	form := url.Values{"payment_intent": {object.PaymentIntent}, "amount": {"2000"}}
	for name, value := range scope.metadata() {
		form.Set("metadata["+name+"]", value)
	}
	var response refundObject
	if err = client.request(ctx, http.MethodPost, "/refunds", scope.key("refund", id), form, &response); err != nil {
		return Refund{}, err
	}
	refund, err := response.refund(scope, object.PaymentIntent)
	if err != nil {
		return Refund{}, err
	}
	return *refund, nil
}
