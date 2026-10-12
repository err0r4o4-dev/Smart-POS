package storefront

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode/utf8"
)

var ErrInput = errors.New("invalid storefront input")
var ErrConflict = errors.New("storefront state conflict")
var ErrNotFound = errors.New("storefront resource not found")
var ErrClosed = errors.New("storefront not accepting orders")
var ErrQuote = errors.New("storefront quote changed")
var ErrStock = errors.New("storefront stock unavailable")
var uuidPattern = regexp.MustCompile(`^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$`)
var tokenPattern = regexp.MustCompile(`^[a-f0-9]{64}$`)
var slugPattern = regexp.MustCompile(`^[a-z][a-z0-9-]{2,49}$`)
var phonePattern = regexp.MustCompile(`^[0-9+() .-]{3,30}$`)

type Settings struct {
	Slug               string `json:"slug"`
	Name               string `json:"name"`
	Description        string `json:"description"`
	ContactPhone       string `json:"contact_phone"`
	PickupInstructions string `json:"pickup_instructions"`
	TerminalID         string `json:"terminal_id,omitempty"`
	OnlineTerminalID   string `json:"online_terminal_id,omitempty"`
	Published          bool   `json:"published"`
	AcceptingOrders    bool   `json:"accepting_orders"`
	Revision           int64  `json:"revision"`
	BranchID           string `json:"branch_id,omitempty"`
	LocationID         string `json:"stock_location_id,omitempty"`
}
type SettingsInput struct {
	Slug               string `json:"slug"`
	Name               string `json:"name"`
	Description        string `json:"description"`
	ContactPhone       string `json:"contact_phone"`
	PickupInstructions string `json:"pickup_instructions"`
	TerminalID         string `json:"terminal_id"`
	OnlineTerminalID   string `json:"online_terminal_id"`
	Published          bool   `json:"published"`
	AcceptingOrders    bool   `json:"accepting_orders"`
	Revision           int64  `json:"revision"`
}
type Product struct {
	VariantID   string `json:"variant_id"`
	ProductName string `json:"product_name"`
	VariantName string `json:"variant_name"`
	SKU         string `json:"sku"`
	Unit        string `json:"unit"`
	UnitType    string `json:"unit_type"`
	UnitPrice   string `json:"unit_price"`
	Available   string `json:"available"`
	Saleable    bool   `json:"saleable"`
	Published   bool   `json:"published"`
}
type Page[T any] struct {
	Items    []T `json:"items"`
	Total    int `json:"total"`
	Page     int `json:"page"`
	PageSize int `json:"page_size"`
}
type ItemInput struct {
	VariantID string `json:"variant_id"`
	Quantity  string `json:"quantity"`
}
type QuoteInput struct {
	Items []ItemInput `json:"items"`
}
type OrderInput struct {
	Items        []ItemInput `json:"items"`
	QuoteID      string      `json:"quote_id"`
	CustomerName string      `json:"customer_name"`
	ContactPhone string      `json:"contact_phone"`
	CustomerNote string      `json:"customer_note"`
	AccessToken  string      `json:"access_token"`
}
type Line struct {
	VariantID   string `json:"variant_id"`
	ProductName string `json:"product_name"`
	VariantName string `json:"variant_name"`
	SKU         string `json:"sku"`
	Unit        string `json:"unit"`
	Quantity    string `json:"quantity"`
	UnitPrice   string `json:"unit_price"`
	LineTotal   string `json:"line_total"`
}
type Quote struct {
	ID       string `json:"quote_id"`
	Items    []Line `json:"items"`
	Total    string `json:"estimated_total"`
	Currency string `json:"currency"`
}
type Event struct {
	Status    string    `json:"status"`
	Message   string    `json:"message"`
	CreatedAt time.Time `json:"created_at"`
}
type Order struct {
	ID                 string    `json:"id"`
	Number             string    `json:"number"`
	Status             string    `json:"status"`
	PaymentStatus      string    `json:"payment_status"`
	CustomerName       string    `json:"customer_name,omitempty"`
	ContactPhone       string    `json:"contact_phone,omitempty"`
	CustomerNote       string    `json:"customer_note,omitempty"`
	StoreName          string    `json:"store_name"`
	StorePhone         string    `json:"store_phone"`
	PickupInstructions string    `json:"pickup_instructions"`
	EstimatedTotal     string    `json:"estimated_total"`
	FinalTotal         *string   `json:"final_total"`
	ReceiptNumber      *string   `json:"receipt_number"`
	BranchID           string    `json:"branch_id,omitempty"`
	TerminalID         string    `json:"terminal_id,omitempty"`
	CartID             *string   `json:"cart_id,omitempty"`
	SaleID             *string   `json:"sale_id,omitempty"`
	Revision           int64     `json:"revision"`
	CreatedAt          time.Time `json:"created_at"`
	ExpiresAt          time.Time `json:"expires_at"`
	Items              []Line    `json:"items"`
	Events             []Event   `json:"events"`
}
type TrackingInput struct {
	OrderID     string `json:"order_id"`
	AccessToken string `json:"access_token"`
}
type TransitionInput struct {
	Status   string `json:"status"`
	Message  string `json:"message"`
	Revision int64  `json:"revision"`
}
type PublishInput struct {
	Published bool  `json:"published"`
	Revision  int64 `json:"revision"`
}

func text(value string, maximum int, required bool) bool {
	return utf8.RuneCountInString(value) <= maximum && (!required || strings.TrimSpace(value) != "") && !strings.ContainsAny(value, "\x00\r\n")
}
func digest(value any) string {
	encoded, _ := json.Marshal(value)
	sum := sha256.Sum256(encoded)
	return hex.EncodeToString(sum[:])
}
func accessHash(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
func money(value int64) string { return fmt.Sprintf("%d.%02d", value/100, value%100) }
func normalizeItems(items []ItemInput) error {
	if len(items) == 0 || len(items) > 100 {
		return ErrInput
	}
	seen := map[string]bool{}
	for index := range items {
		items[index].VariantID = strings.ToLower(items[index].VariantID)
		if !uuidPattern.MatchString(items[index].VariantID) || seen[items[index].VariantID] {
			return ErrInput
		}
		seen[items[index].VariantID] = true
	}
	sort.Slice(items, func(left, right int) bool { return items[left].VariantID < items[right].VariantID })
	return nil
}
func (input *SettingsInput) validate() error {
	input.Slug = strings.TrimSpace(input.Slug)
	input.Name = strings.TrimSpace(input.Name)
	input.ContactPhone = strings.TrimSpace(input.ContactPhone)
	input.TerminalID = strings.ToLower(input.TerminalID)
	input.OnlineTerminalID = strings.ToLower(input.OnlineTerminalID)
	if input.OnlineTerminalID != "" && (!uuidPattern.MatchString(input.OnlineTerminalID) || input.OnlineTerminalID == input.TerminalID) {
		return ErrInput
	}
	if !slugPattern.MatchString(input.Slug) || strings.HasSuffix(input.Slug, "-") || strings.Contains(input.Slug, "--") || !text(input.Name, 200, true) || !text(input.Description, 1000, false) || !text(input.PickupInstructions, 1000, false) || !text(input.ContactPhone, 30, false) || !uuidPattern.MatchString(input.TerminalID) || input.Revision < 0 || (input.AcceptingOrders && !input.Published) {
		return ErrInput
	}
	return nil
}
func (shop Settings) orderTerminalID() string {
	if shop.OnlineTerminalID != "" {
		return shop.OnlineTerminalID
	}
	return shop.TerminalID
}
func (input *OrderInput) validate() error {
	input.CustomerName = strings.TrimSpace(input.CustomerName)
	input.ContactPhone = strings.TrimSpace(input.ContactPhone)
	input.CustomerNote = strings.TrimSpace(input.CustomerNote)
	if !text(input.CustomerName, 200, true) || !phonePattern.MatchString(input.ContactPhone) || !text(input.CustomerNote, 1000, false) || !tokenPattern.MatchString(input.AccessToken) || !tokenPattern.MatchString(input.QuoteID) {
		return ErrInput
	}
	return normalizeItems(input.Items)
}
func canTransition(current, next string) bool {
	switch current {
	case "PENDING":
		return next == "PREPARING" || next == "REJECTED" || next == "CANCELLED"
	case "PREPARING":
		return next == "READY" || next == "REJECTED" || next == "CANCELLED"
	case "READY":
		return next == "CANCELLED"
	}
	return false
}
func effectiveStatus(status string, expires time.Time, cart *string, now time.Time) string {
	if cart == nil && (status == "PENDING" || status == "PREPARING" || status == "READY") && !expires.After(now) {
		return "EXPIRED"
	}
	return status
}
